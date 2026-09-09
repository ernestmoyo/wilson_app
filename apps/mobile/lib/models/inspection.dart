import 'package:flutter/foundation.dart';

import '../generated/checksheets.g.dart';
import 'finding.dart';

/// One inspection of one hazardous substance location, against one or more
/// check sheet templates.
///
/// Fields carry their IPS 2019 clause where the regulation mandates them. An
/// inspection missing any of them is not a complete record, regardless of how
/// many check sheet items have been ticked.
class Inspection extends ChangeNotifier {
  /// IPS 21(1)(a) — "the unique identification or description of any item or
  /// location inquired into". e.g. "G2 Chiller".
  final String locationName;

  final String pcbuName;
  final String siteAddress;

  /// IPS 21(1)(b) — the date of the inspection.
  final DateTime inspectedAt;

  /// IPS 21(1)(d) — "the details of any equipment or facilities used".
  /// The source workbook's declaration records "an iPad and tape measure".
  String equipmentUsed;

  /// IPS 21(1)(g) — where someone inspects on behalf of the certifier, their
  /// name and whether they were supervised must both be recorded.
  final String certifierName;
  String conductedByName;
  bool supervised;

  /// Which class-specific templates apply, alongside the general sheet.
  /// Drives the class overlay on regulation references.
  final String? classKey;

  final List<ChecksheetTemplate> templates;
  final Map<String, Finding> _findings = {};

  /// Server identities, set once the job and inspection exist there. Findings
  /// cannot sync until `inspectionId` is known — they reference it.
  int? jobId;
  int? inspectionId;

  /// Called after every finding change. The sync layer attaches here to queue
  /// a `finding.upsert`; the model itself stays ignorant of the network.
  void Function(Finding)? onFindingChanged;

  Inspection({
    required this.locationName,
    required this.pcbuName,
    required this.siteAddress,
    required this.certifierName,
    required this.templates,
    DateTime? inspectedAt,
    this.equipmentUsed = 'iPad, tape measure',
    this.conductedByName = '',
    this.supervised = false,
    this.classKey,
  }) : inspectedAt = inspectedAt ?? DateTime.now();

  /// Findings are created lazily; an item with no finding yet is pending.
  Finding findingFor(ChecksheetTemplate t, ChecksheetSection s, ChecksheetItem i) {
    final key = '${t.code}/${s.ordinal}/${i.ordinal}';
    return _findings.putIfAbsent(
      key,
      () => Finding(
        templateCode: t.code,
        sectionOrdinal: s.ordinal,
        itemOrdinal: i.ordinal,
      ),
    );
  }

  void update(Finding f, void Function(Finding) change) {
    change(f);
    _findings[f.key] = f;
    notifyListeners();
    onFindingChanged?.call(f);
  }

  /// Load findings the server already holds, WITHOUT firing onFindingChanged —
  /// these came from the server, so re-enqueueing them would be a loop.
  void hydrate(Iterable<HydratedFinding> rows) {
    for (final r in rows) {
      final t = templates.where((x) => x.code == r.templateCode).firstOrNull;
      if (t == null) continue;
      final s = t.sections.where((x) => x.ordinal == r.sectionOrdinal).firstOrNull;
      if (s == null) continue;
      final i = s.items.where((x) => x.ordinal == r.itemOrdinal).firstOrNull;
      if (i == null) continue;
      final f = findingFor(t, s, i);
      f.status = r.status;
      f.comment = r.comment;
      f.verificationMethod = r.verificationMethod;
      f.failureReason = r.failureReason;
      f.evidenceIds
        ..clear()
        ..addAll(List.generate(r.evidenceCount, (k) => 'server-$k'));
    }
    notifyListeners();
  }

  Iterable<Finding> get findings => _findings.values;

  int get totalItems => templates.fold(0, (n, t) => n + t.itemCount);

  int countWhere(FindingStatus s) {
    if (s == FindingStatus.pending) {
      // Items never touched are pending too, not just explicitly-pending ones.
      final assessed = _findings.values.where((f) => f.status != FindingStatus.pending).length;
      return totalItems - assessed;
    }
    return _findings.values.where((f) => f.status == s).length;
  }

  int get assessedCount => totalItems - countWhere(FindingStatus.pending);
  double get progress => totalItems == 0 ? 0 : assessedCount / totalItems;

  /// Non-compliances recorded without the reason IPS 21(1)(f) requires.
  Iterable<Finding> get incompleteFindings => _findings.values.where((f) => f.isIncomplete);

  /// reg 13.39 — a full grant requires no unresolved non-compliances and no
  /// unassessed items. Surfaced in the UI so the decision is never guesswork.
  bool get canGrant =>
      countWhere(FindingStatus.pending) == 0 &&
      countWhere(FindingStatus.nonCompliant) == 0;

  Map<String, dynamic> toJson() => {
        'jobId': jobId,
        'inspectionId': inspectionId,
        'locationName': locationName,
        'pcbuName': pcbuName,
        'siteAddress': siteAddress,
        'inspectedAt': inspectedAt.toIso8601String(),
        'equipmentUsed': equipmentUsed,
        'certifierName': certifierName,
        'conductedByName': conductedByName,
        'supervised': supervised,
        'classKey': classKey,
        'templateCodes': templates.map((t) => t.code).toList(),
        'findings': _findings.values.map((f) => f.toJson()).toList(),
      };
}

/// A finding as the server reports it — the shape of GET /api/jobs/:id.
class HydratedFinding {
  final String templateCode;
  final int sectionOrdinal;
  final int itemOrdinal;
  final FindingStatus status;
  final String comment;
  final String verificationMethod;
  final String failureReason;
  final int evidenceCount;
  const HydratedFinding({
    required this.templateCode,
    required this.sectionOrdinal,
    required this.itemOrdinal,
    required this.status,
    required this.comment,
    required this.verificationMethod,
    required this.failureReason,
    required this.evidenceCount,
  });
}
