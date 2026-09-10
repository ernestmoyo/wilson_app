// Real Dart ↔ real server ↔ real Postgres.
//
// The sync layer's unit tests run against a fake server that implements the
// contract. This one talks to an actual apps/server process over HTTP — the
// same bytes the iPad will send — and asserts that what the app records is
// what the server holds afterwards.
//
// Skipped unless pointed at a server:
//   flutter test --dart-define=LIVE_API=http://localhost:8000 test/live_server_test.dart

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'package:assure_field/bootstrap.dart';
import 'package:assure_field/models/finding.dart';
import 'package:assure_field/sync/api_client.dart';
import 'package:assure_field/sync/outbox.dart';
import 'package:assure_field/sync/sync_service.dart';

const liveApi = String.fromEnvironment('LIVE_API', defaultValue: '');
// A server enforcing sign-in (AUTH_REQUIRED=1) needs a passcode:
//   --dart-define=LIVE_PASSCODE=…
const livePasscode = String.fromEnvironment('LIVE_PASSCODE', defaultValue: '');
String? liveToken;

void main() {
  if (liveApi.isEmpty) {
    test('live server test skipped (set --dart-define=LIVE_API=…)', () {}, skip: true);
    return;
  }

  // flutter_test installs an HttpOverrides that answers every request with
  // 400 so tests never touch the network by accident. This test exists to
  // touch the network, so restore the real client.
  setUpAll(() async {
    HttpOverrides.global = null;
    if (livePasscode.isNotEmpty) {
      final a = ApiClient(baseUrl: Uri.parse(liveApi), deviceId: 'flutter-live-test', httpClient: http.Client());
      final session = await a.login('compliancecertifier@assuresafety.co.nz', livePasscode);
      liveToken = session.token;
      a.close();
    }
  });

  late ApiClient api;
  late SyncService sync;

  setUp(() {
    api = ApiClient(
      baseUrl: Uri.parse(liveApi),
      deviceId: 'flutter-live-test',
      userId: CurrentUser.id,
      httpClient: http.Client(),
    )..token = liveToken;
    sync = SyncService(outbox: Outbox(InMemoryOutboxStore()), api: api);
  });

  tearDown(() => api.close());

  test('server is reachable and holds the template layer', () async {
    expect(await api.health(), isTrue, reason: 'no server at $liveApi');
    final t = await api.getJson('/api/templates') as List;
    expect(t.length, 3);
  });

  test('open the G2 job, record findings, and read them back from the server', () async {
    final insp = await openG2Inspection(api, sync);
    expect(insp.jobId, isNotNull);
    expect(insp.inspectionId, isNotNull);

    // Record against real items: signage 2.6(3) non-compliant with a reason,
    // and item 1 compliant with a verification method.
    final general = insp.templates.first;
    final signage = general.sections.firstWhere((s) => s.title == 'Signage');
    final first = general.sections.first;

    insp.update(insp.findingFor(general, signage, signage.items[3]), (f) {
      f.status = FindingStatus.nonCompliant;
      f.comment = 'No signage on the door to the G2 Chiller';
      f.failureReason = 'reg 2.6(3): no compliant signage at the room entrance';
      f.verificationMethod = 'Sighted on site';
    });
    insp.update(insp.findingFor(general, first, first.items.first), (f) {
      f.status = FindingStatus.compliant;
      f.comment = 'Class 6.1B 310 kg and 6.1C 2510 kg exceed thresholds';
      f.verificationMethod = 'Inventory register reviewed';
    });
    await Future<void>.delayed(Duration.zero);
    expect(sync.pendingCount, 2);

    await sync.flush();
    expect(sync.lastError, isNull, reason: sync.lastError);
    expect(sync.pendingCount, 0);
    expect(sync.rejectedCount, 0);

    // Read back through a fresh client: what the server holds, not what the
    // app remembers.
    final job = await api.getJson('/api/jobs/${insp.jobId}') as Map<String, dynamic>;
    // The G2 job is one persistent record on a live server, so assert on
    // the findings this test wrote, not on job-wide counts that other
    // sessions (the iPad, the web demo, earlier runs) also move.
    final findings = (job['findings'] as List).cast<Map<String, dynamic>>();
    // Section/item ordinals repeat across the two sheets and across
    // inspections of the same job, so key on this inspection and sheet too.
    Map<String, dynamic> at(int section, int item) => findings.singleWhere((f) =>
        f['inspection_id'] == insp.inspectionId &&
        f['template_code'] == general.code &&
        f['section_ordinal'] == section &&
        f['item_ordinal'] == item);
    final nc = at(signage.ordinal, signage.items[3].ordinal);
    expect(nc['status'], 'non_compliant');
    expect(nc['failure_reason'], contains('reg 2.6(3)'));
    final ok = at(first.ordinal, first.items.first.ordinal);
    expect(ok['status'], 'compliant');
    expect(ok['verification_method'], 'Inventory register reviewed');
  });

  test('a rejected finding comes back with its clause, and a fix clears it', () async {
    final insp = await openG2Inspection(api, sync);
    final general = insp.templates.first;
    final signage = general.sections.firstWhere((s) => s.title == 'Signage');
    final f = insp.findingFor(general, signage, signage.items[4]);

    insp.update(f, (x) {
      x.status = FindingStatus.nonCompliant;
      x.failureReason = ''; // IPS 21(1)(f) violation on purpose
    });
    await Future<void>.delayed(Duration.zero);
    await sync.flush();
    expect(sync.rejectedCount, 1);
    expect(sync.rejected.single.outcome!.clause, 'IPS 21(1)(f)');
    final rejectedId = sync.rejected.single.id;

    insp.update(f, (x) => x.failureReason = 'No signage next to the outdoor area');
    await Future<void>.delayed(Duration.zero);
    await sync.flush();
    await sync.dismissRejected(rejectedId);
    expect(sync.rejectedCount, 0);

    final job = await api.getJson('/api/jobs/${insp.jobId}') as Map<String, dynamic>;
    final findings = (job['findings'] as List).cast<Map<String, dynamic>>();
    final fixed = findings.singleWhere((x) =>
        x['inspection_id'] == insp.inspectionId &&
        x['template_code'] == general.code &&
        x['section_ordinal'] == signage.ordinal &&
        x['item_ordinal'] == signage.items[4].ordinal);
    expect(fixed['status'], 'non_compliant');
    expect(fixed['failure_reason'], 'No signage next to the outdoor area');
  });

  test('issuance-check is server-authoritative and names the blockers', () async {
    final insp = await openG2Inspection(api, sync);
    final chk = await api.issuanceCheck(insp.jobId!);
    expect(chk.canGrant, isFalse);
    expect(chk.blockers, isNotEmpty);
    expect(chk.blockers.first.clause, 'IPS 23(1)');
    // At least the two this run recorded; a live job may carry more.
    expect(chk.unresolvedNonCompliances, greaterThanOrEqualTo(2));
  });

  test('hydration: a fresh app instance sees what the server holds', () async {
    final insp = await openG2Inspection(api, sync);
    final general = insp.templates.first;
    final signage = general.sections.firstWhere((s) => s.title == 'Signage');
    final first = general.sections.first;
    expect(insp.findingFor(general, signage, signage.items[3]).status, FindingStatus.nonCompliant);
    expect(insp.findingFor(general, signage, signage.items[4]).status, FindingStatus.nonCompliant);
    expect(insp.findingFor(general, first, first.items.first).status, FindingStatus.compliant);
    expect(insp.countWhere(FindingStatus.nonCompliant), greaterThanOrEqualTo(2));
    expect(insp.assessedCount, greaterThanOrEqualTo(3));
  });
}
