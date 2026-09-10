/// The job as the server holds it: where it sits in the Assure Safety
/// compliance certification process flow, what it may legally do next, and
/// the records stages 5 to 8 turn on (corrective actions, interest
/// declaration, certificate, retention).
///
/// This is a read model. Every change goes out as a sync event or a POST and
/// the job is re-read; the screen never guesses at what the server decided.
library;

import 'dashboard.dart' show describeEvent;

/// node-postgres hands int8 over as strings; accept either.
int _int(Object? v) => v is int ? v : int.parse("$v");

/// The eight stages of the process flow document, in order, with the
/// document's own headings. The database adds the loop and exit states
/// (rfi, gap_closure, closed, referred), which are shown under their parent.
class ProcessStage {
  final int number;
  final String key;
  final String title;
  const ProcessStage(this.number, this.key, this.title);

  static const flow = [
    ProcessStage(1, 'enquiry', 'Enquiry & Initial Triage'),
    ProcessStage(2, 'application', 'Application & Proposal'),
    ProcessStage(3, 'document_review', 'Document Review (Desktop Assessment)'),
    ProcessStage(4, 'site_inspection', 'Site Inspection'),
    ProcessStage(5, 'compliance_evaluation', 'Compliance Evaluation & Gap Closure'),
    ProcessStage(6, 'final_validation', 'Final Validation'),
    ProcessStage(7, 'certificate_issued', 'Certificate Issuance & Recordkeeping'),
    ProcessStage(8, 'monitoring', 'Ongoing Support & Renewal'),
  ];

  /// Which numbered stage a database state belongs to.
  static int numberOf(String key) => switch (key) {
        'rfi' => 3,
        'gap_closure' => 5,
        'closed' || 'referred' => 0,
        _ => flow.firstWhere((s) => s.key == key, orElse: () => flow.first).number,
      };

  /// Human label for any database state, including the loops and exits.
  static String label(String key) => switch (key) {
        'rfi' => 'Request for further information',
        'gap_closure' => 'Gap closure (client remediating)',
        'closed' => 'Closed',
        'referred' => 'Referred (out of scope)',
        _ => flow.firstWhere((s) => s.key == key, orElse: () => ProcessStage(0, key, key)).title,
      };

  /// Short form for chips and cards.
  static String short(String key) => switch (key) {
        'enquiry' => 'Enquiry',
        'application' => 'Application',
        'document_review' => 'Document review',
        'rfi' => 'Awaiting information',
        'site_inspection' => 'Site inspection',
        'compliance_evaluation' => 'Compliance evaluation',
        'gap_closure' => 'Gap closure',
        'final_validation' => 'Final validation',
        'certificate_issued' => 'Certificate issued',
        'monitoring' => 'Monitoring',
        'closed' => 'Closed',
        'referred' => 'Referred',
        _ => key,
      };

  /// What the button that moves a job to [next] should say: a verb, not a
  /// document heading.
  static String moveLabel(String from, String next) => switch (next) {
        'application' => 'Accept enquiry, start application',
        'document_review' => from == 'rfi' ? 'Information received, resume review' : 'Start document review',
        'rfi' => 'Request further information',
        'site_inspection' => from == 'final_validation' ? 'Send back for re-inspection' : 'Start site inspection',
        'compliance_evaluation' => from == 'gap_closure' ? 'Client done, re-evaluate' : 'Start compliance evaluation',
        'gap_closure' => 'Hand to client for gap closure',
        'final_validation' => 'Start final validation',
        'certificate_issued' => 'Issue certificate',
        'monitoring' => 'Certificate sent, start monitoring',
        'enquiry' => 'Renewal: open a new enquiry',
        'closed' => 'Close job',
        'referred' => 'Out of scope, refer elsewhere',
        _ => label(next),
      };

