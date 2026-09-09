import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import 'outbox.dart';

/// The wire to the server. One method per endpoint the app uses; nothing
/// clever. Identity travels in headers until real auth lands — the server
/// reads the same two headers, so this is the one place to change.
class ApiClient {
  final Uri baseUrl;
  final String deviceId;
  final int? userId;
  final http.Client _http;

  ApiClient({
    required this.baseUrl,
    required this.deviceId,
    this.userId,
    http.Client? httpClient,
  }) : _http = httpClient ?? http.Client();

  Map<String, String> get _headers => {
        'content-type': 'application/json',
        'x-device-id': deviceId,
        if (userId != null) 'x-user-id': '$userId',
      };

  Uri _u(String path) => baseUrl.resolve(path);

  /// POST /api/sync — the offline contract. Returns outcomes keyed by event id.
  Future<Map<String, SyncOutcome>> sync(List<SyncEvent> events) async {
    if (events.isEmpty) return {};
    final res = await _http.post(
      _u('/api/sync'),
      headers: _headers,
      body: jsonEncode({
        'deviceId': deviceId,
        if (userId != null) 'userId': userId,
        'events': events.map((e) => e.toWire()).toList(),
      }),
    );
    if (res.statusCode != 200) {
      throw ApiException(res.statusCode, _reason(res.body));
    }
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    final out = <String, SyncOutcome>{};
    for (final a in (body['applied'] as List? ?? const [])) {
      final m = a as Map<String, dynamic>;
      out[m['id'] as String] = SyncOutcome(
        status: 'applied',
        result: m['result'] == null ? null : Map<String, dynamic>.from(m['result'] as Map),
      );
    }
    for (final r in (body['rejected'] as List? ?? const [])) {
      final m = r as Map<String, dynamic>;
      out[m['id'] as String] = SyncOutcome(
        status: 'rejected',
        clause: m['clause'] as String?,
        reason: m['reason'] as String?,
      );
    }
    for (final d in (body['duplicate'] as List? ?? const [])) {
      final m = d as Map<String, dynamic>;
      final wasRejected = m['previousOutcome'] == 'rejected';
      out[m['id'] as String] = SyncOutcome(
        status: wasRejected ? 'rejected' : 'duplicate',
        clause: m['clause'] as String?,
        reason: m['reason'] as String?,
      );
    }
    return out;
  }

  /// GET /api/jobs/:id — everything needed to render a job.
  Future<Map<String, dynamic>> job(int jobId) async {
    final res = await _http.get(_u('/api/jobs/$jobId'), headers: _headers);
    if (res.statusCode != 200) throw ApiException(res.statusCode, _reason(res.body));
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  /// GET /api/jobs/:id/issuance-check — the server-authoritative "can grant".
  Future<IssuanceCheck> issuanceCheck(int jobId) async {
    final res = await _http.get(_u('/api/jobs/$jobId/issuance-check'), headers: _headers);
    if (res.statusCode != 200) throw ApiException(res.statusCode, _reason(res.body));
    final j = jsonDecode(res.body) as Map<String, dynamic>;
    return IssuanceCheck(
      canGrant: j['canGrant'] == true,
      canIssueConditional: j['canIssueConditional'] == true,
      unresolvedNonCompliances: (j['unresolvedNonCompliances'] as num?)?.toInt() ?? 0,
      blockers: ((j['blockers'] as List?) ?? const [])
          .map((b) => Blocker(
                clause: (b as Map)['clause'] as String?,
                reason: b['reason'] as String? ?? '',
              ))
          .toList(),
    );
  }

  /// POST /api/evidence/upload — raw bytes, content-addressed. The server
  /// recomputes the hash and refuses a mismatch, so the digest computed at
  /// capture is what is stored.
  Future<Map<String, dynamic>> uploadEvidence(
    Uint8List bytes, {
    required String mime,
    required String sha256,
  }) async {
    final res = await _http.post(
      _u('/api/evidence/upload'),
      headers: {..._headers, 'content-type': mime, 'x-sha256': sha256},
      body: bytes,
    );
    if (res.statusCode != 201) throw ApiException(res.statusCode, _reason(res.body));
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  Future<dynamic> getJson(String path) async {
    final res = await _http.get(_u(path), headers: _headers);
    if (res.statusCode != 200) throw ApiException(res.statusCode, _reason(res.body));
    return jsonDecode(res.body);
  }

  Future<dynamic> postJson(String path, Map<String, dynamic> body) async {
    final res = await _http.post(_u(path), headers: _headers, body: jsonEncode(body));
    if (res.statusCode != 200 && res.statusCode != 201) {
      throw ApiException(res.statusCode, _reason(res.body));
    }
    return jsonDecode(res.body);
  }

  Future<bool> health() async {
    try {
      final res = await _http.get(_u('/api/health'));
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  static String _reason(String body) {
    try {
      final j = jsonDecode(body) as Map<String, dynamic>;
      final clause = j['clause'];
      return clause == null ? '${j['error']}' : '$clause: ${j['error']}';
    } catch (_) {
      return body;
    }
  }

  void close() => _http.close();
}

class ApiException implements Exception {
  final int status;
  final String message;
  ApiException(this.status, this.message);
  @override
  String toString() => 'ApiException($status): $message';
}

class IssuanceCheck {
  final bool canGrant;
  final bool canIssueConditional;
  final int unresolvedNonCompliances;
  final List<Blocker> blockers;
  const IssuanceCheck({
    required this.canGrant,
    required this.canIssueConditional,
    required this.unresolvedNonCompliances,
    required this.blockers,
  });
}

class Blocker {
  final String? clause;
  final String reason;
  const Blocker({this.clause, required this.reason});
}
