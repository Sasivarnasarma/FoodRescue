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

1. Sign in with the claimed admin account. Donor and organization accounts must be denied console access.
2. Open **All profiles**. Use Next and Previous to browse pages of 50. Open **View details** to inspect all stored profile and account fields.
3. Approve any profile without a reason. Reject any profile with a nonblank reason. Repeat both actions and verify each creates a new history record with the actual previous state.
4. Keep Android open while reviewing. Verify the status and latest rejection reason update without refreshing, and approval clears the reason.
5. Disconnect the browser. Review controls must be disabled until current server records return. Sign out and confirm the directory and history disappear.

Deploy the changed Firestore rules before testing against the live project. See the Firebase README for deployment instructions.
