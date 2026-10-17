# FoodRescue Admin

Separate React and TypeScript web app built with Vite and Material UI. This app is part of the root pnpm workspace and uses the shared root lockfile. Use Node.js 22.20.0 and pnpm 11.7.0.

From the FoodRescue root:

```powershell
pnpm install --frozen-lockfile
pnpm --dir admin dev
```

Open the local URL printed by Vite. Run the checks and production build from this directory:

```powershell
pnpm lint
pnpm format:check
pnpm typecheck
pnpm build
```

From the repository root, copy `.env.example` to `.env` and fill in the Firebase Web SDK values once for both apps. The Firebase module in `src/lib/firebase.ts` exposes Auth and Firestore for Phase 1. Vite serves the admin site locally during development. Use Firebase Hosting when the site is ready to publish.

Set the optional `EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID` to enable Google Analytics in supported browsers for production builds. The Vite dev server skips Analytics. To check event delivery, run `pnpm build` and `pnpm preview`, open the site in a supported browser, and look for the visit in Google Analytics Realtime.

## Verify profiles

In Firebase Authentication, enable Email/Password and grant the admin custom
claim to the reviewer through the local provisioning script. See the
[Firebase setup](../firebase/README.md) for instructions. The admin app uses the
same project and Phase 1 Firestore Rules as the Android app.

1. Start the admin app and sign in with the claimed admin account. Reload the
   page to check session restoration. Signing in with a donor or organization
   account should show an access error.
2. Submit two synthetic profiles from Android: one donor and one recipient
   organization. Both should appear in **Pending profiles** without reloading.
3. Approve one and reject the other. Enter a reason for each decision and
   confirm. Both profiles should leave the queue, and each decision should
   appear in **Review history** with the profile UID, reviewer UID, reason and
   timestamp. Check the matching statuses on Android.
4. Disconnect the browser from the network. Review controls should be disabled
   until the queue reconnects. If another admin has already reviewed a profile,
   the open dialog should stop accepting a decision.
5. Sign out and confirm the queue and history are no longer visible.

The queue shows up to 50 pending profiles. As profiles are reviewed, additional
pending profiles can appear. The history shows up to 50 recent decisions.
