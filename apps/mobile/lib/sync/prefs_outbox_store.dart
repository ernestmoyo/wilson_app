import 'package:shared_preferences/shared_preferences.dart';

import 'outbox.dart';

/// The outbox on disk. localStorage on web, app-private storage on Android
/// and iOS. A change queued in the chiller with no signal must still be there
/// after the app is killed, the tab is refreshed, or the phone is swapped for
/// the laptop and back.
class PrefsOutboxStore implements OutboxStore {
  final String key;
  PrefsOutboxStore({this.key = 'assure.outbox'});

  @override
  Future<String?> read() async {
    try {
      return (await SharedPreferences.getInstance()).getString(key);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> write(String json) async {
    try {
      await (await SharedPreferences.getInstance()).setString(key, json);
    } catch (_) {
      // A store that cannot write costs persistence, not the change itself:
      // the in-memory queue still sends on the next flush.
    }
  }
}
