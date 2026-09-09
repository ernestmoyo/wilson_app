import 'package:flutter/foundation.dart';

import '../models/finding.dart';
import '../models/inspection.dart';
import 'api_client.dart';
import 'outbox.dart';

/// Ties the inspection model to the outbox and the wire.
///
/// Every change to a finding becomes a `finding.upsert` event in the outbox
/// immediately — before any network call — so a chiller with no signal loses
/// nothing. `flush()` sends what is queued when it can; the server's answer
/// settles each event, and rejections stay visible with their clause until the
/// inspector fixes the underlying finding (which enqueues a corrected event).
class SyncService extends ChangeNotifier {
  final Outbox outbox;
  final ApiClient api;

  bool _flushing = false;
  DateTime? lastFlushAt;
  String? lastError;

  SyncService({required this.outbox, required this.api});

  bool get isFlushing => _flushing;
  int get pendingCount => outbox.pendingCount;
  int get rejectedCount => outbox.rejectedCount;
  List<SyncEvent> get rejected => outbox.rejected;

  /// Attach to an inspection so its finding changes and signatures are queued.
  void track(Inspection insp) {
    insp.onFindingChanged = (f) => _enqueueFinding(insp, f);
    insp.onSign = (which) => _enqueueSignature(insp, which);
  }

  /// IPS 21(5): the signer is the authenticated user on the server side; the
  /// event carries only which signature and when it happened on the device.
  Future<void> _enqueueSignature(Inspection insp, String which) async {
    if (insp.inspectionId == null) return;
    await outbox.enqueue('inspection.sign', {
      'inspectionId': insp.inspectionId,
      'which': which,
      'signedAt': DateTime.now().toUtc().toIso8601String(),
    });
    notifyListeners();
    await flush();
  }

  Future<void> _enqueueFinding(Inspection insp, Finding f) async {
    if (insp.inspectionId == null) return; // not yet opened on the server
    await outbox.enqueue('finding.upsert', {
      'inspectionId': insp.inspectionId,
      'templateCode': f.templateCode,
      'sectionOrdinal': f.sectionOrdinal,
      'itemOrdinal': f.itemOrdinal,
      'status': f.status.wireValue,
      'comment': f.comment,
      'verificationMethod': f.verificationMethod,
      'failureReason': f.status == FindingStatus.nonCompliant ? f.failureReason : null,
    });
    notifyListeners();
  }

  /// Open the inspection on the server. Must succeed before findings sync,
  /// because they reference its id — so this one is not queued offline.
  Future<int> openInspection(Inspection insp, {required int jobId, required int hsLocationId}) async {
    final ev = SyncEvent(type: 'inspection.open', payload: {
      'jobId': jobId,
      'hsLocationId': hsLocationId,
      'certifierId': api.userId,
      'conductedById': null,
      'supervised': insp.supervised,
      'inspectedAt': insp.inspectedAt.toUtc().toIso8601String(),
      'equipmentUsed': insp.equipmentUsed,
      'templateCodes': insp.templates.map((t) => t.code).toList(),
    });
    final out = await api.sync([ev]);
    final o = out[ev.id];
    if (o == null || o.isRejected) {
      throw ApiException(422, '${o?.clause ?? ''}: ${o?.reason ?? 'inspection.open failed'}');
    }
    // Ids may be numbers (PGlite) or strings (node-postgres int8).
    final raw = o.result?['inspectionId'];
    final id = raw is num ? raw.toInt() : int.parse('$raw');
    insp.inspectionId = id;
    insp.jobId = jobId;
    notifyListeners();
    return id;
  }

  /// Send everything queued. Safe to call repeatedly; safe to call offline
  /// (it just records the error and leaves the queue intact).
  Future<void> flush() async {
    if (_flushing) return;
    _flushing = true;
    lastError = null;
    notifyListeners();
    try {
      await outbox.load();
      final batch = outbox.nextBatch();
      if (batch.isNotEmpty) {
        final outcomes = await api.sync(batch);
        await outbox.settle(outcomes);
      }
      lastFlushAt = DateTime.now();
    } catch (e) {
      lastError = e.toString();
    } finally {
      _flushing = false;
      notifyListeners();
    }
  }

  Future<void> dismissRejected(String id) async {
    await outbox.dismiss(id);
    notifyListeners();
  }
}
