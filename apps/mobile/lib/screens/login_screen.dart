import 'package:flutter/material.dart';

import '../auth/session.dart';
import '../sync/api_client.dart';
import '../theme.dart';
import '../widgets/ui.dart';

/// Sign in. One email, one passcode. The server answers with the person it
/// knows by that passcode; from then on every record carries that identity.
class LoginScreen extends StatefulWidget {
  final ApiClient api;
  final Future<void> Function(Session) onSignedIn;
  final String initialEmail;
  const LoginScreen({
    super.key,
    required this.api,
    required this.onSignedIn,
    this.initialEmail = 'compliancecertifier@assuresafety.co.nz',
  });

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  late final TextEditingController _email = TextEditingController(text: widget.initialEmail);
  final _passcode = TextEditingController();
  bool _busy = false;
  String? _error;

  Future<void> _submit() async {
    if (_passcode.text.isEmpty) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    var signedIn = false;
    try {
      final s = await widget.api.login(_email.text.trim(), _passcode.text);
      signedIn = true;
      await widget.onSignedIn(s);
    } on ApiException catch (e) {
      setState(() => _error = e.status == 401 ? 'Email or passcode not recognised.' : e.message);
    } catch (e) {
      // Before a 200 the server was never reached: say so. After it, the
      // sign-in worked and keeping the session failed: say that instead.
      setState(() => _error = signedIn
          ? 'Signed in, but the app could not keep the session: $e'
          : 'Could not reach the server at ${widget.api.baseUrl.host}. Check the connection and try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final field = t.bodyLarge?.copyWith(fontSize: 16) ?? const TextStyle(fontSize: 16);
    return Scaffold(
      backgroundColor: Neutral.canvas,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(Space.lg),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Container(
                key: const ValueKey('login-card'),
                padding: const EdgeInsets.fromLTRB(Space.xl, Space.xl, Space.xl, Space.lg),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(Radii.md),
                  border: Border.all(color: Neutral.line),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Image.asset('assets/brand/logo-white.png', height: 44, fit: BoxFit.contain),
                    ),
                    const SizedBox(height: Space.sm),
                    // The website's own line, so the app and assuresafety.co.nz
                    // read as one company.
                    Row(
                      children: [
                        Icon(Icons.verified_outlined, size: 16, color: Tone.good.fg),
                        const SizedBox(width: 6),
                        Flexible(
                          child: Text('WorkSafe-authorised compliance certification',
                              style: t.labelMedium?.copyWith(color: Tone.good.fg)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text('Whakapūmautia te Haumaru Aotearoa',
                        style: t.bodySmall?.copyWith(fontStyle: FontStyle.italic)),
                    const SizedBox(height: Space.lg),
                    Text('Sign in', style: t.headlineSmall),
                    const SizedBox(height: Space.xs),
                    Text(
                      'Records made in this app carry the name of the person signed in: '
                      'photographs (IPS 21(4)), signatures (21(5)) and verifications (reg 6.24).',
                      style: t.bodySmall?.copyWith(color: Neutral.muted),
                    ),
                    const SizedBox(height: Space.lg),
                    TextField(
                      controller: _email,
                      key: const ValueKey('login-email'),
                      keyboardType: TextInputType.emailAddress,
                      autocorrect: false,
                      style: field,
                      decoration: const InputDecoration(labelText: 'Email'),
                    ),
                    const SizedBox(height: Space.md),
                    TextField(
                      controller: _passcode,
                      key: const ValueKey('login-passcode'),
                      obscureText: true,
                      autofocus: true,
                      style: field,
                      onSubmitted: (_) => _submit(),
                      decoration: const InputDecoration(labelText: 'Passcode'),
                    ),
                    if (_error != null) Notice(_error!),
                    const SizedBox(height: Space.lg),
                    FilledButton(
                      key: const ValueKey('login-submit'),
                      onPressed: _busy ? null : _submit,
                      child: _busy
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Text('Sign in'),
                    ),
                    const SizedBox(height: Space.lg),
                    Text('Assure Safety Field · ${widget.api.baseUrl.host}', style: t.labelSmall, textAlign: TextAlign.center),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
