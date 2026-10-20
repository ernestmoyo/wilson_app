// Landing and navigation (owner, 20 Oct 2026: "make it easy to see projects /
// people buttons etc, and make the landing page more intuitive"). A teal
// rail on iPad and desk (Clients, People, sync, who is signed in, Sign out),
// a bottom bar on a phone; the landing greets, offers the next thing to do,
// and lists the work by client or as one list of every open job.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:assure_field/app.dart';
import 'package:assure_field/auth/session.dart';
import 'package:assure_field/screens/jobs_board.dart';
import 'package:assure_field/screens/people_screen.dart';
import 'package:assure_field/sync/api_client.dart';
import 'package:assure_field/sync/outbox.dart';

import 'fake_server.dart';

const _bryan = Session(token: 't', userId: 1, fullName: 'Bryan Wilson', occupation: 'Compliance certifier', authorisationNumber: 'TST100250');
const _reviewer = Session(token: 't', userId: 2, fullName: 'Document reviewer', occupation: 'Reviewer', role: 'reviewer');
const _peer = Session(token: 't', userId: 9, fullName: 'Peer Reviewer', occupation: 'Peer reviewer', role: 'peer_reviewer');

const _ipadLandscape = Size(1180, 820);
const _desk = Size(1400, 1000);
const _phone = Size(390, 844);

