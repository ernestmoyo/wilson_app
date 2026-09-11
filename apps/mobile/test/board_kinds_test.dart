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
