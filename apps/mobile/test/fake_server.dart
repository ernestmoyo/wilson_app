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

  /// Refuse the next interest.declare with this clause (null: accept).
  String? rejectDeclareWith;

  /// Further jobs for the clients board: other clients, or a second job
  /// under client 1. Each row as /api/jobs returns it (see [row]).
  final List<Map<String, dynamic>> extraJobs = [];

  /// Client ids archived through a client.archive event.
  final Set<int> archivedClients = {};

  /// Refuse every client.archive with this reason (null: accept).
  String? rejectArchiveWith;

  /// The network is down for POST /api/sync: the request fails before it
  /// reaches the server, so the events stay queued on the device.
  bool syncOffline = false;

  /// The certificate once issued through POST /api/jobs/7/certificate (null:
  /// not issued), and the bodies that route received.
  Map<String, dynamic>? certificate;
  final List<Map<String, dynamic>> issued = [];

  /// No reminders on the dashboard (the empty state of Needs attention).
  bool noReminders = false;

  /// Further dashboard reminders, shaped as /api/dashboard returns them.
  final List<Map<String, dynamic>> extraReminders = [];

  /// Sections the job does not assess (scope choices not picked, or work
  /// outside the authorisation), as GET /api/jobs/:id reports them.
  final List<Map<String, dynamic>> excludedSections = [];

  /// When true, class_2_3 is authorised and offers scope choices (19 Oct 2026).
  bool class23WithChoices = false;

  // ── evidence ──────────────────────────────────────────────────────────────
  /// Evidence rows as GET /api/jobs/:id returns them.
  final List<Map<String, dynamic>> evidence = [];

  /// 'server' (disk: bytes POSTed here) or 'direct' (Blob/Spaces: PUT to storage).
  String evidenceMode = 'server';

  /// Bytes as they reached the server route or the storage PUT, by key.
  final Map<String, List<int>> stored = {};

  /// Headers each storage PUT carried (must not include our session token).
  final List<Map<String, String>> storagePutHeaders = [];

  /// A board row for another job, shaped like the real /api/jobs row.
  static Map<String, dynamic> row(int id, int clientId, String client, String location,
          {String stage = 'site_inspection', String? address, String? lastActivity}) =>
      {
        'id': id,
        'stage': stage,
        'class_key': 'class_6_8',
        'kind': 'location',
        'subject': <String, dynamic>{},
        'opened_at': '2026-09-01T00:00:00Z',
        'client_id': clientId,
        'client_archived': false,
        'client': client,
        'trading_name': null,
        'location': location,
        'address': address ?? '1 Test Road',
        'inspection_id': null,
        'inspected_at': null,
        'item_total': 0,
        'assessed': 0,
        'non_compliant': 0,
        'certificate_decision': null,
        'last_activity': lastActivity ?? '2026-09-05T00:00:00Z',
      };

  /// /api/jobs: archived clients only with ?archived=1, never otherwise.
  List<Map<String, dynamic>> board({bool archived = false}) => [
        ..._allJobs().where((j) => archivedClients.contains(j['client_id']) == archived)
            .map((j) => {...j, 'client_archived': archived}),
      ];

  List<Map<String, dynamic>> _allJobs() => noJobs ? [] : [
        {
          'id': 7,
          'client_id': 1,
          'client_archived': false,
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
        ...extraJobs,
      ];

  /// People as the server lists them.
  final List<Map<String, dynamic>> users = [
    {'id': 1, 'fullName': 'Bryan Wilson', 'occupation': 'Compliance certifier', 'email': 'compliancecertifier@assuresafety.co.nz', 'role': 'certifier', 'authorisationNumber': 'TST100250', 'active': true, 'hasPasscode': true},
    {'id': 2, 'fullName': 'Document reviewer', 'occupation': 'Compliance reviewer', 'email': 'reviewer@assuresafety.co.nz', 'role': 'reviewer', 'active': true, 'hasPasscode': false},
  ];
  final List<Map<String, dynamic>> passcodesSet = [];
  final List<Map<String, dynamic>> patches = [];
  final List<String> requests = [];

  /// Bodies posted to /api/jobs, in order.
  final List<Map<String, dynamic>> created = [];

  /// Substance rows as the server returns them (the G2 job's one by default).
  final List<Map<String, dynamic>> substances = [
    {'id': 1, 'name': 'Abamectin', 'hazard_class': '6.1B'},
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
        'substances': substances,
        'client': client,
        'location': location,
        'inspections': [
          {'id': 3, 'inspected_at': '2026-09-09T00:00:00Z', 'status': 'in_progress'}
        ],
        'findings': findings,
        'excludedSections': excludedSections,
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
        'certificate': certificate,
        'retention': null,
        'contacts': [
          {'id': 1, 'name': 'Jesh Chandra', 'role': 'Site manager', 'phone': '0226787761', 'email': 'jesh@argenta.example', 'is_site_manager': true}
        ],
        'allowedNext': stage == 'document_review'
            ? ['rfi', 'site_inspection']
            : stage == 'site_inspection'
                ? ['compliance_evaluation']
                : ['gap_closure', 'site_inspection', 'certificate_issued'],
        'communications': comms,
        'evidence': evidence,
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
        'reminders': noReminders ? [] : [
          {'kind': 'action', 'jobId': 7, 'client': client['legalName'], 'location': location['name'], 'when': '2026-09-15', 'text': 'Corrective action due 2026-09-15: Install compliant signage'},
          ...extraReminders,
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
          {'key': 'class_2_3', 'name': 'Location: classes 2 and 3.1', 'templates': ['wks17-general', 'wks17-class-2-and-3-1-substances'],
           'authorised': class23WithChoices, 'authorisationEntry': null,
           if (class23WithChoices) 'choices': [
             {'key': '2_1_1_gases', 'label': 'Class 2.1.1 gases'},
             {'key': '3_1_cabinet', 'label': 'Class 3.1: packages in cabinets'},
           ]},
          {'key': 'class_3_2_4', 'kind': 'location', 'name': 'Location: classes 3.2 and 4', 'templates': ['wks17-general', 'wks17-class-3-2-and-4'], 'authorised': true, 'authorisationEntry': {'regulation': 'Regulation 10.36'}},
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
      case 'client.archive':
        final id = p['clientId'] as int;
        p['archived'] == false ? archivedClients.remove(id) : archivedClients.add(id);
      case 'job.subject.set':
        subject.addAll((p['fields'] as Map).cast<String, dynamic>());
      case 'job.unit.upsert':
        final ord = p['ordinal'] as int;
        while (units.length < ord) {
          units.add({'ordinal': units.length + 1, 'fields': <String, dynamic>{}});
        }
        (units[ord - 1]['fields'] as Map).addAll((p['fields'] as Map? ?? const {}).cast<String, dynamic>());
      case 'evidence.attach':
        final f = findings.where((x) =>
            x['template_code'] == p['templateCode'] &&
            x['section_ordinal'] == p['sectionOrdinal'] &&
            x['item_ordinal'] == p['itemOrdinal']);
        // A new version (supersedesId): the old row stays, no longer current.
        final prior = evidence.where((x) => x['id'] == p['supersedesId']).firstOrNull;
        prior?['current'] = false;
        evidence.add({
          'id': 500 + evidence.length,
          'finding_id': prior != null ? prior['finding_id'] : (f.isEmpty ? null : f.first['id']),
          'kind': p['kind'] ?? 'photo',
          'sha256': p['sha256'],
          'storage_key': p['storageKey'],
          'original_name': p['originalName'],
          'mime': p['mime'],
          'bytes': p['bytes'],
          'captured_by_name': p['capturedByName'],
          'captured_at': p['capturedAt'],
          'version': prior == null ? 1 : (prior['version'] as int? ?? 1) + 1,
          'supersedes_id': prior?['id'],
          'uploaded_by_name': p['capturedByName'],
          'uploaded_at': '2026-10-20T01:00:00Z',
          'review_state': 'submitted',
          'current': true,
        });
      case 'evidence.review':
        final row = evidence.firstWhere((x) => x['id'] == p['evidenceId']);
        row['review_state'] = p['state'];
        row['review_note'] = p['note'];
        row['reviewed_by_name'] = 'Reviewer On Test';
        row['reviewed_at'] = '2026-10-20T02:00:00Z';
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
          'general_comment': p['generalComment'],
          'na_reason': p['naReason'],
          'updated_at': '2026-09-10T00:00:00Z',
        });
    }
  }

  http.Client client_() => MockClient((req) async {
        final path = req.url.path;
        requests.add('${req.method} $path');
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
        // Object storage, for a direct (presigned) upload.
        if (req.url.host == 'storage.invalid' && req.method == 'PUT') {
          storagePutHeaders.add(req.headers);
          stored[req.url.pathSegments.last] = req.bodyBytes;
          return http.Response('{}', 200);
        }
        if (requireLogin && req.headers['authorization'] != 'Bearer $token') {
          return http.Response('{"error":"login required"}', 401);
        }
        if (path == '/api/jobs' && req.method == 'GET') {
          return http.Response(jsonEncode(board(archived: req.url.queryParameters['archived'] == '1')), 200);
        }
        if (path == '/api/users' && req.method == 'GET') {
          if (role != 'certifier') return http.Response('{"error":"managing people needs a compliance certifier","clause":"Role"}', 403);
          return http.Response(jsonEncode(users), 200);
        }
        if (path == '/api/users' && req.method == 'POST') {
          final b = jsonDecode(req.body) as Map<String, dynamic>;
          if ((b['passcode'] as String? ?? '').length < 6) return http.Response('{"error":"a passcode of at least 6 characters is required"}', 400);
          final u = {'id': users.length + 1, ...b, 'email': (b['email'] as String).toLowerCase(), 'active': true, 'hasPasscode': true}..remove('passcode');
          users.add(u);
          return http.Response(jsonEncode(u), 201);
        }
        final pm = RegExp(r'^/api/users/(\d+)/passcode$').firstMatch(path);
        if (pm != null && req.method == 'POST') {
          passcodesSet.add({'id': int.parse(pm.group(1)!), ...jsonDecode(req.body) as Map<String, dynamic>});
          return http.Response('{"ok":true}', 200);
        }
        final um = RegExp(r'^/api/users/(\d+)$').firstMatch(path);
        if (um != null && req.method == 'PATCH') {
          final u = users.firstWhere((x) => x['id'] == int.parse(um.group(1)!));
          patches.add(jsonDecode(req.body) as Map<String, dynamic>);
          u.addAll(jsonDecode(req.body) as Map<String, dynamic>);
          return http.Response(jsonEncode(u), 200);
        }
        if (path == '/api/jobs' && req.method == 'POST') {
          final b = jsonDecode(req.body) as Map<String, dynamic>;
          created.add(b);
          for (final x in (b['substances'] as List?) ?? const []) {
            substances.add({'name': x['name'], 'hazard_class': x['hazardClass'], 'lifecycles': x['lifecycles']});
          }
          return http.Response(jsonEncode({'jobId': 7, 'clientId': 1, 'siteId': 1, 'hsLocationId': 1, 'stage': 'enquiry'}), 201);
        }
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
        if (path == '/api/evidence/upload-url' && req.method == 'POST') {
          if (role == 'viewer') return http.Response('{"error":"a viewer cannot upload evidence","clause":"Role"}', 403);
          final b = jsonDecode(req.body) as Map<String, dynamic>;
          final ext = switch (b['mime']) { 'application/pdf' => 'pdf', 'image/png' => 'png', 'image/jpeg' => 'jpg', _ => null };
          if (ext == null) return http.Response('{"error":"not accepted as evidence"}', 415);
          final key = '${b['sha256']}.$ext';
          // Already stored (same bytes from another device): no PUT URL.
          if (stored.containsKey(key) && evidenceMode == 'direct') {
            return http.Response(jsonEncode({'mode': 'exists', 'storageKey': 'evidence/$key'}), 200);
          }
          return http.Response(
              jsonEncode(evidenceMode == 'direct'
                  ? {
                      'mode': 'direct',
                      'method': 'PUT',
                      'url': 'https://storage.invalid/evidence/$key?sig=1',
                      'headers': {'x-content-type': b['mime']},
                      'storageKey': 'evidence/$key',
                    }
                  : {
                      'mode': 'server',
                      'method': 'POST',
                      'url': '/api/evidence/upload',
                      'headers': {'content-type': b['mime'], 'x-sha256': b['sha256']},
                      'storageKey': key,
                    }),
              200);
        }
        if (path == '/api/evidence/upload' && req.method == 'POST') {
          final sha = req.headers['x-sha256']!;
          final ext = req.headers['content-type'] == 'application/pdf' ? 'pdf' : 'jpg';
          stored['$sha.$ext'] = req.bodyBytes;
          return http.Response(
              jsonEncode({'sha256': sha, 'bytes': req.bodyBytes.length, 'mime': req.headers['content-type'], 'storageKey': '$sha.$ext', 'url': null, 'backend': 'disk'}),
              201);
        }
        if (path == '/api/evidence/confirm' && req.method == 'POST') {
          final b = jsonDecode(req.body) as Map<String, dynamic>;
          final key = (b['storageKey'] as String).replaceFirst('evidence/', '');
          if (!stored.containsKey(key)) return http.Response('{"error":"nothing has been uploaded under that key"}', 404);
          return http.Response(
              jsonEncode({'sha256': b['sha256'], 'bytes': stored[key]!.length, 'mime': b['mime'], 'storageKey': b['storageKey'], 'url': null, 'backend': 'fake-direct'}),
              201);
        }
        final lm = RegExp(r'^/api/evidence/([0-9a-f]{64}\.[a-z]+)/link$').firstMatch(path);
        if (lm != null && req.method == 'GET') {
          return http.Response(
              jsonEncode(evidenceMode == 'direct'
                  ? {'url': 'https://storage.invalid/evidence/${lm.group(1)}?sig=get', 'expiresAt': '2026-10-19T00:10:00Z'}
                  : {'url': '/api/evidence/${lm.group(1)}', 'expiresAt': null}),
              200);
        }
        if (path == '/api/jobs/7/certificate' && req.method == 'POST') {
          final b = jsonDecode(req.body) as Map<String, dynamic>;
          issued.add(b);
          certificate = {
            'id': 1,
            'decision': b['decision'],
            'certificate_number': b['certificateNumber'],
            'issue_date': b['issueDate'],
            'in_force_date': b['issueDate'],
            'expiry_date': b['expiryDate'],
            'conditions': b['conditions'] ?? [],
            'requirements_not_met': b['requirementsNotMet'] ?? [],
          };
          stage = 'certificate_issued';
          return http.Response(jsonEncode({'certificateId': 1}), 201);
        }
        if (path == '/api/sync' && syncOffline) {
          throw http.ClientException('Failed host lookup: fake.test');
        }
        if (path == '/api/sync') {
          final body = jsonDecode(req.body) as Map<String, dynamic>;
          final applied = <Map<String, dynamic>>[];
          final rejected = <Map<String, dynamic>>[];
          for (final e in (body['events'] as List).cast<Map<String, dynamic>>()) {
            if (e['type'] == 'client.archive' && rejectArchiveWith != null) {
              rejected.add({'id': e['id'], 'type': e['type'], 'clause': 'Role', 'reason': rejectArchiveWith});
              continue;
            }
            if (e['type'] == 'evidence.review' && !const {'reviewer', 'admin', 'certifier'}.contains(role)) {
              rejected.add({'id': e['id'], 'type': e['type'], 'clause': 'Role', 'reason': 'reviewing evidence needs a reviewer'});
              continue;
            }
            if (e['type'] == 'interest.declare' && rejectDeclareWith != null) {
              rejected.add({'id': e['id'], 'type': e['type'], 'clause': rejectDeclareWith, 'reason': 'refused for the test'});
              rejectDeclareWith = null;
              continue;
            }
            _apply(e);
            applied.add({'id': e['id'], 'result': e['type'] == 'inspection.open' ? {'inspectionId': 3} : {}});
          }
          return http.Response(jsonEncode({'applied': applied, 'rejected': rejected, 'duplicate': []}), 200);
        }
        return http.Response('{"error":"not found"}', 404);
      });
}