  /// The one line a certifier reads first: what this job needs now.
  static String nextAction(String stage, {int itemTotal = 0, int assessed = 0, int nonCompliant = 0,
      bool interestDeclared = false, int openActions = 0, String? certificateDecision}) {
    final pending = itemTotal - assessed;
    return switch (stage) {
      'enquiry' => 'Triage the enquiry: in scope, urgent?',
      'application' => 'Send the application pack and quote',
      'document_review' => 'Review the documents; request anything missing',
      'rfi' => 'Waiting on the client for further information',
      'site_inspection' => itemTotal == 0
          ? 'Start the site inspection'
          : pending > 0
              ? 'Continue the inspection: $assessed of $itemTotal items assessed'
              : 'Inspection complete: start compliance evaluation',
      'compliance_evaluation' => nonCompliant > 0
          ? '$nonCompliant non-compliance${nonCompliant == 1 ? '' : 's'}: raise and track corrective actions'
          : 'No non-compliances: start final validation',
      'gap_closure' => openActions > 0
          ? 'Client remediating: $openActions action${openActions == 1 ? '' : 's'} still open'
          : 'Client remediating',
      'final_validation' => !interestDeclared
          ? 'Answer the register of interests, then run the issuance check'
          : 'Run the issuance check and issue the certificate',
      'certificate_issued' => 'Send the certificate to the client, then start monitoring',
      'monitoring' => certificateDecision == 'conditional'
          ? 'Conditional certificate: follow up the conditions'
          : 'Renewal reminder 3 to 6 months before expiry',
      'closed' => 'Closed',
      'referred' => 'Referred to another provider',
      _ => '',
    };
  }
}

/// One row of the jobs board, as GET /api/jobs returns it.
class JobSummary {
  final int id;
  final String stage;
  final String? classKey;
  final String clientName;
  final String? tradingName;
  final String locationName;
  final String? address;
  final DateTime? openedAt;
  final int? inspectionId;
  final int itemTotal;
  final int assessed;
  final int nonCompliant;
  final String? certificateDecision;
  final DateTime? lastActivity;

  const JobSummary({
    required this.id,
    required this.stage,
    this.classKey,
    required this.clientName,
    this.tradingName,
    required this.locationName,
    this.address,
    this.openedAt,
    this.inspectionId,
    this.itemTotal = 0,
    this.assessed = 0,
    this.nonCompliant = 0,
    this.certificateDecision,
    this.lastActivity,
  });

  int get pending => itemTotal - assessed;
  String get nextAction => ProcessStage.nextAction(stage,
      itemTotal: itemTotal, assessed: assessed, nonCompliant: nonCompliant, certificateDecision: certificateDecision);

  factory JobSummary.fromJson(Map<String, dynamic> j) => JobSummary(
        id: _int(j['id']),
        stage: j['stage'] as String,
        classKey: j['class_key'] as String?,
        clientName: j['client'] as String? ?? '',
        tradingName: j['trading_name'] as String?,
        locationName: j['location'] as String? ?? '',
        address: j['address'] as String?,
        openedAt: j['opened_at'] == null ? null : DateTime.tryParse('${j['opened_at']}'),
        inspectionId: j['inspection_id'] == null ? null : _int(j['inspection_id']),
        itemTotal: j['item_total'] == null ? 0 : _int(j['item_total']),
        assessed: j['assessed'] == null ? 0 : _int(j['assessed']),
        nonCompliant: j['non_compliant'] == null ? 0 : _int(j['non_compliant']),
        certificateDecision: j['certificate_decision'] as String?,
        lastActivity: j['last_activity'] == null ? null : DateTime.tryParse('${j['last_activity']}'),
      );
}

class JobFinding {
  final int id;
  final int inspectionId;
  final String templateCode;
  final int sectionOrdinal;
  final int itemOrdinal;
  final String status;
  final String? comment;
  final String? failureReason;
  final DateTime? updatedAt;
  const JobFinding({
    required this.id,
    required this.inspectionId,
    required this.templateCode,
    required this.sectionOrdinal,
    required this.itemOrdinal,
    required this.status,
    this.comment,
    this.failureReason,
    this.updatedAt,
  });

  String get ref => '${templateCode == 'wks17-general' ? 'General' : 'Class sheet'} '
      '$sectionOrdinal.$itemOrdinal';
}

