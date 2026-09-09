import 'dart:convert';

import 'uuid.dart';

/// One mutation the device wants the server to apply.
///
/// Mirrors the server's sync contract exactly: a client-generated id, a type
/// from the server's event-type list, a payload, and when it happened on the
/// device. The id is the idempotency key — a retried batch applies nothing
/// twice, so losing connectivity mid-upload in a chiller is safe.
class SyncEvent {
  final String id;
  final String type;
  final Map<String, dynamic> payload;
  final DateTime occurredAt;

  /// Set once the server has answered for this event.
  SyncOutcome? outcome;

  SyncEvent({
    String? id,
    required this.type,
    required this.payload,
    DateTime? occurredAt,
    this.outcome,
  })  : id = id ?? uuidV4(),
        occurredAt = occurredAt ?? DateTime.now().toUtc();

  Map<String, dynamic> toWire() => {
        'id': id,
        'type': type,
        'payload': payload,
        'occurredAt': occurredAt.toIso8601String(),
      };

  Map<String, dynamic> toJson() => {...toWire(), 'outcome': outcome?.toJson()};

  factory SyncEvent.fromJson(Map<String, dynamic> j) => SyncEvent(
        id: j['id'] as String,
        type: j['type'] as String,
        payload: Map<String, dynamic>.from(j['payload'] as Map),
        occurredAt: DateTime.parse(j['occurredAt'] as String),
        outcome: j['outcome'] == null
            ? null
            : SyncOutcome.fromJson(Map<String, dynamic>.from(j['outcome'] as Map)),
      );
}

/// What the server said about one event.
class SyncOutcome {
  final String status; // applied | rejected | duplicate
  /// The regulatory clause behind a rejection, e.g. "IPS 21(1)(f)". This is
  /// what the inspector sees — never a bare "422".
  final String? clause;
  final String? reason;
  final Map<String, dynamic>? result;

  const SyncOutcome({required this.status, this.clause, this.reason, this.result});

  bool get isRejected => status == 'rejected';
  bool get isSettled => status == 'applied' || status == 'duplicate';

  Map<String, dynamic> toJson() =>
      {'status': status, 'clause': clause, 'reason': reason, 'result': result};

  factory SyncOutcome.fromJson(Map<String, dynamic> j) => SyncOutcome(
        status: j['status'] as String,
        clause: j['clause'] as String?,
        reason: j['reason'] as String?,
        result: j['result'] == null ? null : Map<String, dynamic>.from(j['result'] as Map),
      );
}

/// Where the outbox persists between launches.
///
/// The queue must survive the app being killed with unsent events in it —
/// that is the whole point of an outbox. The store is pluggable so tests run
/// in memory and the device writes to disk.
abstract class OutboxStore {
  Future<String?> read();
  Future<void> write(String json);
}

class InMemoryOutboxStore implements OutboxStore {
  String? _data;
  @override
  Future<String?> read() async => _data;
  @override
  Future<void> write(String json) async => _data = json;
}

/// The queue of mutations awaiting the server.
///
/// Events stay in the outbox until the server has settled them (applied or
/// duplicate). Rejected events stay too, carrying their clause, so the UI can
/// show the inspector what to fix; they leave only when superseded by a
/// corrected event for the same target, or explicitly dismissed.
class Outbox {
  final OutboxStore store;
  final List<SyncEvent> _events = [];
  bool _loaded = false;

  Outbox(this.store);

  Future<void> load() async {
    if (_loaded) return;
    final raw = await store.read();
    if (raw != null && raw.isNotEmpty) {
      final list = jsonDecode(raw) as List;
      _events.addAll(list.map((e) => SyncEvent.fromJson(Map<String, dynamic>.from(e as Map))));
    }
    _loaded = true;
  }

  Future<void> _persist() => store.write(jsonEncode(_events.map((e) => e.toJson()).toList()));

  List<SyncEvent> get all => List.unmodifiable(_events);
  List<SyncEvent> get pending => _events.where((e) => e.outcome == null).toList();
  List<SyncEvent> get rejected => _events.where((e) => e.outcome?.isRejected ?? false).toList();

  int get pendingCount => pending.length;
  int get rejectedCount => rejected.length;

  Future<SyncEvent> enqueue(String type, Map<String, dynamic> payload) async {
    await load();
    final ev = SyncEvent(type: type, payload: payload);
    _events.add(ev);
    await _persist();
    return ev;
  }

  /// Record what the server said, and drop what is settled.
  Future<void> settle(Map<String, SyncOutcome> byId) async {
    for (final ev in _events) {
      final o = byId[ev.id];
      if (o != null) ev.outcome = o;
    }
    _events.removeWhere((e) => e.outcome?.isSettled ?? false);
    await _persist();
  }

  /// Remove a rejected event the inspector has dealt with (by sending a
  /// corrected one, or by deciding it should not be sent).
  Future<void> dismiss(String id) async {
    _events.removeWhere((e) => e.id == id);
    await _persist();
  }

  /// Events that should go in the next batch: everything unsettled, including
  /// previously rejected ones — the server will re-reject with the same clause,
  /// which is harmless, and any that have since become valid will apply.
  List<SyncEvent> nextBatch({int limit = 200}) =>
      _events.where((e) => !(e.outcome?.isSettled ?? false)).take(limit).toList();
}
