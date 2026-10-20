import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../bootstrap.dart' show CurrentUser;
import '../generated/checksheets.g.dart';
import '../models/finding.dart';
import '../models/inspection.dart';
import '../models/site_block.dart';
import '../sync/sync_service.dart';
import '../theme.dart';
import '../widgets/answer_control.dart';
import '../widgets/company_details.dart';
import '../widgets/subject_editor.dart';
import '../widgets/ui.dart';
import 'evidence_capture.dart';

/// Which items the sheet shows: all, those still to answer, or the findings
/// (non-compliances). Sections with nothing to show fold away entirely.
enum SheetFilter {
  all,
  toAnswer,
  findings;

  bool shows(Finding f) => switch (this) {
        SheetFilter.all => true,
        SheetFilter.toAnswer => f.status == FindingStatus.pending,
        SheetFilter.findings => f.status == FindingStatus.nonCompliant,
      };
}

/// Where a section stands, for the section list: every item answered, a
/// non-compliance in it, started, or untouched.
enum SectionState {
  complete('complete', Icons.check_circle, Tone.good),
  finding('finding', Icons.error, Tone.bad),
  partial('partial', Icons.timelapse, Tone.info),
  notStarted('not-started', Icons.radio_button_unchecked, Tone.neutral);

  final String key;
  final IconData icon;
  final Tone tone;
  const SectionState(this.key, this.icon, this.tone);

  static SectionState of(Inspection insp, ChecksheetTemplate t, ChecksheetSection s) {
    final fs = [for (final i in s.items) insp.findingFor(t, s, i)];
    final done = fs.where((f) => f.status != FindingStatus.pending).length;
    if (fs.any((f) => f.status == FindingStatus.nonCompliant)) return finding;
    if (fs.isNotEmpty && done == fs.length) return complete;
    if (done > 0) return partial;
    return notStarted;
  }

  String get label => switch (this) {
        complete => 'Complete',
        finding => 'Has a finding',
        partial => 'In progress',
        notStarted => 'Not started',
      };
}

/// The decision as the sheet should state it: the issued certificate once
/// there is one (F3), otherwise the reg 13.39 grant gate.
({String label, Tone tone, IconData icon}) sheetDecision(Inspection insp, {String? stage}) {
  final d = insp.certificateDecision;
  if (d == 'granted') return (label: 'Certificate issued', tone: Tone.good, icon: Icons.verified_outlined);
  if (d == 'conditional') {
    return (label: 'Conditional certificate issued', tone: Tone.good, icon: Icons.verified_outlined);
  }
  if (d == 'refused') return (label: 'Certificate refused', tone: Tone.bad, icon: Icons.block);
  if (stage == 'certificate_issued' || stage == 'monitoring') {
    return (label: 'Certificate issued', tone: Tone.good, icon: Icons.verified_outlined);
  }
  return insp.canGrant
      ? (label: 'Can grant', tone: Tone.good, icon: Icons.check_circle_outline)
      : (label: 'Cannot grant yet', tone: Tone.neutral, icon: Icons.pending_outlined);
}

/// The check sheet as the workbook lays it out, for wide screens.
///
/// Same order, same words: the site block (rows 2–14), the title and banner,
/// the column headers — Item · Regulation · Action · Records · Comments ·
/// Evidence Portfolio — every section as a full-width row, every item as a
/// row, then the NB note, the declaration with its signature, the Decision
/// row, Document Control beside Scope of Authorisation, the Reference and the
/// footer. Comments are edited in place; non-compliances are red, as on paper.
///
/// The result is answered in one tap at the head of the Comments cell (UX
/// B6) — the workbook records the result as the colour of the comment, so
/// that is where it belongs.
class SheetView extends StatefulWidget {
  final Inspection inspection;
  final ChecksheetTemplate template;
  final SyncService? sync;

  /// Which items to show (the progress strip's chips).
  final SheetFilter filter;

  /// The job's stage, so the Decision row reads as issued once it is (F3).
  final String? stage;

  const SheetView({
    super.key,
    required this.inspection,
    required this.template,
    this.sync,
    this.filter = SheetFilter.all,
    this.stage,
  });

