import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';

import 'bootstrap.dart';
import 'generated/checksheets.g.dart';
import 'models/inspection.dart';
import 'screens/checksheet_screen.dart';
import 'sync/api_client.dart';
import 'sync/outbox.dart';
import 'sync/sync_service.dart';
import 'theme.dart';
import 'widgets/brand_bar.dart';

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
        home: const HomeScreen(),
      );
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late final ApiClient _api;
  late final SyncService _sync;
  bool? _online;
  bool _opening = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _api = ApiClient(
      baseUrl: Uri.parse(AppConfig.apiBase),
      deviceId: AppConfig.deviceId,
      userId: CurrentUser.id,
    );
    _sync = SyncService(outbox: Outbox(InMemoryOutboxStore()), api: _api);
    _checkHealth();
  }

  Future<void> _checkHealth() async {
    final ok = await _api.health();
    if (mounted) setState(() => _online = ok);
  }

  /// Class 2 & 3.1 stays a local-only walkthrough until a second job exists
  /// on the server.
  Inspection _class23Local() => Inspection(
        locationName: 'Class 2 & 3.1 store',
        pcbuName: 'Abecca',
        siteAddress: 'Auckland',
        certifierName: CurrentUser.name,
        classKey: 'class_2_3',
        templates: [
          kTemplatesByCode['wks17-general']!,
          kTemplatesByCode['wks17-class-2-and-3-1-substances']!,
        ],
      );

  Inspection _g2Local() => Inspection(
        locationName: 'G2 Chiller',
        pcbuName: 'Argenta Manufacturing Limited',
        siteAddress: '2 Sterling Avenue, Manurewa East, Auckland 2102',
        certifierName: CurrentUser.name,
        classKey: 'class_6_8',
        templates: [
          kTemplatesByCode['wks17-general']!,
          kTemplatesByCode['wks17-class-6-1a-6-1b-6-1c-8-2a-8']!,
        ],
      );

  Future<void> _openG2() async {
    setState(() {
      _opening = true;
      _error = null;
    });
    try {
      Inspection insp;
      SyncService? sync;
      if (_online == true) {
        insp = await openG2Inspection(_api, _sync);
        sync = _sync;
      } else {
        insp = _g2Local();
      }
      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => ChecksheetScreen(inspection: insp, sync: sync)),
      );
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _opening = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final statusLabel = _online == null
        ? 'Checking…'
        : _online!
            ? 'Server'
            : 'Offline';
    final statusColor = _online == null
        ? Brand.tealDark
        : _online!
            ? Brand.compliant
            : Brand.conditional;

    return Scaffold(
      appBar: BrandBar(
        title: 'Field inspections',
        subtitle: 'WKS-17 location compliance certification',
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Center(
              child: InkWell(
                onTap: _checkHealth,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: statusColor,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Icon(
                      _online == true ? Icons.cloud_done_outlined : Icons.cloud_off_outlined,
                      size: 14,
                      color: Colors.white,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      statusLabel,
                      style: const TextStyle(
                          color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600),
                    ),
                  ]),
                ),
              ),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.info_outline),
            onPressed: () => showAboutDialog(
              context: context,
              applicationName: 'Assure Safety Field',
              applicationVersion: 'WKS-17 templates rev 1',
              children: [
                const Text(
                  'Check sheet content is generated from the canonical WKS-17 '
                  'templates and shown verbatim. It is never paraphrased.',
                  style: TextStyle(fontSize: 13),
                ),
                const SizedBox(height: 8),
                Text('API: ${AppConfig.apiBase}',
                    style: const TextStyle(fontSize: 12, color: Colors.black54)),
              ],
            ),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(vertical: 12),
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 4, 16, 12),
            child: Text('Inspections',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, letterSpacing: .4)),
          ),
          _jobCard(
            title: 'G2 Chiller',
            pcbu: 'Argenta Manufacturing Limited',
            address: '2 Sterling Avenue, Manurewa East, Auckland 2102',
            meta: '2 check sheets · 54 items · ${_online == true ? 'live on server' : 'local only'}',
            busy: _opening,
            onTap: _opening ? null : _openG2,
          ),
          _jobCard(
            title: 'Class 2 & 3.1 store',
            pcbu: 'Abecca',
            address: 'Auckland',
            meta: '2 check sheets · 80 items · local only',
            busy: false,
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => ChecksheetScreen(inspection: _class23Local())),
            ),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: Text(_error!, style: const TextStyle(color: Brand.nonCompliant, fontSize: 12)),
            ),
        ],
      ),
    );
  }

  Widget _jobCard({
    required String title,
    required String pcbu,
    required String address,
    required String meta,
    required bool busy,
    required VoidCallback? onTap,
  }) =>
      Card(
        child: ListTile(
          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
          subtitle: Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(pcbu, style: const TextStyle(fontSize: 13)),
                const SizedBox(height: 2),
                Text(address, style: const TextStyle(fontSize: 12, color: Colors.black54)),
                const SizedBox(height: 6),
                Text(meta,
                    style: const TextStyle(
                        fontSize: 12, color: Brand.teal, fontWeight: FontWeight.w600)),
              ],
            ),
          ),
          trailing: busy
              ? const SizedBox(
                  width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.chevron_right),
          onTap: onTap,
        ),
      );
}
