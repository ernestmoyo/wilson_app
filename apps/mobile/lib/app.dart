import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'auth/session.dart';
import 'bootstrap.dart';
import 'models/inspection.dart';
import 'screens/checksheet_screen.dart';
import 'screens/job_screen.dart';
import 'screens/jobs_board.dart';
import 'screens/login_screen.dart';
import 'sync/api_client.dart';
import 'sync/outbox.dart';
import 'sync/prefs_outbox_store.dart';
import 'sync/sync_service.dart';
import 'theme.dart';

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
    await api.logout();
    await store.clear();
    inspections.clear();
    session = null;
    notifyListeners();
  }
}

/// The route graph. Every screen has a URL, so the browser's back button,
/// a refresh and a shared link all land where a person expects:
///   /login · / (jobs board) · /jobs/:id (hub) · /jobs/:id/sheet (check sheet)
/// Nothing that needs the server renders before the saved session (and
/// its token) is loaded: a deep link to /jobs/1 would otherwise fire its
/// first request with no token and be refused.
Widget _gated(AppSession app, Widget Function() build) => ListenableBuilder(
      listenable: app,
      builder: (context, _) => app.loaded && app.session != null
          ? build()
          : const Scaffold(body: Center(child: CircularProgressIndicator())),
    );

GoRouter buildRouter(AppSession app, {String? initialLocation}) => GoRouter(
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
        GoRoute(
          path: '/',
          builder: (context, state) => _gated(app,
              () => JobsBoard(api: app.api, sync: app.sync, session: app.session!, onSignOut: app.signOut)),
          routes: [
            GoRoute(
              path: 'jobs/:id',
              builder: (context, state) => _gated(app,
                  () => JobScreen(jobId: int.parse(state.pathParameters['id']!), sync: app.sync, onUnauthorized: app.signOut)),
              routes: [
                GoRoute(
                  path: 'sheet',
                  builder: (context, state) => _gated(app,
                      () => SheetRoute(app: app, jobId: int.parse(state.pathParameters['id']!))),
                ),
              ],
            ),
          ],
        ),
      ],
    );

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

class _SheetRouteState extends State<SheetRoute> {
  late final Future<(Inspection, String)> _load = _open();

  Future<(Inspection, String)> _open() async {
    final job = await fetchJob(widget.app.api, widget.jobId);
    final insp = widget.app.inspections[widget.jobId] ??
        (widget.app.inspections[widget.jobId] =
            await openInspectionForJob(widget.app.api, widget.app.sync, widget.jobId));
    return (insp, job.stage);
  }

  @override
  Widget build(BuildContext context) => FutureBuilder(
        future: _load,
        builder: (context, snap) {
          if (snap.hasError) {
            return Scaffold(
              appBar: AppBar(title: const Text('Check sheet')),
              body: Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text('${snap.error}', style: const TextStyle(color: Brand.nonCompliant)),
                ),
              ),
            );
          }
          if (!snap.hasData) return const Scaffold(body: Center(child: CircularProgressIndicator()));
          final (insp, stage) = snap.data!;
          return ChecksheetScreen(inspection: insp, sync: widget.app.sync, stage: stage);
        },
      );
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
