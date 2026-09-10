import 'generated/checksheets.g.dart';
import 'models/finding.dart';
import 'models/inspection.dart';
import 'models/site_block.dart';
import 'sync/api_client.dart';
import 'sync/sync_service.dart';

/// The certifier the app runs as until real auth lands. Mirrors the server's
/// seeded user id 1 — IPS 21(4)(a) needs both the name and the occupation on
/// every photograph, so both live here, once.
class CurrentUser {
  static const int id = 1;
  static const String name = 'Bryan Wilson';
  static const String occupation = 'Compliance certifier';
  static const String authorisationNumber = 'TST100250';
}

/// Site block rows 10, 12 and 13 for the G2 Chiller job, from the workbook.
/// Used both when the job is first created and to backfill an older job.
const List<Map<String, dynamic>> g2Contacts = [
  {
    'name': 'Jesh Chandra',
    'role': 'Site manager',
    'phone': '0226787761',
    'email': 'jesh.chandra@argentaglobal.com',
    'isSiteManager': true,
  },
];

const List<Map<String, dynamic>> g2Substances = [
  {'name': 'Abamectin', 'hazardClass': '6.1B', 'quantity': 190, 'unit': 'kg'},
  {'name': 'Eprinomectin', 'hazardClass': '6.1C', 'quantity': 2500, 'unit': 'kg'},
  {'name': 'Ivermectin', 'hazardClass': '6.1B', 'quantity': 10, 'unit': 'kg'},
  {'name': 'Moxidectin', 'hazardClass': '6.1B', 'quantity': 120, 'unit': 'kg'},
];

/// Ids may arrive as numbers (PGlite) or strings (node-postgres int8). The
/// server now normalises them, but the app must not fall over if it meets an
/// older server or a different driver.
int toInt(Object? v) {
  if (v is int) return v;
  if (v is num) return v.toInt();
  if (v is String) return int.parse(v);
  throw FormatException('expected an integer id, got ${v.runtimeType}: $v');
}

class ServerJob {
  final int jobId;
  final int hsLocationId;
  final int? inspectionId;
  final String stage;
  final String? classKey;
  final List<dynamic> findings;

  /// The full GET /api/jobs/:id payload — the site block, signatures and
  /// certificate are read from here.
  final Map<String, dynamic> raw;

  const ServerJob({
    required this.jobId,
    required this.hsLocationId,
    required this.inspectionId,
    required this.stage,
    required this.classKey,
    required this.findings,
    required this.raw,
  });

  Map<String, dynamic>? get inspection =>
      (raw['inspections'] as List?)?.isEmpty ?? true
          ? null
          : Map<String, dynamic>.from((raw['inspections'] as List).first as Map);

  /// Rows 2–14 of the sheet, from the job's client, site, location, contacts,
  /// substances and inspection.
  SiteBlock siteBlock() {
    final client = Map<String, dynamic>.from(raw['client'] as Map);
    final loc = Map<String, dynamic>.from(raw['location'] as Map);
    final contacts = ((raw['contacts'] as List?) ?? const []).cast<Map>();
    final manager = contacts.isEmpty ? null : Map<String, dynamic>.from(contacts.first);
    final subs = ((raw['substances'] as List?) ?? const []).cast<Map>();
    final insp = inspection;
    return SiteBlock(
      legalEntityName: client['legalName'] as String?,
      tradingAsName: client['tradingName'] as String?,
      siteAddress: loc['address'] as String?,
      postalAddress: client['postalAddress'] as String?,
      businessPhone: client['phone'] as String?,
      website: client['website'] as String?,
      nzbn: client['nzbn'] as String?,
      industry: client['industry'] as String?,
      managerName: manager?['name'] as String?,
      inspectionDate: insp?['inspected_at'] == null ? null : DateTime.tryParse('${insp!['inspected_at']}'),
      inspectionStatus: insp?['status'] as String?,
      directDial: manager?['phone'] as String?,
      substanceNames: subs.map((s) => '${s['name']}').toList(),
      hsLocation: [loc['name'], client['legalName'], loc['address']]
          .where((x) => x != null && '$x'.isNotEmpty)
          .join(' '),
      summary: loc['summary'] as String?,
    );
  }
}

