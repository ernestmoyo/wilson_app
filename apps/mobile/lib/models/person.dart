/// One person who may sign in: Person → Role. The server is the authority
/// on what the role allows; the app only shows or hides.
class Person {
  final int id;
  final String fullName;
  final String occupation;
  final String? email;
  final String role;
  final String? authorisationNumber;
  final bool active;
  final bool hasPasscode;

  const Person({
    required this.id,
    required this.fullName,
    required this.occupation,
    this.email,
    required this.role,
    this.authorisationNumber,
    this.active = true,
    this.hasPasscode = true,
  });

  factory Person.fromJson(Map<String, dynamic> j) => Person(
        id: (j['id'] as num).toInt(),
        fullName: j['fullName'] as String? ?? '',
        occupation: j['occupation'] as String? ?? '',
        email: j['email'] as String?,
        role: j['role'] as String? ?? 'viewer',
        authorisationNumber: j['authorisationNumber'] as String?,
        active: j['active'] != false,
        hasPasscode: j['hasPasscode'] != false,
      );
}
