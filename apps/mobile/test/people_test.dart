import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:assure_field/app.dart';
import 'package:assure_field/auth/session.dart';
import 'package:assure_field/screens/people_screen.dart';
import 'package:assure_field/sync/api_client.dart';
import 'package:assure_field/sync/outbox.dart';

import 'fake_server.dart';

SessionStore signedIn({String role = 'certifier'}) => MemorySessionStore()
  ..save(Session(token: 'test-token', userId: 1, fullName: 'Bryan Wilson', occupation: 'Compliance certifier', authorisationNumber: 'TST100250', role: role));

/// Person → Role: a certifier reaches People from the board, adds a person
/// with a role and a passcode, edits a role, sets a passcode. A reviewer has
/// no People button.
void main() {
  testWidgets('a certifier adds a person, changes a role, sets a passcode', (tester) async {
    tester.view.physicalSize = const Size(1200, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    final server = FakeServer();
    final api = ApiClient(baseUrl: Uri.parse('http://fake.test'), deviceId: 'd', httpClient: server.client_());
    await tester.pumpWidget(AssureFieldApp(app: AppSession(store: signedIn(), api: api, outboxStore: InMemoryOutboxStore())));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('to-people')));
    await tester.pumpAndSettle();
    expect(find.byType(PeopleScreen), findsOneWidget);
    expect(find.text('Bryan Wilson'), findsWidgets);
    expect(find.text('Document reviewer'), findsOneWidget);
    expect(find.textContaining('No passcode yet'), findsOneWidget);

    // Add.
    await tester.tap(find.byKey(const ValueKey('add-person')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('p-name')), 'Tendai Example');
    await tester.enterText(find.byKey(const ValueKey('p-occupation')), 'Field assessor');
    await tester.enterText(find.byKey(const ValueKey('p-email')), 'Tendai@assuresafety.co.nz');
    await tester.enterText(find.byKey(const ValueKey('p-passcode')), 'secret-1');
    await tester.tap(find.byKey(const ValueKey('p-save')));
    await tester.pumpAndSettle();
    expect(server.users.last['fullName'], 'Tendai Example');
    expect(server.users.last['role'], 'reviewer', reason: 'reviewer is the default role');
    expect(server.users.last['email'], 'tendai@assuresafety.co.nz');
    expect(find.text('Tendai Example'), findsOneWidget);

    // Change the role through the menu.
    final id = server.users.last['id'];
    await tester.tap(find.byKey(ValueKey('person-menu-$id')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Edit details and role'));
    await tester.pumpAndSettle();
    // Pick Viewer on the role field (driving the field's own callback; the
    // overlay menu does not open reliably under the test binding).
    tester.widget<DropdownButtonFormField<String>>(find.byKey(const ValueKey('p-role'))).onChanged!('viewer');
    await tester.pumpAndSettle();
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('p-save')));
    await tester.pumpAndSettle();
    expect(server.users.last['role'], 'viewer');

    // New passcode.
    await tester.tap(find.byKey(ValueKey('person-menu-$id')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Set a new passcode'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('p-new-passcode')), 'another-1');
    await tester.tap(find.byKey(const ValueKey('p-passcode-save')));
    await tester.pumpAndSettle();
    expect(server.passcodesSet.single, {'id': id, 'passcode': 'another-1'});
  });

  testWidgets('a reviewer has no People button', (tester) async {
    final server = FakeServer()..role = 'reviewer';
    final api = ApiClient(baseUrl: Uri.parse('http://fake.test'), deviceId: 'd', httpClient: server.client_());
    await tester.pumpWidget(AssureFieldApp(app: AppSession(store: signedIn(role: 'reviewer'), api: api, outboxStore: InMemoryOutboxStore())));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('to-people')), findsNothing);
  });
}
