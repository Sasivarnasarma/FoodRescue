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
