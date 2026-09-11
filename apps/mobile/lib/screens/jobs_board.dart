import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../auth/session.dart';
import '../bootstrap.dart';
import '../models/dashboard.dart';
import '../models/job.dart';
import '../sync/api_client.dart';
import '../sync/sync_service.dart';
import '../theme.dart';
import '../widgets/brand_bar.dart';
import '../widgets/job_context_bar.dart';

/// The jobs board: every job the server holds, the way a certifier scans
/// them. Who, where, which stage, what it needs now, when anything last
/// happened. Tapping a job opens its hub. This replaces the hardcoded
/// inspection list; the phone and the laptop read the same rows.
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

  /// Active hides closed, referred and monitoring jobs; the count on the
  /// header says how many the filter hides.
  String _filter = 'active';

  static bool _isActive(JobSummary j) => !const {'closed', 'referred', 'monitoring'}.contains(j.stage);
  List<JobSummary> _visible(List<JobSummary> all) => switch (_filter) {
        'active' => all.where(_isActive).toList(),
        'issued' => all.where((j) => j.certificateDecision != null).toList(),
        _ => all,
      };

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    setState(() => _busy = true);
    try {
      final rows = (await widget.api.getJson('/api/jobs') as List).cast<Map<String, dynamic>>();
      DashboardData? dash;
      try {
        dash = await widget.api.dashboard();
      } catch (_) {
        dash = null;
      }
      if (!mounted) return;
      setState(() {
        _jobs = rows.map(JobSummary.fromJson).toList();
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
    String kindOf(String key) => sets.firstWhere((x) => x.key == key, orElse: () => sets.first).kind;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          title: const Text('New job'),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
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
              TextField(controller: legal, key: const ValueKey('nj-legal'), decoration: const InputDecoration(labelText: 'Legal entity name')),
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

  @override
  Widget build(BuildContext context) {
    final jobs = _jobs;
    return Scaffold(
      appBar: BrandBar(
        title: 'Jobs',
        subtitle: '${widget.session.fullName} · ${widget.session.authorisationNumber ?? ''}',
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
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 48),
          children: [
            _headerRow(jobs),
            if (_busy) const LinearProgressIndicator(minHeight: 2),
            if (_dash != null) _attention(_dash!),
            if (_dash != null && _dash!.activity.isNotEmpty) _activity(_dash!),
            if (_error != null)
              Card(
                color: const Color(0xFFFDECEA),
                child: ListTile(
                  leading: const Icon(Icons.cloud_off_outlined, color: Brand.nonCompliant),
                  title: Text(_error!, style: const TextStyle(fontSize: 13)),
                  trailing: TextButton(onPressed: _reload, child: const Text('Retry')),
                ),
              ),
            if (jobs != null && jobs.isEmpty) _empty(),
            if (jobs != null && jobs.isNotEmpty && _visible(jobs).isEmpty)
              const Padding(
                padding: EdgeInsets.all(24),
                child: Text('Nothing under this filter.', style: TextStyle(color: Colors.black54)),
              ),
            if (jobs != null) for (final j in _visible(jobs)) _card(j),
          ],
        ),
      ),
    );
  }

  /// The board's own header: what is listed, a filter, and the New job
  /// button where the eye lands, not floating in a corner.
  Widget _headerRow(List<JobSummary>? jobs) {
    final all = jobs ?? const <JobSummary>[];
    final shown = _visible(all).length;
    Widget chip(String key, String label) => ChoiceChip(
          label: Text(label, style: const TextStyle(fontSize: 12)),
          selected: _filter == key,
          onSelected: (_) => setState(() => _filter = key),
          visualDensity: VisualDensity.compact,
        );
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(children: [
        Expanded(
          child: Wrap(spacing: 6, runSpacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
            Padding(
              padding: const EdgeInsets.only(right: 6),
              child: Text(
                jobs == null ? 'Jobs' : '$shown of ${all.length} job${all.length == 1 ? '' : 's'}',
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Brand.tealDark),
              ),
            ),
            chip('active', 'Active'),
            chip('issued', 'Certificate issued'),
            chip('all', 'All'),
          ]),
        ),
        const SizedBox(width: 12),
        FilledButton.icon(
          key: const ValueKey('new-job'),
          onPressed: _busy ? null : _newJob,
          icon: const Icon(Icons.add, size: 18),
          label: const Text('New job'),
        ),
      ]),
    );
  }

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
        margin: const EdgeInsets.only(bottom: 10),
        color: const Color(0xFFFFF6E5),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Needs attention', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: Brand.conditional)),
            const SizedBox(height: 4),
            if (d.reminders.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 4),
                child: Text('Nothing waiting on you right now.', style: TextStyle(fontSize: 12.5, color: Colors.black54)),
              ),
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
  Widget _activity(DashboardData d) => Card(
        key: const ValueKey('activity'),
        margin: const EdgeInsets.only(bottom: 10),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Recent activity', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: Brand.tealDark)),
            const SizedBox(height: 4),
            for (final a in d.activity.take(8))
              InkWell(
                onTap: _busy || a.jobId == null ? null : () => _open(a.jobId!),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 3),
                  child: Text.rich(TextSpan(children: [
                    TextSpan(text: a.userName ?? 'Someone', style: const TextStyle(fontWeight: FontWeight.w700)),
                    TextSpan(text: ' ${a.verb}'),
                    if (a.location != null) TextSpan(text: ' · ${a.location}', style: const TextStyle(color: Colors.black54)),
                    TextSpan(text: '  ${_ago(a.at)}', style: const TextStyle(color: Colors.black45, fontSize: 11)),
                  ]), style: const TextStyle(fontSize: 12.5)),
                ),
              ),
          ]),
        ),
      );

  Widget _empty() => Card(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('No jobs yet', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            const Text('Create a job for a client, or load the G2 Chiller job from the workbook to see the whole flow.',
                style: TextStyle(fontSize: 13, color: Colors.black54)),
            const SizedBox(height: 12),
            Wrap(spacing: 8, children: [
              FilledButton(onPressed: _busy ? null : _newJob, child: const Text('New job')),
              OutlinedButton(
                  key: const ValueKey('create-demo'),
                  onPressed: _busy ? null : _createDemo,
                  child: const Text('Load G2 Chiller (workbook)')),
            ]),
          ]),
        ),
      );

  Widget _card(JobSummary j) {
    final hasInspection = j.itemTotal > 0;
    return Card(
      key: ValueKey('job-${j.id}'),
      margin: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: _busy ? null : () => _open(j.id),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 14, 14),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: 44,
              height: 44,
              margin: const EdgeInsets.only(right: 14, top: 2),
              decoration: BoxDecoration(
                color: StageChip.colorFor(j.stage).withValues(alpha: .12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(
                j.certificateDecision != null
                    ? Icons.verified_outlined
                    : switch (j.kind) { 'handler' => Icons.person_outline, 'cylinder' => Icons.propane_tank_outlined, _ => Icons.factory_outlined },
                color: StageChip.colorFor(j.stage),
                size: 24,
              ),
            ),
            Expanded(child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                Expanded(
                  child: Text(j.clientName,
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Brand.tealDark)),
                ),
                StageChip(stage: j.stage),
              ]),
              const SizedBox(height: 2),
              Text(
                [j.subjectLine, if ((j.address ?? '').isNotEmpty) j.address!].join('  ·  '),
                style: const TextStyle(fontSize: 13, color: Colors.black87),
              ),
              const SizedBox(height: 10),
              Row(children: [
                const Icon(Icons.arrow_forward, size: 14, color: Brand.teal),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(j.nextAction,
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Brand.teal)),
                ),
              ]),
              if (hasInspection) ...[
                const SizedBox(height: 8),
                Row(children: [
                  Expanded(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(3),
                      child: LinearProgressIndicator(
                        value: j.assessed / j.itemTotal,
                        minHeight: 5,
                        backgroundColor: const Color(0xFFE3E8E8),
                        valueColor: AlwaysStoppedAnimation(j.nonCompliant > 0 ? Brand.conditional : Brand.compliant),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    '${j.assessed}/${j.itemTotal}${j.nonCompliant > 0 ? ' · ${j.nonCompliant} non-compliant' : ''}',
                    style: const TextStyle(fontSize: 11.5, color: Colors.black54),
                  ),
                ]),
              ],
              const SizedBox(height: 6),
              Text(
                'Last activity ${_ago(j.lastActivity ?? j.openedAt)}'
                '${j.certificateDecision != null ? '  ·  certificate ${j.certificateDecision}' : ''}',
                style: const TextStyle(fontSize: 11, color: Colors.black45),
              ),
            ],
          )),
          ]),
        ),
      ),
    );
  }
}
