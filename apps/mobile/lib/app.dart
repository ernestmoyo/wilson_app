import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'auth/session.dart';
import 'bootstrap.dart';
import 'models/inspection.dart';
import 'screens/checksheet_screen.dart';
import 'screens/item_screen.dart';
import 'screens/job_screen.dart';
import 'screens/jobs_board.dart';
import 'screens/people_screen.dart';
import 'screens/login_screen.dart';
import 'sync/api_client.dart';
import 'sync/outbox.dart';
import 'sync/prefs_outbox_store.dart';
import 'sync/sync_service.dart';
import 'theme.dart';
import 'widgets/app_shell.dart';
import 'widgets/ui.dart';

/// Where the server is. Built in with --dart-define=API_BASE=…; when absent
/// on web, the app assumes it is served from the same origin as the API
/// (which is how the Vercel deployment is laid out).
class AppConfig {
  static const _fromEnv = String.fromEnvironment('API_BASE', defaultValue: '');
  static String get apiBase {
    if (_fromEnv.isNotEmpty) return _fromEnv;
    if (kIsWeb) return Uri.base.origin;
    return 'http://localhost:8000';
  }

  static String get deviceId => kIsWeb ? 'web-demo-001' : 'ipad-demo-001';
}

/// The one ApiClient, the one SyncService, and the signed-in person. Screens
/// read these; the router redirects on them.
class AppSession extends ChangeNotifier {
  final SessionStore store;
  final ApiClient api;
  late final SyncService sync;
  Session? session;
  bool loaded = false;

  /// Inspections already opened this run, by job, so going back and forward
  /// between the hub and the sheet does not re-open them.
  final Map<int, Inspection> inspections = {};

  /// The landing's view ('clients' or 'jobs'), kept while the app is open.
  String boardView = 'clients';

  AppSession({SessionStore? store, ApiClient? api, OutboxStore? outboxStore})
      : store = store ?? PrefsSessionStore(),
        api = api ??
            ApiClient(baseUrl: Uri.parse(AppConfig.apiBase), deviceId: AppConfig.deviceId, userId: CurrentUser.id) {
    sync = SyncService(outbox: Outbox(outboxStore ?? PrefsOutboxStore()), api: this.api);
  }

  Future<void> load() async {
    final s = await store.load();
    if (s != null) {
      api.token = s.token;
      CurrentUser.apply(s);
    }
    session = s;
    loaded = true;
    notifyListeners();
  }

  Future<void> signedIn(Session s) async {
    CurrentUser.apply(s);
    session = s;
    notifyListeners();
    try {
      await store.save(s);
    } catch (e) {
      debugPrint('session not persisted: $e');
    }
  }

  Future<void> signOut() async {
    // Send what this person queued while they still hold the token; whatever
    // cannot go is dropped, never sent under the next sign-in.
    try {
      await sync.flush();
    } catch (_) {}
    await sync.outbox.clear();
    await api.logout();
    await store.clear();
    inspections.clear();
    boardView = 'clients';
    session = null;
    notifyListeners();
  }
}

/// The route graph. Every screen has a URL, so the browser's back button,
/// a refresh and a shared link all land where a person expects:
///   /login · / (jobs board) · /jobs/:id (hub) · /jobs/:id/sheet (check sheet)
///   · /jobs/:id/sheet/item/:template/:section/:item (one item)
/// Nothing that needs the server renders before the saved session (and
/// its token) is loaded: a deep link to /jobs/1 would otherwise fire its
/// first request with no token and be refused.
Widget _gated(AppSession app, Widget Function() build) => ListenableBuilder(
      listenable: app,
      builder: (context, _) => app.loaded && app.session != null
          ? build()
          : const Scaffold(body: Center(child: CircularProgressIndicator())),
    );

