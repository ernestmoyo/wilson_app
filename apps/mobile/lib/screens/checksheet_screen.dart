import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../generated/checksheets.g.dart';
import '../models/finding.dart';
import '../models/inspection.dart';
import '../models/site_block.dart';
import '../sync/sync_service.dart';
import '../theme.dart';
import '../widgets/answer_control.dart';
import '../widgets/brand_bar.dart';
import '../widgets/subject_editor.dart';
import '../widgets/ui.dart';
import '../bootstrap.dart' show CurrentUser;
import 'item_screen.dart';
import 'sheet_view.dart';

/// The inspection screen: every section and item of the applicable check
/// sheets, with the recorded result against each.
///
/// The item text shown here is the verbatim Performance Standard wording from
/// the generated templates. It is never paraphrased — an inspector reading a
/// summary of a regulation is reading something the regulator did not write.
///
/// Layout (UX change graph, phase U2): a slim white bar (location, client,
/// inspection date, the sheet tabs, the sync state), one progress strip
/// (answered · findings · to go, the filter, Next unanswered), then the
/// sheet: the workbook table from [wideMinWidth] (iPad portrait and up),
/// item cards below it (phones).
class ChecksheetScreen extends StatefulWidget {
  final Inspection inspection;
  final SyncService? sync;

  /// The job's stage. The sheet reads as issued once a certificate is (F3).
  final String? stage;
  const ChecksheetScreen({super.key, required this.inspection, this.sync, this.stage});

  /// The workbook table from here up. 760 rather than 900 so an iPad held
  /// upright (768–834 px) gets the table, not the phone cards.
  static const double wideMinWidth = 760;

  /// Sheet tabs sit in the bar itself from here up; below, under it.
  static const double tabsInBarMinWidth = 900;

  /// The sheet's name on its tab: "General", the class sheet's own name, or
  /// the form's. Never an internal code.
  static String sheetLabel(ChecksheetTemplate t) {
    if (t.code.startsWith('wks17-')) return Wording.sheetName(t.code);
    if (t.code.contains('handler')) return 'Handler assessment';
    if (t.code.contains('fern')) return 'Cylinders (FERN)';
    if (t.code.contains('unrtdg')) return 'UN cylinders';
    return t.title;
  }

  @override
  State<ChecksheetScreen> createState() => _ChecksheetScreenState();
}

class _ChecksheetScreenState extends State<ChecksheetScreen> {
  int _templateIndex = 0;
  SheetFilter _filter = SheetFilter.all;
  final Set<int> _collapsed = {};
  final Map<String, GlobalKey<SheetViewState>> _sheetKeys = {};
  final Map<String, GlobalKey> _tileKeys = {};
  bool _wide = false;
  Timer? _pull;

  Inspection get insp => widget.inspection;
  ChecksheetTemplate get template => insp.templates[_templateIndex];

  @override
  void initState() {
    super.initState();
    final sync = widget.sync;
    if (sync != null && insp.jobId != null) {
      // Every 30 s: send what is queued, then take what the other device sent.
      // Local unsent changes are left alone; see SyncService.pull.
      _pull = Timer.periodic(const Duration(seconds: 30), (_) => sync.syncNow(insp).catchError((_) {}));
    }
  }

