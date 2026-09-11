import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:assure_field/auth/session.dart';
import 'package:assure_field/bootstrap.dart';
import 'package:assure_field/generated/checksheets.g.dart';
import 'package:assure_field/models/finding.dart';
import 'package:assure_field/models/inspection.dart';
import 'package:assure_field/screens/sheet_view.dart';
import 'package:assure_field/sync/outbox.dart';

/// Regression tests for the client defects the independent review found
/// (11 September 2026): a viewer must not be able to type into the sheet;
/// a corrected event supersedes the rejected one it replaces; the outbox is
/// emptied when a person signs out.
void main() {
  Inspection g2() => Inspection(
        locationName: 'G2 Chiller',
        pcbuName: 'Example Limited',
        siteAddress: '1 Example Street',
        certifierName: 'Bryan Wilson',
        classKey: 'class_6_8',
        templates: [kTemplatesByCode['wks17-general']!, kTemplatesByCode['wks17-class-6-1a-6-1b-6-1c-8-2a-8']!],
      );

  testWidgets('a viewer sees the sheet but every control is read-only', (tester) async {
    CurrentUser.apply(const Session(token: 't', userId: 3, fullName: 'Office viewer', occupation: 'Read-only access', role: 'viewer'));
    addTearDown(() => CurrentUser.apply(const Session(token: 't', userId: 1, fullName: 'Bryan Wilson', occupation: 'Compliance certifier', role: 'certifier')));
    tester.view.physicalSize = const Size(1400, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    final insp = g2();
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: SheetView(inspection: insp, template: insp.templates.first))));
    await tester.pumpAndSettle();

    final pickers = tester.widgetList<DropdownButton<FindingStatus>>(find.byType(DropdownButton<FindingStatus>));
    expect(pickers, isNotEmpty);
    expect(pickers.every((d) => d.onChanged == null), isTrue, reason: 'status pickers disabled for a viewer');
    final fields = tester.widgetList<TextField>(find.byType(TextField));
    expect(fields, isNotEmpty);
    expect(fields.every((f) => f.readOnly), isTrue, reason: 'inline fields read-only for a viewer');
  });

  test('a corrected event supersedes the rejected one about the same item', () async {
    final o = Outbox(InMemoryOutboxStore());
    final first = await o.enqueue('finding.upsert', {'inspectionId': 3, 'templateCode': 'wks17-general', 'sectionOrdinal': 1, 'itemOrdinal': 1, 'status': 'non_compliant'});
    await o.settle({first.id: const SyncOutcome(status: 'rejected', clause: 'IPS 21(1)(f)', reason: 'needs a reason')});
    expect(o.rejectedCount, 1);
    await o.enqueue('finding.upsert', {'inspectionId': 3, 'templateCode': 'wks17-general', 'sectionOrdinal': 1, 'itemOrdinal': 1, 'status': 'non_compliant', 'failureReason': 'No signage'});
    expect(o.rejectedCount, 0, reason: 'the rejected event was replaced');
    expect(o.pendingCount, 1);
    // A different item's rejection stays.
    final other = await o.enqueue('finding.upsert', {'inspectionId': 3, 'templateCode': 'wks17-general', 'sectionOrdinal': 1, 'itemOrdinal': 2, 'status': 'non_compliant'});
    await o.settle({other.id: const SyncOutcome(status: 'rejected', clause: 'IPS 21(1)(f)', reason: 'needs a reason')});
    await o.enqueue('finding.upsert', {'inspectionId': 3, 'templateCode': 'wks17-general', 'sectionOrdinal': 1, 'itemOrdinal': 3, 'status': 'compliant'});
    expect(o.rejectedCount, 1);
  });

  test('clearing the outbox drops everything queued', () async {
    final store = InMemoryOutboxStore();
    final o = Outbox(store);
    await o.enqueue('finding.upsert', {'inspectionId': 3});
    await o.enqueue('job.transition', {'jobId': 7, 'toStage': 'application'});
    expect(o.pendingCount, 2);
    await o.clear();
    expect(o.pendingCount, 0);
    final again = Outbox(store);
    await again.load();
    expect(again.pendingCount, 0, reason: 'nothing survives on disk for the next sign-in');
  });
}
