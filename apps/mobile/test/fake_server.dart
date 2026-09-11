// A fake apps/server for widget tests: answers the routes the app uses the
// way the real one does, and keeps enough state that a sync event changes
// what the next GET returns. Shared by the board, hub, sheet and login tests.

import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

class FakeServer {
  bool declared = false;
  String caStatus = 'open';
  String stage = 'final_validation';
  bool requireLogin = false;
  String? token;
  String role = 'certifier';
  final List<Map<String, dynamic>> sent = [];
  final List<Map<String, dynamic>> events = [];
  final List<Map<String, dynamic>> findings = [
    {
      'id': 11,
      'inspection_id': 3,
      'template_code': 'wks17-general',
      'section_ordinal': 4,
      'item_ordinal': 4,
      'status': 'non_compliant',
      'failure_reason': 'reg 2.6(3): no signage at the room entrance',
      'updated_at': '2026-09-09T00:00:00Z',
    },
    {
      'id': 12,
      'inspection_id': 3,
      'template_code': 'wks17-general',
      'section_ordinal': 1,
      'item_ordinal': 1,
      'status': 'compliant',
      'comment': 'Class 6.1B 310 kg and 6.1C 2510 kg exceed thresholds',
      'updated_at': '2026-09-09T00:00:00Z',
    },
  ];
  final List<Map<String, dynamic>> comms = [
    {
      'id': 1,
      'direction': 'outbound',
      'medium': 'email',
      'party': 'Jesh Chandra',
      'summary': 'Sent application form, required documents checklist, terms and fee estimate',
      'body': null,
      'occurred_at': '2026-09-02T00:00:00Z',
    },
  ];

  Map<String, dynamic> get client => {
        'id': 1,
        'legalName': 'Argenta Manufacturing Limited',
        'tradingName': 'Argenta Manufacturing Limited',
        'postalAddress': 'PO Box 75340, Manurewa',
        'phone': '64 9 2503100',
        'website': 'www.argentaglobal.com',
        'nzbn': '9429033971360',
      };

  /// Which sheet set the job uses; the board and job carry its kind.
  String classKey = 'class_6_8';
  String get kind => switch (classKey) { 'handler_6' => 'handler', 'cylinder_fern' || 'cylinder_un' => 'cylinder', _ => 'location' };

  Map<String, dynamic> get location => {'id': 1, 'name': 'G2 Chiller', 'address': '2 Sterling Avenue, Manurewa East, Auckland 2102', 'summary': 'Cool room'};

  /// A server with nothing on it yet.
  bool noJobs = false;

  List<Map<String, dynamic>> board() => noJobs ? [] : [
        {
          'id': 7,
          'stage': stage,
          'class_key': classKey,
          'kind': kind,
          'subject': subject,
          'opened_at': '2026-09-01T00:00:00Z',
          'client': client['legalName'],
          'trading_name': client['tradingName'],
          'location': location['name'],
          'address': location['address'],
          'inspection_id': 3,
          'inspected_at': '2026-09-09T00:00:00Z',
          'item_total': 54,
          'assessed': findings.where((f) => f['status'] != 'pending').length,
          'non_compliant': findings.where((f) => f['status'] == 'non_compliant').length,
          'certificate_decision': null,
          'last_activity': '2026-09-09T00:00:00Z',
        },
      ];

  /// Subject and units as the server keeps them (form sheets).
  final Map<String, dynamic> subject = {};
  final List<Map<String, dynamic>> units = [];

