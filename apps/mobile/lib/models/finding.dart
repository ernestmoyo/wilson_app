/// A finding is the result recorded against one check sheet item during one
/// inspection.
///
/// This is the node that replaces the source workbook's font colour. The
/// spreadsheet encodes compliance as red text in the Comments column, which
/// IPS cl. 21(1)(c) — "the result of any inquiry, inspection, assessment, or
/// examination" — is not adequately served by: a colour cannot be queried,
/// counted or validated, and a copy-paste destroys it.
library;

/// The result of assessing one item. IPS cl. 21(1)(c).
enum FindingStatus {
  /// Not yet assessed. The default; an inspection is incomplete while any
  /// item is still pending.
  pending,

  /// The requirement is met.
  compliant,

  /// The requirement is not met. Red in the source workbook. Blocks a full
  /// grant until resolved or carried as a condition (reg 6.24).
  nonCompliant,

  /// The requirement does not apply to this location — e.g. thresholds not
  /// triggered. Must still be recorded; "N/A" is a finding, not a blank.
  notApplicable,

  /// Met subject to a condition on the certificate (reg 6.24).
  conditional;

  String get label => switch (this) {
        FindingStatus.pending => 'Pending',
        FindingStatus.compliant => 'Compliant',
        FindingStatus.nonCompliant => 'Non-compliant',
        FindingStatus.notApplicable => 'N/A',
        FindingStatus.conditional => 'Conditional',
      };

  /// Short form for dense list rows.
  String get shortLabel => switch (this) {
        FindingStatus.pending => '—',
        FindingStatus.compliant => 'C',
        FindingStatus.nonCompliant => 'NC',
        FindingStatus.notApplicable => 'N/A',
        FindingStatus.conditional => 'CD',
      };

  /// Whether this status blocks a full grant under reg 13.39.
  bool get blocksGrant => this == FindingStatus.nonCompliant || this == FindingStatus.pending;

  String get wireValue => switch (this) {
        FindingStatus.pending => 'pending',
        FindingStatus.compliant => 'compliant',
        FindingStatus.nonCompliant => 'non_compliant',
        FindingStatus.notApplicable => 'not_applicable',
        FindingStatus.conditional => 'conditional',
      };

  static FindingStatus fromWire(String v) => switch (v) {
        'compliant' => FindingStatus.compliant,
        'non_compliant' => FindingStatus.nonCompliant,
        'not_applicable' => FindingStatus.notApplicable,
        'conditional' => FindingStatus.conditional,
        _ => FindingStatus.pending,
      };
}

class Finding {
  /// Identifies the item this finding is against: template code + section and
  /// item ordinals. Stable across template revisions in a way a row number is
  /// not.
  final String templateCode;
  final int sectionOrdinal;
  final int itemOrdinal;

  FindingStatus status;

  /// The verbatim Comments column: what the certifier observed.
  String comment;

  /// IPS cl. 21(1)(e) — "the manner in which each requirement for the issue of
  /// a compliance certificate has been verified".
  String verificationMethod;

  /// IPS cl. 21(1)(f) — the reasons for any failure to meet certification
  /// requirements. Required whenever status is nonCompliant.
  String failureReason;

  /// Ids of evidence captured against this item.
  final List<String> evidenceIds;

  Finding({
    required this.templateCode,
    required this.sectionOrdinal,
    required this.itemOrdinal,
    this.status = FindingStatus.pending,
    this.comment = '',
    this.verificationMethod = '',
    this.failureReason = '',
    List<String>? evidenceIds,
  }) : evidenceIds = evidenceIds ?? [];

  String get key => '$templateCode/$sectionOrdinal/$itemOrdinal';

  /// A non-compliant finding without a stated reason is incomplete under
  /// IPS 21(1)(f); the UI surfaces this rather than letting it reach a
  /// certificate decision.
  bool get isIncomplete =>
      status == FindingStatus.nonCompliant && failureReason.trim().isEmpty;

  Map<String, dynamic> toJson() => {
        'templateCode': templateCode,
        'sectionOrdinal': sectionOrdinal,
        'itemOrdinal': itemOrdinal,
        'status': status.wireValue,
        'comment': comment,
        'verificationMethod': verificationMethod,
        'failureReason': failureReason,
        'evidenceIds': evidenceIds,
      };

  factory Finding.fromJson(Map<String, dynamic> j) => Finding(
        templateCode: j['templateCode'] as String,
        sectionOrdinal: j['sectionOrdinal'] as int,
        itemOrdinal: j['itemOrdinal'] as int,
        status: FindingStatus.fromWire(j['status'] as String? ?? 'pending'),
        comment: j['comment'] as String? ?? '',
        verificationMethod: j['verificationMethod'] as String? ?? '',
        failureReason: j['failureReason'] as String? ?? '',
        evidenceIds: (j['evidenceIds'] as List?)?.cast<String>().toList(),
      );
}
