// Every screen has a URL. A deep link lands on the sheet; back pops to the
// hub and then the board; the logo goes home; signed-out lands on /login
// and returns to where it was going after sign-in.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:assure_field/app.dart';
import 'package:assure_field/auth/session.dart';
import 'package:assure_field/sync/api_client.dart';
import 'package:assure_field/sync/outbox.dart';

import 'fake_server.dart';

SessionStore signedIn() => MemorySessionStore()
  ..save(const Session(token: 't', userId: 1, fullName: 'Bryan Wilson', occupation: 'Compliance certifier', authorisationNumber: 'TST100250'));

void main() {
  late FakeServer server;
  late AppSession app;

  setUp(() {
    server = FakeServer()..stage = 'site_inspection';
    final api = ApiClient(baseUrl: Uri.parse('http://fake.test'), deviceId: 'd', httpClient: server.client_());
    app = AppSession(store: signedIn(), api: api, outboxStore: InMemoryOutboxStore());
  });

  Future<void> pumpAt(WidgetTester t, String location) async {
    t.view.physicalSize = const Size(1200, 2200);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    await t.pumpWidget(AssureFieldApp(app: app, initialLocation: location));
    await t.pumpAndSettle();
  }

  testWidgets('a deep link to /jobs/7/sheet opens the check sheet directly', (t) async {
    await pumpAt(t, '/jobs/7/sheet');
    expect(find.text('Check sheet'), findsOneWidget);
    expect(find.textContaining('Determining which regulations apply'), findsWidgets);
  });

  testWidgets('back from the sheet returns to the hub, then the board; the logo goes home', (t) async {
    await pumpAt(t, '/');
    await t.tap(find.byKey(const ValueKey('job-7')));
    await t.pumpAndSettle();
    expect(find.byKey(const ValueKey('now-card')), findsOneWidget);
    await t.tap(find.byKey(const ValueKey('open-sheet')));
    await t.pumpAndSettle();
    expect(find.text('Check sheet'), findsOneWidget);

    // Job (top right) pops back to the hub, as the browser's back does.
    await t.tap(find.byKey(const ValueKey('to-job')));
    await t.pumpAndSettle();
    expect(find.byKey(const ValueKey('now-card')), findsOneWidget);

    // Logo from the hub: home.
    await t.tap(find.byKey(const ValueKey('logo-home')).first);
    await t.pumpAndSettle();
    expect(find.byKey(const ValueKey('job-7')), findsOneWidget);
  });

  testWidgets('signed out, a deep link goes to /login and comes back after sign-in', (t) async {
    app = AppSession(store: MemorySessionStore(), api: app.api, outboxStore: InMemoryOutboxStore());
    await pumpAt(t, '/jobs/7');
    expect(find.byKey(const ValueKey('login-submit')), findsOneWidget);
    await t.enterText(find.byKey(const ValueKey('login-passcode')), 'chiller-2026');
    await t.tap(find.byKey(const ValueKey('login-submit')));
    await t.pumpAndSettle();
    expect(find.byKey(const ValueKey('now-card')), findsOneWidget, reason: 'should land on the job it was going to');
  });
}
