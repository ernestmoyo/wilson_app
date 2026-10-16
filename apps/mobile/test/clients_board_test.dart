import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:assure_field/app.dart';
import 'package:assure_field/auth/session.dart';
import 'package:assure_field/models/dashboard.dart';
import 'package:assure_field/sync/api_client.dart';
import 'package:assure_field/sync/outbox.dart';

import 'fake_server.dart';

SessionStore signedIn({String role = 'certifier'}) => MemorySessionStore()
  ..save(Session(token: 'test-token', userId: 1, fullName: 'Bryan Wilson', occupation: 'Compliance certifier', authorisationNumber: 'TST100250', role: role));

/// The clean landing (16 October 2026): Brian signs in to his active clients,
/// one row per client with its open jobs under it, nothing empty shouting at
/// him, and clients that are not real work archived off the list.
void main() {
  Future<FakeServer> open(WidgetTester tester, {FakeServer? server, String role = 'certifier', Size size = const Size(1400, 1000)}) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    final s = server ?? (FakeServer()..stage = 'site_inspection');
    final api = ApiClient(baseUrl: Uri.parse('http://fake.test'), deviceId: 'd', httpClient: s.client_());
    await tester.pumpWidget(AssureFieldApp(app: AppSession(store: signedIn(role: role), api: api, outboxStore: InMemoryOutboxStore())));
    await tester.pumpAndSettle();
    return s;
  }

  FakeServer twoClients() => FakeServer()
    ..stage = 'site_inspection'
    ..extraJobs.addAll([
      FakeServer.row(8, 1, 'Argenta Manufacturing Limited', 'Drum store', address: '2 Sterling Avenue'),
      FakeServer.row(9, 2, 'Test Coatings Limited', 'Paint store', stage: 'enquiry'),
      FakeServer.row(10, 3, 'Test Closed Limited', 'Old store', stage: 'closed'),
    ]);

  testWidgets('the landing is Clients: one row per client, its open jobs under it', (tester) async {
    await open(tester, server: twoClients());
    expect(find.text('Clients'), findsOneWidget);
    expect(find.byKey(const ValueKey('client-1')), findsOneWidget);
    expect(find.byKey(const ValueKey('client-2')), findsOneWidget);
    // Argenta's two jobs sit under one row, not two cards.
    expect(find.text('Argenta Manufacturing Limited'), findsOneWidget);
    expect(find.descendant(of: find.byKey(const ValueKey('client-1')), matching: find.byKey(const ValueKey('job-7'))), findsOneWidget);
    expect(find.descendant(of: find.byKey(const ValueKey('client-1')), matching: find.byKey(const ValueKey('job-8'))), findsOneWidget);
    // A client with nothing open is not an active client.
    expect(find.byKey(const ValueKey('client-3')), findsNothing);
    expect(find.text('2 active clients'), findsOneWidget);
  });

  testWidgets('two clients that share a name stay two rows (grouped by id, not name)', (tester) async {
    final s = FakeServer()
      ..stage = 'site_inspection'
      ..extraJobs.add(FakeServer.row(20, 14, 'Argenta Manufacturing Limited', 'G2 Chiller', address: '1d Matakohe'));
    await open(tester, server: s);
    expect(find.byKey(const ValueKey('client-1')), findsOneWidget);
    expect(find.byKey(const ValueKey('client-14')), findsOneWidget);
  });

  testWidgets('Needs attention appears only when something needs attention', (tester) async {
    await open(tester, server: FakeServer()..noReminders = true);
    expect(find.byKey(const ValueKey('attention')), findsNothing);
    expect(find.text('Nothing waiting on you right now.'), findsNothing);
  });

  testWidgets('recent activity comes after the clients, not before', (tester) async {
    await open(tester);
    final client = tester.getTopLeft(find.byKey(const ValueKey('client-1'))).dy;
    final activity = tester.getTopLeft(find.byKey(const ValueKey('activity'))).dy;
    expect(activity, greaterThan(client));
  });

  testWidgets('on a wide screen the list keeps a readable width', (tester) async {
    await open(tester, size: const Size(1800, 1000));
    expect(tester.getSize(find.byKey(const ValueKey('client-1'))).width, lessThanOrEqualTo(960));
  });

  testWidgets('a job line opens the job hub', (tester) async {
    await open(tester);
    await tester.tap(find.byKey(const ValueKey('job-7')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('now-card')), findsOneWidget);
  });

  testWidgets('the certifier archives a client: it leaves the list, Undo brings it back', (tester) async {
    final s = await open(tester, server: twoClients());
    await tester.tap(find.byKey(const ValueKey('client-menu-2')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Archive client'));
    await tester.pumpAndSettle();
    expect(s.events.where((e) => e['type'] == 'client.archive').single['payload'], {'clientId': 2, 'archived': true});
    expect(find.byKey(const ValueKey('client-2')), findsNothing);
    expect(find.text('1 active client'), findsOneWidget);

    // The archived list shows it, and Bring back returns it.
    await tester.scrollUntilVisible(find.byKey(const ValueKey('show-archived')), 200, scrollable: find.byType(Scrollable).first);
    await tester.tap(find.byKey(const ValueKey('show-archived')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('client-2')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('client-menu-2')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Bring back'));
    await tester.pumpAndSettle();
    expect(s.archivedClients, isEmpty);
  });

  testWidgets('a reviewer has no archive menu', (tester) async {
    await open(tester, server: twoClients(), role: 'reviewer');
    expect(find.byKey(const ValueKey('client-2')), findsOneWidget);
    expect(find.byKey(const ValueKey('client-menu-2')), findsNothing);
  });

  testWidgets('New job for an existing client sends its id: no duplicate client', (tester) async {
    final s = await open(tester, server: twoClients());
    await tester.tap(find.byKey(const ValueKey('new-job')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('nj-legal')), 'Test Coat');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Test Coatings Limited').last);
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('nj-address')), '5 Second Road');
    await tester.enterText(find.byKey(const ValueKey('nj-location')), 'Second store');
    await tester.tap(find.byKey(const ValueKey('nj-create')));
    await tester.pumpAndSettle();
    final client = (s.created.single['client'] as Map).cast<String, dynamic>();
    expect(client['id'], 2, reason: jsonEncode(client));
    expect(client['legalName'], 'Test Coatings Limited');
  });

  testWidgets('a typed new name creates a new client (no id sent)', (tester) async {
    final s = await open(tester, server: twoClients());
    await tester.tap(find.byKey(const ValueKey('new-job')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('nj-legal')), 'Brand New Limited');
    await tester.enterText(find.byKey(const ValueKey('nj-address')), '1 New Road');
    await tester.enterText(find.byKey(const ValueKey('nj-location')), 'Store');
    await tester.tap(find.byKey(const ValueKey('nj-create')));
    await tester.pumpAndSettle();
    expect((s.created.single['client'] as Map).containsKey('id'), isFalse);
  });

  testWidgets('the empty board offers no demo loader in a production build', (tester) async {
    await open(tester, server: FakeServer()..noJobs = true);
    expect(find.byKey(const ValueKey('create-demo')), findsNothing);
    expect(find.text('No active clients yet'), findsOneWidget);
  });

  testWidgets('the board fits a phone without overflow', (tester) async {
    await open(tester, server: twoClients(), size: const Size(390, 844));
    expect(tester.takeException(), isNull);
    expect(find.byKey(const ValueKey('client-1')), findsOneWidget);
  });

  testWidgets('a refused archive is shown, and the client stays', (tester) async {
    final s = twoClients()..rejectArchiveWith = 'Role: archiving a client needs a compliance certifier; signed in as reviewer';
    await open(tester, server: s);
    await tester.tap(find.byKey(const ValueKey('client-menu-2')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Archive client'));
    await tester.pumpAndSettle();
    expect(find.textContaining('archiving a client needs a compliance certifier'), findsOneWidget);
    expect(find.byKey(const ValueKey('client-2')), findsOneWidget);
    expect(find.text('Undo'), findsNothing);
  });

  testWidgets('Undo still works after Brian has opened a job', (tester) async {
    final s = await open(tester, server: twoClients());
    await tester.tap(find.byKey(const ValueKey('client-menu-2')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Archive client'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.byKey(const ValueKey('job-7')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('now-card')), findsOneWidget);
    await tester.tap(find.text('Undo').last);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(s.archivedClients, isEmpty);
  });

  test('the activity strip says what an archive did', () {
    expect(describeEvent('client.archive', {'clientId': 2, 'archived': true}), 'archived a client');
    expect(describeEvent('client.archive', {'clientId': 2, 'archived': false}), 'brought a client back to the list');
  });
}
