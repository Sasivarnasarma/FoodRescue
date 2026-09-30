# 10 — APIs, Device Services, and Integrations

## 1. Firebase

Spark MVP uses client Authentication (email/password) and Firestore with reviewed Rules. No custom API server, deployed Functions, scheduled jobs, paid Firebase services, or SMS authentication. Local Admin SDK is reserved for an authorized operator's admin-claim bootstrap, never mobile/browser code. Confirm the actual Firebase project and region before configuring the clients.

Storage remains the approved future file service but hosted Storage is unavailable under the no-billing decision; listing photo uploads use Firestore bytes instead. Official requirements and sources are recorded in document 15. Use local emulators for development; emulator demonstrations must not be described as deployed cloud features.

## 2. Location and navigation

Use compatible Expo Location after SDK checks. Ask permission in context; allow manual address/coordinates and label missing/approximate distance. Store the donor's pickup coordinates and address on the listing. Store an organization-provided operational departure point on its request if available. Keep device location for browsing on the device. Use bounded paginated Firestore queries then client Haversine sorting for the modest demo dataset. No arbitrary native Firestore radius search assumption.

Use external navigation handoff to the installed maps app; no embedded maps API or billable geocoding service in MVP. Manual address entry must not pretend to have generated coordinates. A location without coordinates may be displayed but cannot receive automatic distance recommendations.

## 3. Camera and image picker

Use Expo ImagePicker for photo selection/capture and Expo ImageManipulator for on-device resizing and JPEG encoding. Confirm package compatibility during scaffolding. Start with a longest edge of up to 800 px, preserve aspect ratio, and use JPEG quality around 0.7. Measure the encoded byte length. If it exceeds 153,600 bytes, retry at lower quality or smaller dimensions with a bounded number of attempts. If it still exceeds the cap, let the provider choose another photo or use a fallback. Preview the result before upload. Write Firestore Bytes to the draft listing's photo document. Handle permission, compression, upload and decode failures. The listing detail loads photos on demand. See the [Expo image manipulation API](https://docs.expo.dev/versions/latest/sdk/imagemanipulator/) and [Firestore byte type](https://firebase.google.com/docs/firestore/manage-data/data-types).

## 4. QR

Encode the version and opaque listing ID. Validate format, length, supported version, and access to the Firestore record. Reject arbitrary URL payloads. Manual ID entry fetches the same authorized record. Recipient confirms in their own session; provider then completes with Rules enforcing the full contract in documents 05/06/09. QR is a reference, not a secret credential.

## 5. Updates and reminders

Listen to authorized listing, request and profile records. Configure both Android devices and the web client for the same Spark project. Use separate accounts, unsubscribe on sign-out, and mark cached snapshots as potentially stale. Foreground status updates depend on network connectivity. Local pickup reminders may be scheduled on a device after permission; delivery can fail, and cancelling/rescheduling a record must update the local reminder. Remote event push and server-sent scheduled reminders are deferred. Do not put FCM server credentials in a client or allow arbitrary notification creation.

## 6. Setup checklist

- [ ] Spark project created without a linked billing account; Firestore region confirmed.
- [ ] Android and admin Firebase client apps registered as needed; public config supplied locally.
- [ ] Email/password sign-in enabled; first admin securely provisioned by authorized operator.
- [ ] Firestore rules and actual query indexes implemented and emulator-tested before deployment.
- [ ] Storage stays disabled/deny-all; no Functions deployment or billed service setup.
- [ ] Expo starter and packages checked for SDK compatibility.
- [ ] Location, camera and optional local notification permission/fallback tested on Android.
- [ ] Compressed photo uploaded from Android and visible on listing detail. Bundled fallback works in both clients. Verification uses synthetic evidence.
- [ ] Two-party pickup, replay rejection, manual entry, and expiry tested online.
- [ ] No quota failure, missing network, or unimplemented upload is presented as success.
