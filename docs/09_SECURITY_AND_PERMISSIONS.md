# 09 — Security, Privacy, and Permissions

## 1. Enforcement

Firebase Auth identifies users. Firestore Rules enforce field allowlists, types, ownership, role, account status, verification, and transitions. Treat all client input, scores, locations and photos as untrusted. Deny access by default. Grant admin custom claims through an authorized local operator using credentials kept outside both apps and Git. Review actions require a matching immutable audit in the same write.

## 2. Access

| Data or action | Allowed actor |
|---|---|
| Private account and verification status | Self or claimed admin. Public signup cannot alter protected fields or assign admin |
| Draft listing and photo | Active approved owning donor for writes. Owner/admin can read independently of discovery |
| Discover open listings | Active approved organization. Query constraints must match Rules |
| Assigned or closed listing | Owner and admin. An organization can read a listing it participated in through its own request where needed for history |
| Read requests | Owning donor or admin can list requests for one listing. Organization can read its own request |
| Submit or withdraw a pending request | Active approved organization for its own UID |
| Approve a request | Active approved owning donor only |
| Confirm handover | Active approved assigned organization only |
| Complete collection | Active approved owning donor with recent assigned-recipient confirmation |
| Reconcile an overdue listing | Owning donor, claimed admin, or assigned organization after deadline |

Restrict request location, private identity and verification details to authorized parties. An organization reading a listing or photo does not gain access to requests from other organizations. Use synthetic business locations and profile data in the demo.

## 3. Single assignment invariant

An open listing has no selected recipient. An assigned listing has exactly one matching approved request. Acceptance checks the current open state, pending request, active roles, storage declaration, 15-minute lead time and proposed pickup timestamp. The listing and selected request must change atomically. Use reciprocal checks of the before and after state and link the exact selected organization with `getAfter()`. Reject a request update for another organization in the same write. Test concurrent approvals from two donor sessions. A cancelled or expired assignment must close its own request and clear confirmation in the same transaction. Other pending requests can remain unchanged since effective availability derives from the parent listing.

## 4. Pickup and expiry

The QR contains only a version and opaque listing reference. Recipient confirmation sets a server timestamp while assigned during the pickup window. The provider cannot set this field. Completion must occur at or before the five-minute confirmation limit and strictly before the deadline. Check the listing and request state and participant identities again. Mark both collected atomically and reject replay. Manual reference entry uses the same checks. Client clocks drive labels and reminders. Rules use `request.time` for all enforced deadlines.

## 5. Photos and network

Only the fixed listing-photo document accepts image bytes. Enforce draft ownership, active approved donor status, and the 153,600-byte cap. Read access follows the corresponding listing. Reject malformed field shapes and handle untrusted image decoding in clients. Keep hosted Storage closed. Use authorized Firestore listeners for in-app updates and local device reminders for pickup. Reject unauthorized writes even when clients retry. Show cached data as potentially stale and confirm transaction success only on server commit.
