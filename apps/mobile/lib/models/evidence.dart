/// One version of one piece of evidence, as GET /api/jobs/:id reports it
/// (phase 2 package A, Tatenda Katai's answers of 20 Oct 2026, Q3 and Q4).
///
/// A replaced file is never deleted: the new version points at the one it
/// replaces ([supersedesId]) and only the newest is [current]. The reviewer
/// accepts the current version, or marks it not accepted with a note.
class EvidenceFile {
  final int id;
  final int? findingId;
  final String kind;
  final String? originalName;
  final String? storageKey;
  final String? sha256;
  final int? bytes;
  final String? capturedByName;
  final int version;
  final int? supersedesId;
  final String? uploadedByName;
  final DateTime? uploadedAt;

  /// submitted | accepted | not_accepted
  final String reviewState;
  final String? reviewedByName;
  final DateTime? reviewedAt;
  final String? reviewNote;
  final bool current;

  /// The row as the server sent it (storage key, hash, for opening the file).
  final Map<String, dynamic> raw;

  const EvidenceFile({
    required this.id,
    this.findingId,
    this.kind = 'photo',
    this.originalName,
    this.storageKey,
    this.sha256,
    this.bytes,
    this.capturedByName,
    this.version = 1,
    this.supersedesId,
    this.uploadedByName,
    this.uploadedAt,
    this.reviewState = 'submitted',
    this.reviewedByName,
    this.reviewedAt,
    this.reviewNote,
    this.current = true,
    this.raw = const {},
  });

  static int? _int(Object? v) => v == null ? null : (v is num ? v.toInt() : int.tryParse('$v'));
  static DateTime? _date(Object? v) => v == null ? null : DateTime.tryParse('$v');

  factory EvidenceFile.fromJson(Map<String, dynamic> j) => EvidenceFile(
        id: _int(j['id']) ?? 0,
        findingId: _int(j['finding_id']),
        kind: j['kind'] as String? ?? 'photo',
        originalName: j['original_name'] as String?,
        storageKey: j['storage_key'] as String?,
        sha256: j['sha256'] as String?,
        bytes: _int(j['bytes']),
        capturedByName: j['captured_by_name'] as String?,
        version: _int(j['version']) ?? 1,
        supersedesId: _int(j['supersedes_id']),
        uploadedByName: j['uploaded_by_name'] as String?,
        // An older server has no upload date: the capture date stands in.
        uploadedAt: _date(j['uploaded_at'] ?? j['captured_at']),
        reviewState: j['review_state'] as String? ?? 'submitted',
        reviewedByName: j['reviewed_by_name'] as String?,
        reviewedAt: _date(j['reviewed_at']),
        reviewNote: j['review_note'] as String?,
        // An older server knows no versions: every row is current.
        current: j['current'] is bool ? j['current'] as bool : true,
        raw: j,
      );

  bool get isDocument => kind == 'document';
  bool get isAccepted => reviewState == 'accepted';
  bool get isNotAccepted => reviewState == 'not_accepted';

  /// The name it arrived with, else what it is.
  String get title {
    final n = originalName?.trim();
    if (n != null && n.isNotEmpty) return n;
    return isDocument ? 'Document' : 'Photograph';
  }

  /// "Submitted", "Accepted", "Not accepted".
  String get reviewLabel => switch (reviewState) {
        'accepted' => 'Accepted',
        'not_accepted' => 'Not accepted',
        _ => 'Submitted',
      };

  /// "v2 · 20 Oct 2026 · Bryan Wilson": which version, uploaded when, by whom.
  String get versionLine => [
        'v$version',
        if (uploadedAt != null) formatDay(uploadedAt!),
        if ((uploadedByName ?? capturedByName ?? '').isNotEmpty) uploadedByName ?? capturedByName!,
      ].join(' · ');

  /// "Accepted by X on 20 Oct 2026" / "Not accepted by X: note".
  String? get reviewLine {
    if (reviewState == 'submitted') return null;
    final who = reviewedByName == null ? '' : ' by $reviewedByName';
    final when = reviewedAt == null ? '' : ' on ${formatDay(reviewedAt!)}';
    final note = (reviewNote ?? '').trim().isEmpty ? '' : ': ${reviewNote!.trim()}';
    return '$reviewLabel$who$when$note';
  }

  static const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /// "20 Oct 2026", in local time.
  static String formatDay(DateTime d) {
    final l = d.toLocal();
    return '${l.day} ${_months[l.month - 1]} ${l.year}';
  }

  /// The versions [current] replaced, newest first.
  static List<EvidenceFile> previousVersions(EvidenceFile current, Iterable<EvidenceFile> all) {
    final byId = {for (final e in all) e.id: e};
    final out = <EvidenceFile>[];
    var at = current.supersedesId;
    while (at != null && byId.containsKey(at) && out.length < 1000) {
      final e = byId[at]!;
      out.add(e);
      at = e.supersedesId;
    }
    return out;
  }
}
