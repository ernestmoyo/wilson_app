import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// The signed-in person, as the server described them at login. Kept on the
/// device so the app opens straight to the inspections; the server still
/// decides on every request whether the token is good.
class Session {
  final String token;
  final int userId;
  final String fullName;
  final String occupation;
  final String? email;
  final String? authorisationNumber;
  final DateTime? expiresAt;

  const Session({
    required this.token,
    required this.userId,
    required this.fullName,
    required this.occupation,
    this.email,
    this.authorisationNumber,
    this.expiresAt,
  });

  factory Session.fromLogin(Map<String, dynamic> j) {
    final u = (j['user'] as Map).cast<String, dynamic>();
    return Session(
      token: j['token'] as String,
      userId: u['id'] is int ? u['id'] as int : int.parse('${u['id']}'),
      fullName: u['fullName'] as String? ?? '',
      occupation: u['occupation'] as String? ?? '',
      email: u['email'] as String?,
      authorisationNumber: u['authorisationNumber'] as String?,
      expiresAt: j['expiresAt'] == null ? null : DateTime.tryParse('${j['expiresAt']}'),
    );
  }

  Map<String, dynamic> toJson() => {
        'token': token,
        'user': {
          'id': userId,
          'fullName': fullName,
          'occupation': occupation,
          'email': email,
          'authorisationNumber': authorisationNumber,
        },
        'expiresAt': expiresAt?.toIso8601String(),
      };
}

/// Where the session lives between launches. shared_preferences is
/// localStorage on web and app-private storage on Android and iOS.
abstract class SessionStore {
  Future<Session?> load();
  Future<void> save(Session s);
  Future<void> clear();
}

class PrefsSessionStore implements SessionStore {
  static const _key = 'assure.session';

  @override
  Future<Session?> load() async {
    try {
      final p = await SharedPreferences.getInstance();
      final raw = p.getString(_key);
      if (raw == null) return null;
      return Session.fromLogin(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> save(Session s) async {
    final p = await SharedPreferences.getInstance();
    await p.setString(_key, jsonEncode(s.toJson()));
  }

  @override
  Future<void> clear() async {
    final p = await SharedPreferences.getInstance();
    await p.remove(_key);
  }
}

class MemorySessionStore implements SessionStore {
  Session? _s;
  @override
  Future<Session?> load() async => _s;
  @override
  Future<void> save(Session s) async => _s = s;
  @override
  Future<void> clear() async => _s = null;
}