GoRouter buildRouter(AppSession app, {String? initialLocation}) {
  // A job and everything under it go on the root navigator, over the shell.
  final rootKey = GlobalKey<NavigatorState>(debugLabel: 'root');
  return GoRouter(
      navigatorKey: rootKey,
      // On web the address bar wins: a deep link or a refresh lands where it
      // says, not on the board.
      initialLocation: initialLocation ?? (kIsWeb && Uri.base.path.isNotEmpty ? Uri.base.path : '/'),
      refreshListenable: app,
      redirect: (context, state) {
        if (!app.loaded) return null;
        final onLogin = state.matchedLocation == '/login';
        if (app.session == null) return onLogin ? null : '/login?from=${Uri.encodeComponent(state.matchedLocation)}';
        if (onLogin) {
          final from = state.uri.queryParameters['from'];
          return (from == null || from.isEmpty || from == '/login') ? '/' : from;
        }
        return null;
      },
      routes: [
        GoRoute(
          path: '/login',
          builder: (context, state) => LoginScreen(api: app.api, onSignedIn: app.signedIn),
        ),
        // The shell (rail or bottom bar) wraps the two destinations only.
        // Everything under a job goes on the root navigator: it covers the
        // shell and keeps its own back arrow, and every URL is unchanged.
        ShellRoute(
          builder: (context, state, child) => _gated(
            app,
            () => AppShell(
              session: app.session!,
              sync: app.sync,
              onSignOut: app.signOut,
              location: state.uri.path,
              child: child,
            ),
          ),
          routes: [
            GoRoute(
              path: '/',
              builder: (context, state) => _gated(
                  app,
                  () => JobsBoard(
                        api: app.api,
                        sync: app.sync,
                        session: app.session!,
                        onSignOut: app.signOut,
                        initialView: app.boardView,
                        onViewChanged: (v) => app.boardView = v,
                      )),
              routes: [
                GoRoute(
                  path: 'people',
                  // A destination switch, not a step down: no slide.
                  pageBuilder: (context, state) =>
                      NoTransitionPage(key: state.pageKey, child: _gated(app, () => PeopleScreen(api: app.api))),
                ),
                GoRoute(
                  path: 'jobs/:id',
                  parentNavigatorKey: rootKey,
                  builder: (context, state) => _gated(app,
                      () => JobScreen(jobId: int.parse(state.pathParameters['id']!), sync: app.sync, onUnauthorized: app.signOut)),
                  routes: [
                    GoRoute(
                      path: 'sheet',
                      parentNavigatorKey: rootKey,
                      builder: (context, state) => _gated(app,
                          () => SheetRoute(app: app, jobId: int.parse(state.pathParameters['id']!))),
                      routes: [
                        // One item of the sheet (UX B10): a refresh or a shared
                        // link lands on the item, and back returns to the sheet.
                        GoRoute(
                          path: 'item/:template/:section/:item',
                          parentNavigatorKey: rootKey,
                          builder: (context, state) => _gated(
                            app,
                            () => ItemRoute(
                              app: app,
                              jobId: int.parse(state.pathParameters['id']!),
                              templateCode: state.pathParameters['template']!,
                              sectionOrdinal: int.tryParse(state.pathParameters['section']!) ?? -1,
                              itemOrdinal: int.tryParse(state.pathParameters['item']!) ?? -1,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ],
    );
}

/// /jobs/:id/sheet — opens (or reuses) the inspection, then shows the sheet.
/// A refresh on this URL comes straight back here with everything reloaded
/// from the server.
class SheetRoute extends StatefulWidget {
  final AppSession app;
  final int jobId;
  const SheetRoute({super.key, required this.app, required this.jobId});

  @override
  State<SheetRoute> createState() => _SheetRouteState();
}

/// Opens (or reuses) the job's inspection, with the job's stage. Shared by
/// the sheet and item routes, so both hold the same Inspection.
Future<(Inspection, String)> _openSheet(AppSession app, int jobId) async {
  final job = await fetchJob(app.api, jobId);
  final insp = app.inspections[jobId] ??
      (app.inspections[jobId] = await openInspectionForJob(app.api, app.sync, jobId));
  // Opening the sheet from an early stage walks the job to site inspection
  // (openInspectionForJob); the sheet must say so, not the stage read a
  // moment before.
  final walked = CurrentUser.canRecord && const {'enquiry', 'application', 'document_review'}.contains(job.stage);
  return (insp, walked ? 'site_inspection' : job.stage);
}

Widget _loadFailed(String title, Object error) => Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Notice('$error'),
        ),
      ),
    );

class _SheetRouteState extends State<SheetRoute> {
  late final Future<(Inspection, String)> _load = _openSheet(widget.app, widget.jobId);

  @override
  Widget build(BuildContext context) => FutureBuilder(
        future: _load,
        builder: (context, snap) {
          if (snap.hasError) return _loadFailed(Wording.checkSheet, snap.error!);
          if (!snap.hasData) return const Scaffold(body: Center(child: CircularProgressIndicator()));
          final (insp, stage) = snap.data!;
          return ChecksheetScreen(inspection: insp, sync: widget.app.sync, stage: stage);
        },
      );
}

/// /jobs/:id/sheet/item/:template/:section/:item — one item of the sheet.
/// Previous / Next replace the address, so the bar always names the item
/// on screen and back still returns to the sheet.
class ItemRoute extends StatefulWidget {
  final AppSession app;
  final int jobId;
  final String templateCode;
  final int sectionOrdinal;
  final int itemOrdinal;
  const ItemRoute({
    super.key,
    required this.app,
    required this.jobId,
    required this.templateCode,
    required this.sectionOrdinal,
    required this.itemOrdinal,
  });

  @override
  State<ItemRoute> createState() => _ItemRouteState();
}

class _ItemRouteState extends State<ItemRoute> {
  /// The sheet already open this run is used as is (Previous / Next and
  /// coming from the sheet never wait); a cold deep link opens it first.
  late final Future<Inspection>? _load =
      widget.app.inspections.containsKey(widget.jobId) ? null : _openSheet(widget.app, widget.jobId).then((r) => r.$1);

  @override
  Widget build(BuildContext context) {
    final cached = widget.app.inspections[widget.jobId];
    if (cached != null) return _item(context, cached);
    return FutureBuilder(
      future: _load,
      builder: (context, snap) {
        if (snap.hasError) return _loadFailed(Wording.checkSheet, snap.error!);
        if (!snap.hasData) return const Scaffold(body: Center(child: CircularProgressIndicator()));
        return _item(context, snap.data!);
      },
    );
  }

  Widget _item(BuildContext context, Inspection insp) {
    final t = insp.templates.where((x) => x.code == widget.templateCode).firstOrNull;
    final s = t?.sections.where((x) => x.ordinal == widget.sectionOrdinal).firstOrNull;
    final i = s?.items.where((x) => x.ordinal == widget.itemOrdinal).firstOrNull;
    if (t == null || s == null || i == null) {
      return _loadFailed(Wording.checkSheet,
          'No such item on this job\'s check sheet: ${widget.templateCode} ${widget.sectionOrdinal}/${widget.itemOrdinal}');
    }
    return ItemScreen(
      inspection: insp,
      template: t,
      section: s,
      item: i,
      finding: insp.findingFor(t, s, i),
      sync: widget.app.sync,
      // go, not push/replace: the address bar follows (imperative routes do
      // not change the URL), and back still pops to the sheet.
      onGo: (s2, i2) => GoRouter.of(context).go(ItemScreen.pathFor(widget.jobId, t.code, s2.ordinal, i2.ordinal)),
    );
  }
}

class AssureFieldApp extends StatefulWidget {
  final AppSession? app;
  final String? initialLocation;
  const AssureFieldApp({super.key, this.app, this.initialLocation});

  @override
  State<AssureFieldApp> createState() => _AssureFieldAppState();
}

class _AssureFieldAppState extends State<AssureFieldApp> {
  late final AppSession _app = widget.app ?? AppSession();
  late final GoRouter _router = buildRouter(_app, initialLocation: widget.initialLocation);

  @override
  void initState() {
    super.initState();
    _app.load();
  }

  @override
  Widget build(BuildContext context) => MaterialApp.router(
        title: 'Assure Safety Field',
        theme: buildTheme(),
        debugShowCheckedModeBanner: false,
        routerConfig: _router,
      );
}