class CorrectiveAction {
  final int id;
  final int findingId;
  final String severity;
  final String description;
  final DateTime? dueDate;
  final String status;
  final int? reverifiedBy;
  final DateTime? reverifiedAt;
  const CorrectiveAction({
    required this.id,
    required this.findingId,
    required this.severity,
    required this.description,
    this.dueDate,
    required this.status,
    this.reverifiedBy,
    this.reverifiedAt,
  });

  bool get isVerified => status == 'verified';
}

/// IPS 21(2)(a): a communication with the applicant. Stages 1 to 3 of the
/// process flow (enquiry, application pack, RFI) are made of these.
class Communication {
  final int id;
  final String direction;
  final String medium;
  final String party;
  final String summary;
  final String? body;
  final DateTime? at;
  const Communication({
    required this.id,
    required this.direction,
    required this.medium,
    required this.party,
    required this.summary,
    this.body,
    this.at,
  });
}

/// One line of the audit trail: who did what, when, and whether the server
/// took it (IPS 22).
class JobEvent {
  final String type;
  final DateTime? at;
  final String? userName;
  final String? userRole;
  final String outcome;
  final String? clause;
  final Map<String, dynamic> payload;
  const JobEvent({required this.type, this.at, this.userName, this.userRole, required this.outcome, this.clause, this.payload = const {}});
  String get verb => describeEvent(type, payload);
}

class StageTransition {
  final String? from;
  final String to;
  final DateTime? at;
  final String? reason;
  const StageTransition({this.from, required this.to, this.at, this.reason});
}

class JobCertificate {
  final int id;
  final String decision;
  final String? registerNumber;
  final String? certificateNumber;
  final DateTime? issueDate;
  final DateTime? inForceDate;
  final DateTime? expiryDate;
  final List<String> conditions;
  final List<String> requirementsNotMet;
  final DateTime? worksafeRegisterDue;
  const JobCertificate({
    required this.id,
    required this.decision,
    this.registerNumber,
    this.certificateNumber,
    this.issueDate,
    this.inForceDate,
    this.expiryDate,
    this.conditions = const [],
    this.requirementsNotMet = const [],
    this.worksafeRegisterDue,
  });
}

class JobRecord {
  final int id;
  final String stage;
  final String? classKey;
  final List<String> allowedNext;
  final String clientName;
  final String locationName;
  final String? address;
  final int? inspectionId;
  final List<JobFinding> findings;
  final List<CorrectiveAction> correctiveActions;
  final List<StageTransition> transitions;
  final List<Communication> communications;
  final List<JobEvent> events;
  final String? managerEmail;
  final bool interestDeclared;
  final bool? conflictFound;
  final JobCertificate? certificate;
  final DateTime? retainUntil;

  const JobRecord({
    required this.id,
    required this.stage,
    this.classKey,
    required this.allowedNext,
    required this.clientName,
    required this.locationName,
    this.address,
    this.inspectionId,
    this.findings = const [],
    this.correctiveActions = const [],
    this.transitions = const [],
    this.communications = const [],
    this.events = const [],
    this.managerEmail,
    this.interestDeclared = false,
    this.conflictFound,
    this.certificate,
    this.retainUntil,
  });

  List<JobFinding> get nonCompliances => findings.where((f) => f.status == 'non_compliant').toList();
  List<CorrectiveAction> actionsFor(int findingId) =>
      correctiveActions.where((c) => c.findingId == findingId).toList();
  int get pendingCount => findings.where((f) => f.status == 'pending').length;
  int get assessedCount => findings.where((f) => f.status != 'pending').length;
  int get openActions => correctiveActions.where((c) => !c.isVerified).length;

  static DateTime? _d(Object? v) => v == null ? null : DateTime.tryParse('$v');
  static List<String> _strings(Object? v) =>
      v is List ? v.map((e) => '$e').where((e) => e.isNotEmpty).toList() : const [];

