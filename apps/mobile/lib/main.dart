import 'package:flutter/material.dart';
import 'package:flutter_web_plugins/url_strategy.dart';

import 'app.dart';

export 'app.dart' show AppConfig, AppSession, AssureFieldApp, buildRouter;

void main() {
  // Real paths (/jobs/1) rather than /#/jobs/1: shareable, and the server
  // rewrites unknown paths to the app.
  usePathUrlStrategy();
  runApp(const AssureFieldApp());
}
