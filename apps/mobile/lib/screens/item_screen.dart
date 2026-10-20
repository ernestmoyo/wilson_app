import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../bootstrap.dart' show CurrentUser;
import '../generated/checksheets.g.dart';
import '../models/finding.dart';
import '../models/inspection.dart';
import '../sync/sync_service.dart';
import '../theme.dart';
import '../widgets/answer_control.dart';
import '../widgets/brand_bar.dart';
import '../widgets/ui.dart';
import 'checksheet_screen.dart';
import 'evidence_capture.dart';

/// A single check sheet item: the verbatim Action and Records text from the
/// Performance Standard, and the finding recorded against it.
///
/// The Records column is shown, not hidden, because it tells the certifier
/// exactly what must be captured to satisfy the clause — it is the difference
/// between "verify the signs are compliant" and knowing that a photograph is
/// the required record.
///
/// Previous / Next walk the items of the sheet in order (the ones in scope),
/// saving as they go, so a phone can answer a whole sheet without going back
/// to the list each time.
class ItemScreen extends StatefulWidget {
  final Inspection inspection;
  final ChecksheetTemplate template;
  final ChecksheetSection section;
  final ChecksheetItem item;
  final Finding finding;
  final SyncService? sync;

  /// Called when Previous / Next moves to another item, in place of moving
  /// within this screen; the router passes one that goes to the item's
  /// address, so the address bar names the item shown (UX B10).
  final void Function(ChecksheetSection section, ChecksheetItem item)? onGo;

  const ItemScreen({
    super.key,
    required this.inspection,
    required this.template,
    required this.section,
    required this.item,
    required this.finding,
    this.sync,
    this.onGo,
  });

  /// The item's address: /jobs/:id/sheet/item/:template/:section/:item.
  static String pathFor(int jobId, String templateCode, int sectionOrdinal, int itemOrdinal) =>
      '/jobs/$jobId/sheet/item/$templateCode/$sectionOrdinal/$itemOrdinal';

  @override
  State<ItemScreen> createState() => _ItemScreenState();
}

class _ItemScreenState extends State<ItemScreen> {
  late ChecksheetSection _section = widget.section;
  late ChecksheetItem _item = widget.item;
  late Finding _f = widget.finding;

  final _comment = TextEditingController();
  final _verification = TextEditingController();
  final _reason = TextEditingController();
  final _general = TextEditingController();
  final _naReason = TextEditingController();