  @override
  void dispose() {
    _pull?.cancel();
    widget.sync?.stopAutoFlush();
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

  void _selectTemplate(int i) => setState(() {
        _templateIndex = i;
        _collapsed.clear();
      });

  // ── counts ───────────────────────────────────────────────────────────────

  List<Finding> _findingsInScope(ChecksheetTemplate t) => [
        for (final s in insp.sectionsInScope(t))
          for (final i in s.items) insp.findingFor(t, s, i),
      ];

  /// The first unanswered item in scope: on this sheet first, then the others.
  (int, ChecksheetSection, ChecksheetItem)? _firstPending() {
    final order = [_templateIndex, for (var k = 0; k < insp.templates.length; k++) if (k != _templateIndex) k];
    for (final k in order) {
      final t = insp.templates[k];
      for (final s in insp.sectionsInScope(t)) {
        for (final i in s.items) {
          if (insp.findingFor(t, s, i).status == FindingStatus.pending) return (k, s, i);
        }
      }
    }
    return null;
  }

  void _nextUnanswered() {
    final next = _firstPending();
    if (next == null) {
      showDone(context, 'Every item is answered');
      return;
    }
    final (k, s, i) = next;
    setState(() {
      if (_filter == SheetFilter.findings) _filter = SheetFilter.all;
      if (k != _templateIndex) _templateIndex = k;
      _collapsed.remove(s.ordinal);
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final t = insp.templates[k];
      if (_wide) {
        _sheetKeys[t.code]?.currentState?.reveal(s, i);
      } else {
        final ctx = _tileKeys[insp.findingFor(t, s, i).key]?.currentContext;
        if (ctx != null) Scrollable.ensureVisible(ctx, duration: const Duration(milliseconds: 250), alignment: 0.1);
      }
    });
  }

  // ── build ────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: Listenable.merge([insp, if (widget.sync != null) widget.sync!]),
      builder: (context, _) {
        if (widget.sync != null) _announceRemote(widget.sync!);
        final width = MediaQuery.sizeOf(context).width;
        final tabsInBar = width >= ChecksheetScreen.tabsInBarMinWidth;
        final showTabs = insp.templates.length > 1;
        return Scaffold(
          appBar: BrandBar(
            title: '${insp.locationName} · ${Wording.checkSheet}',
            subtitle: _subtitle(),
            actions: [
              if (showTabs && tabsInBar) ...[_tabs(inBar: true), const SizedBox(width: Space.sm)],
              if (insp.jobId != null)
                width >= ChecksheetScreen.wideMinWidth
                    ? TextButton.icon(
                        key: const ValueKey('to-job'),
                        onPressed: () => context.go('/jobs/${insp.jobId}'),
                        icon: const Icon(Icons.account_tree_outlined, size: 18),
                        label: const Text('Job'),
                      )
                    : IconButton(
                        key: const ValueKey('to-job'),
                        tooltip: 'Job',
                        onPressed: () => context.go('/jobs/${insp.jobId}'),
                        icon: const Icon(Icons.account_tree_outlined, color: Brand.ribbon),
                      ),
              if (widget.sync != null) ...[
                SyncIndicator(
                  sync: widget.sync!,
                  // Refused events first: that list is what needs a person.
                  onTap: () => widget.sync!.rejectedCount > 0 ? _showRejections(widget.sync!) : _syncNow(widget.sync!),
                ),
                _moreMenu(widget.sync!),
              ],
            ],
            bottom: showTabs && !tabsInBar
                ? PreferredSize(preferredSize: const Size.fromHeight(kTouch + 8), child: _tabs(inBar: false))
                : null,
          ),
          body: LayoutBuilder(builder: (context, c) {
            _wide = c.maxWidth >= ChecksheetScreen.wideMinWidth;
            return Column(children: [
              _progressStrip(c.maxWidth),
              Expanded(
                child: _wide
                    ? SheetView(
                        key: _sheetKeys.putIfAbsent(template.code, () => GlobalKey<SheetViewState>()),
                        inspection: insp,
                        template: template,
                        sync: widget.sync,
                        filter: _filter,
                        stage: widget.stage,
                      )
                    : _narrowList(),
              ),
            ]);
          }),
        );
      },
    );
  }

  String _subtitle() {
    final date = SiteBlock.formatDate(insp.siteBlock?.inspectionDate ?? insp.inspectedAt);
    return [insp.pcbuName, if (date.isNotEmpty) 'inspected $date'].join(' · ');
  }

  // ── bar: sheet tabs, sync ──────────────────────────────────────────────────

  /// One segment per sheet: its name and how many items it has in scope.
  Widget _tabs({required bool inBar}) {
    final tabs = Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(color: Neutral.canvas, borderRadius: BorderRadius.circular(Radii.sm + 2)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var k = 0; k < insp.templates.length; k++) _tab(k),
        ],
      ),
    );
    if (inBar) return tabs;
    return Container(
      height: kTouch + 8,
      alignment: Alignment.centerLeft,
      padding: const EdgeInsets.symmetric(horizontal: Space.md),
      decoration: const BoxDecoration(color: Colors.white, border: Border(bottom: BorderSide(color: Neutral.line))),
      child: SingleChildScrollView(scrollDirection: Axis.horizontal, child: tabs),
    );
  }

  Widget _tab(int k) {
    final t = insp.templates[k];
    final selected = k == _templateIndex;
    final n = _findingsInScope(t).length;
    return Semantics(
      button: true,
      selected: selected,
      child: Material(
        color: selected ? Colors.white : Colors.transparent,
        borderRadius: BorderRadius.circular(Radii.sm),
        elevation: selected ? 1 : 0,
        child: InkWell(
          key: ValueKey('sheet-tab-$k'),
          borderRadius: BorderRadius.circular(Radii.sm),
          onTap: selected ? null : () => _selectTemplate(k),
          child: Container(
            height: kTouch - 6,
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: Space.md),
            child: Text(
              '${ChecksheetScreen.sheetLabel(t)} · $n',
              style: TextStyle(
                fontSize: 14,
                fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
                color: selected ? Brand.ribbon : Neutral.body,
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _syncNow(SyncService s) async {
    if (s.isFlushing) return;
    try {
      await s.syncNow(insp);
    } catch (_) {
      // The indicator shows offline; nothing else to say.
    }
  }

  Widget _moreMenu(SyncService s) => PopupMenuButton<String>(
        key: const ValueKey('sheet-more'),
        tooltip: 'More',
        icon: const Icon(Icons.more_vert, color: Brand.ribbon),
        onSelected: (v) => v == 'sync' ? _syncNow(s) : _showRejections(s),
        itemBuilder: (_) => [
          PopupMenuItem(
            value: 'sync',
            enabled: !s.isFlushing,
            child: const Row(children: [Icon(Icons.sync, size: 20), SizedBox(width: Space.sm), Text('Sync now')]),
          ),
          if (s.rejectedCount > 0)
            PopupMenuItem(
              value: 'rejected',
              child: Row(children: [
                Icon(Icons.report_gmailerrorred, size: 20, color: Tone.bad.fg),
                const SizedBox(width: Space.sm),
                Text('Not accepted by the server (${s.rejectedCount})'),
              ]),
            ),
        ],
      );

  void _showRejections(SyncService s) {
    showModalBottomSheet(
      context: context,
      showDragHandle: true,
      builder: (_) => ListView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
        shrinkWrap: true,
        children: [
          Text('Not accepted by the server', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 4),
          Text(
            'Each refusal names the clause it fails. Fix the finding and it will resend.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 12),
          for (final ev in s.rejected)
            Card(
              margin: const EdgeInsets.only(bottom: 8),
              child: ListTile(
                leading: Icon(Icons.report_gmailerrorred, color: Tone.bad.fg),
                title: Text(ev.outcome?.clause ?? 'Not accepted', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                subtitle: Text(
                  [
                    if ((ev.outcome?.reason ?? '').isNotEmpty) ev.outcome!.reason!,
                    _eventItem(ev.payload),
                  ].join('\n'),
                  style: const TextStyle(fontSize: 13),
                ),
                trailing: IconButton(
                  icon: const Icon(Icons.close),
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

  static String _eventItem(Map<String, dynamic> p) {
    final code = p['templateCode'], s = p['sectionOrdinal'], i = p['itemOrdinal'];
    if (code is String && s is int && i is int) return Wording.itemRef(code, s, i);
    return '';
  }

  // ── progress strip ─────────────────────────────────────────────────────────

  Widget _progressStrip(double width) {
    final fs = _findingsInScope(template);
    final total = fs.length;
    final answered = fs.where((f) => f.status != FindingStatus.pending).length;
    final findings = fs.where((f) => f.status == FindingStatus.nonCompliant).length;
    final toGo = total - answered;
    final decision = sheetDecision(insp, stage: widget.stage);

    final summary = Text(
      // What is left to answer is on the "To answer" chip beside it.
      '$answered of $total answered · $findings finding${findings == 1 ? '' : 's'}',
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Neutral.strong),
    );
    final badges = [
      StatusBadge(label: decision.label, tone: decision.tone, icon: decision.icon, dense: true),
      if (widget.sync != null && insp.inspectionId == null) ...[
        const SizedBox(width: 6),
        const StatusBadge(label: 'Not on server', tone: Tone.warn, icon: Icons.cloud_off_outlined, dense: true),
      ],
    ];
    final bar = ClipRRect(
      borderRadius: BorderRadius.circular(Radii.pill),
      child: SizedBox(
        height: 6,
        child: Row(children: [
          if (answered - findings > 0) Expanded(flex: answered - findings, child: ColoredBox(color: Tone.good.fg)),
          if (findings > 0) Expanded(flex: findings, child: ColoredBox(color: Tone.bad.fg)),
          if (toGo > 0) Expanded(flex: toGo, child: const ColoredBox(color: Neutral.lineSoft)),
        ]),
      ),
    );
    final chips = [
      _filterChip(SheetFilter.all, 'All', 'filter-all'),
      _filterChip(SheetFilter.toAnswer, 'To answer · $toGo', 'filter-to-answer'),
      _filterChip(SheetFilter.findings, 'Findings · $findings', 'filter-findings'),
    ];
    final next = OutlinedButton.icon(
      key: const ValueKey('next-unanswered'),
      onPressed: _firstPending() == null ? null : _nextUnanswered,
      icon: const Icon(Icons.south, size: 18),
      label: const Text('Next unanswered'),
    );

    // The badges give way (ellipsis) before anything overflows.
    final badgeBox = Flexible(
      flex: 2,
      child: Row(mainAxisSize: MainAxisSize.min, children: [for (final b in badges) b is SizedBox ? b : Flexible(child: b)]),
    );
    final Widget content;
    if (width >= 1000) {
      content = Row(children: [
        Expanded(
          flex: 3,
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            summary,
            const SizedBox(height: 6),
            bar,
          ]),
        ),
        const SizedBox(width: Space.md),
        badgeBox,
        const SizedBox(width: Space.md),
        for (final c in chips) ...[c, const SizedBox(width: 6)],
        const SizedBox(width: Space.sm),
        next,
      ]);
    } else {
      content = Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const SizedBox(height: Space.xs),
        Row(children: [Expanded(flex: 3, child: summary), const SizedBox(width: Space.sm), badgeBox]),
        const SizedBox(height: 6),
        bar,
        const SizedBox(height: Space.xs),
        Wrap(
          spacing: 6,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [...chips, next],
        ),
      ]);
    }
    return Container(
      decoration: const BoxDecoration(color: Colors.white, border: Border(bottom: BorderSide(color: Neutral.line))),
      padding: const EdgeInsets.symmetric(horizontal: Space.lg, vertical: 2),
      child: content,
    );
  }

  Widget _filterChip(SheetFilter f, String label, String key) => ChoiceChip(
        key: ValueKey(key),
        label: Text(label),
        selected: _filter == f,
        showCheckmark: false,
        onSelected: (_) => setState(() => _filter = f),
      );

  // ── phone: item cards ──────────────────────────────────────────────────────

  /// Every card is built (not a lazy list) so "Next unanswered" can scroll
  /// to any of them; a sheet is at most a few dozen items.
  Widget _narrowList() {
    final sheet = template.sheetFor(insp.classKey);
    final sections = [
      for (final s in insp.sectionsInScope(template))
        (s, [for (final i in s.items) if (_filter.shows(insp.findingFor(template, s, i))) i]),
    ].where((x) => _filter == SheetFilter.all || x.$2.isNotEmpty).toList();
    return SingleChildScrollView(
      padding: const EdgeInsets.only(bottom: 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (sheet.kind != 'location')
            Card(
              margin: const EdgeInsets.fromLTRB(8, 8, 8, 4),
              child: Column(children: [
                SubjectEditor(inspection: insp, sheet: sheet, readOnly: !CurrentUser.canRecord),
                if (sheet.hasUnits) UnitsEditor(inspection: insp, sheet: sheet, readOnly: !CurrentUser.canRecord),
              ]),
            ),
          if (sections.isEmpty)
            EmptyState(
              icon: _filter == SheetFilter.findings ? Icons.verified_outlined : Icons.task_alt,
              title: _filter == SheetFilter.findings ? 'No findings on this sheet' : 'Every item on this sheet is answered',
            ),
          for (final (s, items) in sections) ..._section(s, items),
        ],
      ),
    );
  }

  /// The workbook's number, or the item's position when the section carries
  /// no numbers at all (the cylinder sheets); a blank in a numbered section
  /// stays blank, as it is a continuation row in the workbook.
  static String? _numberFor(ChecksheetSection s, ChecksheetItem i) =>
      i.number ?? (s.items.every((x) => x.number == null) ? '${i.ordinal}' : null);

  List<Widget> _section(ChecksheetSection s, List<ChecksheetItem> items) {
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
          constraints: const BoxConstraints(minHeight: kTouch),
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
          child: Row(
            children: [
              Icon(isCollapsed ? Icons.chevron_right : Icons.expand_more, size: 20, color: Neutral.body),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  '${s.number ?? s.ordinal}. ${s.title}',
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: Neutral.strong),
                ),
              ),
              if (ncCount > 0) ...[
                StatusBadge(label: '$ncCount non-compliant', tone: Tone.bad, dense: true),
                const SizedBox(width: 6),
              ],
              Text('$done/${s.items.length}', style: const TextStyle(fontSize: 13, color: Neutral.muted)),
            ],
          ),
        ),
      ),
      if (!isCollapsed)
        for (final i in items) _itemTile(s, i, insp.findingFor(template, s, i)),
    ];
  }

  Future<void> _openItem(ChecksheetSection s, ChecksheetItem i, Finding f) async {
    final router = GoRouter.maybeOf(context);
    if (router != null && insp.jobId != null) {
      // Through the router, so the item has a URL (UX B10); the sheet stays
      // beneath it and back returns to it. This screen redraws from the
      // inspection when the item changes.
      router.go(ItemScreen.pathFor(insp.jobId!, template.code, s.ordinal, i.ordinal));
      return;
    } else {
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
    }
    if (mounted) setState(() {});
  }

  Widget _itemTile(ChecksheetSection s, ChecksheetItem i, Finding f) {
    final refs = i.regulationRefsFor(insp.classKey);
    final number = _numberFor(s, i);
    return KeyedSubtree(
      key: _tileKeys.putIfAbsent(f.key, () => GlobalKey()),
      child: Card(
        key: ValueKey('item-${f.key}'),
        child: InkWell(
          borderRadius: BorderRadius.circular(Radii.md),
          onTap: () => _openItem(s, i, f),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              if (number != null)
                                Padding(
                                  padding: const EdgeInsets.only(right: 6),
                                  child: Text('$number.',
                                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: Neutral.strong)),
                                ),
                              if (refs.isNotEmpty)
                                Flexible(
                                  child: Text(
                                    refs.join('  '),
                                    style: const TextStyle(fontSize: 13, color: Brand.teal, fontWeight: FontWeight.w600),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              if (i.evidenceRequired) ...[
                                const SizedBox(width: 6),
                                const Icon(Icons.photo_camera_outlined, size: 16, color: Neutral.faint),
                              ],
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(
                            i.action,
                            maxLines: 3,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 14, height: 1.4, color: Neutral.strong),
                          ),
                          if (f.comment.isNotEmpty) ...[
                            const SizedBox(height: 6),
                            Text(
                              f.comment,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 13,
                                fontStyle: FontStyle.italic,
                                // The workbook's colours on the comment (UX B2).
                                color: switch (f.status) {
                                  FindingStatus.nonCompliant => Brand.nonCompliant,
                                  FindingStatus.compliant => Brand.compliant,
                                  _ => Neutral.body,
                                },
                              ),
                            ),
                          ],
                          if (f.isIncomplete) ...[
                            const SizedBox(height: 6),
                            Row(children: [
                              Icon(Icons.warning_amber_rounded, size: 16, color: Tone.warn.fg),
                              const SizedBox(width: 4),
                              Expanded(
                                child: Text(
                                  '${Wording.ncReason} is required — IPS 21(1)(f)',
                                  style: TextStyle(fontSize: 13, color: Tone.warn.fg, fontWeight: FontWeight.w600),
                                ),
                              ),
                            ]),
                          ],
                        ],
                      ),
                    ),
                    const Icon(Icons.chevron_right, size: 20, color: Neutral.faint),
                  ],
                ),
                const SizedBox(height: Space.sm),
                AnswerControl(
                  keyPrefix: 'answer-${f.key}',
                  status: f.status,
                  onChanged: !CurrentUser.canRecord ? null : (v) => insp.update(f, (x) => x.status = v),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
