import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../auth/session.dart';
import '../bootstrap.dart';
import '../models/dashboard.dart';
import '../models/job.dart';
import '../sync/api_client.dart';
import '../sync/outbox.dart';
import '../sync/sync_service.dart';
import '../theme.dart';
import '../widgets/brand_bar.dart';
import '../widgets/job_context_bar.dart';

/// The landing: Brian's active clients. One row per client (grouped by the
/// client's id, so two clients that share a name stay two), its open jobs
/// under it with stage and what each needs now. Needs attention shows only
/// when something does; recent activity sits last. A certifier archives a
/// client that is not real work; it leaves the list and the reminders but
/// keeps its records (16 October 2026).
class JobsBoard extends StatefulWidget {
  final ApiClient api;
  final SyncService sync;
  final Session session;
  final Future<void> Function() onSignOut;
  const JobsBoard({
    super.key,
    required this.api,
    required this.sync,
    required this.session,
    required this.onSignOut,
  });

  @override
  State<JobsBoard> createState() => _JobsBoardState();
}

class _JobsBoardState extends State<JobsBoard> {
  List<JobSummary>? _jobs;
  DashboardData? _dash;
  List<SheetSet>? _sets;
  bool _busy = false;
  String? _error;

  /// Archived clients, read only when Brian asks for them.
  List<JobSummary>? _archivedJobs;
  bool _showArchived = false;

  /// Clients with nothing open (every job closed or referred), shown on request.
  bool _showPast = false;

  /// The empty board offers the G2 workbook job only in a demo build
  /// (--dart-define=DEMO=true), so a demo is never seeded on production.
  static const _demoBuild = bool.fromEnvironment('DEMO');

