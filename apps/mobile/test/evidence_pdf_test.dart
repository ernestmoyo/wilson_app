// Attach a PDF as evidence (scope of work, 19 October 2026), against the
// fake server: the app hashes the file, asks for an upload URL, sends the
// bytes to the server (disk) or straight to storage (Blob/Spaces) and
// confirms, then queues evidence.attach as a document with its name. The
// item's evidence list shows the name and opens the file through /link.

import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:assure_field/bootstrap.dart';
import 'package:assure_field/models/finding.dart';
import 'package:assure_field/models/inspection.dart';
import 'package:assure_field/screens/evidence_capture.dart';
import 'package:assure_field/sync/api_client.dart';
import 'package:assure_field/sync/outbox.dart';
import 'package:assure_field/sync/sync_service.dart';

import 'fake_server.dart';

void main() {
  late FakeServer server;
  late ApiClient api;
  late SyncService sync;
  final pdf = Uint8List.fromList([...'%PDF-1.4\n'.codeUnits, ...List.filled(4000, 0x41), ...'\n%%EOF\n'.codeUnits]);
  final pdfSha = sha256.convert(pdf).toString();

  setUp(() {
    server = FakeServer();
    api = ApiClient(baseUrl: Uri.parse('http://fake.test'), deviceId: 'test', userId: 1, httpClient: server.client_());
    api.token = 'tok-123';
    sync = SyncService(outbox: Outbox(InMemoryOutboxStore()), api: api);
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

  final finding = Finding(templateCode: 'wks17-general', sectionOrdinal: 4, itemOrdinal: 4);
  final opened = <Uri>[];

  Future<void> pump(WidgetTester t, {PickedDocument? pick}) async {
    t.view.physicalSize = const Size(1000, 2400);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    opened.clear();
    await t.pumpWidget(MaterialApp(
      home: Builder(
        builder: (context) => Scaffold(
          body: TextButton(
            onPressed: () => Navigator.of(context).push(MaterialPageRoute<bool>(
              builder: (_) => EvidenceCaptureScreen(
                inspection: inspection(),
                finding: finding,
                sync: sync,
                capturedByName: 'Bryan Wilson',
                capturedByOccupation: 'Compliance certifier',
                pickDocument: () async => pick,
                openUrl: (u) async => opened.add(u),
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

  Map<String, dynamic> attachEvent() =>
      (server.events.singleWhere((e) => e['type'] == 'evidence.attach')['payload'] as Map).cast<String, dynamic>();

  testWidgets('Attach PDF sits beside Camera and Choose', (t) async {
    await pump(t);
    expect(find.text('Camera'), findsOneWidget);
    expect(find.text('Choose'), findsOneWidget);
    expect(find.text('Attach PDF'), findsOneWidget);
  });

  testWidgets('a PDF goes upload-url → POST to the server → attached as a document with its name', (t) async {
    await pump(t, pick: PickedDocument('ERP rev 2.pdf', pdf));
    await t.tap(find.text('Attach PDF'));
    await t.pumpAndSettle();
    expect(find.text('ERP rev 2.pdf'), findsOneWidget);
    // A document needs no "where the photograph was taken".
    await t.enterText(find.byType(TextField), '');
    await t.pumpAndSettle();
    await t.tap(find.text('Attach as record'));
    await t.pumpAndSettle();

    expect(server.requests, containsAllInOrder(['POST /api/evidence/upload-url', 'POST /api/evidence/upload', 'POST /api/sync']));
    expect(server.stored['$pdfSha.pdf'], pdf);
    final p = attachEvent();
    expect(p['kind'], 'document');
    expect(p['originalName'], 'ERP rev 2.pdf');
    expect(p['sha256'], pdfSha);
    expect(p['storageKey'], '$pdfSha.pdf');
    expect(p['mime'], 'application/pdf');
    expect(p['bytes'], pdf.length);
    expect(p.containsKey('capturedWhere'), isFalse);
    expect(find.text('open capture'), findsOneWidget, reason: 'the screen closes once attached');
  });

  testWidgets('direct mode: PUT straight to storage without our token, then confirm', (t) async {
    server.evidenceMode = 'direct';
    await pump(t, pick: PickedDocument('Big site plan.pdf', pdf));
    await t.tap(find.text('Attach PDF'));
    await t.pumpAndSettle();
    await t.tap(find.text('Attach as record'));
    await t.pumpAndSettle();

    expect(server.requests, containsAllInOrder(['POST /api/evidence/upload-url', 'PUT /evidence/$pdfSha.pdf', 'POST /api/evidence/confirm', 'POST /api/sync']));
    expect(server.requests, isNot(contains('POST /api/evidence/upload')));
    expect(server.storagePutHeaders.single['x-content-type'], 'application/pdf');
    expect(server.storagePutHeaders.single.containsKey('authorization'), isFalse);
    expect(attachEvent()['storageKey'], 'evidence/$pdfSha.pdf');
    expect(attachEvent()['originalName'], 'Big site plan.pdf');
  });

  testWidgets('already stored: no PUT at all, the server re-hashes what is there, then attach', (t) async {
    server.evidenceMode = 'direct';
    server.stored['$pdfSha.pdf'] = pdf;
    await pump(t, pick: PickedDocument('Site plan.pdf', pdf));
    await t.tap(find.text('Attach PDF'));
    await t.pumpAndSettle();
    await t.tap(find.text('Attach as record'));
    await t.pumpAndSettle();

    expect(server.requests, containsAllInOrder(['POST /api/evidence/upload-url', 'POST /api/evidence/confirm', 'POST /api/sync']));
    expect(server.requests.where((r) => r.startsWith('PUT ')), isEmpty);
    expect(attachEvent()['storageKey'], 'evidence/$pdfSha.pdf');
  });

  testWidgets('over 50 MB is refused on the device, before any upload', (t) async {
    await pump(t, pick: PickedDocument('huge.pdf', Uint8List(evidenceMaxBytes + 1)));
    await t.tap(find.text('Attach PDF'));
    await t.pumpAndSettle();
    expect(find.textContaining('limited to 50 MB'), findsOneWidget);
    expect(server.requests, isNot(contains('POST /api/evidence/upload-url')));
  });

  testWidgets('the item lists its documents by name; tapping one opens it through /link', (t) async {
    server.evidence.add({
      'id': 900, 'finding_id': 11, 'kind': 'document', 'sha256': pdfSha, 'storage_key': '$pdfSha.pdf',
      'original_name': 'Emergency response plan.pdf', 'mime': 'application/pdf', 'bytes': pdf.length,
      'captured_by_name': 'Bryan Wilson', 'captured_at': '2026-10-19T01:00:00Z',
    });
    server.evidence.add({
      'id': 901, 'finding_id': 12, 'kind': 'document', 'sha256': 'b' * 64, 'storage_key': '${'b' * 64}.pdf',
      'original_name': 'Another item.pdf', 'mime': 'application/pdf', 'bytes': 10,
    });
    await pump(t);
    expect(find.text('Attached to this item'), findsOneWidget);
    expect(find.text('Emergency response plan.pdf'), findsOneWidget);
    expect(find.text('Another item.pdf'), findsNothing, reason: 'evidence of another item');
    await t.tap(find.text('Emergency response plan.pdf'));
    await t.pumpAndSettle();
    expect(server.requests, contains('GET /api/evidence/$pdfSha.pdf/link'));
    expect(opened.single.path, '/api/evidence/$pdfSha.pdf');
    expect(opened.single.queryParameters['token'], 'tok-123', reason: 'the server route needs the session');
  });

  test('evidenceLink: a presigned storage URL is used as is', () async {
    server.evidenceMode = 'direct';
    final u = await api.evidenceLink('evidence/$pdfSha.pdf');
    expect(u.host, 'storage.invalid');
    expect(u.queryParameters.containsKey('token'), isFalse);
  });
}
