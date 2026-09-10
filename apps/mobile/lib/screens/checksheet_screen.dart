import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../generated/checksheets.g.dart';
import '../models/finding.dart';
import '../models/inspection.dart';
import '../sync/sync_service.dart';
import '../theme.dart';
import '../widgets/brand_bar.dart';
import '../widgets/job_context_bar.dart';
import 'item_screen.dart';
import 'sheet_view.dart';

/// The inspection screen: every section and item of the applicable check
/// sheets, with the recorded result against each.
///
/// The item text shown here is the verbatim Performance Standard wording from
/// the generated templates. It is never paraphrased — an inspector reading a
/// summary of a regulation is reading something the regulator did not write.
class ChecksheetScreen extends StatefulWidget {
  final Inspection inspection;
  final SyncService? sync;

  /// The job's stage, for the context bar. The sheet itself is stage 4.
  final String? stage;
  const ChecksheetScreen({super.key, required this.inspection, this.sync, this.stage});

  @override
  State<ChecksheetScreen> createState() => _ChecksheetScreenState();
}

class _ChecksheetScreenState extends State<ChecksheetScreen> {
  int _templateIndex = 0;
  final Set<int> _collapsed = {};
  Timer? _pull;

  Inspection get insp => widget.inspection;
  ChecksheetTemplate get template => insp.templates[_templateIndex];

  @override
  void initState() {
    super.initState();
    // Every 30 s bring in what another device recorded. Local unsent changes
    // are left alone; see SyncService.pull.
    final sync = widget.sync;
    if (sync != null && insp.jobId != null) {
      _pull = Timer.periodic(const Duration(seconds: 30), (_) => sync.pull(insp).catchError((_) => 0));
    }
  }

  @override
  void dispose() {
    _pull?.cancel();
    super.dispose();
  }

