# FoodRescue Android

Expo SDK 57 with Expo Router, TypeScript, Expo UI and Reanimated. Use Node.js 22.20.0 and pnpm 11.7.0.

From the root of FoodRescue:

```powershell
pnpm --dir mobile install --frozen-lockfile
pnpm --dir mobile start
```

Open the QR code in SDK-compatible Expo Go on an Android phone on the same network as the computer. With Android SDK tools and a connected Android device or emulator, `pnpm --dir mobile android` opens the starter through Expo CLI.

Run the development checks from this directory:

```powershell
pnpm lint
pnpm format:check
pnpm typecheck
```

Run `pnpm exec expo export --platform android` to check Android bundling. Add compatible Expo packages with `pnpm exec expo install <package>`. Firebase configuration is part of Phase 1. The environment example contains placeholders for that work.
