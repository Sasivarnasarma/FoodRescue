# 15 — MVP Decisions and No-Billing Deployment

This is the current plan for the FoodRescue university assignment.

| Area | Decision |
|---|---|
| Product | Free donations from businesses to verified organizations |
| Allocation | Organization requests the whole listing. Donor approves one. Requests hold nothing until approval |
| Novelty | GPS-aware discovery, urgency prioritization and explainable ranking of eligible requests. Donor makes the final choice |
| Food condition | Donor supplies storage requirements, dates and allergen information. Recipient declares compatibility with the storage requirement |
| Device features | GPS, maps handoff, camera/gallery, on-device JPEG compression, QR display and scan, live in-app updates and optional local reminders |
| Pickup | Recipient displays QR, donor scans, assigned recipient confirms in their signed-in app, and donor completes within five minutes and inside the pickup window |
| Deployment | Android app and separate web admin connected to one Firebase Spark project. Live demo uses two physical phones and the web client |
| Photos | One optional compressed JPEG at most 150 KiB per listing, stored as Firestore Bytes in a separate document. Bundled fallback |
| Verification | Admin reviews synthetic business and organization profiles. Verification files are deferred |

Discounted sales, buyer accounts, partial claims, invitations, paid services and IoT are outside this MVP. Verified individuals and image-based category suggestions can be considered later, or if the rubric explicitly requires an AI showcase. AI suggestions require donor confirmation.

Use Firebase email/password, Firestore, rule-protected atomic writes and the Emulator Suite. Keep Firebase Storage closed and use in-app updates for cross-device state. Use server-time deadlines and foreground expiry reconciliation. Keep privileged credentials outside the clients and repository. Store Firebase client configuration in local environment files and commit placeholder examples.

[Product requirements](02_PRODUCT_REQUIREMENTS.md) · [Schema](05_DATABASE_SCHEMA.md) · [Smart matching](08_SMART_MATCHING_ENGINE.md) · [Two-phone demo](12_TESTING_AND_DEMO.md) · [Firebase pricing](https://firebase.google.com/pricing) · [Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions)