  Map<String, dynamic> job() => {
        'id': 7,
        'stage': stage,
        'class_key': classKey,
        'kind': kind,
        'subject': subject,
        'units': units,
        'client': client,
        'location': location,
        'inspections': [
          {'id': 3, 'inspected_at': '2026-09-09T00:00:00Z', 'status': 'in_progress'}
        ],
        'findings': findings,
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
        'contacts': [
          {'id': 1, 'name': 'Jesh Chandra', 'role': 'Site manager', 'phone': '0226787761', 'email': 'jesh@argenta.example', 'is_site_manager': true}
        ],
        'substances': [
          {'id': 1, 'name': 'Abamectin', 'hazard_class': '6.1B'}
        ],
        'allowedNext': stage == 'document_review'
            ? ['rfi', 'site_inspection']
            : stage == 'site_inspection'
                ? ['compliance_evaluation']
                : ['gap_closure', 'site_inspection', 'certificate_issued'],
        'communications': comms,
        'events': [
          for (final e in events.reversed)
            {
              'type': e['type'],
              'payload': e['payload'],
              'occurred_at': '2026-09-10T00:00:00Z',
              'outcome': 'applied',
              'reject_clause': null,
              'user_name': role == 'certifier' ? 'Bryan Wilson' : 'Document reviewer',
              'user_role': role,
            },
          {
            'type': 'inspection.sign',
            'payload': {'inspectionId': 3, 'which': 'declaration'},
            'occurred_at': '2026-09-09T00:00:00Z',
            'outcome': 'applied',
            'reject_clause': null,
            'user_name': 'Bryan Wilson',
            'user_role': 'certifier',
          },
          {
            'type': 'inspection.sign',
            'payload': {'inspectionId': 3, 'which': 'declaration'},
            'occurred_at': '2026-09-08T00:00:00Z',
            'outcome': 'rejected',
            'reject_clause': 'Role',
            'user_name': 'Document reviewer',
            'user_role': 'reviewer',
          },
        ],
      };

  Map<String, dynamic> dashboard() => {
        'reminders': [
          {'kind': 'action', 'jobId': 7, 'client': client['legalName'], 'location': location['name'], 'when': '2026-09-15', 'text': 'Corrective action due 2026-09-15: Install compliant signage'},
        ],
        'activity': [
          {'type': 'inspection.sign', 'occurred_at': '2026-09-09T00:00:00Z', 'payload': {'inspectionId': 3, 'which': 'declaration'}, 'user_name': 'Bryan Wilson', 'job_id': 7, 'client': client['legalName'], 'location': location['name']},
          {'type': 'finding.upsert', 'occurred_at': '2026-09-09T00:00:00Z', 'payload': {'sectionOrdinal': 4, 'itemOrdinal': 4, 'status': 'non_compliant'}, 'user_name': 'Document reviewer', 'job_id': 7, 'client': client['legalName'], 'location': location['name']},
        ],
        'mailConfigured': false,
      };

