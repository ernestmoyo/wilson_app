import 'package:flutter/material.dart';

import '../bootstrap.dart' show CurrentUser;
import '../generated/checksheets.g.dart';
import '../models/finding.dart';
import '../models/inspection.dart';
import '../models/site_block.dart';
import '../sync/sync_service.dart';
import '../theme.dart';
import '../widgets/company_details.dart';
import 'evidence_capture.dart';

/// The check sheet as the workbook lays it out, for wide screens.
///
/// Same order, same words: the site block (rows 2–14), the title and banner,
/// the column headers — Item · Regulation · Action · Records · Comments ·
/// Evidence Portfolio — every section as a full-width row, every item as a
/// row, then the NB note, the declaration with its signature, the Decision
/// row, Document Control beside Scope of Authorisation, the Reference and the
/// footer. Comments are edited in place; non-compliances are red, as on paper.
class SheetView extends StatefulWidget {
  final Inspection inspection;
  final ChecksheetTemplate template;
  final SyncService? sync;

  const SheetView({
    super.key,
    required this.inspection,
    required this.template,
    this.sync,
  });

  @override
  State<SheetView> createState() => _SheetViewState();
}

class _SheetViewState extends State<SheetView> {
  final _comment = <String, TextEditingController>{};
  final _reason = <String, TextEditingController>{};

  /// Rows 2–14 are on the sheet verbatim but folded behind one line, so the
  /// checklist starts on the first screen.
  bool _siteBlockOpen = false;

  /// Sections fold on their band row; a folded section still shows its
  /// count. The chip row above the sheet jumps to a section and unfolds it.
  final Set<int> _folded = {};
  final Map<int, GlobalKey> _sectionKeys = {};
  GlobalKey _keyFor(ChecksheetSection s) => _sectionKeys.putIfAbsent(s.ordinal, () => GlobalKey());

