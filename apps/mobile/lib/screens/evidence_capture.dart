import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';

import '../bootstrap.dart' show CurrentUser;
import '../models/evidence.dart';
import '../models/finding.dart';
import '../models/inspection.dart';
import '../sync/sync_service.dart';
import '../theme.dart';
import '../widgets/brand_bar.dart';
import '../widgets/ui.dart';

/// A document picked from the device: the name it arrived with and its bytes.
class PickedDocument {
  final String name;
  final Uint8List bytes;
  const PickedDocument(this.name, this.bytes);
}

typedef DocumentPicker = Future<PickedDocument?> Function();
typedef UrlOpener = Future<void> Function(Uri url);

/// The PDF picker. Bytes, never a path: Flutter web has no file paths, and
/// the bytes are what gets hashed.
Future<PickedDocument?> pickPdf() async {
  final r = await FilePicker.platform.pickFiles(
    type: FileType.custom,
    allowedExtensions: const ['pdf'],
    withData: true,
  );
  final f = (r == null || r.files.isEmpty) ? null : r.files.single;
  if (f == null || f.bytes == null) return null;
  return PickedDocument(f.name, f.bytes!);
}

Future<void> _openExternally(Uri url) async {
  await launchUrl(url, mode: LaunchMode.externalApplication);
}

/// The most the server accepts as one piece of evidence.
const evidenceMaxBytes = 50 * 1024 * 1024;

/// Capture a photograph, or attach a PDF, as a record against one check
/// sheet item.
///
/// What it does that the camera roll cannot:
///   - hashes the bytes AT CAPTURE, so what reaches the server is provably
///     the same object the inspector saw on screen (the server refuses a
///     mismatch, and re-hashes a file that went straight to storage)
///   - records the four things IPS cl. 21(4) requires of every photograph
///     used as a record — photographer's name, occupation, date, and place —
///     before the record exists, not as an afterthought
///
/// A PDF keeps the name it arrived with; it opens through a short-lived link.
/// Not yet: C2PA signing, and deferred upload (the bytes go up now, so this
/// needs connectivity; the finding itself never does).
class EvidenceCaptureScreen extends StatefulWidget {
  final Inspection inspection;
  final Finding finding;
  final SyncService sync;
  final String capturedByName;
  final String capturedByOccupation;

  /// Picks a PDF; defaults to the platform file picker (injectable for tests).
  final DocumentPicker pickDocument;

  /// Opens a stored document; defaults to the browser / system viewer.
  final UrlOpener openUrl;

  /// The signed-in role (defaults to [CurrentUser.role]); decides who sees
  /// Accept / Not accepted and Replace. The server enforces it regardless.
  final String? role;

  const EvidenceCaptureScreen({
    super.key,
    required this.inspection,
    required this.finding,
    required this.sync,
    required this.capturedByName,
    required this.capturedByOccupation,
    this.pickDocument = pickPdf,
    this.openUrl = _openExternally,
    this.role,
  });

  @override
  State<EvidenceCaptureScreen> createState() => _EvidenceCaptureScreenState();
}

class _EvidenceCaptureScreenState extends State<EvidenceCaptureScreen> {
  final _picker = ImagePicker();
  final _place = TextEditingController();

  Uint8List? _bytes;
  String? _mime;
  String? _sha256;
  String? _name;
  DateTime? _capturedAt;
  bool _saving = false;
  String? _error;

  /// Evidence the server already holds for this item (null while loading).
  List<Map<String, dynamic>>? _attached;

  bool get _isDocument => _mime == 'application/pdf';

  /// The current version being replaced, if Replace was pressed (Q3/Q4).
  EvidenceFile? _replacing;

  /// An evidence.review on its way to the server.
  bool _reviewing = false;

  String get _role => widget.role ?? CurrentUser.role;

  /// Who accepts evidence (Q3): reviewer, admin or certifier; never a viewer
  /// or a peer reviewer.
  bool get _canReview => const {'reviewer', 'admin', 'certifier'}.contains(_role);
  bool get _canReplace => _role != 'viewer' && _role != 'peer_reviewer';