/// Find the G2 Chiller job on the server, creating it on first run.
///
/// Idempotent: the demo can be reloaded any number of times and there is one
/// job. This is where a real job list will come from once there is more than
/// one client in the system.
Future<ServerJob> ensureG2Job(ApiClient api) async {
  final jobs = (await api.getJson('/api/jobs') as List).cast<Map<String, dynamic>>();
  Map<String, dynamic>? found;
  for (final j in jobs) {
    if (j['location'] == 'G2 Chiller') {
      found = j;
      break;
    }
  }

  int jobId;
  if (found != null) {
    jobId = toInt(found['id']);
  } else {
    final created = await api.postJson('/api/jobs', {
      'client': {
        'legalName': 'Argenta Manufacturing Limited',
        'tradingName': 'Argenta Manufacturing Limited',
        'nzbn': '9429033971360',
        'companiesNumber': '1846134',
        'postalAddress': 'PO Box 75340, Manurewa, Auckland, 2243 New Zealand',
        'phone': '64 9 2503100',
        'website': 'www.argentaglobal.com',
        'industry':
            'Argenta Manufacturing Limited is an animal health pharmaceutical manufacturer. The company '
            'produces a wide range of bespoke animal health products for both local and export markets.',
      },
      // Site block rows 10, 12 and 13, from the G2 Chiller workbook.
      'contacts': g2Contacts,
      'substances': g2Substances,
      'site': {'address': '2 Sterling Avenue, Manurewa East, Auckland 2102'},
      'location': {
        'name': 'G2 Chiller',
        'summary':
            'G2 Chiller is a dedicated storage area for Class 6.1B (320 kg) and Class 6.1C (2500 kg) '
            'used in veterinary medicine. At this site, these hazardous substances are kept closed and '
            'are stored in a temperature-controlled cool room.',
      },
      'classKey': 'class_6_8',
    }) as Map<String, dynamic>;
    jobId = toInt(created['jobId']);
  }

  var full = await api.getJson('/api/jobs/$jobId') as Map<String, dynamic>;

  // Jobs created before contacts and substances were captured render rows
  // 10–13 blank. Backfill is idempotent by name on the server, so this is
  // safe to attempt on every open.
  final noContacts = ((full['contacts'] as List?) ?? const []).isEmpty;
  final noSubstances = ((full['substances'] as List?) ?? const []).isEmpty;
  if (noContacts || noSubstances) {
    await api.postJson('/api/jobs/$jobId/site-block', {
      'contacts': g2Contacts,
      'substances': g2Substances,
    });
    full = await api.getJson('/api/jobs/$jobId') as Map<String, dynamic>;
  }

  final inspections = (full['inspections'] as List?) ?? const [];
  final loc = full['location'] as Map<String, dynamic>;
  return ServerJob(
    jobId: jobId,
    hsLocationId: toInt(loc['id']),
    inspectionId: inspections.isEmpty ? null : toInt((inspections.first as Map)['id']),
    stage: full['stage'] as String,
    classKey: full['class_key'] as String?,
    findings: (full['findings'] as List?) ?? const [],
    raw: full,
  );
}

/// Build the local inspection model for the G2 job, attach sync, and make
/// sure it exists on the server (opening it if needed), then hydrate the
/// findings the server already holds so state survives a reload.
Future<Inspection> openG2Inspection(ApiClient api, SyncService sync) async {
  final job = await ensureG2Job(api);

  final insp = Inspection(
    locationName: 'G2 Chiller',
    pcbuName: 'Argenta Manufacturing Limited',
    siteAddress: '2 Sterling Avenue, Manurewa East, Auckland 2102',
    certifierName: CurrentUser.name,
    classKey: job.classKey ?? 'class_6_8',
    templates: [
      kTemplatesByCode['wks17-general']!,
      kTemplatesByCode['wks17-class-6-1a-6-1b-6-1c-8-2a-8']!,
    ],
  )..jobId = job.jobId;

  // Move the job to site_inspection if it is still at the front of the flow.
  // The server enforces legality; we only ask.
  const path = ['application', 'document_review', 'site_inspection'];
  if (job.stage == 'enquiry' || job.stage == 'application' || job.stage == 'document_review') {
    final start = job.stage == 'enquiry' ? 0 : path.indexOf(job.stage) + 1;
    for (final stage in path.sublist(start)) {
      await sync.outbox.enqueue('job.transition', {'jobId': job.jobId, 'toStage': stage});
    }
    await sync.flush();
  }

  sync.track(insp);
  if (job.inspectionId != null) {
    insp.inspectionId = job.inspectionId;
  } else {
    await sync.openInspection(insp, jobId: job.jobId, hsLocationId: job.hsLocationId);
  }

  // Hydrate what the server already knows without re-enqueueing it.
  insp.hydrate(job.findings.cast<Map<String, dynamic>>().map((f) => HydratedFinding(
        templateCode: f['template_code'] as String,
        sectionOrdinal: toInt(f['section_ordinal']),
        itemOrdinal: toInt(f['item_ordinal']),
        status: FindingStatus.fromWire(f['status'] as String),
        comment: f['comment'] as String? ?? '',
        verificationMethod: f['verification_method'] as String? ?? '',
        failureReason: f['failure_reason'] as String? ?? '',
        evidenceCount: f['evidence_count'] == null ? 0 : toInt(f['evidence_count']),
      )));

  // Rows 2–14 and the trailing blocks come from the same payload. On a job's
  // first open the inspection did not exist when the payload was fetched, so
  // row 11 falls back to what was just recorded locally.
  final sb = job.siteBlock();
  insp.siteBlock = sb.inspectionDate != null
      ? sb
      : SiteBlock(
          legalEntityName: sb.legalEntityName,
          tradingAsName: sb.tradingAsName,
          siteAddress: sb.siteAddress,
          postalAddress: sb.postalAddress,
          businessPhone: sb.businessPhone,
          website: sb.website,
          nzbn: sb.nzbn,
          industry: sb.industry,
          managerName: sb.managerName,
          inspectionDate: insp.inspectedAt,
          inspectionStatus: 'in_progress',
          directDial: sb.directDial,
          substanceNames: sb.substanceNames,
          hsLocation: sb.hsLocation,
          summary: sb.summary,
        );
  final si = job.inspection;
  if (si != null) {
    insp.declarationSignedAt =
        si['declaration_signed_at'] == null ? null : DateTime.tryParse('${si['declaration_signed_at']}');
    insp.declarationSignedBy = si['declaration_signed_by'] == null ? null : CurrentUser.name;
    insp.scopeConfirmedAt =
        si['scope_confirmed_at'] == null ? null : DateTime.tryParse('${si['scope_confirmed_at']}');
    insp.scopeConfirmedBy = si['scope_confirmed_by'] == null ? null : CurrentUser.name;
  }
  final cert = job.raw['certificate'];
  if (cert is Map) {
    insp.certificateDecision = cert['decision'] as String?;
    insp.requirementsNotMet = ((cert['requirements_not_met'] as List?) ?? const []).map((x) => '$x').toList();
    insp.conditions = ((cert['conditions'] as List?) ?? const []).map((x) => '$x').toList();
  }

  return insp;
}
