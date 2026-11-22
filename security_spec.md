# Security Specification — Claudia Rodrigues Studio Firestore Rules

## 1. Data Invariants
1. **Default Deny**: All unmatched paths are strictly denied (`allow read, write: if false`).
2. **Strict PII Isolation**: Appointments contain sensitive client PII (`clientName`, `clientCpf`, `clientPhone`). Only the booking owner (`ownerId == request.auth.uid`) or the verified studio admin (`onegretedesign@gmail.com` with `email_verified == true` or trusted `/admins/{uid}` entry) may `get`, `list`, `update`, or `delete` an appointment.
3. **Strict Schema Lockstep**: Every appointment must contain the exact 21 keys declared in `firebase-blueprint.json` (`hasAll` + `hasOnly`), including formatted CPF (`^\d{3}\.\d{3}\.\d{3}-\d{2}$`, exact length 14), Google Calendar event metadata (`googleCalendarEventId <= 256`, `googleCalendarHtmlLink` empty or `https://` `<= 512`), and boolean `ownerSeen`.
4. **Immutable Ownership & Timestamps**: `ownerId` and `createdAt` can never be mutated on update; `createdAt == request.time` on create and `updatedAt == request.time` on create/update.
5. **Owner Notification Integrity**: Regular clients must create appointments with `ownerSeen == false` and cannot mark their own booking as seen by the owner (`ownerSeen` is admin-only on update).
6. **Terminal State Locking**: Non-admin clients cannot update an appointment once `status` is `completed` or `cancelled`. Verified studio admin (`isAdmin()`) retains full reschedule, cancel, mark-seen, and delete control.
7. **Cost-Safe List Queries**: `allow list` on `/appointments` validates `resource.data.ownerId == request.auth.uid || isBootstrapAdmin()` without invoking `get()` or `exists()`.

## 2. The "Dirty Dozen" Adversarial Payloads (All Must Return PERMISSION_DENIED)
1. **Identity Spoofing**: Client creates appointment with `ownerId: "victim_uid"` != `request.auth.uid`.
2. **Shadow Field Injection**: Client creates/updates appointment adding `{ isAdmin: true }` or `{ verified: true }`.
3. **Malformed CPF Poisoning**: Client submits `clientCpf: "12345"` or 500-char string instead of `000.000.000-00`.
4. **JavaScript Scheme Link Injection**: Client submits `googleCalendarHtmlLink: "javascript:alert(1)"`.
5. **Owner Notification Spoofing on Create**: Client creates appointment with `ownerSeen: true` to hide booking from owner inbox.
6. **Owner Notification Tampering on Update**: Client updates `ownerSeen: true` on their own appointment.
7. **Email Spoofing**: Attacker authenticates with `email: "onegretedesign@gmail.com"` and `email_verified: false`.
8. **Cross-Client PII Read**: Authenticated client B attempts `get` or `list` on client A's appointment containing CPF and phone.
9. **Path ID Poisoning**: Attacker writes to `/appointments/` with a 300-character or special-character document ID.
10. **Terminal State Mutation**: Client attempts to reschedule or re-confirm a `cancelled` or `completed` appointment.
11. **Timestamp Forgery**: Client creates appointment with backdated `createdAt` != `request.time`.
12. **Self-Assigned Admin Role**: Client attempts `create` on `/admins/{uid}` with `{ role: "admin" }`.