  /// At this width and above the section list sits beside the sheet; below
  /// it, a row of jump chips above it.
  static const double sectionListMinWidth = 1100;

  @override
  State<SheetView> createState() => SheetViewState();
}

class SheetViewState extends State<SheetView> {
  final _comment = <String, TextEditingController>{};
  final _reason = <String, TextEditingController>{};
  final _general = <String, TextEditingController>{};
  final _na = <String, TextEditingController>{};

  /// Rows 2–14 are on the sheet verbatim but folded behind one line, so the
  /// checklist starts on the first screen.
  bool _siteBlockOpen = false;

  /// Sections fold on their band row; a folded section still shows its
  /// count. The section list (or the chips) jumps to a section and unfolds it.
  final Set<int> _folded = {};
  final Map<int, GlobalKey> _sectionKeys = {};
  final Map<String, GlobalKey> _itemKeys = {};
  GlobalKey _keyFor(ChecksheetSection s) => _sectionKeys.putIfAbsent(s.ordinal, () => GlobalKey());

  void _jumpTo(ChecksheetSection s) {
    setState(() => _folded.remove(s.ordinal));
    _ensureVisible(() => _keyFor(s), 0.02);
  }

  /// Bring one item's row into view, unfolding its section ("Next unanswered").
  void reveal(ChecksheetSection s, ChecksheetItem i) {
    setState(() => _folded.remove(s.ordinal));
    final key = insp.findingFor(t, s, i).key;
    _ensureVisible(() => _itemKeys[key], 0.1);
  }

