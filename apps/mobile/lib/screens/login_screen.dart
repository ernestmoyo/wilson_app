import 'package:flutter/material.dart';

import '../auth/session.dart';
import '../sync/api_client.dart';
import '../theme.dart';
import '../widgets/brand_bar.dart';

/// Sign in. One email, one passcode. The server answers with the person it
/// knows by that passcode; from then on every record carries that identity.
class LoginScreen extends StatefulWidget {
  final ApiClient api;
  final void Function(Session) onSignedIn;
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
    try {
      final s = await widget.api.login(_email.text.trim(), _passcode.text);
      widget.onSignedIn(s);
    } on ApiException catch (e) {
      setState(() => _error = e.status == 401 ? 'Email or passcode not recognised.' : e.message);
    } catch (e) {
      setState(() => _error = 'Could not reach the server. Check the connection and try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: const BrandBar(title: 'Sign in', subtitle: 'Assure Safety Field'),
        body: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.all(24),
              children: [
                const Text(
                  'Records made in this app carry the name of the person signed in: '
                  'photographs (IPS 21(4)), signatures (21(5)) and verifications (reg 6.24).',
                  style: TextStyle(fontSize: 12.5, color: Colors.black54),
                ),
                const SizedBox(height: 20),
                TextField(
                  controller: _email,
                  key: const ValueKey('login-email'),
                  keyboardType: TextInputType.emailAddress,
                  autocorrect: false,
                  decoration: const InputDecoration(labelText: 'Email'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _passcode,
                  key: const ValueKey('login-passcode'),
                  obscureText: true,
                  autofocus: true,
                  onSubmitted: (_) => _submit(),
                  decoration: const InputDecoration(labelText: 'Passcode'),
                ),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Text(_error!, style: const TextStyle(color: Brand.nonCompliant, fontSize: 13)),
                  ),
                const SizedBox(height: 20),
                FilledButton(
                  key: const ValueKey('login-submit'),
                  onPressed: _busy ? null : _submit,
                  child: _busy
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Text('Sign in'),
                ),
                const SizedBox(height: 16),
                Text('Server: ${widget.api.baseUrl}', style: const TextStyle(fontSize: 11, color: Colors.black45)),
              ],
            ),
          ),
        ),
      );
}
