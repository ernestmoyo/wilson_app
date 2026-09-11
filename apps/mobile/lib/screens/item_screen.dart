import 'package:flutter/material.dart';

import '../bootstrap.dart' show CurrentUser;
import '../generated/checksheets.g.dart';
import '../models/finding.dart';
import '../models/inspection.dart';
import '../sync/sync_service.dart';
import '../theme.dart';
import 'evidence_capture.dart';

/// A single check sheet item: the verbatim Action and Records text from the
/// Performance Standard, and the finding recorded against it.
///
/// The Records column is shown, not hidden, because it tells the certifier
/// exactly what must be captured to satisfy the clause — it is the difference
/// between "verify the signs are compliant" and knowing that a photograph is
/// the required record.
class ItemScreen extends StatefulWidget {
  final Inspection inspection;
  final ChecksheetTemplate template;
  final ChecksheetSection section;
  final ChecksheetItem item;
  final Finding finding;
  final SyncService? sync;

  const ItemScreen({
    super.key,
    required this.inspection,
    required this.template,
    required this.section,
    required this.item,
    required this.finding,
    this.sync,
  });

  @override
  State<ItemScreen> createState() => _ItemScreenState();
}

class _ItemScreenState extends State<ItemScreen> {
  late final TextEditingController _comment;
  late final TextEditingController _verification;
  late final TextEditingController _reason;

  @override
  void initState() {
    super.initState();
    _comment = TextEditingController(text: widget.finding.comment);
    _verification = TextEditingController(text: widget.finding.verificationMethod);
    _reason = TextEditingController(text: widget.finding.failureReason);
  }

  @override
  void dispose() {
    // Leaving the screen commits whatever was typed.
    _saveIfChanged();
    _comment.dispose();
    _verification.dispose();
    _reason.dispose();
    super.dispose();
  }

  void _save() => _saveIfChanged();

  /// One event per field left, not one per keystroke (each event is an
  /// audit row on the server). Nothing is written when nothing changed.
  void _saveIfChanged() {
    if (!CurrentUser.canRecord) return;
    final f = widget.finding;
    if (f.comment == _comment.text && f.verificationMethod == _verification.text && f.failureReason == _reason.text) return;
    widget.inspection.update(f, (x) {
      x.comment = _comment.text;
      x.verificationMethod = _verification.text;
      x.failureReason = _reason.text;
    });
  }

  Widget _onBlur(Widget field) => Focus(onFocusChange: (has) { if (!has) setState(_saveIfChanged); }, child: field);

  @override
  Widget build(BuildContext context) {
    final i = widget.item;
    final refs = i.regulationRefsFor(widget.inspection.classKey);
    final f = widget.finding;

    return Scaffold(
      appBar: AppBar(
        title: Text('${widget.section.number ?? widget.section.ordinal}. ${widget.section.title}',
            overflow: TextOverflow.ellipsis),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
        children: [
          if (refs.isNotEmpty)
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final r in refs)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: Brand.teal.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: Brand.teal.withValues(alpha: 0.35)),
                    ),
                    child: Text('reg $r',
                        style: const TextStyle(
                            fontSize: 12, color: Brand.teal, fontWeight: FontWeight.w700)),
                  ),
              ],
            ),
          const SizedBox(height: 16),

          _label('Action', 'What must be verified'),
          Text(i.action, style: const TextStyle(fontSize: 15, height: 1.45)),
          const SizedBox(height: 20),

          _label('Records', 'What must be captured to satisfy the clause'),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFF3F6F6),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: const Color(0xFFDCE3E3)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(i.records, style: const TextStyle(fontSize: 14, height: 1.4)),
                if (i.evidenceRequired) ...[
                  const SizedBox(height: 10),
                  Row(children: const [
                    Icon(Icons.photo_camera_outlined, size: 16, color: Brand.teal),
                    SizedBox(width: 6),
                    Text('Photographic or documentary evidence required',
                        style: TextStyle(fontSize: 12, color: Brand.teal, fontWeight: FontWeight.w600)),
                  ]),
                ],
              ],
            ),
          ),
          const SizedBox(height: 24),

          _label('Result', 'IPS cl. 21(1)(c)'),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final s in FindingStatus.values)
                ChoiceChip(
                  label: Text(s.label),
                  selected: f.status == s,
                  showCheckmark: false,
                  onSelected: !CurrentUser.canRecord
                      ? null
                      : (_) => setState(() {
                            widget.inspection.update(f, (x) => x.status = s);
                          }),
                  labelStyle: TextStyle(
                    color: f.status == s ? Colors.white : Colors.black87,
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                  ),
                  selectedColor: Brand.forStatus(s),
                  backgroundColor: Colors.white,
                  side: BorderSide(color: Brand.forStatus(s).withValues(alpha: 0.5)),
                ),
            ],
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
            _label('Reason for failure', 'IPS cl. 21(1)(f) — required'),
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

          const SizedBox(height: 28),
          // Evidence capture: hash at capture, IPS 21(4) fields recorded before
          // the record exists. Needs the inspection to exist on the server.
          Builder(builder: (context) {
            final canCapture = widget.sync != null && widget.inspection.inspectionId != null;
            final n = f.evidenceIds.length;
            return OutlinedButton.icon(
              onPressed: !canCapture
                  ? null
                  : () async {
                      final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(
                        builder: (_) => EvidenceCaptureScreen(
                          inspection: widget.inspection,
                          finding: f,
                          sync: widget.sync!,
                          capturedByName: CurrentUser.name,
                          capturedByOccupation: CurrentUser.occupation,
                        ),
                      ));
                      if (ok == true && mounted) setState(() {});
                    },
              icon: const Icon(Icons.add_a_photo_outlined),
              label: Text(
                !canCapture
                    ? 'Capture evidence  (offline — open on server first)'
                    : n == 0
                        ? 'Capture evidence'
                        : 'Capture evidence  ($n attached)',
              ),
              style: OutlinedButton.styleFrom(minimumSize: const Size(0, 48)),
            );
          }),
        ],
      ),
    );
  }

  Widget _label(String title, String sub) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.baseline,
          textBaseline: TextBaseline.alphabetic,
          children: [
            Text(title,
                style: const TextStyle(
                    fontSize: 12, fontWeight: FontWeight.w800, letterSpacing: .4, color: Colors.black87)),
            const SizedBox(width: 8),
            Expanded(
              child: Text(sub,
                  style: const TextStyle(fontSize: 11, color: Colors.black45),
                  overflow: TextOverflow.ellipsis),
            ),
          ],
        ),
      );
}
