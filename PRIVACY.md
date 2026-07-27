# Privacy

Last updated: 2026-07-27

Diet Tracker stores the profile details you enter, nutrition targets, custom
foods, weight, sleep, exercise, hydration, notes, and daily meal records. An
account-specific copy is cached in your browser and synchronized to the
authenticated user's single Firestore document at `/trackers/{uid}`.

Food descriptions submitted for an AI estimate are sent to Firebase AI Logic.
AI estimates are approximate and must not be treated as medical measurements.
Google/Firebase processes authentication and hosted application traffic under
its own terms.

Data remains until you remove it. Export creates a JSON copy on your device.
Import replaces the in-memory tracker data with the selected JSON file and
synchronizes it. “حذف كل بياناتي” deletes the tracker document and browser
cache, then signs out. It does not delete the user's Google account.

Do not submit exported health data, credentials, or private logs in a public
issue. For privacy or security questions, use the private reporting process in
[SECURITY.md](SECURITY.md).

This application is a general tracking tool, not medical advice, diagnosis, or
treatment. Consult a qualified clinician for health decisions.