void main() {
  Future<FakeServer> open(WidgetTester tester, {FakeServer? server, Session session = _bryan, Size size = _ipadLandscape}) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final s = server ?? (FakeServer()..stage = 'site_inspection');
    final api = ApiClient(baseUrl: Uri.parse('http://fake.test'), deviceId: 'd', httpClient: s.client_());
    final store = MemorySessionStore()..save(session);
    await tester.pumpWidget(AssureFieldApp(app: AppSession(store: store, api: api, outboxStore: InMemoryOutboxStore())));
    await tester.pumpAndSettle();
    return s;
  }

  /// Open work in every bucket: in progress (7, 8, 9), waiting on the client
  /// (11, 12), issued (13); and one closed job that is not open work at all.
  FakeServer mixed() => FakeServer()
    ..stage = 'site_inspection'
    ..extraJobs.addAll([
      FakeServer.row(8, 1, 'Argenta Manufacturing Limited', 'Drum store', lastActivity: '2026-09-02T00:00:00Z'),
      FakeServer.row(9, 2, 'Test Coatings Limited', 'Paint store', stage: 'enquiry', lastActivity: '2026-09-03T00:00:00Z'),
      FakeServer.row(10, 3, 'Test Closed Limited', 'Old store', stage: 'closed'),
      FakeServer.row(11, 4, 'Waiting Limited', 'Acid room', stage: 'gap_closure', lastActivity: '2026-09-08T00:00:00Z'),
      FakeServer.row(12, 4, 'Waiting Limited', 'Gas cage', stage: 'rfi', lastActivity: '2026-09-04T00:00:00Z'),
      FakeServer.row(13, 5, 'Issued Limited', 'Tank farm', stage: 'monitoring', lastActivity: '2026-09-10T00:00:00Z'),
    ]);

  // ── The shell ─────────────────────────────────────────────────────────────

  group('rail on an iPad and a desk', () {
    testWidgets('the rail holds Clients and People, the sync state, who is signed in and Sign out', (tester) async {
      await open(tester);
      expect(find.byKey(const ValueKey('app-rail')), findsOneWidget);
      Finder inRail(Finder f) => find.descendant(of: find.byKey(const ValueKey('app-rail')), matching: f);
      expect(inRail(find.byKey(const ValueKey('nav-clients'))), findsOneWidget);
      expect(inRail(find.byKey(const ValueKey('nav-people'))), findsOneWidget);
      expect(inRail(find.byKey(const ValueKey('to-people'))), findsOneWidget, reason: 'the old key still reaches People');
      expect(inRail(find.byKey(const ValueKey('sync-indicator'))), findsOneWidget);
      expect(inRail(find.byKey(const ValueKey('sign-out'))), findsOneWidget);
      expect(inRail(find.text('BW')), findsOneWidget, reason: 'the signed-in person\'s initials');
      // One of each on screen: the board's own bar no longer repeats them.
      expect(find.byKey(const ValueKey('sign-out')), findsOneWidget);
      expect(find.byKey(const ValueKey('sync-indicator')), findsOneWidget);
      expect(find.byKey(const ValueKey('nav-bar')), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('destinations are comfortable targets', (tester) async {
      await open(tester);
      for (final k in ['nav-clients', 'nav-people', 'sign-out']) {
        final size = tester.getSize(find.byKey(ValueKey(k)));
        expect(size.height, greaterThanOrEqualTo(44), reason: k);
        expect(size.width, greaterThanOrEqualTo(44), reason: k);
      }
    });

    testWidgets('a desk-wide window extends the rail: names beside the icons', (tester) async {
      await open(tester, size: _desk);
      final rail = find.byKey(const ValueKey('app-rail'));
      expect(tester.getSize(rail).width, greaterThan(160));
      expect(find.descendant(of: rail, matching: find.text('Bryan Wilson')), findsOneWidget);
      expect(find.descendant(of: rail, matching: find.text('Sign out')), findsOneWidget);

      await open(tester, size: _ipadLandscape);
      expect(tester.getSize(find.byKey(const ValueKey('app-rail'))).width, lessThan(120));
    });

    testWidgets('People and back to Clients through the rail; the rail stays put', (tester) async {
      await open(tester);
      await tester.tap(find.byKey(const ValueKey('nav-people')));
      await tester.pumpAndSettle();
      expect(find.byType(PeopleScreen), findsOneWidget);
      expect(find.byKey(const ValueKey('app-rail')), findsOneWidget);
      expect(find.byTooltip('Back'), findsNothing, reason: 'a destination, not a step down');

      await tester.tap(find.byKey(const ValueKey('nav-clients')));
      await tester.pumpAndSettle();
      expect(find.byType(PeopleScreen), findsNothing);
      expect(find.byKey(const ValueKey('client-1')), findsOneWidget);
    });

    testWidgets('a reviewer\'s rail has Clients and no People', (tester) async {
      await open(tester, session: _reviewer, server: FakeServer()..role = 'reviewer'..stage = 'site_inspection');
      expect(find.byKey(const ValueKey('nav-clients')), findsOneWidget);
      expect(find.byKey(const ValueKey('nav-people')), findsNothing);
      expect(find.byKey(const ValueKey('to-people')), findsNothing);
    });

    testWidgets('a job keeps its own back navigation, without the rail', (tester) async {
      await open(tester);
      await tester.tap(find.byKey(const ValueKey('job-7')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('now-card')), findsOneWidget);
      expect(find.byKey(const ValueKey('app-rail')), findsNothing);
      await tester.tap(find.byTooltip('Back'));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('app-rail')), findsOneWidget);
      expect(find.byKey(const ValueKey('client-1')), findsOneWidget);
    });

    testWidgets('signing out from the rail returns to sign-in', (tester) async {
      await open(tester);
      await tester.tap(find.byKey(const ValueKey('sign-out')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('login-submit')), findsOneWidget);
    });
  });

  group('bottom bar on a phone', () {
    testWidgets('Clients and People sit at the bottom; no rail', (tester) async {
      await open(tester, size: _phone);
      expect(find.byKey(const ValueKey('app-rail')), findsNothing);
      expect(find.byKey(const ValueKey('nav-bar')), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('nav-people')));
      await tester.pumpAndSettle();
      expect(find.byType(PeopleScreen), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('nav-clients')));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.byKey(const ValueKey('client-1')), 200, scrollable: find.byType(Scrollable).first);
      expect(find.byKey(const ValueKey('client-1')), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('the account button holds who is signed in and Sign out', (tester) async {
      await open(tester, size: _phone);
      expect(find.byKey(const ValueKey('sign-out')), findsNothing);
      await tester.tap(find.byKey(const ValueKey('account')));
      await tester.pumpAndSettle();
      expect(find.text('Bryan Wilson'), findsWidgets);
      await tester.tap(find.byKey(const ValueKey('sign-out')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('login-submit')), findsOneWidget);
    });

    testWidgets('one destination is no bar: a reviewer on a phone has none', (tester) async {
      await open(tester, size: _phone, session: _reviewer, server: FakeServer()..role = 'reviewer'..stage = 'site_inspection');
      expect(find.byKey(const ValueKey('nav-bar')), findsNothing);
      expect(find.byKey(const ValueKey('account')), findsOneWidget);
    });
  });

  // ── The landing ───────────────────────────────────────────────────────────

  group('welcome', () {
    test('the greeting follows the time of day', () {
      expect(JobsBoard.greeting(DateTime(2026, 10, 20, 7)), 'Good morning');
      expect(JobsBoard.greeting(DateTime(2026, 10, 20, 12)), 'Good afternoon');
      expect(JobsBoard.greeting(DateTime(2026, 10, 20, 18)), 'Good evening');
      expect(JobsBoard.greeting(DateTime(2026, 10, 20, 2)), 'Good evening');
    });

    test('the date reads in words', () {
      expect(JobsBoard.longDate(DateTime(2026, 10, 20)), '20 October 2026');
      expect(JobsBoard.longDate(DateTime(2027, 1, 3)), '3 January 2027');
    });

    testWidgets('greets by first name, with the date and one line of what is open', (tester) async {
      await open(tester, server: mixed());
      final header = find.byKey(const ValueKey('welcome'));
      expect(header, findsOneWidget);
      expect(find.descendant(of: header, matching: find.text('${JobsBoard.greeting(DateTime.now())}, Bryan')), findsOneWidget);
      expect(find.descendant(of: header, matching: find.text(JobsBoard.longDate(DateTime.now()))), findsOneWidget);
      // Open work: 7, 8, 9, 11, 12, 13 (10 is closed). The fake dashboard's
      // reminders point at job 7.
      expect(find.descendant(of: header, matching: find.textContaining('6 active jobs')), findsOneWidget);
      expect(find.descendant(of: header, matching: find.textContaining('need')), findsOneWidget);
    });
  });

  group('quick actions', () {
    testWidgets('New job is a large button; Continue opens the most recently active open job', (tester) async {
      await open(tester, server: mixed());
      final newJob = find.byKey(const ValueKey('new-job'));
      expect(find.ancestor(of: find.text('New job'), matching: find.byType(FilledButton)), findsWidgets);
      expect(tester.getSize(newJob).height, greaterThanOrEqualTo(56));
      final cont = find.byKey(const ValueKey('continue-job'));
      expect(tester.getSize(cont).height, greaterThanOrEqualTo(56));
      // 13 is more recent but issued: nothing to continue there. 7 (9 Sept) is.
      expect(find.descendant(of: cont, matching: find.textContaining('G2 Chiller')), findsOneWidget);
      await tester.tap(cont);
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('now-card')), findsOneWidget);
    });

    testWidgets('nothing open, nothing to continue', (tester) async {
      await open(tester, server: FakeServer()..noJobs = true);
      expect(find.byKey(const ValueKey('continue-job')), findsNothing);
      expect(find.byKey(const ValueKey('new-job')), findsOneWidget);
    });

    testWidgets('a peer reviewer gets Jobs to review, not New job', (tester) async {
      await open(tester, session: _peer, server: FakeServer()..role = 'peer_reviewer'..stage = 'final_validation');
      expect(find.byKey(const ValueKey('new-job')), findsNothing);
      await tester.tap(find.byKey(const ValueKey('jobs-to-review')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('all-jobs')), findsOneWidget);
    });
  });

  group('By client / All jobs', () {
    testWidgets('All jobs lists every open job in one list, what needs doing first', (tester) async {
      await open(tester, server: mixed(), size: const Size(1180, 1600));
      expect(find.byKey(const ValueKey('client-1')), findsOneWidget, reason: 'By client is the default');
      await tester.tap(find.byKey(const ValueKey('view-jobs')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('all-jobs')), findsOneWidget);
      expect(find.byKey(const ValueKey('client-1')), findsNothing);
      for (final id in [7, 8, 9, 11, 12, 13]) {
        expect(find.byKey(ValueKey('job-$id')), findsOneWidget, reason: 'job $id');
      }
      expect(find.byKey(const ValueKey('job-10')), findsNothing, reason: 'closed is not open work');
      // Each row names its client.
      expect(find.descendant(of: find.byKey(const ValueKey('job-11')), matching: find.text('Waiting Limited')), findsOneWidget);
      // In progress (latest first), then waiting on the client, then issued.
      double y(int id) => tester.getTopLeft(find.byKey(ValueKey('job-$id'))).dy;
      expect([7, 9, 8, 11, 12, 13].map(y).toList(), orderedEquals([...[7, 9, 8, 11, 12, 13].map(y)]..sort()));
    });

    testWidgets('stage filters narrow All jobs', (tester) async {
      await open(tester, server: mixed(), size: const Size(1180, 1600));
      await tester.tap(find.byKey(const ValueKey('view-jobs')));
      await tester.pumpAndSettle();
      for (final k in ['all', 'in-progress', 'waiting', 'issued']) {
        expect(find.byKey(ValueKey('stage-filter-$k')), findsOneWidget, reason: k);
      }
      await tester.tap(find.byKey(const ValueKey('stage-filter-waiting')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('job-11')), findsOneWidget);
      expect(find.byKey(const ValueKey('job-12')), findsOneWidget);
      expect(find.byKey(const ValueKey('job-7')), findsNothing);
      expect(find.byKey(const ValueKey('job-13')), findsNothing);

      await tester.tap(find.byKey(const ValueKey('stage-filter-issued')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('job-13')), findsOneWidget);
      expect(find.byKey(const ValueKey('job-11')), findsNothing);

      await tester.tap(find.byKey(const ValueKey('stage-filter-in-progress')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('job-7')), findsOneWidget);
      expect(find.byKey(const ValueKey('job-9')), findsOneWidget);
      expect(find.byKey(const ValueKey('job-13')), findsNothing);

      await tester.tap(find.byKey(const ValueKey('stage-filter-all')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('job-13')), findsOneWidget);
      expect(find.byKey(const ValueKey('job-7')), findsOneWidget);
    });

    testWidgets('search works in All jobs too', (tester) async {
      await open(tester, server: mixed(), size: const Size(1180, 1600));
      await tester.tap(find.byKey(const ValueKey('view-jobs')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const ValueKey('board-search')), 'waiting');
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('job-11')), findsOneWidget);
      expect(find.byKey(const ValueKey('job-7')), findsNothing);
    });

    testWidgets('the chosen view is remembered while the app is open', (tester) async {
      await open(tester, server: mixed(), size: const Size(1180, 1600));
      await tester.tap(find.byKey(const ValueKey('view-jobs')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('job-7')));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Back'));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('all-jobs')), findsOneWidget);

      // And across People and back.
      await tester.tap(find.byKey(const ValueKey('nav-people')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('nav-clients')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('all-jobs')), findsOneWidget);
    });

    testWidgets('All jobs fits a phone without overflow', (tester) async {
      await open(tester, server: mixed(), size: _phone);
      await tester.tap(find.byKey(const ValueKey('view-jobs')));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.scrollUntilVisible(find.byKey(const ValueKey('all-jobs')), 200, scrollable: find.byType(Scrollable).first);
      expect(find.byKey(const ValueKey('all-jobs')), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });
}
