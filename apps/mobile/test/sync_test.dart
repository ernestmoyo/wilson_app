import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:assure_field/generated/checksheets.g.dart';
import 'package:assure_field/models/finding.dart';
import 'package:assure_field/models/inspection.dart';
import 'package:assure_field/sync/api_client.dart';
import 'package:assure_field/sync/outbox.dart';
import 'package:assure_field/sync/sync_service.dart';
import 'package:assure_field/sync/uuid.dart';

/// A stand-in server that speaks the real /api/sync contract: applies events
/// once per id, rejects non-compliant findings with no reason (IPS 21(1)(f)),
/// and reports replays as duplicates carrying the original clause.
class FakeServer {
  final Map<String, Map<String, dynamic>> seen = {};
  int calls = 0;
  bool offline = false;

  http.Client client() => MockClient((req) async {
        calls++;
        if (offline) throw http.ClientException('no route to host');
        if (req.url.path == '/api/health') return http.Response('{"ok":true}', 200);
        if (req.url.path != '/api/sync') return http.Response('{"error":"nope"}', 404);

        final body = jsonDecode(req.body) as Map<String, dynamic>;
        final applied = <Map<String, dynamic>>[];
        final rejected = <Map<String, dynamic>>[];
        final duplicate = <Map<String, dynamic>>[];

        for (final e in body['events'] as List) {
          final ev = e as Map<String, dynamic>;
          final id = ev['id'] as String;
          if (seen.containsKey(id)) {
            final prev = seen[id]!;
            duplicate.add({
              'id': id,
              'previousOutcome': prev['outcome'],
              if (prev['outcome'] == 'rejected') ...{'clause': prev['clause'], 'reason': prev['reason']},
            });
            continue;
          }
          final p = ev['payload'] as Map<String, dynamic>;
          if (ev['type'] == 'finding.upsert' &&
              p['status'] == 'non_compliant' &&
              ((p['failureReason'] as String?)?.trim().isEmpty ?? true)) {
            const clause = 'IPS 21(1)(f)';
            const reason = 'A non-compliant finding must state the reason the requirement is not met.';
            seen[id] = {'outcome': 'rejected', 'clause': clause, 'reason': reason};
            rejected.add({'id': id, 'type': ev['type'], 'clause': clause, 'reason': reason});
            continue;
          }
          final result = ev['type'] == 'inspection.open' ? {'inspectionId': 42} : {'ok': true};
          seen[id] = {'outcome': 'applied'};
          applied.add({'id': id, 'type': ev['type'], 'result': result});
        }
        return http.Response(
          jsonEncode({'applied': applied, 'rejected': rejected, 'duplicate': duplicate}),
          200,
        );
      });
}

Inspection g2() => Inspection(
      locationName: 'G2 Chiller',
      pcbuName: 'Argenta Manufacturing Limited',
      siteAddress: '2 Sterling Avenue',
      certifierName: 'Bryan Wilson',
      classKey: 'class_6_8',
      templates: [
        kTemplatesByCode['wks17-general']!,
        kTemplatesByCode['wks17-class-6-1a-6-1b-6-1c-8-2a-8']!,
      ],
    );