  @override
  void initState() {
    super.initState();
    _place.text = widget.inspection.locationName;
    _loadAttached();
  }

  @override
  void dispose() {
    _place.dispose();
    super.dispose();
  }

  /// What is already attached to this item, from GET /api/jobs/:id.
  Future<void> _loadAttached() async {
    final jobId = widget.inspection.jobId;
    if (jobId == null) {
      _attached = const [];
      return;
    }
    try {
      final j = await widget.sync.api.job(jobId);
      final f = widget.finding;
      final ids = <dynamic>{
        for (final x in (j['findings'] as List? ?? const []))
          if ((x as Map)['template_code'] == f.templateCode &&
              '${x['section_ordinal']}' == '${f.sectionOrdinal}' &&
              '${x['item_ordinal']}' == '${f.itemOrdinal}')
            '${x['id']}',
      };
      final rows = [
        for (final e in (j['evidence'] as List? ?? const []))
          if (ids.contains('${(e as Map)['finding_id']}')) e.cast<String, dynamic>(),
      ];
      if (mounted) setState(() => _attached = rows);
    } catch (_) {
      // Offline: nothing to list; capture still works when the upload can.
      if (mounted) setState(() => _attached = const []);
    }
  }

  Future<void> _pick(ImageSource source) async {
    setState(() => _error = null);
    final x = await _picker.pickImage(source: source, imageQuality: 85, maxWidth: 2048);
    if (x == null) return;
    final bytes = await x.readAsBytes();
    // Hash at capture: this digest travels with the upload and the server
    // verifies it. Anything that changes the bytes afterwards is detectable.
    final digest = sha256.convert(bytes).toString();
    setState(() {
      _bytes = bytes;
      _mime = x.mimeType ?? _mimeFromName(x.name);
      _sha256 = digest;
      _name = null;
      _capturedAt = DateTime.now().toUtc();
    });
  }

  Future<void> _pickPdf() async {
    setState(() => _error = null);
    PickedDocument? picked;
    try {
      picked = await widget.pickDocument();
    } catch (e) {
      setState(() => _error = 'Could not open the file: $e');
      return;
    }
    if (picked == null) return;
    final doc = picked;
    if (doc.bytes.length > evidenceMaxBytes) {
      setState(() => _error = '${doc.name} is ${(doc.bytes.length / 1024 / 1024).toStringAsFixed(1)} MB; '
          'evidence is limited to ${evidenceMaxBytes ~/ 1024 ~/ 1024} MB.');
      return;
    }
    // The same hash-at-capture as a photograph.
    final digest = sha256.convert(doc.bytes).toString();
    setState(() {
      _bytes = doc.bytes;
      _mime = 'application/pdf';
      _sha256 = digest;
      _name = doc.name;
      _capturedAt = DateTime.now().toUtc();
    });
  }

  static String _mimeFromName(String name) {
    final n = name.toLowerCase();
    if (n.endsWith('.png')) return 'image/png';
    if (n.endsWith('.webp')) return 'image/webp';
    return 'image/jpeg';
  }

  // A photograph needs its place (IPS 21(4)(c)); a document does not.
  bool get _canSave => _bytes != null && (_isDocument || _place.text.trim().isNotEmpty) && !_saving;

