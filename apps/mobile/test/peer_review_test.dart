// Phase 2, package B (Tatenda Katai, 20 Oct 2026, Q5 to Q7): the New job
// peer review checkbox, the Peer review card per role, the Conditions card
// with Verify for a certifier only, and the People screen's peer reviewer
// role, "Can manage people" switch and Certificate holder badge.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:assure_field/app.dart';
import 'package:assure_field/auth/session.dart';
import 'package:assure_field/bootstrap.dart';
import 'package:assure_field/models/job.dart';
import 'package:assure_field/screens/job_screen.dart';
import 'package:assure_field/sync/api_client.dart';
import 'package:assure_field/sync/outbox.dart';
import 'package:assure_field/sync/sync_service.dart';
import 'package:assure_field/widgets/ui.dart';

import 'fake_server.dart';

const _bryan = Session(token: 't', userId: 1, fullName: 'Bryan Wilson', occupation: 'Compliance certifier', authorisationNumber: 'TST100250', role: 'certifier');
const _peer = Session(token: 't', userId: 9, fullName: 'Peer Reviewer', occupation: 'Peer reviewer', role: 'peer_reviewer');
const _reviewer = Session(token: 't', userId: 2, fullName: 'Document reviewer', occupation: 'Reviewer', role: 'reviewer');

