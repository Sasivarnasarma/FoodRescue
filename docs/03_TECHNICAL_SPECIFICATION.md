# 03 — Technical Specification

| Layer | Technology and scope |
|---|---|
| Mobile | Android-first Expo, React Native and TypeScript. Confirm Expo Router against the chosen starter |
| Admin | Separate React and TypeScript web client |
| Identity | Firebase Authentication with email/password. Admin custom claims provisioned by an authorized local operator |
| Database | One shared Cloud Firestore database on Firebase Spark. Firestore Rules enforce access and atomic transitions |
| Images | Expo ImagePicker and ImageManipulator. One optional JPEG up to 150 KiB in a separate Firestore photo document |
| Device services | Expo-compatible GPS, camera and optional local reminders. External maps handoff |
| Matching | Pure TypeScript logic using distance, proposed pickup buffer and donor-declared storage requirements |

All devices use the same Firebase project and each role signs in with its own account. Firestore listeners deliver authorized updates after cloud commits. Cached data may be stale. Publishing, requests, approval and collection require server acknowledgement. Test with Firebase Emulator Suite and rehearse on two physical Android phones using Spark.

Keep privileged credentials outside mobile, web, and Git. Firebase Storage stays closed. No billing-enabled services, deployed functions, external upload service or custom API are needed. Setup details are in [integrations](10_API_AND_INTEGRATIONS.md).
