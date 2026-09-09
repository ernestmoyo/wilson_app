import 'dart:math';

/// RFC 4122 version-4 UUID from a cryptographically secure source.
///
/// This is the idempotency key for every event the app sends. The server
/// applies an event once per id and treats replays as no-ops, so the id must
/// be generated on the device at the moment the mutation happens — never by
/// the server, and never regenerated on retry.
String uuidV4() {
  final rng = Random.secure();
  final b = List<int>.generate(16, (_) => rng.nextInt(256));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10xx
  final h = b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
  return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-'
      '${h.substring(16, 20)}-${h.substring(20)}';
}