  void _ensureVisible(GlobalKey? Function() key, double alignment) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final ctx = key()?.currentContext;
      if (ctx != null) {
        Scrollable.ensureVisible(ctx, duration: const Duration(milliseconds: 250), alignment: alignment);
      }
    });
  }

  Inspection get insp => widget.inspection;
  ChecksheetTemplate get t => widget.template;
  SheetMeta get sheet => t.sheetFor(insp.classKey);
  bool get isClassSheet => !t.code.contains('general');

  /// The grid's rules: a mid grey that reads as a printed table.
  static final _rule = Neutral.faint.withValues(alpha: .5);
  static const _cellPad = EdgeInsets.symmetric(horizontal: 8, vertical: 6);
  static const _text = TextStyle(fontSize: 13, height: 1.35, color: Neutral.strong);
  static const _bold = TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Neutral.strong);

  // Grid slots: item | regulation | action | records | comments | evidence.
  // Column proportions approximate the workbook's widths; a zero flex hides
  // the slot. The location sheets use all six; the cylinder sheets have
  // Item | Check | Records | Comments | Evidence; the handler sheet has
  // Ref | Requirement | Comments. Comments is wider than the workbook's
  // because the answer sits at its head.
  static const _flexLocation = [6, 11, 26, 22, 34, 11];
  static const _flexFiveCol = [6, 0, 34, 21, 30, 9];
  static const _flexThreeCol = [7, 0, 47, 0, 35, 11];
  List<int> get _flex => sheet.kind == 'location'
      ? _flexLocation
      : sheet.columnHeaders.length >= 5
          ? _flexFiveCol
          : _flexThreeCol;

  @override
  void dispose() {
    for (final c in [..._comment.values, ..._reason.values, ..._general.values, ..._na.values]) {
      c.dispose();
    }
    super.dispose();
  }

  /// Which inline fields have the caret: those keep what is being typed; the
  /// rest follow the model, so a change pulled from another device shows.
  final Set<String> _focused = {};

  /// [fieldKey] is the key the field registers in [_focused] while it has the
  /// caret; the model only overwrites a field that is not being typed in.
  TextEditingController _ctl(Map<String, TextEditingController> m, String key, String text, String fieldKey) {
    final ctl = m.putIfAbsent(key, () => TextEditingController(text: text));
    if (!_focused.contains(fieldKey) && ctl.text != text) ctl.text = text;
    return ctl;
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (context, box) => box.maxWidth >= SheetView.sectionListMinWidth
            ? Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                SizedBox(width: 248, child: _sectionList()),
                const VerticalDivider(width: 1, thickness: 1, color: Neutral.line),
                Expanded(child: _sheet()),
              ])
            : Column(children: [
                _jumpBar(),
                Expanded(child: _sheet()),
              ]),
      );

  // ── section list (wide) and jump chips (narrower) ──────────────────────────

  ({int done, int total}) _count(ChecksheetSection s) {
    final done = s.items.where((i) => insp.findingFor(t, s, i).status != FindingStatus.pending).length;
    return (done: done, total: s.items.length);
  }

  Widget _sectionList() {
    final sections = insp.sectionsInScope(t);
    return Container(
      color: Neutral.surface,
      child: ListView(
        padding: const EdgeInsets.symmetric(vertical: Space.sm),
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(Space.lg, Space.xs, Space.lg, Space.sm),
            child: Text('Sections', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Neutral.muted)),
          ),
          for (final s in sections) _sectionEntry(s),
        ],
      ),
    );
  }

  Widget _sectionEntry(ChecksheetSection s) {
    final state = SectionState.of(insp, t, s);
    final c = _count(s);
    return Semantics(
      button: true,
      label: '${s.number ?? s.ordinal} ${s.title}, ${state.label}, ${c.done} of ${c.total}',
      excludeSemantics: true,
      child: InkWell(
        key: ValueKey('jump-${s.ordinal}'),
        onTap: () => _jumpTo(s),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: kTouch),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: Space.md, vertical: 6),
            child: Row(children: [
              Icon(state.icon,
                  key: ValueKey('jump-state-${s.ordinal}-${state.key}'),
                  size: 18,
                  color: state == SectionState.notStarted ? Neutral.faint : state.tone.fg),
              const SizedBox(width: Space.sm),
              SizedBox(
                width: 22,
                child: Text(s.number ?? '${s.ordinal}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Neutral.muted)),
              ),
              Expanded(
                child: Text(s.title,
                    maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14, color: Neutral.strong, height: 1.3)),
              ),
              const SizedBox(width: Space.sm),
              Text('${c.done}/${c.total}', style: const TextStyle(fontSize: 13, color: Neutral.muted)),
            ]),
          ),
        ),
      ),
    );
  }

  /// One chip per section: status icon, number, a short title, done/total.
  /// Stays put while the sheet scrolls.
  Widget _jumpBar() => Container(
        color: Neutral.canvas,
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
        child: SizedBox(
          height: kTouch,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: insp.sectionsInScope(t).length,
            separatorBuilder: (_, _) => const SizedBox(width: 6),
            itemBuilder: (_, k) {
              final s = insp.sectionsInScope(t)[k];
              final state = SectionState.of(insp, t, s);
              final c = _count(s);
              return ActionChip(
                key: ValueKey('jump-${s.ordinal}'),
                onPressed: () => _jumpTo(s),
                avatar: Icon(state.icon,
                    key: ValueKey('jump-state-${s.ordinal}-${state.key}'),
                    size: 16,
                    color: state == SectionState.notStarted ? Neutral.faint : state.tone.fg),
                side: BorderSide(color: state == SectionState.notStarted ? Neutral.line : state.tone.fg.withValues(alpha: .4)),
                backgroundColor: Neutral.surface,
                label: Text(
                  '${s.number ?? s.ordinal}  ${_shortTitle(s.title)}  ${c.done}/${c.total}',
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: Neutral.strong),
                ),
              );
            },
          ),
        ),
      );

  static String _shortTitle(String title) {
    const cut = 22;
    return title.length <= cut ? title : '${title.substring(0, cut - 1).trimRight()}…';
  }

  // ── the sheet ────────────────────────────────────────────────────────────

  Widget _sheet() {
    final filter = widget.filter;
    final sections = [
      for (final s in insp.sectionsInScope(t))
        (s, [for (final i in s.items) if (filter.shows(insp.findingFor(t, s, i))) i]),
    ].where((x) => filter == SheetFilter.all || x.$2.isNotEmpty).toList();
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 48),
      child: Container(
        decoration: BoxDecoration(color: Colors.white, border: Border.all(color: _rule)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _letterhead(),
            _titleRow(),
            if (sheet.kind == 'location' && insp.siteBlock != null) ..._siteBlockFolded(insp.siteBlock!),
            if (sheet.kind != 'location') ...[
              SubjectEditor(inspection: insp, sheet: sheet, readOnly: !CurrentUser.canRecord),
              if (sheet.hasUnits) UnitsEditor(inspection: insp, sheet: sheet, readOnly: !CurrentUser.canRecord),
            ],
            if (sheet.banner != null) _bandRow(sheet.banner!, bold: true),
            _columnHeaders(),
            if (sections.isEmpty)
              EmptyState(
                icon: filter == SheetFilter.findings ? Icons.verified_outlined : Icons.task_alt,
                title: filter == SheetFilter.findings ? 'No findings on this sheet' : 'Every item on this sheet is answered',
              ),
            for (final (s, items) in sections) ...[
              KeyedSubtree(key: _keyFor(s), child: _sectionRow(s)),
              if (!_folded.contains(s.ordinal))
                for (final i in items) _itemRow(s, i),
            ],
            if (sheet.note != null) _noteRow(sheet.note!),
            if (sheet.declaration != null) _declaration(sheet.declaration!),
            if (isClassSheet) _decisionRow(),
            if (sheet.documentControl != null || sheet.scopeOfAuthorisation != null) _controlAndScope(),
            if (sheet.reference != null) _referenceRow(sheet.reference!),
            if (sheet.footer != null) _footer(sheet.footer!),
            _ribbon(),
          ],
        ),
      ),
    );
  }

  // ── letterhead: the same three images the certificate carries ────────────

  // The contact block is text, not the workbook's pasted bitmap: it stays
  // crisp at any width and reads the same on the certificate.
  Widget _letterhead() => Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Image.asset('assets/brand/logo-white.png', height: 56, fit: BoxFit.contain,
                errorBuilder: (_, _, _) => const SizedBox.shrink()),
            const SizedBox(width: 16),
            // The contact block wraps rather than pushing past a narrow sheet.
            const Expanded(child: Align(alignment: Alignment.centerRight, child: CompanyDetails())),
          ],
        ),
      );

  Widget _ribbon() => Image.asset('assets/brand/bottom-ribbon.png',
      width: double.infinity, fit: BoxFit.fitWidth,
      errorBuilder: (_, _, _) => Container(height: 6, color: Brand.ribbon));

  // ── rows 1 and 2–14 ──────────────────────────────────────────────────────

  Widget _titleRow() => Row(
        children: [
          Expanded(
            flex: 9,
            child: _cell(
              Text(sheet.title ?? t.title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15, color: Neutral.strong)),
              top: false,
            ),
          ),
          Expanded(
            flex: 2,
            child: _cell(
              Text(sheet.evidenceColumnLabel ?? (sheet.kind == 'location' ? 'Evidence Portfolio' : 'Evidence'),
                  textAlign: TextAlign.center, style: _bold),
              top: false,
              left: true,
            ),
          ),
        ],
      );

  List<Widget> _siteBlockFolded(SiteBlock sb) => [
        InkWell(
          key: const ValueKey('site-block-toggle'),
          onTap: () => setState(() => _siteBlockOpen = !_siteBlockOpen),
          child: Container(
            color: Neutral.canvas,
            constraints: const BoxConstraints(minHeight: kTouch),
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            child: Row(children: [
              Icon(_siteBlockOpen ? Icons.expand_less : Icons.expand_more, size: 20, color: Neutral.muted),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  _siteBlockOpen
                      ? 'Site details (rows 2 to 14)'
                      : [
                          sb.legalEntityName,
                          sb.siteAddress,
                          if (sb.inspectionDate != null) 'inspected ${SiteBlock.formatDate(sb.inspectionDate)}',
                          if ((sb.managerName ?? '').isNotEmpty) 'manager ${sb.managerName}',
                        ].where((x) => x != null && x.isNotEmpty).join('  ·  '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Neutral.strong),
                ),
              ),
              Text(_siteBlockOpen ? 'Hide' : 'Show site details',
                  style: const TextStyle(fontSize: 13, color: Brand.ribbon, fontWeight: FontWeight.w600)),
            ]),
          ),
        ),
        if (_siteBlockOpen) ..._siteBlock(sb),
      ];

  List<Widget> _siteBlock(SiteBlock sb) => [
        for (final r in sb.rows())
          _TRow(
            children: [
              Expanded(flex: 3, child: _cell(_label(r.label))),
              if (r.label2 == null)
                Expanded(flex: 6, child: _cell(Text(r.value, style: _text)))
              else ...[
                Expanded(flex: 2, child: _cell(Text(r.value, style: _text))),
                Expanded(flex: 2, child: _cell(_label(r.label2!), left: true)),
                Expanded(flex: 2, child: _cell(Text(r.value2 ?? '', style: _text))),
              ],
              Expanded(flex: 2, child: _cell(const SizedBox.shrink(), left: true)),
            ],
          ),
      ];

  // ── table ────────────────────────────────────────────────────────────────

  Widget _bandRow(String text, {bool bold = false}) => Container(
        color: Brand.band,
        padding: _cellPad,
        child: Text(text,
            style: TextStyle(fontSize: 13, fontWeight: bold ? FontWeight.w700 : FontWeight.w600, color: Neutral.strong)),
      );

  Widget _columnHeaders() {
    final h = [...sheet.columnHeaders];
    while (h.length < 5) {
      h.add('');
    }
    // Form sheets name three columns (ref, requirement, comments); map them
    // onto the six-column grid with the unused ones collapsed.
    final labels = sheet.kind == 'location'
        ? [...h.take(5), sheet.evidenceColumnLabel ?? 'Evidence Portfolio']
        : sheet.columnHeaders.length >= 5
            ? [h[0], '', h[1], h[2], h[3], h[4]]
            : [h[0], '', h[1], '', h[2], sheet.evidenceColumnLabel ?? 'Evidence'];
    return Container(
      color: Neutral.lineSoft,
      child: _RuledRow(
        rule: _rule,
        flex: [for (final f in _flex) if (f > 0) f],
        cells: [
          for (var k = 0; k < 6; k++)
            if (_flex[k] > 0) Padding(padding: _cellPad, child: Text(labels[k], style: _bold)),
        ],
      ),
    );
  }

  Widget _sectionRow(ChecksheetSection s) {
    final c = _count(s);
    final nc = s.items.where((i) => insp.findingFor(t, s, i).status == FindingStatus.nonCompliant).length;
    final folded = _folded.contains(s.ordinal);
    return InkWell(
      key: ValueKey('section-${s.ordinal}'),
      onTap: () => setState(() => folded ? _folded.remove(s.ordinal) : _folded.add(s.ordinal)),
      child: Container(
        color: Brand.band,
        child: _RuledRow(
          rule: _rule,
          flex: [_flex[0], _flex.skip(1).fold(0, (a, b) => a + b)],
          cells: [
            Padding(
              padding: _cellPad,
              child: Row(children: [
                Icon(folded ? Icons.chevron_right : Icons.expand_more, size: 16, color: Neutral.body),
                const SizedBox(width: 2),
                Flexible(child: Text(s.number ?? '', style: _bold)),
              ]),
            ),
            Padding(
              padding: _cellPad,
              child: Row(children: [
                Expanded(child: Text(s.title, style: _bold)),
                if (nc > 0)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: Text('$nc non-compliant',
                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Brand.nonCompliant)),
                  ),
                Text('${c.done}/${c.total}', style: const TextStyle(fontSize: 13, color: Neutral.body)),
              ]),
            ),
          ],
        ),
      ),
    );
  }

  Widget _itemRow(ChecksheetSection s, ChecksheetItem i) {
    final f = insp.findingFor(t, s, i);
    final refs = i.regulationRefsFor(insp.classKey);
    final nc = f.status == FindingStatus.nonCompliant;
    final na = f.status == FindingStatus.notApplicable;
    final commentCtl = _ctl(_comment, f.key, f.comment, 'c:${f.key}');
    final reasonCtl = _ctl(_reason, f.key, f.failureReason, 'r:${f.key}');
    final generalCtl = _ctl(_general, f.key, f.generalComment, 'g:${f.key}');
    final naCtl = _ctl(_na, f.key, f.naReason, 'na:${f.key}');

    // F2: a finding recorded with the same words as its comment and its
    // reason shows them once — the reason field, which IPS 21(1)(f) needs —
    // and editing it keeps the two in step.
    final linked = nc &&
        f.comment.trim().isNotEmpty &&
        f.comment.trim() == f.failureReason.trim() &&
        !_focused.contains('c:${f.key}');

    final cells = <Widget>[
      // Item: the workbook's number.
      Padding(
        padding: _cellPad,
        child: Text(i.number ?? (s.items.every((x) => x.number == null) ? '${i.ordinal}' : ''), style: _bold),
      ),
      if (_flex[1] > 0)
        Padding(
          padding: _cellPad,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final r in refs)
                Text(r, style: const TextStyle(fontSize: 13, color: Brand.teal, fontWeight: FontWeight.w600)),
              if (i.guidanceUrl != null) _guidanceLink(f, i.guidanceUrl!),
            ],
          ),
        ),
      Padding(padding: _cellPad, child: Text(i.action, style: _text)),
      if (_flex[3] > 0) Padding(padding: _cellPad, child: Text(i.records, style: _text)),
      Padding(
        padding: _cellPad,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AnswerControl(
              keyPrefix: 'answer-${f.key}',
              status: f.status,
              onChanged: !CurrentUser.canRecord
                  ? null
                  : (v) {
                      insp.update(f, (x) => x.status = v);
                      setState(() {});
                    },
            ),
            if (!linked) ...[
              const SizedBox(height: 6),
              _inlineField(
                commentCtl,
                hint: '', // the workbook cell is blank; the column header says Comments
                // As the workbooks: red a finding, green compliant.
                color: nc ? Brand.nonCompliant : f.status == FindingStatus.compliant ? Brand.compliant : Neutral.strong,
                current: f.comment,
                fieldKey: 'c:${f.key}',
                onCommit: (v) => insp.update(f, (x) => x.comment = v),
              ),
            ],
            if (nc) ...[
              const SizedBox(height: 6),
              _inlineField(
                reasonCtl,
                hint: '${Wording.ncReason} — IPS 21(1)(f)',
                color: Brand.nonCompliant,
                error: f.isIncomplete,
                current: f.failureReason,
                fieldKey: 'r:${f.key}',
                onCommit: (v) => insp.update(f, (x) {
                  x.failureReason = v;
                  if (linked) x.comment = v;
                }),
              ),
            ],
            if (na) ...[
              const SizedBox(height: 6),
              _inlineField(
                naCtl,
                hint: 'Why not applicable (optional)',
                color: Brand.notApplicable,
                current: f.naReason,
                fieldKey: 'na:${f.key}',
                onCommit: (v) => insp.update(f, (x) => x.naReason = v),
              ),
            ],
            const SizedBox(height: 6),
            _inlineField(
              generalCtl,
              hint: 'General comment',
              color: Brand.generalComment,
              current: f.generalComment,
              fieldKey: 'g:${f.key}',
              onCommit: (v) => insp.update(f, (x) => x.generalComment = v),
            ),
          ],
        ),
      ),
      Padding(padding: _cellPad, child: _evidenceCell(f)),
    ];

    return KeyedSubtree(
      key: _itemKeys.putIfAbsent(f.key, () => GlobalKey()),
      child: _RuledRow(
        key: ValueKey('item-${f.key}'),
        rule: _rule,
        flex: [for (final x in _flex) if (x > 0) x],
        cells: cells,
      ),
    );
  }

  /// The guidance URL the workbook cites, as a link that opens it.
  Widget _guidanceLink(Finding f, String url) => Padding(
        key: ValueKey('guidance-${f.key}'),
        padding: const EdgeInsets.only(top: 4),
        child: Semantics(
          link: true,
          child: InkWell(
            onTap: () async {
              try {
                await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
              } catch (_) {
                // No browser to hand (tests, a locked-down device): nothing to do.
              }
            },
            child: Text(url,
                style: const TextStyle(
                    fontSize: 12, color: Brand.generalComment, decoration: TextDecoration.underline)),
          ),
        ),
      );

  Widget _inlineField(
    TextEditingController ctl, {
    required String hint,
    required Color color,
    required void Function(String) onCommit,
    bool error = false,
    String? current,
    String? fieldKey,
  }) =>
      Focus(
        onFocusChange: (has) {
          if (fieldKey != null) has ? _focused.add(fieldKey) : _focused.remove(fieldKey);
          // Commit on leaving, and only what actually changed: the field must
          // never write an old value back over one pulled from another device.
          if (!has && CurrentUser.canRecord && (current == null || ctl.text != current)) onCommit(ctl.text);
        },
        child: TextField(
          controller: ctl,
          readOnly: !CurrentUser.canRecord,
          minLines: 1,
          maxLines: 8,
          style: TextStyle(fontSize: 13, color: color, height: 1.35),
          decoration: InputDecoration(
            isDense: true,
            hintText: hint,
            hintStyle: const TextStyle(fontSize: 13, color: Neutral.muted),
            contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
            filled: true,
            fillColor: error ? Tone.bad.bg : Neutral.canvas,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(4),
              borderSide: BorderSide(color: error ? Brand.nonCompliant : Neutral.line),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(4),
              borderSide: BorderSide(color: error ? Brand.nonCompliant : Neutral.line),
            ),
          ),
          onSubmitted: onCommit,
        ),
      );

  Widget _evidenceCell(Finding f) {
    final n = f.evidenceIds.length;
    final canCapture = widget.sync != null && insp.inspectionId != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(n == 0 ? '—' : '$n attached',
            style: TextStyle(fontSize: 13, color: n == 0 ? Neutral.muted : Brand.ribbon)),
        if (canCapture)
          IconButton(
            tooltip: 'Add evidence',
            icon: const Icon(Icons.add_a_photo_outlined, color: Brand.ribbon),
            onPressed: () async {
              final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(
                builder: (_) => EvidenceCaptureScreen(
                  inspection: insp,
                  finding: f,
                  sync: widget.sync!,
                  capturedByName: CurrentUser.name,
                  capturedByOccupation: CurrentUser.occupation,
                ),
              ));
              if (ok == true && mounted) {
                setState(() {});
                showDone(context, 'Evidence attached');
              }
            },
          ),
      ],
    );
  }

  // ── trailing blocks ──────────────────────────────────────────────────────

  Widget _noteRow(String note) => _cell(
        Text(note, style: const TextStyle(color: Brand.nonCompliant, fontWeight: FontWeight.w600, fontSize: 13)),
      );

  Widget _declaration(String text) => _cell(
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(text, style: _text),
            const SizedBox(height: 8),
            _signature(
              signedAt: insp.declarationSignedAt,
              signedBy: insp.declarationSignedBy,
              onSign: () => insp.sign('declaration', by: CurrentUser.name),
              label: 'Sign declaration',
            ),
          ],
        ),
      );

  Widget _signature({
    required DateTime? signedAt,
    required String? signedBy,
    required VoidCallback onSign,
    required String label,
  }) {
    if (signedAt != null) {
      final l = signedAt.toLocal();
      return Row(children: [
        Icon(Icons.verified_outlined, size: 18, color: Tone.good.fg),
        const SizedBox(width: 6),
        Flexible(
          child: Text(
            'Signed by ${signedBy ?? ''} · ${l.day.toString().padLeft(2, '0')}/${l.month.toString().padLeft(2, '0')}/${l.year} '
            '${l.hour.toString().padLeft(2, '0')}:${l.minute.toString().padLeft(2, '0')} · IPS 21(5)',
            style: TextStyle(fontSize: 13, color: Tone.good.fg, fontWeight: FontWeight.w600),
          ),
        ),
      ]);
    }
    final enabled = insp.inspectionId != null || widget.sync == null;
    return Align(
      alignment: Alignment.centerLeft,
      child: FilledButton.tonalIcon(
        onPressed: enabled && CurrentUser.canDecide ? onSign : null,
        icon: const Icon(Icons.draw_outlined, size: 18),
        label: Text(label),
      ),
    );
  }

  Widget _decisionRow() {
    // F3: a job past issue whose certificate is not loaded still reads as issued.
    final issuedByStage = insp.certificateDecision == null &&
        (widget.stage == 'certificate_issued' || widget.stage == 'monitoring');
    final text = issuedByStage ? 'Decision: Compliance certificate issued' : insp.decisionText;
    return _cell(
      Text(text,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: text.contains('refused') || text.contains('cannot') ? Brand.nonCompliant : Neutral.strong,
          )),
    );
  }

  Widget _controlAndScope() {
    final dc = sheet.documentControl;
    final scope = sheet.scopeOfAuthorisation;
    return _TRow(
      children: [
        Expanded(
          flex: 4,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _cell(const Text('Document Control', style: _bold)),
              if (dc != null)
                for (final e in dc.entries)
                  Row(children: [
                    Expanded(child: _cell(_label(e.key))),
                    Expanded(child: _cell(Text(e.value, style: _text), left: true)),
                  ]),
            ],
          ),
        ),
        Expanded(
          flex: 6,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _cell(Text(scope?.heading ?? 'Scope of Authorisation', style: _bold), left: true),
              if (scope?.text != null) _cell(Text(scope!.text!, style: _text), left: true),
              if (scope?.confirmation != null)
                _cell(
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(scope!.confirmation!, style: _text),
                      const SizedBox(height: 8),
                      _signature(
                        signedAt: insp.scopeConfirmedAt,
                        signedBy: insp.scopeConfirmedBy,
                        onSign: () => insp.sign('scope', by: CurrentUser.name),
                        label: 'Confirm scope',
                      ),
                    ],
                  ),
                  left: true,
                ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _referenceRow(String ref) => _cell(
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Reference:', style: _bold),
          const SizedBox(height: 2),
          Text(ref, style: _text),
        ]),
      );

  Widget _footer(String footer) => _cell(Text(footer, style: _bold));

  // ── primitives ───────────────────────────────────────────────────────────

  Widget _label(String s) => Text(s, style: _bold);

  Widget _cell(Widget child, {bool top = true, bool left = false}) => Container(
        padding: _cellPad,
        decoration: BoxDecoration(
          border: Border(
            top: top ? BorderSide(color: _rule) : BorderSide.none,
            left: left ? BorderSide(color: _rule) : BorderSide.none,
          ),
        ),
        child: child,
      );
}