  Future<void> _save() async {
    if (!_canSave) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final api = widget.sync.api;
      final up = _isDocument
          ? await api.uploadEvidenceFile(_bytes!, mime: _mime!, sha256: _sha256!, name: _name)
          : await api.uploadEvidence(_bytes!, mime: _mime!, sha256: _sha256!);
      final place = _place.text.trim();
      await widget.sync.outbox.enqueue('evidence.attach', {
        'jobId': widget.inspection.jobId,
        'inspectionId': widget.inspection.inspectionId,
        'templateCode': widget.finding.templateCode,
        'sectionOrdinal': widget.finding.sectionOrdinal,
        'itemOrdinal': widget.finding.itemOrdinal,
        'kind': _isDocument ? 'document' : 'photo',
        'sha256': _sha256,
        'storageKey': up['storageKey'],
        'mime': _mime,
        'bytes': _bytes!.length,
        'provenance': 'app',
        // The next version of a file already on record; the old one is kept.
        if (_replacing != null) 'supersedesId': _replacing!.id,
        if (_isDocument) 'originalName': _name,
        // IPS 21(4)(a)–(c): for a document, who attached it, when and (if
        // given) where it applies.
        'capturedByName': widget.capturedByName,
        'capturedByOccupation': widget.capturedByOccupation,
        'capturedAt': _capturedAt!.toIso8601String(),
        if (!_isDocument || place.isNotEmpty) 'capturedWhere': place,
      });
      widget.finding.evidenceIds.add(_sha256!);
      await widget.sync.flush();
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _open(Map<String, dynamic> e) async {
    setState(() => _error = null);
    try {
      final url = await widget.sync.api.evidenceLink('${e['storage_key'] ?? '${e['sha256']}'}');
      await widget.openUrl(url);
    } catch (err) {
      if (mounted) setState(() => _error = 'Could not open the file: $err');
    }
  }

  /// Accept the current version, or mark it not accepted with the reason
  /// (Q3, IPS 21(1)(e)). One sync event, recorded with the person.
  Future<void> _review(EvidenceFile e, String state, {String? note}) async {
    setState(() {
      _reviewing = true;
      _error = null;
    });
    try {
      final ev = await widget.sync.outbox.enqueue('evidence.review', {
        'jobId': ?widget.inspection.jobId,
        'evidenceId': e.id,
        'state': state,
        'note': ?note,
      });
      await widget.sync.flush();
      final out = ev.outcome;
      if (out != null && out.isRejected) {
        await widget.sync.dismissRejected(ev.id);
        if (mounted) setState(() => _error = '${out.clause == null ? '' : '${out.clause}: '}${out.reason ?? 'not recorded'}');
        return;
      }
      if (out == null) {
        if (mounted) setState(() => _error = 'Not sent yet: the review goes when the connection is back.');
        return;
      }
      await _loadAttached();
      if (mounted) showDone(context, state == 'accepted' ? 'Evidence accepted' : 'Marked not accepted');
    } catch (err) {
      if (mounted) setState(() => _error = err.toString());
    } finally {
      if (mounted) setState(() => _reviewing = false);
    }
  }

  /// Not accepted needs a reason: ask for it before anything is sent.
  Future<void> _reject(EvidenceFile e) async {
    final note = await showDialog<String>(context: context, builder: (_) => _RejectDialog(title: e.title));
    if (note != null && note.trim().isNotEmpty) await _review(e, 'not_accepted', note: note.trim());
  }

  static Tone _reviewTone(EvidenceFile e) =>
      e.isAccepted ? Tone.good : e.isNotAccepted ? Tone.bad : Tone.info;

  /// One version of a file: name, "v2 · 20 Oct 2026 · name", the review
  /// badge and, for the current version, what this person may do with it.
  Widget _evidenceTile(EvidenceFile e, {required bool current}) {
    final t = Theme.of(context).textTheme;
    return Padding(
      key: ValueKey('evidence-${e.id}'),
      padding: const EdgeInsets.symmetric(vertical: Space.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InkWell(
            onTap: () => _open(e.raw),
            child: Row(children: [
              Icon(e.isDocument ? Icons.picture_as_pdf_outlined : Icons.photo_outlined, color: Brand.ribbon),
              const SizedBox(width: Space.md),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(e.title, style: t.bodyLarge),
                  Text(e.versionLine, style: t.bodySmall),
                ]),
              ),
              const SizedBox(width: Space.sm),
              StatusBadge(label: e.reviewLabel, tone: _reviewTone(e), dense: true),
              const SizedBox(width: Space.xs),
              const Icon(Icons.open_in_new, size: 18, color: Neutral.faint),
            ]),
          ),
          if (e.reviewLine != null)
            Padding(
              padding: const EdgeInsets.only(left: 36, top: 2),
              child: Text(e.reviewLine!, style: TextStyle(fontSize: 13, color: _reviewTone(e).fg)),
            ),
          if (current && (_canReview || _canReplace))
            Padding(
              padding: const EdgeInsets.only(left: 28),
              child: Wrap(spacing: Space.xs, children: [
                if (_canReview && !e.isAccepted)
                  TextButton.icon(
                    key: ValueKey('ev-accept-${e.id}'),
                    onPressed: _reviewing ? null : () => _review(e, 'accepted'),
                    icon: const Icon(Icons.check_circle_outline, size: 18),
                    label: const Text('Accept'),
                  ),
                if (_canReview && !e.isNotAccepted)
                  TextButton.icon(
                    key: ValueKey('ev-reject-${e.id}'),
                    onPressed: _reviewing ? null : () => _reject(e),
                    icon: const Icon(Icons.highlight_off, size: 18),
                    label: const Text('Not accepted'),
                  ),
                if (_canReplace)
                  TextButton.icon(
                    key: ValueKey('ev-replace-${e.id}'),
                    onPressed: () => setState(() {
                      _replacing = e;
                      _error = null;
                    }),
                    icon: const Icon(Icons.upload_file_outlined, size: 18),
                    label: const Text('Replace'),
                  ),
              ]),
            ),
        ],
      ),
    );
  }

  /// Current versions, each with its earlier versions under an expander.
  List<Widget> _attachedList() {
    final all = [for (final m in _attached!) EvidenceFile.fromJson(m)];
    final current = all.where((e) => e.current).toList();
    return [
      for (final e in current) ...[
        _evidenceTile(e, current: true),
        if (EvidenceFile.previousVersions(e, all).isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(left: 28),
            child: ExpansionTile(
              key: ValueKey('ev-previous-${e.id}'),
              tilePadding: EdgeInsets.zero,
              title: Text('Previous versions (${EvidenceFile.previousVersions(e, all).length})',
                  style: Theme.of(context).textTheme.bodyMedium),
              children: [
                for (final p in EvidenceFile.previousVersions(e, all)) _evidenceTile(p, current: false),
              ],
            ),
          ),
        const Divider(height: 1),
      ],
    ];
  }

  @override
  Widget build(BuildContext context) {
    final f = widget.finding;
    return Scaffold(
      appBar: BrandBar(
        title: 'Add evidence',
        // The item by its sheet name and number, never the internal code.
        subtitle: '${Wording.itemRef(f.templateCode, f.sectionOrdinal, f.itemOrdinal)} · ${widget.inspection.locationName}',
        actions: [SyncIndicator(sync: widget.sync)],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          if (_replacing != null)
            Notice(
              'Replacing ${_replacing!.title} (v${_replacing!.version}). Take or choose the new file and attach it '
              'as version ${_replacing!.version + 1}; the current file is kept as a previous version.',
              key: const ValueKey('ev-replacing'),
              tone: Tone.info,
              onClose: () => setState(() => _replacing = null),
            ),
          if (_bytes == null)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 12),
              decoration: BoxDecoration(
                color: Neutral.canvas,
                borderRadius: BorderRadius.circular(Radii.md),
                border: Border.all(color: Neutral.line),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.photo_camera_outlined, size: 40, color: Brand.ribbon),
                  const SizedBox(height: 12),
                  Wrap(spacing: 10, runSpacing: 8, alignment: WrapAlignment.center, children: [
                    FilledButton.icon(
                      onPressed: () => _pick(ImageSource.camera),
                      icon: const Icon(Icons.camera_alt_outlined),
                      label: const Text('Camera'),
                    ),
                    OutlinedButton.icon(
                      onPressed: () => _pick(ImageSource.gallery),
                      icon: const Icon(Icons.photo_library_outlined),
                      label: const Text('Choose'),
                    ),
                    OutlinedButton.icon(
                      onPressed: _pickPdf,
                      icon: const Icon(Icons.picture_as_pdf_outlined),
                      label: const Text('Attach PDF'),
                    ),
                  ]),
                  const SizedBox(height: 8),
                  const Text('Photographs (JPEG, PNG) or PDF, up to 50 MB',
                      style: TextStyle(fontSize: 13, color: Neutral.muted)),
                ],
              ),
            )
          else ...[
            if (_isDocument)
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Neutral.canvas,
                  borderRadius: BorderRadius.circular(Radii.md),
                  border: Border.all(color: Neutral.line),
                ),
                child: Row(children: [
                  const Icon(Icons.picture_as_pdf_outlined, size: 36, color: Brand.ribbon),
                  const SizedBox(width: 12),
                  Expanded(child: Text(_name ?? 'Document', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600))),
                ]),
              )
            else
              ClipRRect(
                borderRadius: BorderRadius.circular(Radii.md),
                child: Image.memory(_bytes!, height: 260, fit: BoxFit.cover, width: double.infinity),
              ),
            const SizedBox(height: 8),
            Text(
              'sha256 ${_sha256!.substring(0, 16)}…  ·  ${(_bytes!.length / 1024).toStringAsFixed(0)} KB  ·  $_mime',
              style: const TextStyle(fontSize: 12, color: Neutral.muted, fontFamily: 'monospace'),
            ),
            TextButton.icon(
              onPressed: () => setState(() {
                _bytes = null;
                _sha256 = null;
                _mime = null;
                _name = null;
              }),
              icon: const Icon(Icons.refresh, size: 16),
              label: Text(_isDocument ? 'Choose another' : 'Retake'),
            ),
          ],

          const SizedBox(height: 16),
          Text(_isDocument ? 'Record of the document' : 'Record of the photograph — IPS cl. 21(4)',
              style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          _ro(_isDocument ? 'Attached by' : 'Taken by', '${widget.capturedByName} — ${widget.capturedByOccupation}'),
          _ro('Date', _capturedAt?.toLocal().toString().substring(0, 16) ?? '— (set on capture)'),
          const SizedBox(height: 8),
          TextField(
            controller: _place,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              labelText: _isDocument ? 'Where it applies (optional)' : 'Where the photograph was taken',
              hintText: 'e.g. G2 Chiller door, north wall',
            ),
          ),

          if (_error != null) ...[
            const SizedBox(height: 12),
            Notice(_error!),
          ],

          const SizedBox(height: 20),
          FilledButton.icon(
            onPressed: _canSave ? _save : null,
            icon: _saving
                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.cloud_upload_outlined),
            label: Text(_saving
                ? 'Uploading…'
                : _replacing != null
                    ? 'Attach as version ${_replacing!.version + 1}'
                    : 'Attach as record'),
          ),
          const SizedBox(height: 8),
          const Text(
            'Uploads need connectivity. The finding itself is saved regardless.',
            style: TextStyle(fontSize: 13, color: Neutral.muted),
            textAlign: TextAlign.center,
          ),

          if (_attached != null && _attached!.isNotEmpty) ...[
            const SizedBox(height: 24),
            Text('Attached to this item', style: Theme.of(context).textTheme.titleSmall),
            ..._attachedList(),
          ],
        ],
      ),
    );
  }

  Widget _ro(String k, String v) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(children: [
          SizedBox(width: 100, child: Text(k, style: const TextStyle(fontSize: 13, color: Neutral.muted))),
          Expanded(child: Text(v, style: const TextStyle(fontSize: 14, color: Neutral.strong))),
        ]),
      );
}

/// "Not accepted" asks why (IPS 21(1)(e)): the note goes back to whoever
/// supplied the file. The button stays off until there is a reason.
class _RejectDialog extends StatefulWidget {
  final String title;
  const _RejectDialog({required this.title});

  @override
  State<_RejectDialog> createState() => _RejectDialogState();
}

class _RejectDialogState extends State<_RejectDialog> {
  final _note = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Not accepted'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Why does ${widget.title} not show compliance?'),
            const SizedBox(height: Space.sm),
            TextField(
              key: const ValueKey('ev-note'),
              controller: _note,
              autofocus: true,
              maxLines: 3,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(hintText: 'e.g. Label unreadable; send the current revision'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
          FilledButton(
            key: const ValueKey('ev-reject-confirm'),
            onPressed: _note.text.trim().isEmpty ? null : () => Navigator.of(context).pop(_note.text.trim()),
            child: const Text('Not accepted'),
          ),
        ],
      );
}
