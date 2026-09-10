// The Job screen against a fake server that answers the way apps/server does.
//
// Checks that the screen shows the process flow with the job's stage, offers
// only the server's allowedNext moves, surfaces the issuance blockers with
// their clauses, and sends the right sync events for the interest declaration
// and for verifying a corrective action.

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:assure_field/models/job.dart';
import 'package:assure_field/screens/job_screen.dart';
import 'package:assure_field/sync/api_client.dart';
import 'package:assure_field/sync/outbox.dart';
import 'package:assure_field/sync/sync_service.dart';

class FakeServer {
  bool declared = false;
  String caStatus = 'open';
  final List<Map<String, dynamic>> events = [];

  Map<String, dynamic> job() => {
        'id': 7,
        'stage': 'final_validation',
        'class_key': 'class_6_8',
        'client': {'legalName': 'Argenta Manufacturing Limited'},
        'location': {'id': 1, 'name': 'G2 Chiller', 'address': '2 Sterling Avenue'},
        'inspections': [
          {'id': 3}
        ],
        'findings': [
          {
            'id': 11,
            'inspection_id': 3,
            'template_code': 'wks17-general',
            'section_ordinal': 4,
            'item_ordinal': 4,
            'status': 'non_compliant',
            'failure_reason': 'reg 2.6(3): no signage at the room entrance',
          },
          {
            'id': 12,
            'inspection_id': 3,
            'template_code': 'wks17-general',
            'section_ordinal': 1,
            'item_ordinal': 1,
            'status': 'compliant',
          },
        ],
        'correctiveActions': [
          {
            'id': 1,
            'finding_id': 11,
            'severity': 'major',
            'description': 'Install compliant signage',
            'due_date': '2026-10-01',
            'status': caStatus,
            'reverified_by': caStatus == 'verified' ? 1 : null,
            'reverified_at': caStatus == 'verified' ? '2026-09-10T00:00:00Z' : null,
          },
        ],
        'transitions': [
          {'from_stage': 'enquiry', 'to_stage': 'application', 'occurred_at': '2026-09-01T00:00:00Z'},
          {'from_stage': 'compliance_evaluation', 'to_stage': 'final_validation', 'occurred_at': '2026-09-09T00:00:00Z', 'reason': 'All actions verified'},
        ],
        'interestDeclarations': declared ? [{'conflict_found': false}] : [],
        'certificate': null,
        'retention': null,
        'allowedNext': ['gap_closure', 'site_inspection', 'certificate_issued'],
      };

  Map<String, dynamic> check() => {
        'canGrant': false,
        'canIssueConditional': declared,
        'unresolvedNonCompliances': caStatus == 'verified' ? 0 : 1,
        'blockers': declared
            ? []
            : [
                {'clause': 'IPS 23(1)', 'reason': 'no interest declaration recorded for job 7'}
              ],
      };

  http.Client client() => MockClient((req) async {
        final path = req.url.path;
        if (path == '/api/jobs/7') return http.Response(jsonEncode(job()), 200);
        if (path == '/api/jobs/7/issuance-check') return http.Response(jsonEncode(check()), 200);
        if (path == '/api/sync') {
          final body = jsonDecode(req.body) as Map<String, dynamic>;
          final applied = <Map<String, dynamic>>[];
          for (final e in (body['events'] as List).cast<Map<String, dynamic>>()) {
            events.add(e);
            if (e['type'] == 'interest.declare') declared = true;
            if (e['type'] == 'corrective_action.update') caStatus = e['payload']['status'] as String;
            applied.add({'id': e['id'], 'result': {}});
          }
          return http.Response(jsonEncode({'applied': applied, 'rejected': [], 'duplicate': []}), 200);
        }
        return http.Response('not found', 404);
      });
}