/// A table row whose cells stretch to the tallest cell, so borders run the
/// full height — inside a scroll view, where a bare stretched Row would be
/// handed infinite height. Kept for the few rows with nested cells (site
/// block, Document Control and Scope); item rows use [_RuledRow].
class _TRow extends StatelessWidget {
  final List<Widget> children;
  const _TRow({required this.children});

  @override
  Widget build(BuildContext context) => IntrinsicHeight(
        child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
      );
}

/// A grid row with no intrinsic-height pass (F7): the cells lay out once at
/// their own heights and the rules — the row's top line and one line between
/// each pair of columns — are painted the full height of the row behind
/// them. Looks the same as [_TRow] with bordered cells, at a fraction of the
/// layout cost on a long sheet of text fields.
class _RuledRow extends StatelessWidget {
  final List<int> flex;
  final List<Widget> cells;
  final Color rule;
  const _RuledRow({super.key, required this.flex, required this.cells, required this.rule});

  @override
  Widget build(BuildContext context) => CustomPaint(
        painter: _RulePainter(flex, rule),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (var k = 0; k < cells.length; k++)
              Expanded(
                flex: flex[k],
                // 1 px clear of the rules, as a bordered cell would be.
                child: Padding(padding: EdgeInsets.only(top: 1, left: k > 0 ? 1 : 0), child: cells[k]),
              ),
          ],
        ),
      );
}

class _RulePainter extends CustomPainter {
  final List<int> flex;
  final Color rule;
  _RulePainter(this.flex, this.rule);

  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()..color = rule;
    canvas.drawRect(Rect.fromLTWH(0, 0, size.width, 1), p);
    final total = flex.fold<int>(0, (a, b) => a + b);
    var acc = 0;
    for (var k = 0; k < flex.length - 1; k++) {
      acc += flex[k];
      canvas.drawRect(Rect.fromLTWH(size.width * acc / total, 0, 1, size.height), p);
    }
  }

  @override
  bool shouldRepaint(_RulePainter old) => old.rule != rule || old.flex.join(',') != flex.join(',');
}
