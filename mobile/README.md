# FoodRescue Android

Standalone Android builds use the package ID `com.mit.foodrescue`. Expo Go uses the Firebase JavaScript SDK with the Web app SDK configuration in the repository root `.env`. Keep the native `google-services.json` with the Android registration for future native Firebase integrations.

Expo SDK 58 with Expo Router, TypeScript, Expo UI and Reanimated. This app is part of the root pnpm workspace and uses the shared root lockfile. Use Node.js 22.20.0 and pnpm 11.7.0.

From the root of FoodRescue:

```powershell
pnpm install --frozen-lockfile
pnpm --dir mobile start
```

Open the QR code in SDK-compatible Expo Go on an Android phone on the same network as the computer. With Android SDK tools and a connected Android device or emulator, `pnpm --dir mobile android` opens the starter through Expo CLI.

Run the development checks from this directory:

```powershell
pnpm lint
pnpm format:check
pnpm typecheck
```

Run `pnpm exec expo export --platform android` to check Android bundling. Add compatible Expo packages with `pnpm exec expo install <package>`. From the repository root, copy `.env.example` to `.env` and fill in the Firebase Web SDK values once for both apps. The Firebase module in `src/lib/firebase.ts` exposes Auth and Firestore for Phase 1.

## Android device permission check

Start the app with `pnpm mobile` from the repository root and open it on Android.
Open **Explore → Device permissions** on the starter screen or follow the
**Device permissions** link from the mobile home screen when available.

1. With fresh permissions, verify that opening the screen does not prompt for access.
2. Tap **Allow location** and decline. Confirm the status changes and the manual
   entry guidance appears. Retry and allow access while using the app.
3. Tap **Allow camera** and grant access. Confirm both statuses show **Allowed**.
4. Revoke camera from Android Settings, then return to the app. Confirm the status
   refreshes. Decline until Android stops offering the prompt, tap **Open Settings**,
   restore access, and return. Confirm the camera status updates again.

Use a physical Android phone to verify the prompts. When using Expo Go, the Settings
button opens Expo Go's settings. A native FoodRescue build opens its own settings.
