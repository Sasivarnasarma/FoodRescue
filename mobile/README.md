# FoodRescue Android

Standalone Android builds use the package ID `com.mit.foodrescue`. Expo Go uses the Firebase JavaScript SDK with the Web app SDK configuration in the repository root `.env`. Keep the native `google-services.json` with the Android registration for future native Firebase integrations.

Expo SDK 57 with Expo Router, TypeScript, Expo UI and Reanimated. This app is part of the root pnpm workspace and uses the shared root lockfile. Use Node.js 22.20.0 and pnpm 11.7.0.

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