  /// Open work: anything not closed or referred. A monitoring job is a
  /// certified client Brian still looks after.
  static bool _isOpen(JobSummary j) => !const {'closed', 'referred'}.contains(j.stage);

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    if (!mounted) return;
    setState(() => _busy = true);
    try {
      final rows = (await widget.api.getJson('/api/jobs') as List).cast<Map<String, dynamic>>();
      final archived = _showArchived
          ? (await widget.api.getJson('/api/jobs?archived=1') as List).cast<Map<String, dynamic>>()
          : null;
      DashboardData? dash;
      try {
        dash = await widget.api.dashboard();
      } catch (_) {
        dash = null;
      }
      if (!mounted) return;
      setState(() {
        _jobs = rows.map(JobSummary.fromJson).toList();
        _archivedJobs = archived?.map(JobSummary.fromJson).toList();
        _dash = dash;
        _error = null;
      });
    } on ApiException catch (e) {
      if (e.status == 401) {
        await widget.onSignOut();
        return;
      }
      if (mounted) setState(() => _error = e.message);
    } catch (e) {
      if (mounted) setState(() => _error = 'Could not reach the server: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _open(int jobId) async {
    context.go('/jobs/$jobId');
  }

  Future<void> _createDemo() async {
    setState(() => _busy = true);
    try {
      final job = await ensureG2Job(widget.api);
      await _reload();
      if (mounted) await _open(job.jobId);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _newJob() async {
    _sets ??= await widget.api.sheetSets().catchError((_) => <SheetSet>[]);
    final sets = (_sets ?? const <SheetSet>[]).isEmpty
        ? const [SheetSet(key: 'class_6_8', name: 'Location: classes 6 or 8', templates: [], authorised: true)]
        : _sets!;
    if (!mounted) return;
    final legal = TextEditingController();
    final trading = TextEditingController();
    final address = TextEditingController();
    final location = TextEditingController();
    final manager = TextEditingController();
    final phone = TextEditingController();
    // One row per substance: name, hazard class, lifecycles (handler only).
    final substances = <(TextEditingController, TextEditingController, TextEditingController)>[
      (TextEditingController(), TextEditingController(), TextEditingController()),
    ];
    var classKey = 'class_6_8';
    // An existing client picked from the suggestions: the job goes under it
    // instead of making a second client with the same name.
    final clients = _groups(_jobs ?? const []);
    _ClientGroup? picked;
    final legalFocus = FocusNode();
    String kindOf(String key) => sets.firstWhere((x) => x.key == key, orElse: () => sets.first).kind;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          title: const Text('New job'),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, spacing: 10, children: [
              DropdownButtonFormField<String>(
                isExpanded: true,
                initialValue: classKey,
                decoration: const InputDecoration(labelText: 'Check sheets'),
                items: [
                  for (final x in sets)
                    DropdownMenuItem(
                      value: x.key,
                      enabled: x.authorised,
                      child: Text(x.authorised ? x.name : '${x.name} (outside authorisation)',
                          style: TextStyle(color: x.authorised ? null : Colors.black38)),
                    ),
                ],
                onChanged: (v) => setD(() => classKey = v ?? classKey),
              ),
              if (sets.any((x) => x.key == classKey && x.regulation != null))
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(sets.firstWhere((x) => x.key == classKey).regulation!,
                      style: const TextStyle(fontSize: 11, color: Colors.black54)),
                ),
              RawAutocomplete<_ClientGroup>(
                textEditingController: legal,
                focusNode: legalFocus,
                displayStringForOption: (c) => c.name,
                optionsBuilder: (v) {
                  final q = v.text.trim().toLowerCase();
                  if (q.length < 2) return const Iterable<_ClientGroup>.empty();
                  return clients.where((c) => c.name.toLowerCase().contains(q) || (c.trading ?? '').toLowerCase().contains(q)).take(6);
                },
                onSelected: (c) => setD(() => picked = c),
                fieldViewBuilder: (ctx, controller, focus, onSubmit) => TextField(
                  controller: controller,
                  focusNode: focus,
                  key: const ValueKey('nj-legal'),
                  decoration: InputDecoration(
                    labelText: 'Client (legal entity name)',
                    helperText: picked != null ? 'Existing client: this job is added under it' : null,
                  ),
                  // Editing the name after picking means a different client.
                  onChanged: (t) {
                    final p = picked;
                    if (p != null && t != p.name) setD(() => picked = null);
                  },
                ),
                optionsViewBuilder: (ctx, onSelect, options) => Align(
                  alignment: Alignment.topLeft,
                  child: Material(
                    elevation: 4,
                    borderRadius: BorderRadius.circular(8),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxHeight: 260, maxWidth: 420),
                      child: ListView(padding: EdgeInsets.zero, shrinkWrap: true, children: [
                        for (final c in options)
                          ListTile(
                            key: ValueKey('nj-client-${c.id}'),
                            dense: true,
                            title: Text(c.name),
                            subtitle: Text(c.jobs.first.address ?? c.jobs.first.locationName, maxLines: 1, overflow: TextOverflow.ellipsis),
                            onTap: () => onSelect(c),
                          ),
                      ]),
                    ),
                  ),
                ),
              ),
              TextField(controller: trading, decoration: const InputDecoration(labelText: 'Trading as (optional)')),
              TextField(controller: address, key: const ValueKey('nj-address'), decoration: const InputDecoration(labelText: 'Site address')),
              TextField(
                controller: location,
                key: const ValueKey('nj-location'),
                decoration: InputDecoration(
                  labelText: switch (kindOf(classKey)) {
                    'handler' => 'Applicant (full name)',
                    'cylinder' => 'Shipment or batch reference',
                    _ => 'Hazardous substance location, e.g. G2 Chiller',
                  },
                ),
              ),
              const SizedBox(height: 14),
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  switch (kindOf(classKey)) {
                    'handler' => 'Substances the applicant will handle',
                    'cylinder' => 'Gas in the cylinders (optional)',
                    _ => 'Hazardous substances at the location',
                  },
                  style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: Colors.black54),
                ),
              ),
              for (var k = 0; k < substances.length; k++) ...[
                Row(children: [
                  Expanded(
                    flex: 5,
                    child: TextField(
                      controller: substances[k].$1,
                      key: ValueKey('nj-sub-$k-name'),
                      decoration: const InputDecoration(labelText: 'Substance'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    flex: 3,
                    child: TextField(
                      controller: substances[k].$2,
                      key: ValueKey('nj-sub-$k-class'),
                      decoration: const InputDecoration(labelText: 'Class, e.g. 6.1B'),
                    ),
                  ),
                ]),
                if (kindOf(classKey) == 'handler')
                  TextField(
                    controller: substances[k].$3,
                    key: ValueKey('nj-sub-$k-lifecycles'),
                    decoration: const InputDecoration(labelText: 'Lifecycles, e.g. use, storage'),
                  ),
              ],
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  key: const ValueKey('nj-add-substance'),
                  onPressed: () => setD(() => substances.add((TextEditingController(), TextEditingController(), TextEditingController()))),
                  icon: const Icon(Icons.add, size: 16),
                  label: const Text('Add substance'),
                ),
              ),
              const SizedBox(height: 6),
              TextField(controller: manager, decoration: const InputDecoration(labelText: 'Site manager (optional)')),
              TextField(controller: phone, decoration: const InputDecoration(labelText: 'Manager phone (optional)')),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            FilledButton(key: const ValueKey('nj-create'), onPressed: () => Navigator.pop(ctx, true), child: const Text('Create')),
          ],
        ),
      ),
    );
    if (ok != true || legal.text.trim().isEmpty || address.text.trim().isEmpty || location.text.trim().isEmpty) return;
    setState(() => _busy = true);
    try {
      final created = await widget.api.postJson('/api/jobs', {
        'client': {
          if (picked != null && picked!.id != null && picked!.name == legal.text.trim()) 'id': picked!.id,
          'legalName': legal.text.trim(),
          'tradingName': trading.text.trim().isEmpty ? null : trading.text.trim(),
        },
        'site': {'address': address.text.trim()},
        'location': {'name': location.text.trim()},
        'classKey': classKey,
        // Form sheets: what was typed becomes the first subject field, so the
        // sheet opens with it filled in the template's own label.
        if (kindOf(classKey) != 'location')
          'subject': kindOf(classKey) == 'handler'
              ? {'Name': location.text.trim(), 'Company': legal.text.trim(), 'Address': address.text.trim()}
              : {'Company/Legal Entity': legal.text.trim(), 'Physical Address': address.text.trim()},
        if (manager.text.trim().isNotEmpty)
          'contacts': [
            {'name': manager.text.trim(), 'role': 'Site manager', 'phone': phone.text.trim(), 'isSiteManager': true}
          ],
        // HSLocation → Substance: a row counts when it has a name and a class.
        'substances': [
          for (final x in substances)
            if (x.$1.text.trim().isNotEmpty && x.$2.text.trim().isNotEmpty)
              {
                'name': x.$1.text.trim(),
                'hazardClass': x.$2.text.trim(),
                if (x.$3.text.trim().isNotEmpty) 'lifecycles': x.$3.text.trim(),
              },
        ],
      }) as Map<String, dynamic>;
      await _reload();
      if (mounted) await _open(toInt(created['jobId']));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  static String _ago(DateTime? d) {
    if (d == null) return '';
    final diff = DateTime.now().difference(d);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes} min ago';
    if (diff.inHours < 24) return '${diff.inHours} h ago';
    if (diff.inDays < 7) return '${diff.inDays} d ago';
    final l = d.toLocal();
    return '${l.day.toString().padLeft(2, '0')}/${l.month.toString().padLeft(2, '0')}/${l.year}';
  }

  /// Jobs grouped by client id, in the order the server sorted them (latest
  /// activity first), so a client sits where its freshest job would.
  static List<_ClientGroup> _groups(List<JobSummary> jobs) {
    final byKey = <Object, _ClientGroup>{};
    for (final j in jobs) {
      final key = j.clientId ?? 'name:${j.clientName}';
      byKey.putIfAbsent(key, () => _ClientGroup(id: j.clientId, name: j.clientName, trading: j.tradingName)).jobs.add(j);
    }
    return byKey.values.toList();
  }

  /// Archive (or bring back) a client through the event log, so the trail
  /// names who did it. Sent straight to the server, not through the offline
  /// queue: it is a desk action, and the answer decides what the list shows.
  /// Returns the refusal or network problem, or null when it applied.
  static Future<String?> _sendArchive(ApiClient api, int clientId, bool archived) async {
    final ev = SyncEvent(type: 'client.archive', payload: {'clientId': clientId, 'archived': archived});
    try {
      final o = (await api.sync([ev]))[ev.id];
      if (o == null) return 'No answer from the server; try again.';
      if (o.isRejected) return [if (o.clause != null) o.clause!, o.reason ?? 'refused'].join(': ');
      return null;
    } catch (e) {
      return 'Not archived: could not reach the server ($e).';
    }
  }

  Future<void> _setArchived(_ClientGroup c, bool archived) async {
    final id = c.id;
    if (id == null) return;
    // Undo can be pressed after Brian has left the board: the request still
    // goes, only the screen updates are skipped.
    final api = widget.api;
    final messenger = ScaffoldMessenger.of(context);
    if (mounted) setState(() => _busy = true);
    final problem = await _sendArchive(api, id, archived);
    if (!mounted) return;
    await _reload();
    if (!mounted) return;
    if (problem != null) {
      setState(() => _error = problem);
      return;
    }
    messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content: Text(archived ? '${c.name} archived' : '${c.name} is back on the list'),
        duration: const Duration(seconds: 6),
        persist: false,
        action: archived
            ? SnackBarAction(
                label: 'Undo',
                onPressed: () => mounted ? _setArchived(c, false) : _sendArchive(api, id, false),
              )
            : null,
      ));
  }

  Future<void> _toggleArchived() async {
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    setState(() {
      _showArchived = !_showArchived;
      _showPast = false;
    });
    await _reload();
  }

  @override
  Widget build(BuildContext context) {
    final jobs = _jobs;
    final all = _groups(jobs ?? const []);
    final active = [for (final c in all) if (c.jobs.any(_isOpen)) c];
    final past = [for (final c in all) if (!c.jobs.any(_isOpen)) c];
    final archived = _groups(_archivedJobs ?? const []);
    final dash = _dash;
    return Scaffold(
      appBar: BrandBar(
        title: 'Clients',
        subtitle: [widget.session.fullName, if ((widget.session.authorisationNumber ?? '').isNotEmpty) widget.session.authorisationNumber!].join(' · '),
        actions: [
          if (widget.session.canDecide)
            IconButton(
              key: const ValueKey('to-people'),
              tooltip: 'People',
              icon: const Icon(Icons.people_outline),
              onPressed: () => context.go('/people'),
            ),
          IconButton(tooltip: 'Refresh', icon: const Icon(Icons.refresh), onPressed: _busy ? null : _reload),
          IconButton(
            key: const ValueKey('sign-out'),
            tooltip: 'Sign out',
            icon: const Icon(Icons.logout),
            onPressed: widget.onSignOut,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _reload,
        // A readable column on a desk screen; edge to edge on a phone.
        child: LayoutBuilder(
          builder: (context, box) {
            final side = box.maxWidth > 992 ? (box.maxWidth - 960) / 2 : 16.0;
            return ListView(
              padding: EdgeInsets.fromLTRB(side, 16, side, 48),
              children: [
                _headerRow(_showArchived ? archived.length : active.length),
                if (_busy) const LinearProgressIndicator(minHeight: 2),
                if (_error != null)
                  Card(
                    color: const Color(0xFFFDECEA),
                    child: ListTile(
                      leading: const Icon(Icons.cloud_off_outlined, color: Brand.nonCompliant),
                      title: Text(_error!, style: const TextStyle(fontSize: 13)),
                      trailing: TextButton(onPressed: _reload, child: const Text('Retry')),
                    ),
                  ),
                if (_showArchived) ...[
                  if (_archivedJobs != null && archived.isEmpty)
                    const Padding(
                      padding: EdgeInsets.all(24),
                      child: Text('No archived clients.', style: TextStyle(color: Colors.black54)),
                    ),
                  for (final c in archived) _clientCard(c, archivedView: true),
                ] else ...[
                  if (dash != null && dash.reminders.isNotEmpty) _attention(dash),
                  if (jobs != null && active.isEmpty) _empty(),
                  for (final c in active) _clientCard(c),
                  if (_showPast) for (final c in past) _clientCard(c),
                ],
                _footer(past.length),
                if (!_showArchived && dash != null && dash.activity.isNotEmpty) _activity(dash),
              ],
            );
          },
        ),
      ),
    );
  }

  /// What is listed, and New job where the eye lands.
  Widget _headerRow(int n) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Row(children: [
          Expanded(
            child: Text(
              _jobs == null
                  ? 'Clients'
                  : _showArchived
                      ? 'Archived clients ($n)'
                      : '$n active client${n == 1 ? '' : 's'}',
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: Brand.tealDark),
            ),
          ),
          if (_showArchived)
            TextButton.icon(
              key: const ValueKey('show-active'),
              onPressed: _busy ? null : _toggleArchived,
              icon: const Icon(Icons.arrow_back, size: 16),
              label: const Text('Active clients'),
            )
          else if (widget.session.canRecord)
            FilledButton.icon(
              key: const ValueKey('new-job'),
              onPressed: _busy ? null : _newJob,
              icon: const Icon(Icons.add, size: 18),
              label: const Text('New job'),
            ),
        ]),
      );

  /// Quiet links under the list: clients with nothing open, and the archive.
  Widget _footer(int pastCount) => Padding(
        padding: const EdgeInsets.only(top: 4, bottom: 12),
        child: Wrap(spacing: 8, children: [
          if (!_showArchived && pastCount > 0)
            TextButton(
              key: const ValueKey('show-past'),
              onPressed: () => setState(() => _showPast = !_showPast),
              child: Text(_showPast ? 'Hide clients with nothing open' : 'Clients with nothing open ($pastCount)'),
            ),
          if (!_showArchived)
            TextButton(
              key: const ValueKey('show-archived'),
              onPressed: _busy ? null : _toggleArchived,
              child: const Text('Archived clients'),
            ),
        ]),
      );

  static IconData _reminderIcon(String kind) => switch (kind) {
        'renewal' => Icons.event_repeat,
        'rfi' => Icons.hourglass_bottom,
        'action' => Icons.build_outlined,
        'no_action' => Icons.report_gmailerrorred_outlined,
        'triage' => Icons.inbox_outlined,
        'decide' => Icons.gavel_outlined,
        _ => Icons.pause_circle_outline,
      };

  /// What needs attention: renewals, RFIs waiting, actions due, idle inspections.
  Widget _attention(DashboardData d) => Card(
        key: const ValueKey('attention'),
        margin: const EdgeInsets.only(bottom: 14),
        color: const Color(0xFFFFF6E5),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Needs attention (${d.reminders.length})',
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: Brand.conditional)),
            const SizedBox(height: 4),
            for (final r in d.reminders.take(6))
              InkWell(
                onTap: _busy ? null : () => _open(r.jobId),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Icon(_reminderIcon(r.kind), size: 16, color: Brand.conditional),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text.rich(TextSpan(children: [
                        TextSpan(text: '${r.client} · ${r.location}: ', style: const TextStyle(fontWeight: FontWeight.w700)),
                        TextSpan(text: r.text),
                      ]), style: const TextStyle(fontSize: 12.5)),
                    ),
                  ]),
                ),
              ),
          ]),
        ),
      );

  /// Who did what, most recent first, across every job.
  /// A status change and a comment on the same item arrive as two events
  /// seconds apart; the strip shows the person did one thing, once.
  static List<T> _collapsed<T extends dynamic>(List<T> items) {
    final out = <T>[];
    for (final a in items) {
      if (out.isNotEmpty) {
        final p = out.last;
        if (a.jobId != null && p.userName == a.userName && p.verb == a.verb && p.jobId == a.jobId) continue;
      }
      out.add(a);
    }
    return out;
  }

  Widget _activity(DashboardData d) => Padding(
        key: const ValueKey('activity'),
        padding: const EdgeInsets.fromLTRB(4, 8, 4, 0),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Recent activity', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: Colors.black54)),
          const SizedBox(height: 4),
          for (final a in _collapsed(d.activity).take(5))
            InkWell(
              onTap: _busy || a.jobId == null ? null : () => _open(a.jobId!),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Text.rich(TextSpan(children: [
                  TextSpan(text: a.userName ?? 'Someone', style: const TextStyle(fontWeight: FontWeight.w700)),
                  TextSpan(text: ' ${a.verb}'),
                  if (a.location != null || a.client != null)
                    TextSpan(text: ' · ${a.location ?? a.client}', style: const TextStyle(color: Colors.black54)),
                  TextSpan(text: '  ${_ago(a.at)}', style: const TextStyle(color: Colors.black45, fontSize: 11)),
                ]), style: const TextStyle(fontSize: 12.5)),
              ),
            ),
        ]),
      );

  Widget _empty() => Card(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('No active clients yet', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            const Text('Start with New job: the client, the site and what is being certified.',
                style: TextStyle(fontSize: 13, color: Colors.black54)),
            if (_demoBuild) ...[
              const SizedBox(height: 12),
              OutlinedButton(
                  key: const ValueKey('create-demo'),
                  onPressed: _busy ? null : _createDemo,
                  child: const Text('Load G2 Chiller (workbook)')),
            ],
          ]),
        ),
      );

  /// One client: name, its open jobs as lines (each opens its hub), and for
  /// the certifier a menu to archive it or bring it back.
  Widget _clientCard(_ClientGroup c, {bool archivedView = false}) {
    final open = archivedView ? c.jobs : c.jobs.where(_isOpen).toList();
    final shown = open.isEmpty ? c.jobs : open;
    final finished = c.jobs.length - shown.length;
    final last = c.jobs.map((j) => j.lastActivity ?? j.openedAt).whereType<DateTime>().fold<DateTime?>(
        null, (a, b) => a == null || b.isAfter(a) ? b : a);
    final trading = (c.trading ?? '').trim();
    return Card(
      key: ValueKey('client-${c.id ?? c.name}'),
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 14, 8, 10),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(c.name, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: Brand.tealDark)),
                if (trading.isNotEmpty && trading != c.name)
                  Text('Trading as $trading', style: const TextStyle(fontSize: 12.5, color: Colors.black54)),
              ]),
            ),
            if (last != null)
              Padding(
                padding: const EdgeInsets.only(top: 4, left: 8),
                child: Text(_ago(last), style: const TextStyle(fontSize: 11.5, color: Colors.black45)),
              ),
            if (widget.session.canDecide && c.id != null)
              PopupMenuButton<String>(
                key: ValueKey('client-menu-${c.id}'),
                tooltip: 'Client actions',
                icon: const Icon(Icons.more_vert, size: 20, color: Colors.black45),
                onSelected: (v) => _setArchived(c, v == 'archive'),
                itemBuilder: (_) => [
                  if (archivedView)
                    const PopupMenuItem(value: 'restore', child: Text('Bring back'))
                  else
                    const PopupMenuItem(value: 'archive', child: Text('Archive client')),
                ],
              )
            else
              const SizedBox(width: 8),
          ]),
          const SizedBox(height: 6),
          for (final j in shown) _jobLine(j),
          if (finished > 0)
            Padding(
              padding: const EdgeInsets.only(top: 4, left: 4),
              child: Text('+ $finished closed job${finished == 1 ? '' : 's'}',
                  style: const TextStyle(fontSize: 11.5, color: Colors.black45)),
            ),
        ]),
      ),
    );
  }

  Widget _jobLine(JobSummary j) {
    final hasInspection = j.itemTotal > 0;
    final where = [j.subjectLine, if ((j.address ?? '').isNotEmpty) j.address!].join('  ·  ');
    return InkWell(
      key: ValueKey('job-${j.id}'),
      borderRadius: BorderRadius.circular(8),
      onTap: _busy ? null : () => _open(j.id),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(4, 8, 10, 8),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 34,
            height: 34,
            margin: const EdgeInsets.only(right: 12, top: 1),
            decoration: BoxDecoration(
              color: StageChip.colorFor(j.stage).withValues(alpha: .12),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(
              j.certificateDecision != null
                  ? Icons.verified_outlined
                  : switch (j.kind) { 'handler' => Icons.person_outline, 'cylinder' => Icons.propane_tank_outlined, _ => Icons.factory_outlined },
              color: StageChip.colorFor(j.stage),
              size: 19,
            ),
          ),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(where, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: Colors.black87)),
              const SizedBox(height: 5),
              // Stage, then what it needs now; wraps under on a phone.
              Wrap(spacing: 8, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
                StageChip(stage: j.stage, dense: true),
                Text(j.nextAction, style: const TextStyle(fontSize: 12.5, color: Brand.teal)),
              ]),
              if (hasInspection) ...[
                const SizedBox(height: 6),
                Row(children: [
                  Expanded(
                    flex: 3,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(3),
                      child: LinearProgressIndicator(
                        value: j.assessed / j.itemTotal,
                        minHeight: 4,
                        backgroundColor: const Color(0xFFE3E8E8),
                        valueColor: AlwaysStoppedAnimation(j.nonCompliant > 0 ? Brand.conditional : Brand.compliant),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Flexible(
                    flex: 2,
                    child: Text(
                      '${j.assessed}/${j.itemTotal}${j.nonCompliant > 0 ? ' · ${j.nonCompliant} non-compliant' : ''}',
                      style: const TextStyle(fontSize: 11, color: Colors.black54),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ]),
              ],
            ]),
          ),
          const Icon(Icons.chevron_right, size: 20, color: Colors.black26),
        ]),
      ),
    );
  }
}

/// A client as the board shows it: the jobs the server listed under its id.
class _ClientGroup {
  final int? id;
  final String name;
  final String? trading;
  final List<JobSummary> jobs = [];
  _ClientGroup({required this.id, required this.name, this.trading});
}