  factory JobRecord.fromJson(Map<String, dynamic> j) {
    final client = (j['client'] as Map?)?.cast<String, dynamic>() ?? const {};
    final loc = (j['location'] as Map?)?.cast<String, dynamic>() ?? const {};
    final inspections = (j['inspections'] as List?) ?? const [];
    final interests = (j['interestDeclarations'] as List?) ?? const [];
    final cert = (j['certificate'] as Map?)?.cast<String, dynamic>();
    final ret = (j['retention'] as Map?)?.cast<String, dynamic>();
    return JobRecord(
      id: _int(j['id']),
      stage: j['stage'] as String,
      classKey: j['class_key'] as String?,
      allowedNext: _strings(j['allowedNext']),
      clientName: client['legalName'] as String? ?? '',
      locationName: loc['name'] as String? ?? '',
      address: loc['address'] as String?,
      inspectionId: inspections.isEmpty ? null : _int((inspections.first as Map)['id']),
      findings: [
        for (final f in (j['findings'] as List?) ?? const [])
          JobFinding(
            id: _int(f['id']),
            inspectionId: _int(f['inspection_id']),
            templateCode: f['template_code'] as String,
            sectionOrdinal: _int(f['section_ordinal']),
            itemOrdinal: _int(f['item_ordinal']),
            status: f['status'] as String,
            comment: f['comment'] as String?,
            failureReason: f['failure_reason'] as String?,
            updatedAt: _d(f['updated_at']),
          ),
      ],
      correctiveActions: [
        for (final c in (j['correctiveActions'] as List?) ?? const [])
          CorrectiveAction(
            id: _int(c['id']),
            findingId: _int(c['finding_id']),
            severity: c['severity'] as String,
            description: c['description'] as String? ?? '',
            dueDate: _d(c['due_date']),
            status: c['status'] as String,
            reverifiedBy: c['reverified_by'] == null ? null : _int(c['reverified_by']),
            reverifiedAt: _d(c['reverified_at']),
          ),
      ],
      transitions: [
        for (final t in (j['transitions'] as List?) ?? const [])
          StageTransition(
            from: t['from_stage'] as String?,
            to: t['to_stage'] as String,
            at: _d(t['occurred_at']),
            reason: t['reason'] as String?,
          ),
      ],
      communications: [
        for (final c in (j['communications'] as List?) ?? const [])
          Communication(
            id: _int(c['id']),
            direction: c['direction'] as String,
            medium: c['medium'] as String,
            party: c['party'] as String? ?? '',
            summary: c['summary'] as String? ?? '',
            body: c['body'] as String?,
            at: _d(c['occurred_at']),
          ),
      ],
      events: [
        for (final e in (j['events'] as List?) ?? const [])
          JobEvent(
            type: e['type'] as String,
            at: _d(e['occurred_at']),
            userName: e['user_name'] as String?,
            userRole: e['user_role'] as String?,
            outcome: e['outcome'] as String? ?? 'applied',
            clause: e['reject_clause'] as String?,
            payload: (e['payload'] as Map?)?.cast<String, dynamic>() ?? const {},
          ),
      ],
      managerEmail: (() {
        final contacts = (j['contacts'] as List?) ?? const [];
        for (final c in contacts) {
          final email = (c as Map)['email'];
          if (email != null && '$email'.isNotEmpty) return '$email';
        }
        return null;
      })(),
      interestDeclared: interests.isNotEmpty,
      conflictFound: interests.isEmpty ? null : (interests.first as Map)['conflict_found'] == true,
      certificate: cert == null
          ? null
          : JobCertificate(
              id: _int(cert['id']),
              decision: cert['decision'] as String,
              registerNumber: cert['register_number'] as String?,
              certificateNumber: cert['certificate_number'] as String?,
              issueDate: _d(cert['issue_date']),
              inForceDate: _d(cert['in_force_date']),
              expiryDate: _d(cert['expiry_date']),
              conditions: _strings(cert['conditions']),
              requirementsNotMet: _strings(cert['requirements_not_met']),
              worksafeRegisterDue: _d(cert['worksafe_register_due']),
            ),
      retainUntil: _d(ret?['retain_until']),
    );
  }
}