void main() {
  test('uuidV4 produces well-formed, unique ids', () {
    final ids = List.generate(500, (_) => uuidV4()).toSet();
    expect(ids.length, 500);
    final re = RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');
    for (final id in ids) {
      expect(re.hasMatch(id), isTrue, reason: id);
    }
  });

  group('Outbox', () {
    test('events persist across a reload with their ids intact', () async {
      final store = InMemoryOutboxStore();
      final a = Outbox(store);
      final ev = await a.enqueue('finding.upsert', {'x': 1});

      final b = Outbox(store);
      await b.load();
      expect(b.pending.length, 1);
      expect(b.pending.first.id, ev.id, reason: 'a regenerated id would defeat idempotency');
    });

    test('settle drops applied and duplicate, keeps rejected with its clause', () async {
      final o = Outbox(InMemoryOutboxStore());
      final a = await o.enqueue('finding.upsert', {});
      final r = await o.enqueue('finding.upsert', {});
      final d = await o.enqueue('finding.upsert', {});
      await o.settle({
        a.id: const SyncOutcome(status: 'applied'),
        r.id: const SyncOutcome(status: 'rejected', clause: 'IPS 21(1)(f)', reason: 'needs a reason'),
        d.id: const SyncOutcome(status: 'duplicate'),
      });
      expect(o.all.length, 1);
      expect(o.rejected.single.outcome!.clause, 'IPS 21(1)(f)');
      expect(o.pendingCount, 0);
    });
  });

  group('SyncService against the sync contract', () {
    late FakeServer server;
    late SyncService svc;
    late Inspection insp;

    setUp(() {
      server = FakeServer();
      svc = SyncService(
        outbox: Outbox(InMemoryOutboxStore()),
        api: ApiClient(
          baseUrl: Uri.parse('http://test.local'),
          deviceId: 'ipad-test',
          userId: 1,
          httpClient: server.client(),
        ),
      );
      insp = g2();
      svc.track(insp);
    });

    test('a finding change is queued locally before any network call', () async {
      insp.inspectionId = 42; // pretend it was opened
      final t = insp.templates.first;
      final s = t.sections.first;
      insp.update(insp.findingFor(t, s, s.items.first), (f) => f.status = FindingStatus.compliant);
      await Future<void>.delayed(Duration.zero);

      expect(svc.pendingCount, 1);
      expect(server.calls, 0, reason: 'nothing should touch the network until flush()');
    });

    test('findings are not queued until the inspection exists on the server', () async {
      final t = insp.templates.first;
      final s = t.sections.first;
      insp.update(insp.findingFor(t, s, s.items.first), (f) => f.status = FindingStatus.compliant);
      await Future<void>.delayed(Duration.zero);
      expect(svc.pendingCount, 0);
    });

    test('openInspection sets the server ids from the applied result', () async {
      final id = await svc.openInspection(insp, jobId: 7, hsLocationId: 9);
      expect(id, 42);
      expect(insp.inspectionId, 42);
      expect(insp.jobId, 7);
    });

    test('flush applies, rejects with clause, and a replay is idempotent', () async {
      insp.inspectionId = 42;
      final t = insp.templates.first;
      final signage = t.sections.firstWhere((x) => x.title == 'Signage');
      final ok = insp.findingFor(t, signage, signage.items[0]);
      final bad = insp.findingFor(t, signage, signage.items[1]);

      insp.update(ok, (f) => f.status = FindingStatus.compliant);
      insp.update(bad, (f) => f.status = FindingStatus.nonCompliant); // no reason yet
      await Future<void>.delayed(Duration.zero);
      expect(svc.pendingCount, 2);

      await svc.flush();
      expect(svc.pendingCount, 0);
      expect(svc.rejectedCount, 1);
      expect(svc.rejected.single.outcome!.clause, 'IPS 21(1)(f)');
      expect(server.seen.length, 2);

      // Flush again: the rejected event is re-sent, server reports duplicate,
      // and the clause still comes through. Nothing applied twice.
      await svc.flush();
      expect(server.seen.length, 2, reason: 'no new events should have been created');
      expect(svc.rejectedCount, 1);
      expect(svc.rejected.single.outcome!.clause, 'IPS 21(1)(f)');
    });

    test('fixing the finding enqueues a corrected event that applies', () async {
      insp.inspectionId = 42;
      final t = insp.templates.first;
      final signage = t.sections.firstWhere((x) => x.title == 'Signage');
      final bad = insp.findingFor(t, signage, signage.items[1]);

      insp.update(bad, (f) => f.status = FindingStatus.nonCompliant);
      await Future<void>.delayed(Duration.zero);
      await svc.flush();
      expect(svc.rejectedCount, 1);
      final rejectedId = svc.rejected.single.id;

      insp.update(bad, (f) => f.failureReason = 'No signage on the G2 Chiller door');
      await Future<void>.delayed(Duration.zero);
      await svc.flush();
      await svc.dismissRejected(rejectedId);

      expect(svc.pendingCount, 0);
      expect(svc.rejectedCount, 0);
      expect(server.seen.values.where((v) => v['outcome'] == 'applied').length, 1);
    });

    test('offline flush keeps the queue intact and records the error', () async {
      insp.inspectionId = 42;
      final t = insp.templates.first;
      final s = t.sections.first;
      insp.update(insp.findingFor(t, s, s.items.first), (f) => f.status = FindingStatus.compliant);
      await Future<void>.delayed(Duration.zero);

      server.offline = true;
      await svc.flush();
      expect(svc.pendingCount, 1, reason: 'the chiller has no signal; nothing may be lost');
      expect(svc.lastError, isNotNull);

      server.offline = false;
      await svc.flush();
      expect(svc.pendingCount, 0);
      expect(svc.lastError, isNull);
    });
  });
}
