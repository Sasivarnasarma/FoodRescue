# FoodRescue Admin

Separate React and TypeScript web app built with Vite and Material UI. Use Node.js 22.20.0 and pnpm 11.7.0.

From the FoodRescue root:

```powershell
pnpm --dir admin install --frozen-lockfile
pnpm --dir admin dev
```

Open the local URL printed by Vite. Run the checks and production build from this directory:

```powershell
pnpm lint
pnpm format:check
pnpm typecheck
pnpm build
```

Firebase sign-in and the verification queue are part of Phase 1. Use the placeholder environment example when configuring Firebase locally.
