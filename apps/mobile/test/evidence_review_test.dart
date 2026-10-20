// Evidence review and versions (phase 2 package A; Tatenda Katai's answers of
// 20 Oct 2026, Q3 and Q4), against the fake server: each file on an item
// shows its version line and review badge; a reviewer accepts it or marks it
// not accepted with a note; a viewer sees no actions; Replace uploads the new
// file as the next version (supersedesId); older versions sit under a
// "Previous versions" expander.

import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:assure_field/bootstrap.dart';
import 'package:assure_field/models/evidence.dart';
import 'package:assure_field/models/finding.dart';
import 'package:assure_field/models/inspection.dart';
import 'package:assure_field/screens/evidence_capture.dart';
import 'package:assure_field/sync/api_client.dart';
import 'package:assure_field/sync/outbox.dart';
import 'package:assure_field/sync/sync_service.dart';
import 'package:assure_field/widgets/ui.dart';

import 'fake_server.dart';

void main() {
  late FakeServer server;
  late SyncService sync;
  final pdf = Uint8List.fromList([...'%PDF-1.4\n'.codeUnits, ...List.filled(3000, 0x42), ...'\n%%EOF\n'.codeUnits]);
  const uploadedAt = '2026-10-20T12:00:00Z';
  final day = EvidenceFile.formatDay(DateTime.parse(uploadedAt));

  setUp(() {
    server = FakeServer();
    final api = ApiClient(baseUrl: Uri.parse('http://fake.test'), deviceId: 'test', userId: 1, httpClient: server.client_());
    api.token = 'tok-123';
    sync = SyncService(outbox: Outbox(InMemoryOutboxStore()), api: api);
    // Finding 11 is wks17-general 4/4: a v1 replaced by a v2.
    server.evidence.addAll([
      {
        'id': 401, 'finding_id': 11, 'kind': 'document', 'original_name': 'ERP rev 1.pdf',
        'sha256': 'a' * 64, 'storage_key': '${'a' * 64}.pdf', 'bytes': 2048,
        'version': 1, 'supersedes_id': null, 'uploaded_by_name': 'Ann Reviewer', 'uploaded_at': '2026-10-01T12:00:00Z',
        'review_state': 'not_accepted', 'reviewed_by_name': 'Bryan Wilson', 'review_note': 'Out of date', 'current': false,
      },
      {
        'id': 402, 'finding_id': 11, 'kind': 'document', 'original_name': 'ERP rev 2.pdf',
        'sha256': 'b' * 64, 'storage_key': '${'b' * 64}.pdf', 'bytes': 4096,
        'version': 2, 'supersedes_id': 401, 'uploaded_by_name': 'Bryan Wilson', 'uploaded_at': uploadedAt,
        'review_state': 'submitted', 'current': true,
      },
    ]);
  });

  Inspection inspection() => Inspection(
        locationName: 'G2 Chiller',
        pcbuName: 'Argenta Manufacturing Limited',
        siteAddress: '2 Sterling Avenue',
        certifierName: 'Bryan Wilson',
        classKey: 'class_6_8',
        templates: templatesFor('class_6_8'),
      )
        ..jobId = 7
        ..inspectionId = 3;

  Future<void> pump(WidgetTester t, {required String role, PickedDocument? pick}) async {
    t.view.physicalSize = const Size(1000, 2400);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    server.role = role;
    await t.pumpWidget(MaterialApp(
      home: Builder(
        builder: (context) => Scaffold(
          body: TextButton(
            onPressed: () => Navigator.of(context).push(MaterialPageRoute<bool>(
              builder: (_) => EvidenceCaptureScreen(
                inspection: inspection(),
                finding: Finding(templateCode: 'wks17-general', sectionOrdinal: 4, itemOrdinal: 4),
                sync: sync,
                capturedByName: 'Bryan Wilson',
                capturedByOccupation: 'Compliance certifier',
                role: role,
                pickDocument: () async => pick,
                openUrl: (u) async {},
              ),
            )),
            child: const Text('open capture'),
          ),
        ),
      ),
    ));
    await t.tap(find.text('open capture'));
    await t.pumpAndSettle();
  }

  Map<String, dynamic> lastPayload(String type) =>
      (server.events.lastWhere((e) => e['type'] == type)['payload'] as Map).cast<String, dynamic>();

  Finder badge(String label) => find.byWidgetPredicate((w) => w is StatusBadge && w.label == label);

  testWidgets('each current file shows its version line and a review badge; v1 is under Previous versions', (t) async {
    await pump(t, role: 'reviewer');
    expect(find.text('ERP rev 2.pdf'), findsOneWidget);
    expect(find.text('v2 · $day · Bryan Wilson'), findsOneWidget);
    expect(badge('Submitted'), findsOneWidget);
    // The replaced version is not listed as current.
    expect(find.text('ERP rev 1.pdf'), findsNothing);
    expect(find.text('Previous versions (1)'), findsOneWidget);
    await t.tap(find.byKey(const ValueKey('ev-previous-402')));
    await t.pumpAndSettle();
    expect(find.text('ERP rev 1.pdf'), findsOneWidget);
    expect(find.textContaining('v1 · '), findsOneWidget);
    expect(badge('Not accepted'), findsOneWidget);
    expect(find.textContaining('Out of date'), findsOneWidget);
    // A previous version is never reviewed or replaced.
    expect(find.byKey(const ValueKey('ev-accept-401')), findsNothing);
    expect(find.byKey(const ValueKey('ev-replace-401')), findsNothing);
  });

  testWidgets('a reviewer accepts: evidence.review goes with the job, and the badge turns Accepted', (t) async {
    await pump(t, role: 'reviewer');
    expect(find.byKey(const ValueKey('ev-accept-402')), findsOneWidget);
    expect(find.byKey(const ValueKey('ev-reject-402')), findsOneWidget);
    await t.tap(find.byKey(const ValueKey('ev-accept-402')));
    await t.pumpAndSettle();
    final p = lastPayload('evidence.review');
    expect(p['evidenceId'], 402);
    expect(p['state'], 'accepted');
    expect(p['jobId'], 7);
    expect(badge('Accepted'), findsOneWidget);
    expect(badge('Submitted'), findsNothing);
  });

  testWidgets('Not accepted asks for the reason, and sends it', (t) async {
    await pump(t, role: 'certifier');
    await t.tap(find.byKey(const ValueKey('ev-reject-402')));
    await t.pumpAndSettle();
    final confirm = find.byKey(const ValueKey('ev-reject-confirm'));
    expect(t.widget<FilledButton>(confirm).onPressed, isNull, reason: 'no reason, no refusal (IPS 21(1)(e))');
    await t.enterText(find.byKey(const ValueKey('ev-note')), 'Label unreadable');
    await t.pumpAndSettle();
    await t.tap(confirm);
    await t.pumpAndSettle();
    final p = lastPayload('evidence.review');
    expect(p['state'], 'not_accepted');
    expect(p['note'], 'Label unreadable');
    expect(badge('Not accepted'), findsOneWidget);
    expect(find.textContaining('Label unreadable'), findsOneWidget);
  });

  testWidgets('a viewer sees the versions and badges but no Accept, Not accepted or Replace', (t) async {
    await pump(t, role: 'viewer');
    expect(find.text('v2 · $day · Bryan Wilson'), findsOneWidget);
    expect(badge('Submitted'), findsOneWidget);
    expect(find.byKey(const ValueKey('ev-accept-402')), findsNothing);
    expect(find.byKey(const ValueKey('ev-reject-402')), findsNothing);
    expect(find.byKey(const ValueKey('ev-replace-402')), findsNothing);
  });

  testWidgets('Replace uploads the new file as the next version (supersedesId)', (t) async {
    await pump(t, role: 'reviewer', pick: PickedDocument('ERP rev 3.pdf', pdf));
    await t.tap(find.byKey(const ValueKey('ev-replace-402')));
    await t.pumpAndSettle();
    expect(find.textContaining('Replacing ERP rev 2.pdf (v2)'), findsOneWidget);
    await t.tap(find.text('Attach PDF'));
    await t.pumpAndSettle();
    await t.tap(find.text('Attach as version 3'));
    await t.pumpAndSettle();
    final p = lastPayload('evidence.attach');
    expect(p['supersedesId'], 402);
    expect(p['originalName'], 'ERP rev 3.pdf');
    expect(server.evidence.firstWhere((e) => e['id'] == 402)['current'], isFalse);
    expect(find.text('open capture'), findsOneWidget, reason: 'the screen closes once attached');
  });

  testWidgets('a plain attach (no Replace) carries no supersedesId', (t) async {
    await pump(t, role: 'reviewer', pick: PickedDocument('Site plan.pdf', pdf));
    await t.tap(find.text('Attach PDF'));
    await t.pumpAndSettle();
    await t.tap(find.text('Attach as record'));
    await t.pumpAndSettle();
    expect(lastPayload('evidence.attach').containsKey('supersedesId'), isFalse);
  });

  test('EvidenceFile reads an older server row (no version fields) as v1, current, submitted', () {
    final e = EvidenceFile.fromJson({'id': 9, 'kind': 'photo', 'captured_by_name': 'A', 'captured_at': '2026-10-02T00:00:00Z'});
    expect(e.version, 1);
    expect(e.current, isTrue);
    expect(e.reviewLabel, 'Submitted');
    expect(e.title, 'Photograph');
  });
}
