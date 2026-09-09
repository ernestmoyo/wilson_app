import 'generated/checksheets.g.dart';
import 'models/finding.dart';
import 'models/inspection.dart';
import 'sync/api_client.dart';
import 'sync/sync_service.dart';

/// The certifier the app runs as until real auth lands. Mirrors the server's
/// seeded user id 1 — IPS 21(4)(a) needs both the name and the occupation on
/// every photograph, so both live here, once.
class CurrentUser {
  static const int id = 1;
  static const String name = 'Bryan Wilson';
  static const String occupation = 'Compliance certifier';
}

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
  const ServerJob({
    required this.jobId,
    required this.hsLocationId,
    required this.inspectionId,
    required this.stage,
    required this.classKey,
    required this.findings,
  });
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
      },
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

  final full = await api.getJson('/api/jobs/$jobId') as Map<String, dynamic>;
  final inspections = (full['inspections'] as List?) ?? const [];
  final loc = full['location'] as Map<String, dynamic>;
  return ServerJob(
    jobId: jobId,
    hsLocationId: toInt(loc['id']),
    inspectionId: inspections.isEmpty ? null : toInt((inspections.first as Map)['id']),
    stage: full['stage'] as String,
    classKey: full['class_key'] as String?,
    findings: (full['findings'] as List?) ?? const [],
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

  return insp;
}
