// The two export actions on the Job screen (contract C): the checksheet PDF
// and the bundle ZIP open in the browser with the token as ?token=, and a
// viewer sees them too.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:assure_field/auth/session.dart';
import 'package:assure_field/bootstrap.dart';
import 'package:assure_field/screens/job_screen.dart';
import 'package:assure_field/sync/api_client.dart';
import 'package:assure_field/sync/outbox.dart';
import 'package:assure_field/sync/sync_service.dart';

import 'fake_server.dart';

void main() {
  late SyncService sync;
  final opened = <Uri>[];
  final original = openExternalDocument;

  setUp(() {
    final server = FakeServer();
    final api = ApiClient(
      baseUrl: Uri.parse('http://fake.test'),
      deviceId: 'test',
      userId: 1,
      httpClient: server.client_(),
    )..token = 'tok-123';
    sync = SyncService(outbox: Outbox(InMemoryOutboxStore()), api: api);
    opened.clear();
    openExternalDocument = (uri) async {
      opened.add(uri);
      return true;
    };
  });
  tearDown(() => openExternalDocument = original);

  Future<void> pump(WidgetTester t) async {
    t.view.physicalSize = const Size(1000, 2600);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    await t.pumpWidget(MaterialApp(home: JobScreen(jobId: 7, sync: sync)));
    await t.pumpAndSettle();
  }

  testWidgets('Checksheet (PDF) and Download all (ZIP) open the export routes with the token', (t) async {
    await pump(t);
    expect(find.text('Checksheet (PDF)'), findsOneWidget);
    expect(find.text('Download all (ZIP)'), findsOneWidget);

    await t.tap(find.byKey(const ValueKey('checksheet-pdf')));
    await t.tap(find.byKey(const ValueKey('bundle-zip')));
    await t.pump();

    expect(opened.map((u) => u.path), ['/api/jobs/7/checksheet.pdf', '/api/jobs/7/bundle.zip']);
    expect(opened.every((u) => u.queryParameters['token'] == 'tok-123'), isTrue);
  });

  testWidgets('a viewer can download both', (t) async {
    CurrentUser.apply(const Session(token: 't', userId: 3, fullName: 'Client viewer', occupation: 'Client', role: 'viewer'));
    addTearDown(() => CurrentUser.apply(const Session(token: 't', userId: 1, fullName: 'Bryan Wilson', occupation: 'Compliance certifier', role: 'certifier')));
    await pump(t);
    final pdf = t.widget<OutlinedButton>(find.byKey(const ValueKey('checksheet-pdf')));
    final zip = t.widget<OutlinedButton>(find.byKey(const ValueKey('bundle-zip')));
    expect(pdf.onPressed, isNotNull);
    expect(zip.onPressed, isNotNull);
  });
}
