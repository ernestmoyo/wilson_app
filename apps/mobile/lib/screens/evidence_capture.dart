import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../models/finding.dart';
import '../models/inspection.dart';
import '../sync/sync_service.dart';
import '../theme.dart';

/// Capture a photograph as a record against one check sheet item.
///
/// Phase 1 of evidence capture. What it does that the camera roll cannot:
///   - hashes the bytes AT CAPTURE, so what reaches the server is provably
///     the same object the inspector saw on screen (the server refuses a
///     mismatch)
///   - records the four things IPS cl. 21(4) requires of every photograph
///     used as a record — photographer's name, occupation, date, and place —
///     before the record exists, not as an afterthought
///
/// Not yet: C2PA signing, and deferred upload (the bytes go up now, so this
/// needs connectivity; the finding itself never does).
class EvidenceCaptureScreen extends StatefulWidget {
  final Inspection inspection;
  final Finding finding;
  final SyncService sync;
  final String capturedByName;
  final String capturedByOccupation;

  const EvidenceCaptureScreen({
    super.key,
    required this.inspection,
    required this.finding,
    required this.sync,
    required this.capturedByName,
    required this.capturedByOccupation,
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
  DateTime? _capturedAt;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _place.text = widget.inspection.locationName;
  }

  @override
  void dispose() {
    _place.dispose();
    super.dispose();
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
      _capturedAt = DateTime.now().toUtc();
    });
  }

  static String _mimeFromName(String name) {
    final n = name.toLowerCase();
    if (n.endsWith('.png')) return 'image/png';
    if (n.endsWith('.webp')) return 'image/webp';
    return 'image/jpeg';
  }

  bool get _canSave => _bytes != null && _place.text.trim().isNotEmpty && !_saving;

  Future<void> _save() async {
    if (!_canSave) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final up = await widget.sync.api.uploadEvidence(_bytes!, mime: _mime!, sha256: _sha256!);
      await widget.sync.outbox.enqueue('evidence.attach', {
        'jobId': widget.inspection.jobId,
        'inspectionId': widget.inspection.inspectionId,
        'templateCode': widget.finding.templateCode,
        'sectionOrdinal': widget.finding.sectionOrdinal,
        'itemOrdinal': widget.finding.itemOrdinal,
        'kind': 'photo',
        'sha256': _sha256,
        'storageKey': up['storageKey'],
        'mime': _mime,
        'bytes': _bytes!.length,
        'provenance': 'app',
        // IPS 21(4)(a)–(c)
        'capturedByName': widget.capturedByName,
        'capturedByOccupation': widget.capturedByOccupation,
        'capturedAt': _capturedAt!.toIso8601String(),
        'capturedWhere': _place.text.trim(),
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

  @override
  Widget build(BuildContext context) {
    final f = widget.finding;
    return Scaffold(
      appBar: AppBar(title: const Text('Capture evidence')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          Text(
            '${f.templateCode} · section ${f.sectionOrdinal} · item ${f.itemOrdinal}',
            style: const TextStyle(fontSize: 12, color: Colors.black54),
          ),
          const SizedBox(height: 12),

          if (_bytes == null)
            Container(
              height: 220,
              decoration: BoxDecoration(
                color: const Color(0xFFF3F6F6),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFFDCE3E3)),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.photo_camera_outlined, size: 40, color: Brand.teal),
                  const SizedBox(height: 12),
                  Wrap(spacing: 10, children: [
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
                  ]),
                ],
              ),
            )
          else ...[
            ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: Image.memory(_bytes!, height: 260, fit: BoxFit.cover, width: double.infinity),
            ),
            const SizedBox(height: 8),
            Text(
              'sha256 ${_sha256!.substring(0, 16)}…  ·  ${(_bytes!.length / 1024).toStringAsFixed(0)} KB  ·  $_mime',
              style: const TextStyle(fontSize: 11, color: Colors.black54, fontFamily: 'monospace'),
            ),
            TextButton.icon(
              onPressed: () => setState(() {
                _bytes = null;
                _sha256 = null;
              }),
              icon: const Icon(Icons.refresh, size: 16),
              label: const Text('Retake'),
            ),
          ],

          const SizedBox(height: 16),
          const Text('Record of the photograph — IPS cl. 21(4)',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, letterSpacing: .4)),
          const SizedBox(height: 8),
          _ro('Taken by', '${widget.capturedByName} — ${widget.capturedByOccupation}'),
          _ro('Date', _capturedAt?.toLocal().toString().substring(0, 16) ?? '— (set on capture)'),
          const SizedBox(height: 8),
          TextField(
            controller: _place,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(
              labelText: 'Where the photograph was taken',
              hintText: 'e.g. G2 Chiller door, north wall',
            ),
          ),

          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: const TextStyle(color: Brand.nonCompliant, fontSize: 13)),
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
            style: TextStyle(fontSize: 11, color: Colors.black45),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _ro(String k, String v) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(children: [
          SizedBox(width: 90, child: Text(k, style: const TextStyle(fontSize: 12, color: Colors.black54))),
          Expanded(child: Text(v, style: const TextStyle(fontSize: 13))),
        ]),
      );
}