  void _announceRemote(SyncService s) {
    if (s.remoteChanges == 0) return;
    final n = s.remoteChanges;
    s.remoteChanges = 0;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('$n item${n == 1 ? '' : 's'} updated from another device'),
        duration: const Duration(seconds: 3),
      ));
    });
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: Listenable.merge([insp, if (widget.sync != null) widget.sync!]),
      builder: (context, _) {
        if (widget.sync != null) _announceRemote(widget.sync!);
        return Scaffold(
          appBar: BrandBar(
            title: 'Check sheet',
            subtitle: '${insp.locationName} · ${insp.pcbuName}',
            actions: [
              if (insp.jobId != null)
                TextButton.icon(
                  key: const ValueKey('to-job'),
                  onPressed: () => context.go('/jobs/${insp.jobId}'),
                  icon: const Icon(Icons.account_tree_outlined, size: 18, color: Brand.teal),
                  label: const Text('Job', style: TextStyle(color: Brand.teal, fontWeight: FontWeight.w700)),
                ),
              TextButton.icon(
                key: const ValueKey('to-jobs'),
                onPressed: () => context.go('/'),
                icon: const Icon(Icons.view_list_outlined, size: 18, color: Brand.teal),
                label: const Text('Jobs', style: TextStyle(color: Brand.teal, fontWeight: FontWeight.w700)),
              ),
            ],
            bottom: PreferredSize(
              // Context bar 40 + chips 40 + progress 6 + pills 20 + sync row 28 + gaps/padding.
              preferredSize: Size.fromHeight(40 + (widget.sync == null ? 112 : 150)),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                JobContextBar(
                  clientName: insp.pcbuName,
                  locationName: insp.locationName,
                  address: insp.siteAddress,
                  stage: widget.stage ?? 'site_inspection',
                ),
                _header(),
              ]),
            ),
          ),
          // Wide (normal web, iPad landscape): the sheet as the workbook lays
          // it out. Narrow: cards. Both edit the same Inspection.
          body: LayoutBuilder(
            builder: (context, c) => c.maxWidth >= 900
                ? SheetView(
                    key: ValueKey('sheet-${template.code}'),
                    inspection: insp,
                    template: template,
                    sync: widget.sync,
                  )
                : ListView(
                    padding: const EdgeInsets.only(bottom: 32),
                    children: [
                      for (final section in template.sections) ..._section(section),
                    ],
                  ),
          ),
        );
      },
    );
  }

  Widget _header() {
    final nc = insp.countWhere(FindingStatus.nonCompliant);
    final pending = insp.countWhere(FindingStatus.pending);

    return Container(
      color: Brand.teal,
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            height: 40,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: insp.templates.length,
              separatorBuilder: (context, index) => const SizedBox(width: 8),
              itemBuilder: (context, i) {
                final t = insp.templates[i];
                final selected = i == _templateIndex;
                return ChoiceChip(
                  label: Text(_shortTitle(t)),
                  selected: selected,
                  onSelected: (_) => setState(() {
                    _templateIndex = i;
                    _collapsed.clear();
                  }),
                  showCheckmark: false,
                  labelStyle: TextStyle(
                    color: selected ? Brand.teal : Colors.white,
                    fontWeight: FontWeight.w600,
                    fontSize: 12,
                  ),
                  backgroundColor: Brand.tealDark,
                  selectedColor: Colors.white,
                  side: BorderSide.none,
                );
              },
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: insp.progress,
                    minHeight: 6,
                    backgroundColor: Brand.tealDark,
                    valueColor: const AlwaysStoppedAnimation(Colors.white),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Text(
                '${insp.assessedCount}/${insp.totalItems}',
                style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              _pill('$nc non-compliant', nc > 0 ? Brand.nonCompliant : Brand.tealDark),
              const SizedBox(width: 6),
              _pill('$pending pending', Brand.tealDark),
              const Spacer(),
              // reg 13.39 — surfaced continuously so the decision is never a
              // guess made at the end.
              _pill(
                insp.canGrant ? 'Can grant' : 'Cannot grant yet',
                insp.canGrant ? Brand.compliant : Brand.tealDark,
              ),
            ],
          ),
          if (widget.sync != null) ...[
            const SizedBox(height: 8),
            _syncRow(widget.sync!),
          ],
        ],
      ),
    );
  }

  /// Outbox state, always visible: what is queued, what the server refused
  /// and why. A rejected event carries its regulatory clause.
  Widget _syncRow(SyncService s) {
    final rej = s.rejectedCount;
    final label = s.isFlushing
        ? 'Syncing…'
        : s.lastError != null
            ? 'Offline — ${s.pendingCount} queued'
            : s.pendingCount > 0
                ? '${s.pendingCount} queued'
                : insp.inspectionId == null
                    ? 'Not on server'
                    : 'Synced';
    return Row(
      children: [
        Icon(
          s.lastError != null
              ? Icons.cloud_off_outlined
              : s.pendingCount > 0
                  ? Icons.cloud_upload_outlined
                  : Icons.cloud_done_outlined,
          size: 16,
          color: Colors.white70,
        ),
        const SizedBox(width: 6),
        Text(label, style: const TextStyle(color: Colors.white70, fontSize: 12)),
        if (rej > 0) ...[
          const SizedBox(width: 8),
          InkWell(
            onTap: () => _showRejections(s),
            child: _pill('$rej refused by server', Brand.conditional),
          ),
        ],
        const Spacer(),
        SizedBox(
          height: 28,
          child: TextButton.icon(
            onPressed: s.isFlushing ? null : () => s.syncNow(insp),
            style: TextButton.styleFrom(
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 10),
            ),
            icon: const Icon(Icons.sync, size: 16),
            label: const Text('Sync now', style: TextStyle(fontSize: 12)),
          ),
        ),
      ],
    );
  }

  void _showRejections(SyncService s) {
    showModalBottomSheet(
      context: context,
      showDragHandle: true,
      builder: (_) => ListView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
        shrinkWrap: true,
        children: [
          const Text('Refused by the server',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          const Text(
            'Each refusal names the clause it fails. Fix the finding and it will resend.',
            style: TextStyle(fontSize: 12, color: Colors.black54),
          ),
          const SizedBox(height: 12),
          for (final ev in s.rejected)
            Card(
              margin: const EdgeInsets.only(bottom: 8),
              child: ListTile(
                dense: true,
                leading: const Icon(Icons.gavel_outlined, color: Brand.conditional),
                title: Text(ev.outcome?.clause ?? 'Rejected',
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                subtitle: Text(
                  '${ev.outcome?.reason ?? ''}\n${ev.type} · s${ev.payload['sectionOrdinal']} i${ev.payload['itemOrdinal']}',
                  style: const TextStyle(fontSize: 12),
                ),
                trailing: IconButton(
                  icon: const Icon(Icons.close, size: 18),
                  tooltip: 'Dismiss',
                  onPressed: () {
                    s.dismissRejected(ev.id);
                    Navigator.of(context).pop();
                  },
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _pill(String text, Color bg) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10)),
        child: Text(text, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600)),
      );

  String _shortTitle(ChecksheetTemplate t) {
    if (t.code.contains('general')) return 'General';
    if (t.code.contains('6-1a')) return 'Class 6 & 8';
    if (t.code.contains('2-and-3')) return 'Class 2 & 3.1';
    return t.code;
  }

  List<Widget> _section(ChecksheetSection s) {
    final isCollapsed = _collapsed.contains(s.ordinal);
    final findings = s.items.map((i) => insp.findingFor(template, s, i)).toList();
    final ncCount = findings.where((f) => f.status == FindingStatus.nonCompliant).length;
    final done = findings.where((f) => f.status != FindingStatus.pending).length;

    return [
      InkWell(
        onTap: () => setState(() {
          isCollapsed ? _collapsed.remove(s.ordinal) : _collapsed.add(s.ordinal);
        }),
        child: Container(
          width: double.infinity,
          color: Brand.band,
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
          child: Row(
            children: [
              Icon(isCollapsed ? Icons.chevron_right : Icons.expand_more, size: 20),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  '${s.number ?? s.ordinal}. ${s.title}',
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                ),
              ),
              if (ncCount > 0) ...[
                _pill('$ncCount NC', Brand.nonCompliant),
                const SizedBox(width: 6),
              ],
              Text('$done/${s.items.length}',
                  style: const TextStyle(fontSize: 12, color: Colors.black54)),
            ],
          ),
        ),
      ),
      if (!isCollapsed)
        for (var k = 0; k < s.items.length; k++) _itemTile(s, s.items[k], findings[k]),
    ];
  }

  Widget _itemTile(ChecksheetSection s, ChecksheetItem i, Finding f) {
    final refs = i.regulationRefsFor(insp.classKey);
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: () async {
          await Navigator.of(context).push(MaterialPageRoute(
            builder: (_) => ItemScreen(
              inspection: insp,
              template: template,
              section: s,
              item: i,
              finding: f,
              sync: widget.sync,
            ),
          ));
          setState(() {});
        },
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _statusDot(f.status),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        if (i.number != null)
                          Padding(
                            padding: const EdgeInsets.only(right: 6),
                            child: Text('${i.number}.',
                                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                          ),
                        if (refs.isNotEmpty)
                          Flexible(
                            child: Text(
                              refs.join('  '),
                              style: const TextStyle(
                                  fontSize: 11, color: Brand.teal, fontWeight: FontWeight.w600),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        if (i.evidenceRequired) ...[
                          const SizedBox(width: 6),
                          const Icon(Icons.photo_camera_outlined, size: 14, color: Colors.black38),
                        ],
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      i.action,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 13, height: 1.3),
                    ),
                    if (f.comment.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(
                        f.comment,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 12,
                          fontStyle: FontStyle.italic,
                          color: Brand.forStatus(f.status),
                        ),
                      ),
                    ],
                    if (f.isIncomplete) ...[
                      const SizedBox(height: 6),
                      Row(children: const [
                        Icon(Icons.warning_amber_rounded, size: 14, color: Brand.conditional),
                        SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            'Reason required — IPS 21(1)(f)',
                            style: TextStyle(fontSize: 11, color: Brand.conditional, fontWeight: FontWeight.w600),
                          ),
                        ),
                      ]),
                    ],
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, size: 18, color: Colors.black26),
            ],
          ),
        ),
      ),
    );
  }

  Widget _statusDot(FindingStatus s) => Container(
        width: 30,
        height: 30,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: Brand.forStatus(s).withValues(alpha: s == FindingStatus.pending ? 0.25 : 1),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Text(
          s.shortLabel,
          style: TextStyle(
            color: s == FindingStatus.pending ? Colors.black45 : Colors.white,
            fontSize: 11,
            fontWeight: FontWeight.w800,
          ),
        ),
      );
}