void main() {
  late FakeServer server;
  late SyncService sync;

  setUp(() {
    server = FakeServer();
    final api = ApiClient(
      baseUrl: Uri.parse('http://fake.test'),
      deviceId: 'test',
      userId: 1,
      httpClient: server.client(),
    );
    sync = SyncService(outbox: Outbox(InMemoryOutboxStore()), api: api);
  });

  Future<void> pump(WidgetTester t) async {
    // A ListView builds only what is on screen; give the test a tall viewport
    // so every card exists to be found and tapped.
    t.view.physicalSize = const Size(1000, 2600);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    await t.pumpWidget(MaterialApp(home: JobScreen(jobId: 7, sync: sync)));
    await t.pumpAndSettle();
  }

  test('JobRecord reads the server payload', () {
    final j = JobRecord.fromJson(server.job());
    expect(j.stage, 'final_validation');
    expect(j.allowedNext, ['gap_closure', 'site_inspection', 'certificate_issued']);
    expect(j.nonCompliances.single.ref, 'General 4.4');
    expect(j.actionsFor(11).single.status, 'open');
    expect(j.interestDeclared, isFalse);
    expect(ProcessStage.numberOf('final_validation'), 6);
    expect(ProcessStage.numberOf('gap_closure'), 5);
    expect(ProcessStage.label('rfi'), 'Request for further information');
  });

  testWidgets('shows the eight stages, the current one, and only the legal moves', (t) async {
    await pump(t);
    // Stage titles also label the Move buttons and history rows, so at least one.
    for (final s in ProcessStage.flow) {
      expect(find.text(s.title), findsAtLeastNWidgets(1));
    }
    expect(find.byKey(const ValueKey('move-gap_closure')), findsOneWidget);
    expect(find.byKey(const ValueKey('move-site_inspection')), findsOneWidget);
    expect(find.byKey(const ValueKey('move-certificate_issued')), findsOneWidget);
    expect(find.byKey(const ValueKey('move-monitoring')), findsNothing);
    expect(find.text('Final Validation'), findsOneWidget);
  });

  testWidgets('issuance blockers carry their clause; the certificate button waits for final validation', (t) async {
    await pump(t);
    expect(find.text('Cannot issue'), findsOneWidget);
    expect(find.textContaining('IPS 23(1)'), findsWidgets);
    expect(find.text('1 unresolved non-compliance(s) · 0 item(s) still pending'), findsOneWidget);
    final issue = t.widget<FilledButton>(find.byKey(const ValueKey('issue-certificate')));
    expect(issue.onPressed, isNotNull, reason: 'job is at final_validation');
  });

  testWidgets('declaring no conflict sends interest.declare and clears the IPS 23 blocker', (t) async {
    await pump(t);
    await t.tap(find.byKey(const ValueKey('declare-none')));
    await t.pumpAndSettle();
    expect(server.events.where((e) => e['type'] == 'interest.declare').length, 1);
    expect(server.events.single['payload']['conflictFound'], false);
    expect(find.text('No conflict of interest declared'), findsOneWidget);
    expect(find.text('Conditional certificate or refusal only'), findsOneWidget);
    expect(find.textContaining('IPS 23(1)'), findsNothing);
  });

  testWidgets('verifying a corrective action sends corrective_action.update and re-reads the job', (t) async {
    await pump(t);
    expect(find.text('General 4.4'), findsOneWidget);
    expect(find.text('Install compliant signage'), findsOneWidget);
    await t.tap(find.byKey(const ValueKey('verify-1')));
    await t.pumpAndSettle();
    final ev = server.events.single;
    expect(ev['type'], 'corrective_action.update');
    expect(ev['payload'], {'correctiveActionId': 1, 'status': 'verified'});
    expect(find.byKey(const ValueKey('verify-1')), findsNothing);
    expect(find.textContaining('verified 10/09/2026'), findsOneWidget);
    expect(find.text('0 unresolved non-compliance(s) · 0 item(s) still pending'), findsOneWidget);
  });

  testWidgets('moving the job asks for a reason and sends job.transition', (t) async {
    await pump(t);
    await t.tap(find.byKey(const ValueKey('move-gap_closure')));
    await t.pumpAndSettle();
    await t.enterText(find.byKey(const ValueKey('ask-text')), 'Client fitting signage');
    await t.tap(find.byKey(const ValueKey('ask-ok')));
    await t.pumpAndSettle();
    final ev = server.events.single;
    expect(ev['type'], 'job.transition');
    expect(ev['payload'], {'jobId': 7, 'toStage': 'gap_closure', 'reason': 'Client fitting signage'});
  });
}
