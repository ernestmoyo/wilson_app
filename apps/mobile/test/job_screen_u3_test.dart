// Look and feel, phase U3 (docs/2026-10-19-ux/CHANGE_GRAPH.md, B7): the job
// screen as a task list with the Next step card on top and the rest in tabs.
// One Issue button, one Open certificate, words not codes, a confirmation
// after every action, and an offline save that reads as a note, not an error.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:assure_field/screens/job_screen.dart';
import 'package:assure_field/sync/api_client.dart';
import 'package:assure_field/sync/outbox.dart';
import 'package:assure_field/sync/sync_service.dart';
import 'package:assure_field/theme.dart';

import 'fake_server.dart';

void main() {
  late FakeServer server;
  late SyncService sync;

  setUp(() {
    server = FakeServer();
    final api = ApiClient(
      baseUrl: Uri.parse('http://fake.test'),
      deviceId: 'test',
      userId: 1,
      httpClient: server.client_(),
    );
    sync = SyncService(outbox: Outbox(InMemoryOutboxStore()), api: api);
  });

  Future<void> pump(WidgetTester t, {Size size = const Size(1200, 2400)}) async {
    t.view.physicalSize = size;
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    await t.pumpWidget(MaterialApp(theme: buildTheme(), home: JobScreen(jobId: 7, sync: sync)));
    await t.pumpAndSettle();
  }

  Finder inTask(int n, String text) =>
      find.descendant(of: find.byKey(ValueKey('task-$n')), matching: find.text(text));

  testWidgets('one Issue certificate button, in the Next step card', (t) async {
    await pump(t);
    expect(find.text('Issue certificate'), findsOneWidget);
    expect(
      find.descendant(of: find.byKey(const ValueKey('now-card')), matching: find.byKey(const ValueKey('issue-certificate'))),
      findsOneWidget,
    );
    expect(find.text('Open certificate'), findsNothing, reason: 'nothing issued yet');
  });

  testWidgets('issuing confirms, then Open certificate appears once', (t) async {
    await pump(t);
    await t.tap(find.byKey(const ValueKey('issue-certificate')));
    await t.pumpAndSettle();
    // The dialog groups its fields under headings.
    expect(find.text('Certificate details'), findsOneWidget);
    expect(find.text('Dates'), findsOneWidget);
    await t.tap(find.byKey(const ValueKey('issue-confirm')));
    await t.pumpAndSettle();
    expect(server.issued.single['decision'], 'conditional');
    expect(server.issued.single['issueDate'], matches(RegExp(r'^\d{4}-\d{2}-\d{2}$')));
    expect(find.text('Certificate issued and recorded'), findsOneWidget);
    expect(find.text('Open certificate'), findsOneWidget);
    expect(find.byKey(const ValueKey('open-certificate')), findsOneWidget);
    expect(find.byKey(const ValueKey('issue-certificate')), findsNothing);
  });

  testWidgets('a conditional certificate carries the date its conditions must be met by (reg 6.24(2))', (t) async {
    await pump(t);
    await t.tap(find.byKey(const ValueKey('issue-certificate')));
    await t.pumpAndSettle();
    // Conditional is the default while non-compliances are open; the deadline
    // is offered, set to the latest the regulation allows.
    expect(find.byKey(const ValueKey('conditions-due')), findsOneWidget);
    expect(find.textContaining('Conditions met by'), findsOneWidget);
    await t.tap(find.byKey(const ValueKey('issue-confirm')));
    await t.pumpAndSettle();
    final body = server.issued.single;
    final issued = DateTime.parse(body['issueDate'] as String);
    final due = DateTime.parse(body['conditionsDue'] as String);
    expect(due.isAfter(issued), isTrue);
    expect(due.isAfter(DateTime(issued.year, issued.month + 3, issued.day)), isFalse, reason: 'no more than 3 months');
  });

  testWidgets('the issuance check shows warnings (evidence not yet accepted) as notes, not blockers', (t) async {
    server.checkWarnings.add({
      'kind': 'evidence_not_accepted',
      'clause': 'IPS 21(1)(e)',
      'reason': '2 evidence file(s) not yet accepted by a reviewer',
    });
    await pump(t);
    expect(find.textContaining('2 evidence file(s) not yet accepted by a reviewer'), findsOneWidget);
    expect(find.byKey(const ValueKey('check-warning')), findsOneWidget);
  });

  testWidgets('the process card is a task list: Done, Now, Not started', (t) async {
    await pump(t);
    for (final n in [1, 2, 3, 4, 5]) {
      expect(inTask(n, 'Done'), findsOneWidget, reason: 'stage $n is behind final validation');
    }
    expect(inTask(6, 'Now'), findsOneWidget);
    expect(inTask(7, 'Not started'), findsOneWidget);
    expect(inTask(8, 'Not started'), findsOneWidget);
    // The moves stay under it.
    expect(find.byKey(const ValueKey('move-gap_closure')), findsOneWidget);
  });

  testWidgets('a loop that waits on the client says so', (t) async {
    server.stage = 'gap_closure';
    await pump(t);
    expect(inTask(5, 'Waiting on client'), findsOneWidget);
    expect(inTask(4, 'Done'), findsOneWidget);
    expect(inTask(6, 'Not started'), findsOneWidget);
  });

  testWidgets('wide: the process card sits to the right; phone: below the Next step card', (t) async {
    await pump(t);
    final nowWide = t.getTopLeft(find.byKey(const ValueKey('now-card')));
    final procWide = t.getTopLeft(find.byKey(const ValueKey('process-card')));
    expect(procWide.dx, greaterThan(nowWide.dx + 300));

    await pump(t, size: const Size(420, 2400));
    final nowPhone = t.getRect(find.byKey(const ValueKey('now-card')));
    final procPhone = t.getTopLeft(find.byKey(const ValueKey('process-card')));
    expect(procPhone.dy, greaterThanOrEqualTo(nowPhone.bottom));
    expect(t.takeException(), isNull);
  });

  testWidgets('tabs reach findings, communications and history', (t) async {
    await pump(t);
    // Overview is the default: substances and the decision blocks.
    expect(find.text('Substances'), findsOneWidget);
    expect(find.text('Install compliant signage'), findsNothing);

    await t.tap(find.byKey(const ValueKey('tab-findings')));
    await t.pumpAndSettle();
    expect(find.text('General 4.4'), findsOneWidget);
    expect(find.text('Install compliant signage'), findsOneWidget);
    // Severity and status as words; the due date as a date people read.
    expect(find.text('Major'), findsOneWidget);
    expect(find.textContaining('Due 1 Oct 2026'), findsOneWidget);
    expect(find.textContaining('wks17-'), findsNothing);

    await t.tap(find.byKey(const ValueKey('tab-communications')));
    await t.pumpAndSettle();
    expect(find.text('Sent application form, required documents checklist, terms and fee estimate'), findsOneWidget);

    await t.tap(find.byKey(const ValueKey('tab-history')));
    await t.pumpAndSettle();
    expect(find.textContaining('signed the declaration'), findsWidgets);
  });

  testWidgets('a sent action is confirmed', (t) async {
    await pump(t);
    await t.tap(find.byKey(const ValueKey('declare-none')));
    await t.pump();
    await t.pumpAndSettle();
    expect(find.text('Declaration recorded'), findsOneWidget);
    expect(find.byType(SnackBar), findsOneWidget);
  });

  testWidgets('offline: the action is saved on the device, shown as a note, not an error', (t) async {
    server.syncOffline = true;
    await pump(t);
    await t.tap(find.byKey(const ValueKey('declare-none')));
    await t.pumpAndSettle();
    expect(find.text('Saved on this device; it will send when online'), findsOneWidget);
    expect(find.byIcon(Icons.gavel_outlined), findsNothing);
    expect(find.textContaining('Not sent yet'), findsNothing);
    expect(sync.pendingCount, 1);
  });

  testWidgets('an RFI is a batch: confirmed, and the error path is not lost (F6)', (t) async {
    server.stage = 'document_review';
    await pump(t);
    await t.tap(find.byKey(const ValueKey('send-rfi')));
    await t.pumpAndSettle();
    await t.enterText(find.byKey(const ValueKey('ask-text')), 'Current SDS');
    await t.tap(find.byKey(const ValueKey('ask-ok')));
    await t.pumpAndSettle();
    expect(find.text('Request for further information sent'), findsOneWidget);
  });

  testWidgets('an RFI made offline is queued, not reported as a failure', (t) async {
    server.stage = 'document_review';
    server.syncOffline = true;
    await pump(t);
    await t.tap(find.byKey(const ValueKey('send-rfi')));
    await t.pumpAndSettle();
    await t.enterText(find.byKey(const ValueKey('ask-text')), 'Current SDS');
    await t.tap(find.byKey(const ValueKey('ask-ok')));
    await t.pumpAndSettle();
    expect(find.text('Saved on this device; it will send when online'), findsOneWidget);
    expect(sync.pendingCount, 2);
  });

  testWidgets('recording a communication with no summary shows an inline error', (t) async {
    await pump(t);
    await t.tap(find.byKey(const ValueKey('tab-communications')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('record-communication')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('comm-save')));
    await t.pumpAndSettle();
    expect(find.text('Say what it was about'), findsOneWidget);
    expect(find.byKey(const ValueKey('comm-summary')), findsOneWidget, reason: 'the dialog stays open');
    expect(server.events, isEmpty);

    await t.enterText(find.byKey(const ValueKey('comm-summary')), 'Phoned about the visit');
    await t.tap(find.byKey(const ValueKey('comm-save')));
    await t.pumpAndSettle();
    expect(server.events.single['type'], 'communication.record');
    expect(find.text('Communication recorded'), findsOneWidget);
    expect(find.text('Phoned about the visit'), findsOneWidget);
  });

  testWidgets('raising a corrective action picks the due date from a calendar', (t) async {
    await pump(t);
    await t.tap(find.byKey(const ValueKey('tab-findings')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('raise-11')));
    await t.pumpAndSettle();
    await t.enterText(find.byKey(const ValueKey('ca-description')), 'Fit a sign');
    await t.tap(find.byKey(const ValueKey('ca-due')));
    await t.pumpAndSettle();
    expect(find.byType(DatePickerDialog), findsOneWidget);
    await t.tap(find.text('OK'));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('ca-save')));
    await t.pumpAndSettle();
    final p = server.events.single['payload'];
    expect(server.events.single['type'], 'corrective_action.raise');
    expect(p['dueDate'], matches(RegExp(r'^\d{4}-\d{2}-\d{2}$')));
    expect(find.text('Corrective action raised'), findsOneWidget);
  });

  testWidgets('the app bar shows the sync state; the context line does not repeat the title', (t) async {
    await pump(t);
    expect(find.byKey(const ValueKey('sync-indicator')), findsOneWidget);
    expect(find.text('G2 Chiller'), findsOneWidget, reason: 'title only');
    expect(find.text('Argenta Manufacturing Limited'), findsOneWidget, reason: 'subtitle only');
    expect(find.textContaining('Job 7'), findsOneWidget);
  });

  testWidgets('a closed job says why the check sheet is unavailable', (t) async {
    server.stage = 'closed';
    await pump(t);
    final b = t.widget<ButtonStyleButton>(find.byKey(const ValueKey('open-sheet')));
    expect(b.onPressed, isNull);
    expect(find.byTooltip('The job is closed'), findsOneWidget);
  });
}
