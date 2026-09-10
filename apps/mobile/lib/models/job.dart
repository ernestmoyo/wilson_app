/// The job as the server holds it: where it sits in the Assure Safety
/// compliance certification process flow, what it may legally do next, and
/// the records stages 5 to 8 turn on (corrective actions, interest
/// declaration, certificate, retention).
///
/// This is a read model. Every change goes out as a sync event or a POST and
/// the job is re-read; the screen never guesses at what the server decided.
library;

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
  const JobFinding({
    required this.id,
    required this.inspectionId,
    required this.templateCode,
    required this.sectionOrdinal,
    required this.itemOrdinal,
    required this.status,
    this.comment,
    this.failureReason,
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
  final List<String> allowedNext;
  final String clientName;
  final String locationName;
  final String? address;
  final int? inspectionId;
  final List<JobFinding> findings;
  final List<CorrectiveAction> correctiveActions;
  final List<StageTransition> transitions;
  final List<Communication> communications;
  final bool interestDeclared;
  final bool? conflictFound;
  final JobCertificate? certificate;
  final DateTime? retainUntil;

  const JobRecord({
    required this.id,
    required this.stage,
    required this.allowedNext,
    required this.clientName,
    required this.locationName,
    this.address,
    this.inspectionId,
    this.findings = const [],
    this.correctiveActions = const [],
    this.transitions = const [],
    this.communications = const [],
    this.interestDeclared = false,
    this.conflictFound,
    this.certificate,
    this.retainUntil,
  });

  List<JobFinding> get nonCompliances => findings.where((f) => f.status == 'non_compliant').toList();
  List<CorrectiveAction> actionsFor(int findingId) =>
      correctiveActions.where((c) => c.findingId == findingId).toList();
  int get pendingCount => findings.where((f) => f.status == 'pending').length;

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
