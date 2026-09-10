/// What the board shows above the job cards: what needs attention, and what
/// just happened, both computed on the server from the same rows every
/// device sees.
library;

int _int(Object? v) => v is int ? v : int.parse('$v');
DateTime? _d(Object? v) => v == null ? null : DateTime.tryParse('$v');

class Reminder {
  final String kind; // renewal | rfi | action | stalled
  final int jobId;
  final String client;
  final String location;
  final DateTime? when;
  final String text;
  const Reminder({required this.kind, required this.jobId, required this.client, required this.location, this.when, required this.text});

  factory Reminder.fromJson(Map<String, dynamic> j) => Reminder(
        kind: j['kind'] as String,
        jobId: _int(j['jobId']),
        client: j['client'] as String? ?? '',
        location: j['location'] as String? ?? '',
        when: _d(j['when']),
        text: j['text'] as String? ?? '',
      );
}

class ActivityItem {
  final String type;
  final DateTime? at;
  final String? userName;
  final int? jobId;
  final String? client;
  final String? location;
  final Map<String, dynamic> payload;
  const ActivityItem({required this.type, this.at, this.userName, this.jobId, this.client, this.location, this.payload = const {}});

  factory ActivityItem.fromJson(Map<String, dynamic> j) => ActivityItem(
        type: j['type'] as String,
        at: _d(j['occurred_at']),
        userName: j['user_name'] as String?,
        jobId: j['job_id'] == null ? null : _int(j['job_id']),
        client: j['client'] as String?,
        location: j['location'] as String?,
        payload: (j['payload'] as Map?)?.cast<String, dynamic>() ?? const {},
      );

  /// "signed the declaration", "moved the job to Final validation" …
  String get verb => describeEvent(type, payload);
}

/// One phrase per event type, for the activity strip and the job history.
String describeEvent(String type, Map<String, dynamic> p) => switch (type) {
      'finding.upsert' => 'recorded a finding (${_status(p['status'])}) on item ${p['sectionOrdinal']}.${p['itemOrdinal']}',
      'inspection.open' => 'opened the site inspection',
      'inspection.sign' => p['which'] == 'scope' ? 'confirmed the scope of authorisation' : 'signed the declaration',
      'job.transition' => 'moved the job to ${_stage(p['toStage'])}',
      'interest.declare' => p['conflictFound'] == true ? 'declared a conflict of interest' : 'declared no conflict of interest',
      'corrective_action.raise' => 'raised a ${p['severity']} corrective action',
      'corrective_action.update' => 'marked a corrective action ${_status(p['status'])}',
      'communication.record' => 'recorded a communication: ${p['summary'] ?? ''}',
      'evidence.attach' => 'attached evidence',
      _ => type,
    };

String _status(Object? s) => '${s ?? ''}'.replaceAll('_', ' ');
String _stage(Object? s) {
  final k = '${s ?? ''}';
  return k.isEmpty ? '' : k[0].toUpperCase() + k.substring(1).replaceAll('_', ' ');
}

class DashboardData {
  final List<Reminder> reminders;
  final List<ActivityItem> activity;
  final bool mailConfigured;
  const DashboardData({this.reminders = const [], this.activity = const [], this.mailConfigured = false});

  factory DashboardData.fromJson(Map<String, dynamic> j) => DashboardData(
        reminders: [for (final r in (j['reminders'] as List?) ?? const []) Reminder.fromJson((r as Map).cast<String, dynamic>())],
        activity: [for (final a in (j['activity'] as List?) ?? const []) ActivityItem.fromJson((a as Map).cast<String, dynamic>())],
        mailConfigured: j['mailConfigured'] == true,
      );
}

/// A sheet set as the catalogue describes it: a plain name, the templates,
/// and whether the signed-in certifier's WorkSafe authorisation covers it.
class SheetSet {
  final String key;
  final String name;
  final String? detail;
  final List<String> templates;
  final bool authorised;
  final String? regulation;
  const SheetSet({required this.key, required this.name, this.detail, required this.templates, required this.authorised, this.regulation});

  factory SheetSet.fromJson(Map<String, dynamic> j) => SheetSet(
        key: j['key'] as String,
        name: j['name'] as String,
        detail: j['detail'] as String?,
        templates: [for (final t in (j['templates'] as List?) ?? const []) '$t'],
        authorised: j['authorised'] == true,
        regulation: (j['authorisationEntry'] as Map?)?['regulation'] as String?,
      );
}
