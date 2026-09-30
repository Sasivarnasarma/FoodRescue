# 06 — User Flows and State Transitions

## 1. Set up accounts

Donors and organizations sign in with Firebase email/password and submit synthetic profiles. Admin reviews profiles from the web client. Pending or rejected users can see their own verification status. Approved active donors and organizations can use their respective donation features.

## 2. Post and discover

1. Donor creates a draft with category, full quantity, storage requirements, allergen details, pickup location and pickup window.
2. Donor optionally takes or selects a photo, previews its compressed JPEG and saves it. A bundled image or placeholder is available.
3. Donor publishes online. Another signed-in device in the same Firebase project receives the listing through a Firestore listener.
4. An approved organization browses nearby open donations, sees distance and deadline, and opens details. The app can open directions in the installed maps app.

## 3. Request and approve

1. Organization submits a request for the whole listing, proposes a pickup time, and confirms it can meet the donor's storage requirements.
2. Donor sees incoming requests and an explanation of their ranking. See [smart matching](08_SMART_MATCHING_ENGINE.md).
3. Donor picks one eligible request. An atomic transaction changes the listing from open to assigned, records the organization UID and changes that request from requested to approved.
4. Both devices update after the server commits. The approved recipient sees pickup details and can set a local reminder. An unselected organization sees that the listing has been assigned.

Requests and approval require at least 15 minutes before the deadline and a proposed time at or after server request time inside the pickup window. Eligibility rules are in [security and permissions](09_SECURITY_AND_PERMISSIONS.md).

## 4. Complete pickup

1. Approved organization displays the QR with the listing ID and version. Donor scans it or enters the reference manually.
2. While both users are signed in and inside the pickup window, the organization confirms handover. Rules require the assigned organization and a server timestamp.
3. The owning donor completes pickup within five minutes of that confirmation and before the pickup deadline. The app atomically marks listing and request collected. Both devices show the completed state.

QR lookup identifies the listing. Authentication, assignment and Firestore Security Rules authorize collection. The recipient can clear its confirmation before completion. A stale confirmation requires reconfirmation. Transaction errors and offline states must be visible. Success appears after server commit.

## 5. Cancellation and expiry

| Transition | Effect |
|---|---|
| Draft → open | Publish complete listing |
| Open → assigned | Owning donor approves exactly one eligible request |
| Assigned → collected | Owning donor completes with fresh recipient confirmation |
| Assigned → open | Either assigned participant cancels while sufficient time remains (at least 15 minutes). Mark the approved request cancelled and clear confirmation and assignment |
| Open → cancelled | Owning donor closes without an assignment |
| Assigned → cancelled | Owning donor cancels before the deadline and atomically closes the listing and approved request, clearing confirmation and assignment |
| Open or assigned → expired | At deadline, donor or admin can reconcile the listing. Assigned recipient can also reconcile its own overdue assignment. An assigned request expires in the same write |

If an assigned recipient cancels before the deadline with less than 15 minutes remaining, close the listing as cancelled and clear the assignment. An organization may withdraw its own pending request before approval. Closed listings cannot reopen. Foreground reconciliation is optional for timely display. Clients hide elapsed listings and Rules reject late requests, approval and pickup even if the stored status is stale.