  Map<String, dynamic> sheetSets() => {
        'sets': [
          {'key': 'class_6_8', 'kind': 'location', 'name': 'Location: classes 6 or 8', 'templates': ['wks17-general', 'wks17-class-6-1a-6-1b-6-1c-8-2a-8'], 'authorised': true, 'authorisationEntry': {'regulation': 'Regulation 13.38'}},
          {'key': 'class_2_3', 'name': 'Location: classes 2 and 3.1', 'templates': ['wks17-general', 'wks17-class-2-and-3-1-substances'], 'authorised': false, 'authorisationEntry': null},
          {'key': 'handler_6', 'kind': 'handler', 'name': 'Certified handler: class 6', 'templates': ['ch-class-6-handler-assessment'], 'authorised': true, 'authorisationEntry': {'regulation': 'Regulation 4.1'}},
          {'key': 'cylinder_fern', 'kind': 'cylinder', 'name': 'Cylinder importation: fire extinguishers (FERN)', 'templates': ['ci-cylinder-importation-fern'], 'authorised': true, 'authorisationEntry': {'regulation': 'Regulation 15.16'}},
        ],
        'planned': [],
        'certifier': {'number': 'TST100250'},
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

  void _apply(Map<String, dynamic> e) {
    events.add(e);
    final p = (e['payload'] as Map).cast<String, dynamic>();
    switch (e['type']) {
      case 'interest.declare':
        declared = true;
      case 'corrective_action.update':
        caStatus = p['status'] as String;
      case 'communication.record':
        comms.add({...p, 'id': comms.length + 1, 'occurred_at': '2026-09-10T00:00:00Z'});
      case 'job.transition':
        stage = p['toStage'] as String;
      case 'job.subject.set':
        subject.addAll((p['fields'] as Map).cast<String, dynamic>());
      case 'job.unit.upsert':
        final ord = p['ordinal'] as int;
        while (units.length < ord) {
          units.add({'ordinal': units.length + 1, 'fields': <String, dynamic>{}});
        }
        (units[ord - 1]['fields'] as Map).addAll((p['fields'] as Map? ?? const {}).cast<String, dynamic>());
      case 'job.unit.remove':
        units.removeWhere((u) => u['ordinal'] == p['ordinal']);
      case 'finding.upsert':
        String key(Map<String, dynamic> f) => '${f['template_code']}/${f['section_ordinal']}/${f['item_ordinal']}';
        final k = '${p['templateCode']}/${p['sectionOrdinal']}/${p['itemOrdinal']}';
        findings.removeWhere((f) => key(f) == k);
        findings.add({
          'id': 100 + findings.length,
          'inspection_id': 3,
          'template_code': p['templateCode'],
          'section_ordinal': p['sectionOrdinal'],
          'item_ordinal': p['itemOrdinal'],
          'status': p['status'],
          'comment': p['comment'],
          'verification_method': p['verificationMethod'],
          'failure_reason': p['failureReason'],
          'updated_at': '2026-09-10T00:00:00Z',
        });
    }
  }

  http.Client client_() => MockClient((req) async {
        final path = req.url.path;
        if (path == '/api/auth/login') {
          final b = jsonDecode(req.body) as Map<String, dynamic>;
          if (b['passcode'] != 'chiller-2026') {
            return http.Response(jsonEncode({'error': 'email or passcode not recognised'}), 401);
          }
          token = 'tok-123';
          return http.Response(
              jsonEncode({
                'token': token,
                'expiresAt': '2026-10-10T00:00:00Z',
                'user': {'id': 1, 'fullName': role == 'certifier' ? 'Bryan Wilson' : 'Document reviewer', 'occupation': 'Compliance certifier', 'email': b['email'], 'authorisationNumber': 'TST100250', 'role': role},
              }),
              200);
        }
        if (path == '/api/auth/logout') return http.Response('{"ok":true}', 200);
        if (path == '/api/health') return http.Response('{"ok":true}', 200);
        if (requireLogin && req.headers['authorization'] != 'Bearer $token') {
          return http.Response('{"error":"login required"}', 401);
        }
        if (path == '/api/jobs' && req.method == 'GET') return http.Response(jsonEncode(board()), 200);
        if (path == '/api/jobs/7') return http.Response(jsonEncode(job()), 200);
        if (path == '/api/jobs/7/issuance-check') return http.Response(jsonEncode(check()), 200);
        if (path == '/api/jobs/7/site-block') return http.Response('{"ok":true}', 200);
        if (path == '/api/dashboard') return http.Response(jsonEncode(dashboard()), 200);
        if (path == '/api/sheet-sets') return http.Response(jsonEncode(sheetSets()), 200);
        if (path == '/api/jobs/7/send') {
          final b = jsonDecode(req.body) as Map<String, dynamic>;
          sent.add(b);
          comms.add({'id': comms.length + 1, 'direction': 'outbound', 'medium': 'email', 'party': b['to'], 'summary': 'Prepared the ${b['document'] == 'certificate' ? 'certificate' : 'non-compliance report'} for ${b['to']} (email not sent: SMTP_URL not configured)', 'occurred_at': '2026-09-10T00:00:00Z'});
          return http.Response(jsonEncode({'sent': false, 'reason': 'SMTP_URL not configured', 'summary': 'Prepared for ${b['to']}'}), 200);
        }
        if (path == '/api/sync') {
          final body = jsonDecode(req.body) as Map<String, dynamic>;
          final applied = <Map<String, dynamic>>[];
          for (final e in (body['events'] as List).cast<Map<String, dynamic>>()) {
            _apply(e);
            applied.add({'id': e['id'], 'result': e['type'] == 'inspection.open' ? {'inspectionId': 3} : {}});
          }
          return http.Response(jsonEncode({'applied': applied, 'rejected': [], 'duplicate': []}), 200);
        }
        return http.Response('{"error":"not found"}', 404);
      });
}
