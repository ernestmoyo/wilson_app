import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../bootstrap.dart' show CurrentUser;
import '../models/job.dart';
import '../sync/api_client.dart';
import '../sync/sync_service.dart';
import '../theme.dart';
import '../widgets/brand_bar.dart';

/// The job through the Assure Safety compliance certification process flow.
///
/// The check sheet screen is stage 4. This screen is the rest of the
/// document: where the job sits, the moves the server will allow, the
/// corrective actions of stage 5, the interest declaration and issuance
/// check of stage 6, the certificate of stage 7 and the retention it sets.
/// Nothing here is decided locally; every button asks the server and the
/// screen re-reads the job.
class JobScreen extends StatefulWidget {
  final int jobId;
  final SyncService sync;
  const JobScreen({super.key, required this.jobId, required this.sync});

  @override
  State<JobScreen> createState() => _JobScreenState();
}

class _JobScreenState extends State<JobScreen> {
  JobRecord? _job;
  IssuanceCheck? _check;
  bool _busy = false;
  String? _error;

  ApiClient get api => widget.sync.api;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    setState(() => _busy = true);
    try {
      final j = JobRecord.fromJson(await api.job(widget.jobId));
      IssuanceCheck? c;
      try {
        c = await api.issuanceCheck(widget.jobId);
      } catch (_) {
        c = null;
      }
      if (!mounted) return;
      setState(() {
        _job = j;
        _check = c;
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Send one event, wait for the server, surface a rejection with its
  /// clause, then re-read the job.
  Future<void> _send(String type, Map<String, dynamic> payload) async {
    setState(() => _busy = true);
    final ev = await widget.sync.outbox.enqueue(type, payload);
    await widget.sync.flush();
    final rejected = widget.sync.rejected.where((r) => r.id == ev.id).toList();
    if (rejected.isNotEmpty) {
      final o = rejected.first.outcome;
      final msg = [if (o?.clause != null) o!.clause, o?.reason ?? 'rejected'].join(': ');
      await widget.sync.dismissRejected(ev.id);
      if (mounted) setState(() => _error = msg);
    }
    await _reload();
  }

  static String _d(DateTime? d) {
    if (d == null) return '';
    final l = d.toLocal();
    return '${l.day.toString().padLeft(2, '0')}/${l.month.toString().padLeft(2, '0')}/${l.year}';
  }

  @override
  Widget build(BuildContext context) {
    final j = _job;
    return Scaffold(
      appBar: BrandBar(
        title: j == null ? 'Job' : 'Job ${j.id}: ${j.locationName}',
        subtitle: j?.clientName,
        actions: [
          IconButton(
            tooltip: 'Refresh',
            icon: const Icon(Icons.refresh, color: Brand.teal),
            onPressed: _busy ? null : _reload,
          ),
        ],
      ),
      body: j == null
          ? Center(
              child: _error == null
                  ? const CircularProgressIndicator()
                  : Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(_error!, style: const TextStyle(color: Brand.nonCompliant)),
                    ),
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 48),
              children: [
                if (_busy) const LinearProgressIndicator(minHeight: 2),
                if (_error != null) _errorBanner(),
                _stageCard(j),
                _interestCard(j),
                _correctiveActionsCard(j),
                _issuanceCard(j),
                _certificateCard(j),
                _historyCard(j),
              ],
            ),
    );
  }

  Widget _errorBanner() => Card(
        color: const Color(0xFFFDECEA),
        child: ListTile(
          leading: const Icon(Icons.gavel_outlined, color: Brand.nonCompliant),
          title: Text(_error!, style: const TextStyle(fontSize: 13)),
          trailing: IconButton(
            icon: const Icon(Icons.close, size: 18),
            onPressed: () => setState(() => _error = null),
          ),
        ),
      );

  Widget _card(String title, List<Widget> children, {String? subtitle}) => Card(
        margin: const EdgeInsets.only(bottom: 12),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Brand.tealDark)),
              if (subtitle != null)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(subtitle, style: const TextStyle(fontSize: 12, color: Colors.black54)),
                ),
              const SizedBox(height: 10),
              ...children,
            ],
          ),
        ),
      );

  // ── 1 to 8: where the job sits, and the legal next moves ─────────────────

  Widget _stageCard(JobRecord j) {
    final current = ProcessStage.numberOf(j.stage);
    return _card('Process flow', [
      for (final s in ProcessStage.flow)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 3),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 22,
                height: 22,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: s.number == current
                      ? Brand.teal
                      : s.number < current
                          ? Brand.compliant
                          : Colors.black12,
                ),
                child: Text('${s.number}',
                    style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        color: s.number <= current ? Colors.white : Colors.black54)),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(s.title,
                        style: TextStyle(
                            fontSize: 13,
                            fontWeight: s.number == current ? FontWeight.w800 : FontWeight.w500)),
                    if (s.number == current && j.stage != s.key)
                      Text(ProcessStage.label(j.stage),
                          style: const TextStyle(fontSize: 12, color: Brand.conditional, fontWeight: FontWeight.w600)),
                  ],
                ),
              ),
            ],
          ),
        ),
      if (current == 0)
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Text(ProcessStage.label(j.stage),
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
        ),
      const Divider(height: 20),
      const Text('Move to', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
      const SizedBox(height: 6),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final next in j.allowedNext)
            OutlinedButton(
              key: ValueKey('move-$next'),
              onPressed: _busy ? null : () => _move(next),
              child: Text(ProcessStage.label(next), style: const TextStyle(fontSize: 12)),
            ),
        ],
      ),
      const SizedBox(height: 4),
      const Text('Only the moves the process flow allows from here are offered. The server enforces the same table.',
          style: TextStyle(fontSize: 11, color: Colors.black54)),
    ]);
  }

  Future<void> _move(String next) async {
    final reason = await _askText(
      title: 'Move to ${ProcessStage.label(next)}',
      label: 'Reason (recorded against the move)',
      hint: next == 'certificate_issued' ? 'Use the Certificate card to issue' : 'e.g. Site visit completed 10/09/2026',
    );
    if (reason == null) return;
    await _send('job.transition', {'jobId': widget.jobId, 'toStage': next, if (reason.isNotEmpty) 'reason': reason});
  }

  // ── IPS 23: the conflict-of-interest question ────────────────────────────

  Widget _interestCard(JobRecord j) => _card(
        'Register of interests',
        subtitle: 'IPS clause 23. A certificate cannot issue until this is answered.',
        [
          if (j.interestDeclared)
            Row(children: [
              Icon(j.conflictFound == true ? Icons.warning_amber_rounded : Icons.check_circle_outline,
                  size: 18, color: j.conflictFound == true ? Brand.conditional : Brand.compliant),
              const SizedBox(width: 8),
              Text(j.conflictFound == true ? 'Conflict declared' : 'No conflict of interest declared',
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
            ])
          else
            Wrap(spacing: 8, runSpacing: 8, children: [
              FilledButton(
                key: const ValueKey('declare-none'),
                onPressed: _busy ? null : () => _send('interest.declare', {'jobId': widget.jobId, 'conflictFound': false}),
                child: const Text('No conflict of interest'),
              ),
              OutlinedButton(
                onPressed: _busy ? null : _declareConflict,
                child: const Text('Declare a conflict'),
              ),
            ]),
        ],
      );

  Future<void> _declareConflict() async {
    final d = await _askText(
      title: 'Declare a conflict of interest',
      label: 'Describe the interest (IPS 23(3)(d))',
      hint: 'e.g. Previously advised this client on the ERP',
    );
    if (d == null || d.isEmpty) return;
    await _send('interest.declare', {'jobId': widget.jobId, 'conflictFound': true, 'description': d});
  }

  // ── Stage 5: non-compliances and their corrective actions ────────────────

  Widget _correctiveActionsCard(JobRecord j) {
    final nc = j.nonCompliances;
    return _card(
      'Non-compliances and corrective actions',
      subtitle: 'Stage 5. Each non-compliance needs an action, verified by a named person before issue.',
      [
        if (nc.isEmpty)
          const Text('No non-compliances recorded.', style: TextStyle(fontSize: 13))
        else
          for (final f in nc) ...[
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(width: 4, height: 18, color: Brand.nonCompliant),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(f.ref, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800)),
                    if ((f.failureReason ?? '').isNotEmpty)
                      Text(f.failureReason!, style: const TextStyle(fontSize: 12.5)),
                  ]),
                ),
                TextButton(
                  key: ValueKey('raise-${f.id}'),
                  onPressed: _busy ? null : () => _raise(f),
                  child: const Text('Add action', style: TextStyle(fontSize: 12)),
                ),
              ],
            ),
            for (final ca in j.actionsFor(f.id))
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 4, 0, 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _chip(ca.severity, _severityColor(ca.severity)),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(ca.description, style: const TextStyle(fontSize: 12.5)),
                        Text(
                          [
                            'Status: ${ca.status.replaceAll('_', ' ')}',
                            if (ca.dueDate != null) 'due ${_d(ca.dueDate)}',
                            if (ca.isVerified) 'verified ${_d(ca.reverifiedAt)} by ${CurrentUser.name}',
                          ].join(' · '),
                          style: const TextStyle(fontSize: 11, color: Colors.black54),
                        ),
                      ]),
                    ),
                    if (!ca.isVerified) ...[
                      if (ca.status != 'resolved')
                        TextButton(
                          onPressed: _busy
                              ? null
                              : () => _send('corrective_action.update', {'correctiveActionId': ca.id, 'status': 'resolved'}),
                          child: const Text('Resolved', style: TextStyle(fontSize: 12)),
                        ),
                      TextButton(
                        key: ValueKey('verify-${ca.id}'),
                        onPressed: _busy
                            ? null
                            : () => _send('corrective_action.update', {'correctiveActionId': ca.id, 'status': 'verified'}),
                        child: const Text('Verify', style: TextStyle(fontSize: 12)),
                      ),
                    ],
                  ],
                ),
              ),
            const Divider(height: 16),
          ],
      ],
    );
  }

  static Color _severityColor(String s) => switch (s) {
        'critical' => Brand.nonCompliant,
        'major' => Brand.conditional,
        _ => Brand.teal,
      };

  Widget _chip(String text, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(10)),
        child: Text(text, style: const TextStyle(color: Colors.white, fontSize: 10.5, fontWeight: FontWeight.w700)),
      );

  Future<void> _raise(JobFinding f) async {
    var severity = 'major';
    final desc = TextEditingController();
    final due = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          title: Text('Corrective action for ${f.ref}'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            DropdownButtonFormField<String>(
              initialValue: severity,
              decoration: const InputDecoration(labelText: 'Severity (process flow stage 5)'),
              items: const [
                DropdownMenuItem(value: 'critical', child: Text('Critical')),
                DropdownMenuItem(value: 'major', child: Text('Major')),
                DropdownMenuItem(value: 'minor', child: Text('Minor')),
              ],
              onChanged: (v) => setD(() => severity = v ?? 'major'),
            ),
            TextField(
              controller: desc,
              key: const ValueKey('ca-description'),
              maxLines: 3,
              decoration: const InputDecoration(labelText: 'What must change'),
            ),
            TextField(
              controller: due,
              decoration: const InputDecoration(labelText: 'Due date (YYYY-MM-DD)', hintText: 'optional'),
            ),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            FilledButton(
                key: const ValueKey('ca-save'),
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text('Raise')),
          ],
        ),
      ),
    );
    if (ok != true || desc.text.trim().isEmpty) return;
    await _send('corrective_action.raise', {
      'findingId': f.id,
      'severity': severity,
      'description': desc.text.trim(),
      if (due.text.trim().isNotEmpty) 'dueDate': due.text.trim(),
    });
  }

  // ── Stage 6: the issuance dry-run ────────────────────────────────────────

  Widget _issuanceCard(JobRecord j) {
    final c = _check;
    return _card(
      'Issuance check',
      subtitle: 'Stage 6. The same rule the database applies when the certificate is written.',
      [
        if (c == null)
          const Text('Not available.', style: TextStyle(fontSize: 13))
        else ...[
          Row(children: [
            Icon(c.canGrant ? Icons.check_circle : Icons.block,
                color: c.canGrant ? Brand.compliant : Brand.nonCompliant, size: 20),
            const SizedBox(width: 8),
            Text(
              c.canGrant
                  ? 'Can grant'
                  : c.canIssueConditional
                      ? 'Conditional certificate or refusal only'
                      : 'Cannot issue',
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800),
            ),
          ]),
          const SizedBox(height: 6),
          Text(
            [
              '${c.unresolvedNonCompliances} unresolved non-compliance(s)',
              '${j.pendingCount} item(s) still pending',
            ].join(' · '),
            style: const TextStyle(fontSize: 12, color: Colors.black54),
          ),
          for (final b in c.blockers)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Icon(Icons.gavel_outlined, size: 16, color: Brand.conditional),
                const SizedBox(width: 6),
                Expanded(
                  child: Text('${b.clause ?? ''}: ${b.reason}'.replaceFirst(RegExp(r'^: '), ''),
                      style: const TextStyle(fontSize: 12.5)),
                ),
              ]),
            ),
        ],
      ],
    );
  }

  // ── Stage 7: the certificate ─────────────────────────────────────────────

  Widget _certificateCard(JobRecord j) {
    final c = j.certificate;
    return _card(
      'Certificate',
      subtitle: 'Stage 7. Issued from the job record in the workbook layout; retention set on issue (IPS 21(6)).',
      [
        if (c == null) ...[
          FilledButton.icon(
            key: const ValueKey('issue-certificate'),
            onPressed: _busy || j.stage != 'final_validation' ? null : _issue,
            icon: const Icon(Icons.verified_outlined, size: 18),
            label: const Text('Issue certificate'),
          ),
          if (j.stage != 'final_validation')
            const Padding(
              padding: EdgeInsets.only(top: 6),
              child: Text('Available once the job reaches Final Validation.',
                  style: TextStyle(fontSize: 11, color: Colors.black54)),
            ),
        ] else ...[
          _kv('Decision', c.decision),
          _kv('Certificate number', c.certificateNumber ?? ''),
          if (c.registerNumber != null) _kv('Register number', c.registerNumber!),
          _kv('Issue date', _d(c.issueDate)),
          _kv('In force', _d(c.inForceDate)),
          _kv('Expiry', _d(c.expiryDate)),
          if (c.conditions.isNotEmpty) _kv('Conditions', c.conditions.join('; ')),
          if (c.requirementsNotMet.isNotEmpty) _kv('Requirements not met', c.requirementsNotMet.join('; ')),
          _kv('WorkSafe register due', _d(c.worksafeRegisterDue)),
          _kv('Retain records until', _d(j.retainUntil)),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            key: const ValueKey('open-certificate'),
            onPressed: () => launchUrl(api.uri('/api/jobs/${j.id}/certificate.html'), mode: LaunchMode.externalApplication),
            icon: const Icon(Icons.open_in_new, size: 16),
            label: const Text('Open certificate'),
          ),
        ],
      ],
    );
  }

  Widget _kv(String k, String v) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(width: 160, child: Text(k, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700))),
          Expanded(child: Text(v, style: const TextStyle(fontSize: 12.5))),
        ]),
      );

  Future<void> _issue() async {
    final j = _job!;
    final today = DateTime.now();
    String iso(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    var decision = _check?.canGrant == true ? 'granted' : 'conditional';
    final number = TextEditingController(text: '${CurrentUser.authorisationNumber}-${today.year}-${j.id.toString().padLeft(4, '0')}');
    final issuedTo = TextEditingController(text: j.clientName);
    final appliesTo = TextEditingController(text: j.address ?? j.locationName);
    final issueDate = TextEditingController(text: iso(today));
    final expiry = TextEditingController(text: iso(DateTime(today.year + 1, today.month, today.day)));
    final lines = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          title: const Text('Issue certificate'),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              DropdownButtonFormField<String>(
                initialValue: decision,
                decoration: const InputDecoration(labelText: 'Decision'),
                items: const [
                  DropdownMenuItem(value: 'granted', child: Text('Granted')),
                  DropdownMenuItem(value: 'conditional', child: Text('Granted subject to conditions (reg 6.24)')),
                  DropdownMenuItem(value: 'refused', child: Text('Refused (reg 6.23)')),
                ],
                onChanged: (v) => setD(() => decision = v ?? decision),
              ),
              TextField(controller: number, decoration: const InputDecoration(labelText: 'Certificate number (IPS 8(1)(c))')),
              TextField(controller: issuedTo, decoration: const InputDecoration(labelText: 'Issued to')),
              TextField(controller: appliesTo, decoration: const InputDecoration(labelText: 'Applies to (location)')),
              TextField(controller: issueDate, decoration: const InputDecoration(labelText: 'Issue date (YYYY-MM-DD)')),
              TextField(controller: expiry, decoration: const InputDecoration(labelText: 'Expiry date (YYYY-MM-DD)')),
              if (decision != 'granted')
                TextField(
                  controller: lines,
                  maxLines: 4,
                  decoration: InputDecoration(
                    labelText: decision == 'conditional' ? 'Conditions, one per line' : 'Requirements not met, one per line',
                  ),
                ),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            FilledButton(
                key: const ValueKey('issue-confirm'),
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text('Issue')),
          ],
        ),
      ),
    );
    if (ok != true) return;
    final list = lines.text.split('\n').map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
    setState(() => _busy = true);
    try {
      await api.issueCertificate(j.id, {
        'inspectionId': j.inspectionId,
        'decision': decision,
        'certificateNumber': number.text.trim(),
        'issuedTo': issuedTo.text.trim(),
        'appliesTo': appliesTo.text.trim(),
        'issueDate': issueDate.text.trim(),
        'expiryDate': expiry.text.trim(),
        if (decision == 'conditional') 'conditions': list,
        if (decision == 'refused') 'requirementsNotMet': list,
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      await _reload();
    }
  }

  // ── History: every move, who and when ────────────────────────────────────

  Widget _historyCard(JobRecord j) => _card('History', [
        if (j.transitions.isEmpty)
          const Text('No moves recorded yet.', style: TextStyle(fontSize: 13))
        else
          for (final t in j.transitions)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Text(
                '${_d(t.at)}  ${t.from == null ? '' : '${ProcessStage.label(t.from!)} → '}${ProcessStage.label(t.to)}'
                '${(t.reason ?? '').isEmpty ? '' : '  (${t.reason})'}',
                style: const TextStyle(fontSize: 12),
              ),
            ),
      ]);

  Future<String?> _askText({required String title, required String label, String? hint}) async {
    final c = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: c,
          key: const ValueKey('ask-text'),
          autofocus: true,
          maxLines: 2,
          decoration: InputDecoration(labelText: label, hintText: hint),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
              key: const ValueKey('ask-ok'),
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('OK')),
        ],
      ),
    );
    return ok == true ? c.text.trim() : null;
  }
}
