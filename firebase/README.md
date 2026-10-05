# Firebase configuration folder

This folder contains starter security/configuration files. They are not a complete production deployment.

Phase 1 status is verified on 2026-11-14. The Authentication emulator test and all eight Firestore rules tests pass. The Phase 1 rules have been compiled and deployed to the configured project. Email/Password is enabled, the default Firestore database is available in asia-south1, and the first admin claim has been verified. The remaining UI integration belongs to the donor, organization and admin screen tasks.

Firebase tooling is a package in the root pnpm workspace. Install from the repository root and commit the shared root lockfile.

## Phase 1 verification

Install Node.js 22, pnpm 11.7.0 and a Java 21 JDK. From the repository root:

```powershell
pnpm install --frozen-lockfile
pnpm --dir firebase test:auth
pnpm --dir firebase test
```

Tests use isolated emulator projects. The Auth test checks email/password signup and sign-in, password rejection, and refreshed admin claims. The Firestore tests check profile submission, private reads, admin review, audit records and competing reviews.

Before a cloud test, confirm Email/Password sign-in and the default Firestore database in Firebase Console. Sign in to the project with the local Firebase CLI and deploy only the tested Firestore rules:

```powershell
pnpm --dir firebase exec firebase login
pnpm --dir firebase exec firebase deploy --only firestore:rules --project YOUR_PROJECT_ID
```

For the first admin, create an Email/Password user in Firebase Authentication and copy its UID. In an authorized local terminal, configure Application Default Credentials with permission to manage Firebase Auth users, such as an authorized service account JSON stored outside the repository. If using a service account file, point `GOOGLE_APPLICATION_CREDENTIALS` to it. Then run:

```powershell
pnpm --dir firebase admin:grant YOUR_PROJECT_ID EXISTING_AUTH_UID
```

Have the admin sign out and back in after the claim is assigned. The mobile helper in `mobile/src/lib/verification.ts` submits a pending profile and watches the decision. The admin helper in `admin/src/lib/verification.ts` provides the pending queue query and commits a review with its audit record. Use synthetic accounts for the end-to-end check once the screens are connected.

For Members 1 and 2, `mobile/src/lib/auth.ts` exposes `createAccount`, `signInAccount`, `signOutAccount` and `watchSession`. After account creation, call `submitProfile`. If submission fails after Auth signup, allow the signed-in user to retry profile submission. Android sessions persist through AsyncStorage. Unsubscribe session and verification listeners when screens unmount or the user signs out.

For Member 4, use `admin/src/lib/auth.ts` for claim-checked admin sign-in. Listen to `pendingProfilesQuery()` and `profileReviewHistoryQuery()` for the queue and recent audit records. `reviewProfile()` commits the decision and audit together and rejects an already reviewed profile.

Before deployment:

1. Confirm actual region and create a Spark project without billing. See `../docs/15_MVP_DECISIONS_AND_FREE_TIER.md`.
2. Install/configure Firebase CLI.
3. Implement/review the Firestore contracts in documents 05/09; keep Storage deny-all. Hosted Storage and deployed Functions are outside the no-billing scope.
4. Add indexes based on actual query patterns.
5. Test rules with the Firebase Emulator Suite.
6. Confirm Spark quotas and region. Deploy reviewed Firestore rules and indexes, including the listing photo size and access rules and the bytes indexing exemption. Keep the hosted Storage bucket disabled.

Never commit service-account keys or private credentials.
