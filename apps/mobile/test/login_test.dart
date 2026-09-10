// Sign-in against a fake server, and the gate that sits in front of the app.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:assure_field/auth/session.dart';
import 'package:assure_field/bootstrap.dart';
import 'package:assure_field/main.dart';
import 'package:assure_field/screens/login_screen.dart';
import 'package:assure_field/sync/api_client.dart';
import 'package:assure_field/sync/outbox.dart';

import 'fake_server.dart';

void main() {
  test('Session round-trips through its JSON form', () {
    final s = Session.fromLogin({
      'token': 'abc',
      'expiresAt': '2026-10-10T00:00:00Z',
      'user': {'id': '1', 'fullName': 'Bryan Wilson', 'occupation': 'Compliance certifier', 'authorisationNumber': 'TST100250'},
    });
    final back = Session.fromLogin(s.toJson());
    expect(back.token, 'abc');
    expect(back.userId, 1);
    expect(back.authorisationNumber, 'TST100250');
    expect(back.expiresAt, isNotNull);
  });

  testWidgets('a wrong passcode shows the refusal; the right one hands back a session', (t) async {
    final api = ApiClient(baseUrl: Uri.parse('http://fake.test'), deviceId: 'd', httpClient: FakeServer().client_());
    Session? got;
    await t.pumpWidget(MaterialApp(home: LoginScreen(api: api, onSignedIn: (s) async => got = s)));
    expect(find.text('compliancecertifier@assuresafety.co.nz'), findsOneWidget);

    await t.enterText(find.byKey(const ValueKey('login-passcode')), 'wrong');
    await t.tap(find.byKey(const ValueKey('login-submit')));
    await t.pumpAndSettle();
    expect(find.text('Email or passcode not recognised.'), findsOneWidget);
    expect(got, isNull);

    await t.enterText(find.byKey(const ValueKey('login-passcode')), 'chiller-2026');
    await t.tap(find.byKey(const ValueKey('login-submit')));
    await t.pumpAndSettle();
    expect(got, isNotNull);
    expect(got!.fullName, 'Bryan Wilson');
    expect(api.token, 'tok-123');
  });

  testWidgets('the gate shows sign-in with no session, the inspections after, and sign-out returns', (t) async {
    final store = MemorySessionStore();
    final api = ApiClient(baseUrl: Uri.parse('http://fake.test'), deviceId: 'd', httpClient: FakeServer().client_());
    await t.pumpWidget(MaterialApp(home: AuthGate(store: store, api: api, outboxStore: InMemoryOutboxStore())));
    await t.pumpAndSettle();
    expect(find.byKey(const ValueKey('login-submit')), findsOneWidget);

    await t.enterText(find.byKey(const ValueKey('login-passcode')), 'chiller-2026');
    await t.tap(find.byKey(const ValueKey('login-submit')));
    await t.pumpAndSettle();
    expect(find.textContaining('G2 Chiller'), findsWidgets);
    expect(find.textContaining('Bryan Wilson · TST100250'), findsOneWidget);
    expect(CurrentUser.name, 'Bryan Wilson');
    expect((await store.load())?.token, 'tok-123');

    await t.tap(find.byKey(const ValueKey('sign-out')));
    await t.pumpAndSettle();
    expect(find.byKey(const ValueKey('login-submit')), findsOneWidget);
    expect(api.token, isNull);
    expect(await store.load(), isNull);
  });

  testWidgets('a saved session opens straight to the inspections', (t) async {
    final store = MemorySessionStore();
    await store.save(const Session(token: 'saved', userId: 1, fullName: 'Bryan Wilson', occupation: 'Compliance certifier'));
    final api = ApiClient(baseUrl: Uri.parse('http://fake.test'), deviceId: 'd', httpClient: FakeServer().client_());
    await t.pumpWidget(MaterialApp(home: AuthGate(store: store, api: api, outboxStore: InMemoryOutboxStore())));
    await t.pumpAndSettle();
    expect(find.textContaining('G2 Chiller'), findsWidgets);
    expect(api.token, 'saved');
  });
}
