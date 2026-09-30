# Firebase configuration folder

This folder contains starter security/configuration files. They are not a complete production deployment.

Before deployment:
1. Confirm actual region and create a Spark project without billing. See `../docs/15_MVP_DECISIONS_AND_FREE_TIER.md`.
2. Install/configure Firebase CLI.
3. Implement/review the Firestore contracts in documents 05/09; keep Storage deny-all. Hosted Storage and deployed Functions are outside the no-billing scope.
4. Add indexes based on actual query patterns.
5. Test rules with the Firebase Emulator Suite.
6. Confirm Spark quotas and region. Deploy reviewed Firestore rules and indexes, including the listing photo size and access rules and the bytes indexing exemption. Keep the hosted Storage bucket disabled.

Never commit service-account keys or private credentials.
