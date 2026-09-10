// Start on the phone, finish on the laptop: a pull brings in what another
// device recorded, and never overwrites a change this device has not sent.

import 'package:flutter_test/flutter_test.dart';

import 'package:assure_field/bootstrap.dart';
import 'package:assure_field/models/finding.dart';
import 'package:assure_field/sync/api_client.dart';
import 'package:assure_field/sync/outbox.dart';
import 'package:assure_field/sync/sync_service.dart';

import 'fake_server.dart';

void main() {
  late FakeServer server;
  late ApiClient api;
  late SyncService sync;

  setUp(() {
    server = FakeServer()..stage = 'site_inspection';
    api = ApiClient(baseUrl: Uri.parse('http://fake.test'), deviceId: 'laptop', httpClient: server.client_());
    sync = SyncService(outbox: Outbox(InMemoryOutboxStore()), api: api);
  });

  test('opening a job on a second device hydrates what the first recorded', () async {
    final insp = await openInspectionForJob(api, sync, 7);
    expect(insp.inspectionId, 3);
    expect(insp.assessedCount, 2);
    expect(insp.countWhere(FindingStatus.nonCompliant), 1);
    expect(insp.siteBlock?.legalEntityName, 'Argenta Manufacturing Limited');
    expect(insp.siteBlock?.managerName, 'Jesh Chandra');
  });

  test('a pull merges a change made elsewhere', () async {
    final insp = await openInspectionForJob(api, sync, 7);
    final general = insp.templates.first;
    final signage = general.sections.firstWhere((s) => s.title == 'Signage');
    // The phone marks signage item 5 non-compliant directly on the server.
    server.findings.add({
      'id': 13,
      'inspection_id': 3,
      'template_code': 'wks17-general',
      'section_ordinal': signage.ordinal,
      'item_ordinal': signage.items[4].ordinal,
      'status': 'non_compliant',
      'failure_reason': 'No signage next to the outdoor area',
      'updated_at': '2026-09-10T01:00:00Z',
    });
    final changed = await sync.pull(insp);
    expect(changed, 1);
    expect(sync.remoteChanges, 1);
    final f = insp.findingFor(general, signage, signage.items[4]);
    expect(f.status, FindingStatus.nonCompliant);
    expect(f.failureReason, 'No signage next to the outdoor area');
  });

  test('a pull leaves an unsent local change alone, and the flush then wins', () async {
    final insp = await openInspectionForJob(api, sync, 7);
    final general = insp.templates.first;
    final first = general.sections.first;
    final f = insp.findingFor(general, first, first.items.first);
    expect(f.status, FindingStatus.compliant, reason: 'hydrated from the server');

    // Offline edit on this device: not yet flushed.
    insp.update(f, (x) {
      x.status = FindingStatus.notApplicable;
      x.comment = 'Not applicable at this location';
    });
    await Future<void>.delayed(Duration.zero);
    expect(sync.pendingCount, 1);

    // Meanwhile the other device changes the same item on the server.
    server.findings.removeWhere((x) => x['section_ordinal'] == 1 && x['item_ordinal'] == 1);
    server.findings.add({
      'id': 14,
      'inspection_id': 3,
      'template_code': 'wks17-general',
      'section_ordinal': 1,
      'item_ordinal': 1,
      'status': 'conditional',
      'comment': 'changed on the phone',
      'updated_at': '2026-09-10T02:00:00Z',
    });
    await sync.pull(insp);
    expect(f.status, FindingStatus.notApplicable, reason: 'the local unsent change survives the pull');
    expect(f.comment, 'Not applicable at this location');

    // Sending it settles the server on this device's version.
    await sync.syncNow(insp);
    expect(sync.pendingCount, 0);
    final onServer = server.findings.singleWhere((x) => x['section_ordinal'] == 1 && x['item_ordinal'] == 1);
    expect(onServer['status'], 'not_applicable');
    expect(f.status, FindingStatus.notApplicable);
  });
}
