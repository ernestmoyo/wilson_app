import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';

import 'auth/session.dart';
import 'bootstrap.dart';
import 'screens/jobs_board.dart';
import 'screens/login_screen.dart';
import 'sync/prefs_outbox_store.dart';
import 'sync/api_client.dart';
import 'sync/outbox.dart';
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

void main() => runApp(const AssureFieldApp());

class AssureFieldApp extends StatelessWidget {
  const AssureFieldApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Assure Safety Field',
        theme: buildTheme(),
        debugShowCheckedModeBanner: false,
        home: const AuthGate(),
      );
}

/// Sign-in first. The gate owns the one ApiClient the app uses, restores a
/// saved session, and hands the client to the home screen with the token set.
class AuthGate extends StatefulWidget {
  final SessionStore? store;
  final ApiClient? api;
  final OutboxStore? outboxStore;
  const AuthGate({super.key, this.store, this.api, this.outboxStore});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  late final SessionStore _store = widget.store ?? PrefsSessionStore();
  late final ApiClient _api = widget.api ??
      ApiClient(baseUrl: Uri.parse(AppConfig.apiBase), deviceId: AppConfig.deviceId, userId: CurrentUser.id);
  late final SyncService _sync = SyncService(outbox: Outbox(widget.outboxStore ?? PrefsOutboxStore()), api: _api);
  Session? _session;
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    _store.load().then((s) {
      if (!mounted) return;
      if (s != null) {
        _api.token = s.token;
        CurrentUser.apply(s);
      }
      setState(() {
        _session = s;
        _loaded = true;
      });
    });
  }

  Future<void> _signedIn(Session s) async {
    CurrentUser.apply(s);
    if (mounted) setState(() => _session = s);
    // Persisting is best effort: a store that fails (private browsing, a
    // missing plugin) should not undo a sign-in the server accepted.
    try {
      await _store.save(s);
    } catch (e) {
      debugPrint('session not persisted: $e');
    }
  }

  Future<void> _signOut() async {
    await _api.logout();
    await _store.clear();
    if (mounted) setState(() => _session = null);
  }

  @override
  Widget build(BuildContext context) {
    if (!_loaded) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    if (_session == null) return LoginScreen(api: _api, onSignedIn: _signedIn);
    return JobsBoard(api: _api, sync: _sync, session: _session!, onSignOut: _signOut);
  }
}
