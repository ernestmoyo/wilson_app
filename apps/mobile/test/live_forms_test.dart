// Real Dart ↔ real server, for the form-shaped sheets (certified handler,
// cylinder importation): the app's own client code creates the job, opens
// the inspection, records the subject, units and findings through the sync
// layer, and reads back what the server holds; then issues the certificate
// and checks the rendered document carries the subject.
//
// Skipped unless pointed at a server:
//   flutter test --dart-define=LIVE_API=http://localhost:8010 --dart-define=LIVE_PASSCODE=… test/live_forms_test.dart
//
// Test data only. Names here are invented.

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'package:assure_field/bootstrap.dart';
import 'package:assure_field/models/finding.dart';
import 'package:assure_field/models/job.dart';
import 'package:assure_field/sync/api_client.dart';
import 'package:assure_field/sync/outbox.dart';
import 'package:assure_field/sync/sync_service.dart';

const liveApi = String.fromEnvironment('LIVE_API', defaultValue: '');
const livePasscode = String.fromEnvironment('LIVE_PASSCODE', defaultValue: '');
String? liveToken;

void main() {
  if (liveApi.isEmpty) {
    test('live forms test skipped (set --dart-define=LIVE_API=…)', () {}, skip: true);
    return;
  }

  setUpAll(() async {
    HttpOverrides.global = null;
    if (livePasscode.isNotEmpty) {
      final a = ApiClient(baseUrl: Uri.parse(liveApi), deviceId: 'flutter-live-forms', httpClient: http.Client());
      final session = await a.login('compliancecertifier@assuresafety.co.nz', livePasscode);
      liveToken = session.token;
      a.close();
    }
  });

  late ApiClient api;
  late SyncService sync;
  setUp(() {
    api = ApiClient(baseUrl: Uri.parse(liveApi), deviceId: 'flutter-live-forms', userId: CurrentUser.id, httpClient: http.Client())
      ..token = liveToken;
    sync = SyncService(outbox: Outbox(InMemoryOutboxStore()), api: api);
  });
  tearDown(() => api.close());

  Future<void> settle() async {
    await Future<void>.delayed(const Duration(milliseconds: 30));
    await sync.flush();
    expect(sync.lastError, isNull, reason: sync.lastError);
    expect(sync.rejectedCount, 0, reason: sync.rejected.map((e) => e.outcome?.reason).join('; '));
  }

  test('catalogue: the server and the app agree on the sheet sets and their kinds', () async {
    final sets = await api.sheetSets();
    expect(sets.map((s) => '${s.key}:${s.kind}').toList(),
        containsAll(['class_6_8:location', 'handler_6:handler', 'cylinder_fern:cylinder', 'cylinder_un:cylinder']));
    expect(sets.firstWhere((s) => s.key == 'handler_6').authorised, isTrue);
  });

  test('certified handler: new job → subject → findings → certificate with the applicant on it', () async {
    // The New job form for a handler seeds the subject from what was typed.
    final created = await api.postJson('/api/jobs', {
      'client': {'legalName': 'Example Training Limited'},
      'site': {'address': '1 Example Road, Auckland'},
      'location': {'name': 'Test Applicant'},
      'classKey': 'handler_6',
      'subject': {'Name': 'Test Applicant', 'Company': 'Example Training Limited', 'Address': '1 Example Road, Auckland'},
      // HSLocation → Substance, from the New job form's rows.
      'substances': [
        {'name': 'Test toxic compound', 'hazardClass': '6.1B', 'lifecycles': 'Use, storage'},
      ],
    }) as Map<String, dynamic>;
    final jobId = created['jobId'] as int;

    // Opening the sheet walks the job to stage 4 and opens the inspection.
    final insp = await openInspectionForJob(api, sync, jobId);
    expect(insp.kind, 'handler');
    expect(insp.templates.single.code, 'ch-class-6-handler-assessment');
    expect(insp.subject['Name'], 'Test Applicant', reason: 'seeded subject hydrated');
    expect(insp.siteBlock, isNull, reason: 'a handler sheet has no site block');

    // The applicant block, edited on the sheet.
    insp.setSubject('Application type', 'Renewal');
    insp.setSubject('Scope of Certification', 'Class 6.1 toxic substances');
    insp.setSubject('DOB', '01/01/1990');

    // Findings against the Performance Standard clauses: every item compliant
    // but one, with the reason the clause asks for.
    final t = insp.templates.single;
    var n = 0;
    for (final s in t.sections) {
      for (final i in s.items) {
        final f = insp.findingFor(t, s, i);
        if (n == 3) {
          insp.update(f, (x) {
            x.status = FindingStatus.nonCompliant;
            x.comment = 'Could not describe the controls';
            x.failureReason = 'Answer did not cover the requirement';
          });
        } else {
          insp.update(f, (x) {
            x.status = FindingStatus.compliant;
            x.verificationMethod = 'Written assessment';
          });
        }
        n++;
      }
    }
    expect(n, 40);
    await settle();

    // The server holds it all, merged.
    final job = await api.getJson('/api/jobs/$jobId') as Map<String, dynamic>;
    expect(job['kind'], 'handler');
    final subject = (job['subject'] as Map).cast<String, dynamic>();
    expect(subject['Name'], 'Test Applicant');
    expect(subject['Application type'], 'Renewal');
    expect(subject['Scope of Certification'], 'Class 6.1 toxic substances');
    expect((job['findings'] as List).length, 40);
    expect((job['findings'] as List).where((f) => f['status'] == 'non_compliant').length, 1);

    // A second device sees the same subject.
    final again = await openInspectionForJob(api, SyncService(outbox: Outbox(InMemoryOutboxStore()), api: api), jobId);
    expect(again.subject['Application type'], 'Renewal');
    expect(again.countWhere(FindingStatus.compliant), 39);

    // Fix the one non-compliance, declare, sign, move on, issue.
    final fixMe = t.sections.expand((s) => s.items.map((i) => (s, i))).elementAt(3);
    insp.update(insp.findingFor(t, fixMe.$1, fixMe.$2), (x) {
      x.status = FindingStatus.compliant;
      x.failureReason = '';
      x.verificationMethod = 'Re-assessed orally';
    });
    await sync.outbox.enqueue('interest.declare', {'jobId': jobId, 'conflictFound': false});
    insp.sign('declaration', by: CurrentUser.name);
    await settle();
    for (final stage in ['compliance_evaluation', 'final_validation']) {
      await sync.outbox.enqueue('job.transition', {'jobId': jobId, 'toStage': stage});
    }
    await settle();

    final cert = await api.issueCertificate(jobId, {
      'inspectionId': insp.inspectionId,
      'decision': 'granted',
      'certificateNumber': 'TST100250-CH-LIVE',
      'issuedTo': subject['Name'],
      'appliesTo': subject['Company'],
      'issueDate': '2026-09-11',
      'expiryDate': '2031-09-11',
    });
    expect(cert, isNotNull);
    final res = await http.get(Uri.parse('$liveApi/api/jobs/$jobId/certificate.html'), headers: {'authorization': 'Bearer $liveToken'});
    expect(res.statusCode, 200, reason: res.body);
    expect(res.body, contains('Certified Handler'));
    expect(res.body, contains('Test Applicant'));
    expect(res.body, contains('Example Training Limited'));
    expect(res.body, contains('TST100250-CH-LIVE'));
    expect(res.body, contains('Class 6.1 toxic substances'));
    // The Substances table: Name | Classes | Lifecycles, from the job's substance rows.
    expect(res.body, contains('Test toxic compound'));
    expect(res.body, contains('Use, storage'));
    final rec = JobRecord.fromJson(job);
    expect(rec.substances.single.line, 'Test toxic compound · 6.1B · Use, storage');
  });

  test('cylinder importation: units added, filled, removed; the survivor keeps its ordinal on both sides', () async {
    final created = await api.postJson('/api/jobs', {
      'client': {'legalName': 'Example Importer Limited'},
      'site': {'address': '2 Example Road, Auckland'},
      'location': {'name': 'Shipment TEST-1'},
      'classKey': 'cylinder_fern',
      'subject': {'Company/Legal Entity': 'Example Importer Limited', 'Physical Address': '2 Example Road, Auckland'},
    }) as Map<String, dynamic>;
    final jobId = created['jobId'] as int;
    final insp = await openInspectionForJob(api, sync, jobId);
    expect(insp.kind, 'cylinder');
    expect(insp.templates.single.sheet.hasUnits, isTrue);

    insp.setSubject('Full Name of PCBU', 'Test Person');
    insp.addUnit();
    insp.setUnitField(1, 'FERN', 'FERN-TEST-1');
    insp.setUnitField(1, 'Number of Cylinders', '10');
    insp.addUnit();
    insp.setUnitField(2, 'FERN', 'FERN-TEST-2');
    insp.setUnitField(2, 'Number of Cylinders', '4');
    await settle();

    var job = await api.getJson('/api/jobs/$jobId') as Map<String, dynamic>;
    var units = (job['units'] as List).cast<Map<String, dynamic>>();
    expect(units.length, 2);
    expect((units[0]['fields'] as Map)['FERN'], 'FERN-TEST-1');
    expect((units[0]['fields'] as Map)['Number of Cylinders'], '10', reason: 'merge kept the earlier field');
    expect((units[1]['fields'] as Map)['FERN'], 'FERN-TEST-2');

    // Remove the first batch: the second becomes unit 1 in the app, and must
    // be unit 1 on the server too, or the next edit would fork a duplicate.
    insp.removeUnit(1);
    await settle();
    insp.setUnitField(1, 'Design Standard', 'AS/NZS 1841.5');
    await settle();

    job = await api.getJson('/api/jobs/$jobId') as Map<String, dynamic>;
    units = (job['units'] as List).cast<Map<String, dynamic>>();
    expect(units.length, 1, reason: 'no duplicate after remove + edit');
    expect(units.single['ordinal'], 1);
    expect((units.single['fields'] as Map)['FERN'], 'FERN-TEST-2');
    expect((units.single['fields'] as Map)['Design Standard'], 'AS/NZS 1841.5');

    // Pull on a fresh instance: same one unit, same subject.
    final again = await openInspectionForJob(api, SyncService(outbox: Outbox(InMemoryOutboxStore()), api: api), jobId);
    expect(again.units.length, 1);
    expect(again.units.single['FERN'], 'FERN-TEST-2');
    expect(again.subject['Full Name of PCBU'], 'Test Person');

    // The board says what kind it is and names the PCBU.
    final board = (await api.getJson('/api/jobs') as List).cast<Map<String, dynamic>>();
    final row = board.firstWhere((r) => r['id'] == jobId);
    expect(row['kind'], 'cylinder');
    expect((row['subject'] as Map)['Full Name of PCBU'], 'Test Person');
  });
}