void main() {
  // ── New job ───────────────────────────────────────────────────────────────
  Future<FakeServer> openBoard(WidgetTester tester, {Session session = _bryan}) async {
    tester.view.physicalSize = const Size(1400, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    final s = FakeServer()..stage = 'site_inspection';
    final api = ApiClient(baseUrl: Uri.parse('http://fake.test'), deviceId: 'd', httpClient: s.client_());
    final store = MemorySessionStore()..save(session);
    await tester.pumpWidget(AssureFieldApp(app: AppSession(store: store, api: api, outboxStore: InMemoryOutboxStore())));
    await tester.pumpAndSettle();
    return s;
  }

  Future<void> fillNewJob(WidgetTester tester) async {
    await tester.tap(find.byKey(const ValueKey('new-job')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('nj-legal')), 'Tank Farm Limited');
    await tester.enterText(find.byKey(const ValueKey('nj-address')), '1 Tank Road');
    await tester.enterText(find.byKey(const ValueKey('nj-location')), 'Diesel tank');
    await tester.pumpAndSettle();
  }

  testWidgets('New job: the peer review checkbox sends peerReviewRequired', (tester) async {
    final s = await openBoard(tester);
    await fillNewJob(tester);
    expect(find.text('Existing stationary container system — 17.91 report (needs peer review)'), findsOneWidget);
    await tester.ensureVisible(find.byKey(const ValueKey('nj-peer-review')));
    await tester.tap(find.byKey(const ValueKey('nj-peer-review')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('nj-create')));
    await tester.pumpAndSettle();
    expect(s.created.last['peerReviewRequired'], isTrue);
  });

  testWidgets('New job: left unticked, no peer review is asked for', (tester) async {
    final s = await openBoard(tester);
    await fillNewJob(tester);
    await tester.tap(find.byKey(const ValueKey('nj-create')));
    await tester.pumpAndSettle();
    expect(s.created.last['peerReviewRequired'] == true, isFalse);
  });

  testWidgets('a reviewer with can_administer reaches People; a peer reviewer has no New job', (tester) async {
    await openBoard(tester, session: const Session(token: 't', userId: 4, fullName: 'Admin Reviewer', occupation: 'Reviewer', role: 'reviewer', canAdminister: true));
    expect(find.byKey(const ValueKey('to-people')), findsOneWidget);
  });

  testWidgets('a peer reviewer has no New job and no People', (tester) async {
    await openBoard(tester, session: _peer);
    expect(find.byKey(const ValueKey('new-job')), findsNothing);
    expect(find.byKey(const ValueKey('to-people')), findsNothing);
  });

  // ── Job screen ────────────────────────────────────────────────────────────
  late FakeServer server;
  late SyncService sync;

  void setUpJob() {
    server = FakeServer()..peerReviewRequired = true;
    final api = ApiClient(baseUrl: Uri.parse('http://fake.test'), deviceId: 'test', userId: 1, httpClient: server.client_());
    sync = SyncService(outbox: Outbox(InMemoryOutboxStore()), api: api);
  }

  Future<void> pumpJob(WidgetTester t, Session as) async {
    CurrentUser.apply(as);
    server.role = as.role;
    addTearDown(() => CurrentUser.apply(_bryan));
    t.view.physicalSize = const Size(1000, 3200);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    await t.pumpWidget(MaterialApp(home: JobScreen(jobId: 7, sync: sync)));
    await t.pumpAndSettle();
  }

  Future<void> answer(WidgetTester t, String text) async {
    await t.enterText(find.byKey(const ValueKey('ask-text')), text);
    await t.tap(find.byKey(const ValueKey('ask-ok')));
    await t.pumpAndSettle();
  }

  test('JobRecord reads the peer review and the conditions', () {
    setUpJob();
    server.peerReviews.add({'id': 1, 'decision': 'approved', 'comment': 'Fine', 'decided_at': '2026-10-20T00:00:00Z', 'reviewer_name': 'Peer Reviewer', 'current': true});
    server.conditions.add({'id': 5, 'ordinal': 1, 'text': 'Install signage', 'due_date': '2026-11-01', 'overdue': false});
    final j = JobRecord.fromJson(server.job());
    expect(j.peerReviewRequired, isTrue);
    expect(j.peerReviewState, 'approved');
    expect(j.peerReviews.single.reviewerName, 'Peer Reviewer');
    expect(j.conditions.single.text, 'Install signage');
    expect(j.conditions.single.isVerified, isFalse);
  });

  testWidgets('a peer reviewer comments, requests changes and approves; the sheet is read-only for them', (t) async {
    setUpJob();
    await pumpJob(t, _peer);
    expect(find.byKey(const ValueKey('peer-review-card')), findsOneWidget);
    expect(find.descendant(of: find.byKey(const ValueKey('peer-review-card')), matching: find.widgetWithText(StatusBadge, 'Not requested')), findsOneWidget);
    // Nothing else to press.
    expect(find.byKey(const ValueKey('issue-certificate')), findsNothing);
    expect(find.byKey(const ValueKey('declare-none')), findsNothing);
    expect(find.byKey(const ValueKey('move-gap_closure')), findsNothing);
    expect(CurrentUser.canRecord, isFalse, reason: 'the sheet is read-only, as for a viewer');

    await t.tap(find.byKey(const ValueKey('pr-comment')));
    await t.pumpAndSettle();
    await answer(t, 'Bund capacity checked.');
    expect(server.events.last['type'], 'peer_review.comment');
    expect(server.events.last['payload'], {'jobId': 7, 'body': 'Bund capacity checked.'});
    expect(find.text('Bund capacity checked.'), findsOneWidget);

    await t.tap(find.byKey(const ValueKey('pr-changes')));
    await t.pumpAndSettle();
    await answer(t, 'Add the bund calculation.');
    expect(server.events.last['type'], 'peer_review.decide');
    expect(server.events.last['payload'], {'jobId': 7, 'decision': 'changes_requested', 'comment': 'Add the bund calculation.'});
    expect(find.descendant(of: find.byKey(const ValueKey('peer-review-card')), matching: find.widgetWithText(StatusBadge, 'Changes requested')), findsOneWidget);

    await t.tap(find.byKey(const ValueKey('pr-approve')));
    await t.pumpAndSettle();
    await answer(t, '');
    expect(server.events.last['type'], 'peer_review.decide');
    expect(server.events.last['payload']['decision'], 'approved');
    expect(find.descendant(of: find.byKey(const ValueKey('peer-review-card')), matching: find.widgetWithText(StatusBadge, 'Approved')), findsOneWidget);
    expect(find.textContaining('Approved by Peer Reviewer'), findsOneWidget);
  });

  testWidgets('a certifier sees the state and answers in the thread, but cannot approve', (t) async {
    setUpJob();
    server.peerReviewStateOverride = 'lapsed';
    server.peerReviews.add({'id': 1, 'decision': 'approved', 'decided_at': '2026-10-20T00:00:00Z', 'reviewer_name': 'Peer Reviewer', 'current': false});
    await pumpJob(t, _bryan);
    expect(find.descendant(of: find.byKey(const ValueKey('peer-review-card')), matching: find.widgetWithText(StatusBadge, 'Lapsed')), findsOneWidget);
    expect(find.byKey(const ValueKey('pr-approve')), findsNothing);
    expect(find.byKey(const ValueKey('pr-changes')), findsNothing);
    expect(find.byKey(const ValueKey('pr-comment')), findsOneWidget);
  });

  testWidgets('an unflagged job has no Peer review card', (t) async {
    setUpJob();
    server.peerReviewRequired = false;
    await pumpJob(t, _bryan);
    expect(find.byKey(const ValueKey('peer-review-card')), findsNothing);
  });

  void conditional() {
    server
      ..stage = 'certificate_issued'
      ..certificate = {
        'id': 1, 'decision': 'conditional', 'certificate_number': 'TST100250-2026-0007', 'issue_date': '2026-10-01',
        'in_force_date': '2026-10-01', 'expiry_date': '2027-10-01', 'conditions': ['Install signage', 'Bund the drums'],
        'conditions_due': '2026-11-01', 'requirements_not_met': [],
      }
      ..conditions.addAll([
        {'id': 5, 'ordinal': 1, 'text': 'Install signage', 'regulation': '2.6(3)', 'due_date': '2026-10-10', 'overdue': true},
        {'id': 6, 'ordinal': 2, 'text': 'Bund the drums', 'due_date': '2099-11-01', 'overdue': false},
      ]);
  }

  testWidgets('Conditions card: each condition, Overdue, and Verify for a certifier', (t) async {
    setUpJob();
    server.peerReviewRequired = false;
    conditional();
    await pumpJob(t, _bryan);
    expect(find.byKey(const ValueKey('conditions-card')), findsOneWidget);
    expect(find.text('Install signage'), findsWidgets);
    expect(find.widgetWithText(StatusBadge, 'Overdue'), findsOneWidget);
    expect(find.byKey(const ValueKey('cond-verify-5')), findsOneWidget);
    expect(find.byKey(const ValueKey('cond-verify-6')), findsOneWidget);
    await t.tap(find.byKey(const ValueKey('cond-verify-5')));
    await t.pumpAndSettle();
    await answer(t, 'Signage photographed');
    expect(server.events.last['type'], 'condition.verify');
    expect(server.events.last['payload'], {'jobId': 7, 'conditionId': 5, 'note': 'Signage photographed'});
    expect(find.byKey(const ValueKey('cond-verify-5')), findsNothing);
    expect(find.textContaining('Verified'), findsWidgets);
  });

  testWidgets('a reviewer sees the conditions but cannot verify', (t) async {
    setUpJob();
    server.peerReviewRequired = false;
    conditional();
    await pumpJob(t, _reviewer);
    expect(find.byKey(const ValueKey('conditions-card')), findsOneWidget);
    expect(find.byKey(const ValueKey('cond-verify-5')), findsNothing);
  });

  // ── People ────────────────────────────────────────────────────────────────
  testWidgets('People: Peer reviewer role, Can manage people switch, Certificate holder badge', (tester) async {
    final s = await openBoard(tester);
    await tester.tap(find.byKey(const ValueKey('to-people')));
    await tester.pumpAndSettle();
    expect(find.descendant(of: find.byKey(const ValueKey('person-1')), matching: find.widgetWithText(StatusBadge, 'Certificate holder')), findsOneWidget);
    expect(find.widgetWithText(StatusBadge, 'Peer reviewer'), findsWidgets, reason: 'the role is listed');

    await tester.tap(find.byKey(const ValueKey('person-menu-2')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Edit details and role'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('p-can-administer')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('p-can-administer')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('p-save')));
    await tester.pumpAndSettle();
    expect(s.patches.last['canAdminister'], isTrue);
    expect(find.descendant(of: find.byKey(const ValueKey('person-2')), matching: find.widgetWithText(StatusBadge, 'Manages people')), findsOneWidget);

    // Peer reviewer as a role for a new person.
    await tester.tap(find.byKey(const ValueKey('add-person')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('p-name')), 'Pat Peer');
    await tester.enterText(find.byKey(const ValueKey('p-occupation')), 'Peer reviewer');
    await tester.enterText(find.byKey(const ValueKey('p-email')), 'pat@example.com');
    await tester.enterText(find.byKey(const ValueKey('p-passcode')), 'secret-1');
    tester.widget<DropdownButtonFormField<String>>(find.byKey(const ValueKey('p-role'))).onChanged!('peer_reviewer');
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('p-save')));
    await tester.pumpAndSettle();
    expect(s.users.last['role'], 'peer_reviewer');
  });
}