  void _jumpTo(ChecksheetSection s) {
    setState(() => _folded.remove(s.ordinal));
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final ctx = _keyFor(s).currentContext;
      if (ctx != null) {
        Scrollable.ensureVisible(ctx, duration: const Duration(milliseconds: 250), alignment: 0.02);
      }
    });
  }

  Inspection get insp => widget.inspection;
  ChecksheetTemplate get t => widget.template;
  SheetMeta get sheet => t.sheetFor(insp.classKey);
  bool get isClassSheet => !t.code.contains('general');

  static const _rule = Color(0xFFBDBDBD);
  static const _cellPad = EdgeInsets.symmetric(horizontal: 8, vertical: 4);
  // Column proportions approximating the workbook's widths.
  static const _flex = [7, 12, 30, 24, 28, 9];

  @override
  void dispose() {
    for (final c in _comment.values) {
      c.dispose();
    }
    for (final c in _reason.values) {
      c.dispose();
    }
    super.dispose();
  }

  TextEditingController _ctl(Map<String, TextEditingController> m, String key, String text) =>
      m.putIfAbsent(key, () => TextEditingController(text: text));

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      _jumpBar(),
      Expanded(child: _sheet()),
    ]);
  }

  /// One chip per section: number, a short title, done/total, red when the
  /// section holds a non-compliance. Stays put while the sheet scrolls.
  Widget _jumpBar() => Container(
        color: const Color(0xFFF7F8F8),
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
        child: SizedBox(
          height: 34,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: t.sections.length,
            separatorBuilder: (_, _) => const SizedBox(width: 6),
            itemBuilder: (_, k) {
              final s = t.sections[k];
              final findings = s.items.map((i) => insp.findingFor(t, s, i)).toList();
              final done = findings.where((f) => f.status != FindingStatus.pending).length;
              final nc = findings.any((f) => f.status == FindingStatus.nonCompliant);
              final complete = done == s.items.length;
              return ActionChip(
                key: ValueKey('jump-${s.ordinal}'),
                onPressed: () => _jumpTo(s),
                visualDensity: VisualDensity.compact,
                side: BorderSide(color: nc ? Brand.nonCompliant : complete ? Brand.compliant : const Color(0xFFCFD8D8)),
                backgroundColor: Colors.white,
                label: Text(
                  '${s.number ?? s.ordinal}  ${_shortTitle(s.title)}  $done/${s.items.length}',
                  style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w600,
                    color: nc ? Brand.nonCompliant : complete ? Brand.compliant : Colors.black87,
                  ),
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

  Widget _sheet() {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 48),
      child: Container(
        decoration: BoxDecoration(color: Colors.white, border: Border.all(color: _rule)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _letterhead(),
            _titleRow(),
            if (insp.siteBlock != null) ..._siteBlockFolded(insp.siteBlock!),
            if (sheet.banner != null) _bandRow(sheet.banner!, bold: true),
            _columnHeaders(),
            for (final s in t.sections) ...[
              KeyedSubtree(key: _keyFor(s), child: _sectionRow(s)),
              if (!_folded.contains(s.ordinal))
                for (final i in s.items) _itemRow(s, i),
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
            const Spacer(),
            const CompanyDetails(),
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
              Text(sheet.title ?? t.title,
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
              top: false,
            ),
          ),
          Expanded(
            flex: 2,
            child: _cell(
              Text(sheet.evidenceColumnLabel ?? 'Evidence Portfolio',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12)),
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
            color: const Color(0xFFF4F6F6),
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            child: Row(children: [
              Icon(_siteBlockOpen ? Icons.expand_less : Icons.expand_more, size: 18),
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
                  style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600),
                ),
              ),
              Text(_siteBlockOpen ? 'Hide' : 'Show site details',
                  style: const TextStyle(fontSize: 12, color: Brand.teal, fontWeight: FontWeight.w700)),
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
                Expanded(flex: 6, child: _cell(Text(r.value, style: const TextStyle(fontSize: 12.5))))
              else ...[
                Expanded(flex: 2, child: _cell(Text(r.value, style: const TextStyle(fontSize: 12.5)))),
                Expanded(flex: 2, child: _cell(_label(r.label2!), left: true)),
                Expanded(flex: 2, child: _cell(Text(r.value2 ?? '', style: const TextStyle(fontSize: 12.5)))),
              ],
              Expanded(flex: 2, child: _cell(const SizedBox.shrink(), left: true)),
            ],
          ),
      ];

  // ── table ────────────────────────────────────────────────────────────────

  Widget _bandRow(String text, {bool bold = false}) => Container(
        color: Brand.band,
        padding: _cellPad,
        decoration: null,
        child: Text(text,
            style: TextStyle(fontSize: 13, fontWeight: bold ? FontWeight.w700 : FontWeight.w600)),
      );

  Widget _columnHeaders() {
    final h = [...sheet.columnHeaders];
    while (h.length < 5) {
      h.add('');
    }
    final labels = [...h.take(5), sheet.evidenceColumnLabel ?? 'Evidence Portfolio'];
    return Container(
      color: const Color(0xFFEFEFEF),
      child: _TRow(
        children: [
          for (var k = 0; k < 6; k++)
            Expanded(
              flex: _flex[k],
              child: _cell(
                Text(labels[k], style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5)),
                left: k > 0,
              ),
            ),
        ],
      ),
    );
  }

  Widget _sectionRow(ChecksheetSection s) {
    final findings = s.items.map((i) => insp.findingFor(t, s, i)).toList();
    final done = findings.where((f) => f.status != FindingStatus.pending).length;
    final nc = findings.where((f) => f.status == FindingStatus.nonCompliant).length;
    final folded = _folded.contains(s.ordinal);
    return InkWell(
      key: ValueKey('section-${s.ordinal}'),
      onTap: () => setState(() => folded ? _folded.remove(s.ordinal) : _folded.add(s.ordinal)),
      child: Container(
        color: Brand.band,
        child: _TRow(
          children: [
            Expanded(
              flex: _flex[0],
              child: _cell(Row(children: [
                Icon(folded ? Icons.chevron_right : Icons.expand_more, size: 16),
                const SizedBox(width: 2),
                Text(s.number ?? '', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
              ])),
            ),
            Expanded(
              flex: _flex.skip(1).fold(0, (a, b) => a + b),
              child: _cell(
                Row(children: [
                  Expanded(child: Text(s.title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13))),
                  if (nc > 0)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: Text('$nc non-compliant',
                          style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: Brand.nonCompliant)),
                    ),
                  Text('$done/${s.items.length}', style: const TextStyle(fontSize: 11.5, color: Colors.black54)),
                ]),
                left: true,
              ),
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
    final commentCtl = _ctl(_comment, f.key, f.comment);
    final reasonCtl = _ctl(_reason, f.key, f.failureReason);

    return _TRow(
      children: [
        // Item: number + result (IPS 21(1)(c)) — the sheet encodes this as red
        // text in Comments; here it is a real field and the red follows it.
        Expanded(
          flex: _flex[0],
          child: _cell(
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(i.number ?? '', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                const SizedBox(height: 4),
                _statusPicker(f),
              ],
            ),
          ),
        ),
        Expanded(
          flex: _flex[1],
          child: _cell(
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final r in refs)
                  Text(r, style: const TextStyle(fontSize: 12.5, color: Brand.teal, fontWeight: FontWeight.w600)),
                if (i.guidanceUrl != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(i.guidanceUrl!,
                        style: const TextStyle(
                            fontSize: 10.5, color: Colors.blue, decoration: TextDecoration.underline)),
                  ),
              ],
            ),
            left: true,
          ),
        ),
        Expanded(flex: _flex[2], child: _cell(Text(i.action, style: const TextStyle(fontSize: 12, height: 1.3)), left: true)),
        Expanded(flex: _flex[3], child: _cell(Text(i.records, style: const TextStyle(fontSize: 12, height: 1.3)), left: true)),
        Expanded(
          flex: _flex[4],
          child: _cell(
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _inlineField(
                  commentCtl,
                  hint: '', // the workbook cell is blank; the column header says Comments
                  color: nc ? Brand.nonCompliant : Colors.black87,
                  onCommit: (v) => insp.update(f, (x) => x.comment = v),
                ),
                if (nc) ...[
                  const SizedBox(height: 4),
                  _inlineField(
                    reasonCtl,
                    hint: 'Reason not met — IPS 21(1)(f)',
                    color: Brand.nonCompliant,
                    error: f.isIncomplete,
                    onCommit: (v) => insp.update(f, (x) => x.failureReason = v),
                  ),
                ],
              ],
            ),
            left: true,
          ),
        ),
        Expanded(
          flex: _flex[5],
          child: _cell(_evidenceCell(f), left: true),
        ),
      ],
    );
  }

  Widget _statusPicker(Finding f) => DropdownButtonHideUnderline(
        child: DropdownButton<FindingStatus>(
          value: f.status,
          isDense: true,
          iconSize: 16,
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: f.status == FindingStatus.pending ? Colors.black45 : Brand.forStatus(f.status),
          ),
          items: [
            for (final s in FindingStatus.values)
              DropdownMenuItem(
                value: s,
                child: Text(s.shortLabel,
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Brand.forStatus(s))),
              ),
          ],
          onChanged: (s) {
            if (s == null) return;
            insp.update(f, (x) => x.status = s);
            setState(() {});
          },
        ),
      );

  Widget _inlineField(
    TextEditingController ctl, {
    required String hint,
    required Color color,
    required void Function(String) onCommit,
    bool error = false,
  }) =>
      Focus(
        onFocusChange: (has) {
          if (!has) onCommit(ctl.text);
        },
        child: TextField(
          controller: ctl,
          minLines: 1,
          maxLines: 8,
          style: TextStyle(fontSize: 12.5, color: color, height: 1.35),
          decoration: InputDecoration(
            isDense: true,
            hintText: hint,
            hintStyle: const TextStyle(fontSize: 11.5, color: Colors.black38),
            contentPadding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
            filled: true,
            fillColor: error ? const Color(0xFFFFF1F1) : const Color(0xFFFAFBFB),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(4),
              borderSide: BorderSide(color: error ? Brand.nonCompliant : const Color(0xFFDCE3E3)),
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
            style: TextStyle(fontSize: 11.5, color: n == 0 ? Colors.black38 : Brand.teal)),
        if (canCapture)
          IconButton(
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
            iconSize: 18,
            tooltip: 'Capture evidence',
            icon: const Icon(Icons.add_a_photo_outlined, color: Brand.teal),
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
              if (ok == true && mounted) setState(() {});
            },
          ),
      ],
    );
  }

  // ── trailing blocks ──────────────────────────────────────────────────────

  Widget _noteRow(String note) => _cell(
        Text(note, style: const TextStyle(color: Brand.nonCompliant, fontWeight: FontWeight.w600, fontSize: 12.5)),
      );

  Widget _declaration(String text) => _cell(
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(text, style: const TextStyle(fontSize: 12.5, height: 1.4)),
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
        const Icon(Icons.verified_outlined, size: 16, color: Brand.compliant),
        const SizedBox(width: 6),
        Text(
          'Signed by ${signedBy ?? ''} · ${l.day.toString().padLeft(2, '0')}/${l.month.toString().padLeft(2, '0')}/${l.year} '
          '${l.hour.toString().padLeft(2, '0')}:${l.minute.toString().padLeft(2, '0')} · IPS 21(5)',
          style: const TextStyle(fontSize: 12, color: Brand.compliant, fontWeight: FontWeight.w600),
        ),
      ]);
    }
    final enabled = insp.inspectionId != null || widget.sync == null;
    return Align(
      alignment: Alignment.centerLeft,
      child: FilledButton.tonalIcon(
        onPressed: enabled ? onSign : null,
        icon: const Icon(Icons.draw_outlined, size: 16),
        label: Text(label, style: const TextStyle(fontSize: 12)),
      ),
    );
  }

  Widget _decisionRow() => _cell(
        Text(insp.decisionText,
            style: TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w700,
              color: insp.decisionText.contains('refused') || insp.decisionText.contains('cannot')
                  ? Brand.nonCompliant
                  : Colors.black87,
            )),
      );

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
              _cell(const Text('Document Control', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5))),
              if (dc != null)
                for (final e in dc.entries)
                  Row(children: [
                    Expanded(child: _cell(_label(e.key))),
                    Expanded(child: _cell(Text(e.value, style: const TextStyle(fontSize: 12.5)), left: true)),
                  ]),
            ],
          ),
        ),
        Expanded(
          flex: 6,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _cell(
                Text(scope?.heading ?? 'Scope of Authorisation',
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5)),
                left: true,
              ),
              if (scope?.text != null)
                _cell(Text(scope!.text!, style: const TextStyle(fontSize: 12.5, height: 1.4)), left: true),
              if (scope?.confirmation != null)
                _cell(
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(scope!.confirmation!, style: const TextStyle(fontSize: 12.5, height: 1.4)),
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
          const Text('Reference:', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5)),
          const SizedBox(height: 2),
          Text(ref, style: const TextStyle(fontSize: 12.5)),
        ]),
      );

  Widget _footer(String footer) => _cell(
        Text(footer, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5)),
      );

  // ── primitives ───────────────────────────────────────────────────────────

  Widget _label(String s) => Text(s, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5));

  Widget _cell(Widget child, {bool top = true, bool left = false}) => Container(
        padding: _cellPad,
        decoration: BoxDecoration(
          border: Border(
            top: top ? const BorderSide(color: _rule) : BorderSide.none,
            left: left ? const BorderSide(color: _rule) : BorderSide.none,
          ),
        ),
        child: child,
      );
}

/// A table row whose cells stretch to the tallest cell, so borders run the
/// full height — inside a scroll view, where a bare stretched Row would be
/// handed infinite height.
class _TRow extends StatelessWidget {
  final List<Widget> children;
  const _TRow({required this.children});

  @override
  Widget build(BuildContext context) => IntrinsicHeight(
        child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
      );
}
