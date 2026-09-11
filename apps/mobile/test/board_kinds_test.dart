import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:assure_field/app.dart';
import 'package:assure_field/auth/session.dart';
import 'package:assure_field/sync/api_client.dart';
import 'package:assure_field/sync/outbox.dart';

import 'fake_server.dart';

SessionStore signedIn() => MemorySessionStore()
  ..save(const Session(token: 'test-token', userId: 1, fullName: 'Bryan Wilson', occupation: 'Compliance certifier', authorisationNumber: 'TST100250'));

/// The board and the hub for a handler job and for an empty server: both
/// must settle (a rebuild loop here would freeze the web app).
void main() {
  testWidgets('a handler job on the board: person icon, applicant name, assessment wording', (tester) async {
    final server = FakeServer()
      ..stage = 'site_inspection'
      ..classKey = 'handler_6';
    server.subject.addAll({'Name': 'Test Applicant', 'Company': 'Example Training Limited'});
    final api = ApiClient(baseUrl: Uri.parse('http://fake.test'), deviceId: 'd', httpClient: server.client_());
    await tester.pumpWidget(AssureFieldApp(app: AppSession(store: signedIn(), api: api, outboxStore: InMemoryOutboxStore())));
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.person_outline), findsOneWidget);
    expect(find.textContaining('Test Applicant'), findsWidgets);
    expect(find.textContaining('Continue the assessment'), findsOneWidget);

    // Into the hub, then the sheet.
    await tester.tap(find.textContaining('Test Applicant').first);
    await tester.pumpAndSettle();
    expect(find.textContaining('Continue the assessment'), findsOneWidget);
  });

  testWidgets('New job: substances entered on the form reach the server and show on the hub', (tester) async {
    tester.view.physicalSize = const Size(1200, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    final server = FakeServer()..noJobs = true;
    server.substances.clear();
    final api = ApiClient(baseUrl: Uri.parse('http://fake.test'), deviceId: 'd', httpClient: server.client_());
    await tester.pumpWidget(AssureFieldApp(app: AppSession(store: signedIn(), api: api, outboxStore: InMemoryOutboxStore())));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(FilledButton, 'New job').first);
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('nj-legal')), 'Example Chemicals Limited');
    await tester.enterText(find.byKey(const ValueKey('nj-address')), '1 Example Road');
    await tester.enterText(find.byKey(const ValueKey('nj-location')), 'Store 1');
    await tester.enterText(find.byKey(const ValueKey('nj-sub-0-name')), 'Abamectin');
    await tester.enterText(find.byKey(const ValueKey('nj-sub-0-class')), '6.1B');
    await tester.tap(find.byKey(const ValueKey('nj-add-substance')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('nj-sub-1-name')), 'Ivermectin');
    await tester.enterText(find.byKey(const ValueKey('nj-sub-1-class')), '6.1C');
    await tester.tap(find.byKey(const ValueKey('nj-add-substance')));
    await tester.pumpAndSettle();
    // A third, blank row is ignored.
    await tester.ensureVisible(find.byKey(const ValueKey('nj-create')));
    await tester.tap(find.byKey(const ValueKey('nj-create')));
    await tester.pumpAndSettle();

    expect(server.created.single['substances'], [
      {'name': 'Abamectin', 'hazardClass': '6.1B'},
      {'name': 'Ivermectin', 'hazardClass': '6.1C'},
    ]);
    // The hub shows the Substance nodes it created.
    server.noJobs = false;
    expect(find.text('Substances'), findsOneWidget);
    expect(find.text('Abamectin'), findsOneWidget);
    expect(find.textContaining('Ivermectin'), findsOneWidget, reason: 'second row');
    expect(find.text('6.1B'), findsOneWidget, reason: 'first class');
    expect(find.textContaining('6.1C'), findsOneWidget);
  });

  testWidgets('an empty server settles on "No jobs yet"', (tester) async {
    final server = FakeServer()..noJobs = true;
    final api = ApiClient(
      baseUrl: Uri.parse('http://fake.test'),
      deviceId: 'd',
      httpClient: server.client_(),
    );
    await tester.pumpWidget(AssureFieldApp(app: AppSession(store: signedIn(), api: api, outboxStore: InMemoryOutboxStore())));
    await tester.pumpAndSettle();
    expect(find.text('No jobs yet'), findsOneWidget);
  });
}
