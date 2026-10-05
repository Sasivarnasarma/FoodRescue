# FoodRescue

FoodRescue is an Android-first university project that connects businesses with nearby verified organizations for free surplus-food donations. Smart matching prioritizes time-sensitive listings and compares requests by distance and pickup feasibility.

## Repository structure

```text
FoodRescue/
├── AGENTS.md
├── README.md
├── package.json          # Root pnpm commands
├── pnpm-workspace.yaml   # Workspace packages and dependency build policy
├── pnpm-lock.yaml        # Shared dependency lockfile
├── docs/                 # Product, architecture, data, security and delivery docs
├── mobile/               # Expo + React Native + TypeScript Android app
├── admin/                # React + TypeScript web admin dashboard
└── firebase/             # Firestore rules/indexes, Storage rules and Firebase config
```

## Approved technical decisions

- Mobile: React Native + Expo + TypeScript
- Initial platform: Android
- Admin: separate React + TypeScript web app
- Backend: Firebase
- Database: Cloud Firestore
- Authentication: Firebase Authentication
- Listing photos: one optional compressed JPEG stored as Firestore bytes on Spark. Firebase Storage remains planned for future file storage
- Updates: in-app Firestore activity and optional local Expo reminders; automated remote push deferred
- Donation: one approved organization takes the whole listing for free
- Demo: two Android phones share Firestore updates and complete QR pickup, with verification on the separate admin site

See `docs/03_TECHNICAL_SPECIFICATION.md` for the stack and [MVP decisions and no-billing scope](docs/15_MVP_DECISIONS_AND_FREE_TIER.md) for resolved workflows, current Firebase constraints and sources. The free demo supports one compressed listing photo, a labelled sample fallback, synthetic verification review, and authenticated two-party QR reference pickup.

## Getting started

Phase 0 provides separate Android and admin web starters. Use **pnpm 11.7.0** and Node.js **22.20.0** as the development baseline. The mobile app, admin app and Firebase tooling share a root pnpm workspace and lockfile.

From the repository root, install dependencies:

```powershell
pnpm install --frozen-lockfile
```

Run these in separate terminals:

```powershell
pnpm mobile
pnpm admin
```

Open the Expo QR code with SDK-compatible Expo Go on an Android phone on the same network. Open the URL printed by Vite for the admin app. See [mobile setup](mobile/README.md) and [admin setup](admin/README.md) for local checks.

### Workspace checks

From the repository root, run the checks across the apps:

```powershell
pnpm lint
pnpm format:check
pnpm typecheck
```

Package-specific commands such as `pnpm --dir admin build` still work. Firebase tests run with `pnpm test:auth` and `pnpm test:rules`. Build-script permissions are maintained once in the root `pnpm-workspace.yaml`.

### Firebase setup for Phase 1

Select a Firestore region and use a Firebase Spark project without billing. Enable email/password authentication. Both clients use Firebase Web SDK configuration from the same project. Copy the root `.env.example` to `.env` at the repository root and fill in the configuration once for both clients. A single Web registration works for local development. The admin app runs through Vite locally, and Firebase Hosting is available when the site is ready to publish. Keep Firebase Cloud Storage disabled. Provision the first admin claim through an authorized local operator. Test the Firestore rules in the Emulator Suite before deploying access rules. Use `pnpm dlx firebase-tools` when you need the Firebase CLI.

## Team development

- Use GitHub Issues for individual tasks and pull requests for code review.
- Use the GitHub Project board for status tracking.
- Keep this documentation in sync with implementation.
- Do not store passwords, private keys, service-account files, or real personal data in Git.

## Project documents

Start with:
1. `AGENTS.md` — instructions for AI coding agents.
2. `docs/01_PROJECT_OVERVIEW.md` — what the project is and why it exists.
3. `docs/02_PRODUCT_REQUIREMENTS.md` — roles and functional requirements.
4. `docs/03_TECHNICAL_SPECIFICATION.md` — approved stack.
5. `docs/04_SYSTEM_ARCHITECTURE.md` — component responsibilities and data flow.
6. [Smart matching](docs/08_SMART_MATCHING_ENGINE.md) — eligibility and scoring.
7. [Two-phone demo](docs/12_TESTING_AND_DEMO.md) — acceptance tests and rehearsal.
8. [Final MVP scope](docs/15_MVP_DECISIONS_AND_FREE_TIER.md) — product and deployment decisions.
