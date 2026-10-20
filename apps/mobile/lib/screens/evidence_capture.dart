import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';

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

  const EvidenceCaptureScreen({
    super.key,
    required this.inspection,
    required this.finding,
    required this.sync,
    required this.capturedByName,
    required this.capturedByOccupation,
    this.pickDocument = pickPdf,
    this.openUrl = _openExternally,
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

  static String attachedTitle(Map<String, dynamic> e) {
    final name = (e['original_name'] as String?)?.trim();
    if (name != null && name.isNotEmpty) return name;
    return e['kind'] == 'document' ? 'Document' : 'Photograph';
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
            label: Text(_saving ? 'Uploading…' : 'Attach as record'),
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
            for (final e in _attached!)
              ListTile(
                key: ValueKey('evidence-${e['id']}'),
                contentPadding: EdgeInsets.zero,
                leading: Icon(
                  e['kind'] == 'document' ? Icons.picture_as_pdf_outlined : Icons.photo_outlined,
                  color: Brand.ribbon,
                ),
                title: Text(attachedTitle(e)),
                subtitle: Text([
                  if (e['captured_by_name'] != null) '${e['captured_by_name']}',
                  if (e['captured_at'] != null) '${e['captured_at']}'.split('T').first,
                  if (e['bytes'] != null) '${((int.tryParse('${e['bytes']}') ?? 0) / 1024).toStringAsFixed(0)} KB',
                ].join('  ·  ')),
                trailing: const Icon(Icons.open_in_new, size: 18),
                onTap: () => _open(e),
              ),
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