  Inspection get insp => widget.inspection;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    _comment.text = _f.comment;
    _verification.text = _f.verificationMethod;
    _reason.text = _f.failureReason;
    _general.text = _f.generalComment;
    _naReason.text = _f.naReason;
  }

  @override
  void didUpdateWidget(ItemScreen old) {
    super.didUpdateWidget(old);
    // The router rebuilt this screen for another item (a replaced URL).
    if (widget.section.ordinal != _section.ordinal || widget.item.ordinal != _item.ordinal) {
      _saveIfChanged();
      _section = widget.section;
      _item = widget.item;
      _f = insp.findingFor(widget.template, _section, _item);
      _load();
    }
  }

  @override
  void dispose() {
    // Leaving the screen commits whatever was typed.
    _saveIfChanged();
    _comment.dispose();
    _verification.dispose();
    _reason.dispose();
    _general.dispose();
    _naReason.dispose();
    super.dispose();
  }

  /// One event per field left, not one per keystroke (each event is an
  /// audit row on the server). Nothing is written when nothing changed.
  void _saveIfChanged() {
    if (!CurrentUser.canRecord) return;
    final f = _f;
    if (f.comment == _comment.text && f.verificationMethod == _verification.text && f.failureReason == _reason.text &&
        f.generalComment == _general.text && f.naReason == _naReason.text) {
      return;
    }
    insp.update(f, (x) {
      x.comment = _comment.text;
      x.verificationMethod = _verification.text;
      x.failureReason = _reason.text;
      x.generalComment = _general.text;
      x.naReason = _naReason.text;
    });
  }

  Widget _onBlur(Widget field) => Focus(onFocusChange: (has) { if (!has) setState(_saveIfChanged); }, child: field);

  /// The items of this sheet in scope, in order.
  List<(ChecksheetSection, ChecksheetItem)> get _order => [
        for (final s in insp.sectionsInScope(widget.template))
          for (final i in s.items) (s, i),
      ];

  int get _position => _order.indexWhere((x) => x.$1.ordinal == _section.ordinal && x.$2.ordinal == _item.ordinal);

  void _go((ChecksheetSection, ChecksheetItem) to) {
    FocusManager.instance.primaryFocus?.unfocus();
    _saveIfChanged();
    // Under the router the address changes and the router shows the item.
    if (widget.onGo != null) return widget.onGo!(to.$1, to.$2);
    setState(() {
      _section = to.$1;
      _item = to.$2;
      _f = insp.findingFor(widget.template, _section, _item);
      _load();
    });
  }

  Future<void> _addEvidence() async {
    final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(
      builder: (_) => EvidenceCaptureScreen(
        inspection: insp,
        finding: _f,
        sync: widget.sync!,
        capturedByName: CurrentUser.name,
        capturedByOccupation: CurrentUser.occupation,
      ),
    ));
    if (ok == true && mounted) {
      setState(() {});
      showDone(context, 'Evidence attached');
    }
  }

  @override
  Widget build(BuildContext context) {
    final i = _item;
    final s = _section;
    final refs = i.regulationRefsFor(insp.classKey);
    final f = _f;
    final order = _order;
    final pos = _position;
    final prev = pos > 0 ? order[pos - 1] : null;
    final next = pos >= 0 && pos < order.length - 1 ? order[pos + 1] : null;
    final number = i.number ?? '${i.ordinal}';
    final text = Theme.of(context).textTheme;

    return Scaffold(
      appBar: BrandBar(
        title: '${s.number ?? s.ordinal}. ${s.title}',
        subtitle: '${ChecksheetScreen.sheetLabel(widget.template)} · item $number'
            '${pos >= 0 ? ' · ${pos + 1} of ${order.length}' : ''}',
        actions: [if (widget.sync != null) SyncIndicator(sync: widget.sync!)],
      ),
      bottomNavigationBar: SafeArea(
        child: Container(
          decoration: const BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: Neutral.line))),
          padding: const EdgeInsets.symmetric(horizontal: Space.lg, vertical: Space.sm),
          child: Row(children: [
            OutlinedButton.icon(
              key: const ValueKey('item-prev'),
              onPressed: prev == null ? null : () => _go(prev),
              icon: const Icon(Icons.arrow_back, size: 18),
              label: const Text('Previous'),
            ),
            const Spacer(),
            FilledButton.icon(
              key: const ValueKey('item-next'),
              onPressed: next == null ? null : () => _go(next),
              icon: const Icon(Icons.arrow_forward, size: 18),
              label: const Text('Next item'),
            ),
          ]),
        ),
      ),
      body: Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 760),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
            children: [
              if (refs.isNotEmpty)
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final r in refs)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: Tone.info.bg,
                          borderRadius: BorderRadius.circular(Radii.pill),
                        ),
                        child: Text('reg $r',
                            style: TextStyle(fontSize: 13, color: Tone.info.fg, fontWeight: FontWeight.w600)),
                      ),
                  ],
                ),
              if (i.guidanceUrl != null)
                Padding(
                  padding: const EdgeInsets.only(top: Space.sm),
                  child: Semantics(
                    link: true,
                    child: InkWell(
                      onTap: () async {
                        try {
                          await launchUrl(Uri.parse(i.guidanceUrl!), mode: LaunchMode.externalApplication);
                        } catch (_) {}
                      },
                      child: Text(i.guidanceUrl!,
                          style: const TextStyle(
                              fontSize: 13, color: Brand.generalComment, decoration: TextDecoration.underline)),
                    ),
                  ),
                ),
              const SizedBox(height: 16),

              _label('Action', 'What must be verified'),
              Text(i.action, style: text.bodyLarge),
              const SizedBox(height: 20),

              _label('Records', 'What must be captured to satisfy the clause'),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Neutral.canvas,
                  borderRadius: BorderRadius.circular(Radii.sm),
                  border: Border.all(color: Neutral.line),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(i.records, style: text.bodyMedium),
                    if (i.evidenceRequired) ...[
                      const SizedBox(height: 10),
                      const Row(children: [
                        Icon(Icons.photo_camera_outlined, size: 18, color: Brand.ribbon),
                        SizedBox(width: 6),
                        Flexible(
                          child: Text('Photographic or documentary evidence required',
                              style: TextStyle(fontSize: 13, color: Brand.ribbon, fontWeight: FontWeight.w600)),
                        ),
                      ]),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 24),

              _label('Result', 'IPS cl. 21(1)(c)'),
              AnswerControl(
                status: f.status,
                onChanged: !CurrentUser.canRecord ? null : (v) => setState(() => insp.update(f, (x) => x.status = v)),
              ),
              const SizedBox(height: 20),

              _label('Comments', 'What was observed'),
              _onBlur(TextField(
                controller: _comment,
                maxLines: 4,
                readOnly: !CurrentUser.canRecord,
                decoration: const InputDecoration(hintText: 'Observation recorded on site…'),
              )),
              const SizedBox(height: 20),

              _label('How was this verified?', 'IPS cl. 21(1)(e)'),
              _onBlur(TextField(
                controller: _verification,
                maxLines: 2,
                readOnly: !CurrentUser.canRecord,
                decoration: const InputDecoration(
                    hintText: 'e.g. measured with tape, sighted certificate, interviewed handler'),
              )),

              if (f.status == FindingStatus.nonCompliant) ...[
                const SizedBox(height: 20),
                _label(Wording.ncReason, 'IPS cl. 21(1)(f) — required'),
                TextField(
                  controller: _reason,
                  maxLines: 3,
                  readOnly: !CurrentUser.canRecord,
                  onChanged: (_) => setState(_saveIfChanged),
                  decoration: InputDecoration(
                    hintText: 'Why the requirement is not met…',
                    errorText: f.isIncomplete ? 'Required for a non-compliant finding' : null,
                  ),
                ),
              ],

              if (f.status == FindingStatus.notApplicable) ...[
                const SizedBox(height: 20),
                _label('Why not applicable', 'Optional'),
                _onBlur(TextField(
                  key: const ValueKey('na-reason'),
                  controller: _naReason,
                  maxLines: 2,
                  readOnly: !CurrentUser.canRecord,
                  decoration: const InputDecoration(hintText: 'e.g. no cylinders held at this location'),
                )),
              ],

              const SizedBox(height: 20),
              _label('General comment', 'An observation or recommendation; printed in blue'),
              _onBlur(TextField(
                key: const ValueKey('general-comment'),
                controller: _general,
                maxLines: 3,
                readOnly: !CurrentUser.canRecord,
                style: const TextStyle(color: Brand.generalComment),
                decoration: const InputDecoration(hintText: 'e.g. PCBU to make the hatch pattern denser'),
              )),

              const SizedBox(height: 28),
              // Evidence: hash at capture, IPS 21(4) fields recorded before
              // the record exists. Needs the inspection to exist on the server.
              Builder(builder: (context) {
                final canCapture = widget.sync != null && insp.inspectionId != null;
                final n = f.evidenceIds.length;
                return OutlinedButton.icon(
                  onPressed: canCapture ? _addEvidence : null,
                  icon: const Icon(Icons.add_a_photo_outlined),
                  label: Text(
                    !canCapture
                        ? 'Add evidence  (offline — open on server first)'
                        : n == 0
                            ? 'Add evidence'
                            : 'Add evidence  ($n attached)',
                  ),
                  style: OutlinedButton.styleFrom(minimumSize: const Size(0, 48)),
                );
              }),
            ],
          ),
        ),
      ),
    );
  }

  Widget _label(String title, String sub) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.baseline,
          textBaseline: TextBaseline.alphabetic,
          children: [
            Text(title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Neutral.strong)),
            const SizedBox(width: 8),
            Expanded(
              child: Text(sub, style: const TextStyle(fontSize: 13, color: Neutral.muted), overflow: TextOverflow.ellipsis),
            ),
          ],
        ),
      );
}
