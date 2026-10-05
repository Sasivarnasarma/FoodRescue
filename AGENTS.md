# FoodRescue — AI Agent Instructions

This repository contains the FoodRescue university group project. Read this file and the relevant documents in `docs/` before changing code.

## 1. Product summary
FoodRescue connects businesses with usable surplus food to nearby verified organizations for free pickup. The app prioritizes time-sensitive donations and ranks eligible requests by distance and pickup feasibility. The donor approves one request for the entire listing.

## 2. Approved project decisions
These are settled decisions. Do not silently replace them.

| Area | Approved decision |
|---|---|
| Mobile development | React Native with Expo and TypeScript |
| Initial mobile platform | Android |
| Backend | Firebase services; no separate custom API server in the initial architecture |
| Main database | Cloud Firestore |
| Authentication | Firebase Authentication |
| File storage | Spark MVP stores one optional compressed listing photo (up to 150 KiB) as Firestore bytes. Firebase Storage remains the future file service |
| Deployment budget | Firebase Spark only; no billing account or paid Firebase services |
| Notifications | In-app updates and optional Expo local reminders for Spark; automated remote push deferred |
| Admin application | Separate web application |
| Admin web stack | React + TypeScript |
| Donation scope | Free, whole-listing donations to verified organizations |
| Pickup verification | Recipient QR reference and signed-in confirmation, followed by donor completion |
| Assignment demo | Two Android phones use the same Firebase project with a separate admin web client |
| Navigation | Expo Router is the proposed default; confirm current project setup before adding it |
| Package manager | One pnpm workspace for mobile, admin and Firebase tooling, with a root lockfile |

## 3. Rules for implementation
1. Preserve the approved stack and product scope unless the project owner explicitly approves a change.
2. Do not invent credentials, Firebase project IDs, API keys, real business data, or verification status.
3. Never commit secrets. Use environment variables and provide `.env.example` with placeholders only.
4. Do not put Firebase Admin SDK credentials or privileged secrets in the mobile or browser client.
5. Enforce authorization with Firestore/Storage rules and trusted server-side operations where required. Hiding a button is not security.
6. Never let a public client assign itself an `admin` role or mark an organization as verified.
7. Treat user-provided food descriptions, expiry details, allergens, storage instructions, and safety claims as untrusted data until supplied/confirmed by the responsible provider.
8. Do not claim that an image model or the app can certify food safety. The provider remains responsible for food suitability and accurate information.
9. Keep the MVP donation-only. Buyer accounts, prices, and payments are outside scope.
10. Businesses make the final choice among smart recommendations. The matching engine ranks eligible requests. Donor approval must assign only one organization.
11. Keep the Android app and admin web app as separate clients, while sharing documented Firebase data contracts.
12. Prefer small, reviewable changes. Explain any schema/rules changes and update the matching documentation.
13. Add loading, empty, error, offline, permission-denied, and success states to user-facing screens.
14. Validate inputs on the client for usability and enforce critical validation in trusted backend logic/rules.
15. Use accessible labels, readable contrast, and clear confirmation before irreversible actions.

## 4. Required workflow for an AI coding agent
Before implementation:
- Read `docs/01_PROJECT_OVERVIEW.md`, `02_PRODUCT_REQUIREMENTS.md`, `03_TECHNICAL_SPECIFICATION.md`, `04_SYSTEM_ARCHITECTURE.md`, and the relevant detailed document.
- Read `docs/15_MVP_DECISIONS_AND_FREE_TIER.md` for resolved MVP choices and the no-billing deployment boundary.
- Inspect the existing repository. Do not overwrite working code or package configuration without checking it.
- State the intended files and behavior to change.
- Identify any missing product decision rather than guessing.

During implementation:
- Run `pnpm install --frozen-lockfile` from the repository root. Use `pnpm --filter <package-name>` or `pnpm --dir <folder>` for package-specific commands and `pnpm exec expo install` from mobile for Expo SDK packages. Commit the shared root `pnpm-lock.yaml`. Keep workspace settings and dependency build permissions in the root `pnpm-workspace.yaml`.
- Follow existing naming, formatting, and architecture conventions.
- Keep components focused and avoid unnecessary dependencies.
- Add or update tests for meaningful logic.
- Do not weaken security rules to make a feature work.

After implementation:
- Run `pnpm lint`, `pnpm format:check`, and `pnpm typecheck` in each affected app.
- Summarize changed files and behavior.
- Give exact commands to run/test.
- List any Firebase console setup or manual steps.
- Mention assumptions, known limitations, and follow-up work.
- Update docs if the implementation changes an approved or documented contract.

## 5. Definition of done
A feature is not complete merely because its screen renders. It should have:
- a documented user flow;
- correct role-based access;
- validation and error handling;
- loading/empty states;
- tests for important logic;
- appropriate Firestore indexes/rules if needed;
- no committed secrets; and
- a concise manual test procedure.

## 6. Commit messages

- Use Conventional Commit titles in the form `type(scope): summary`.
- Keep the title under 70 characters.
- Leave a blank line after the title, then summarize the changes in bullets starting with `- `.
- Omit co-author trailers.

## 7. Branching and merging

- Create a branch from the current `main` before starting each piece of work.
- Use `feature/<description>` for features, `fix/<description>` for fixes, and `docs/<description>` for documentation.
- Write descriptions in lowercase with hyphens between words. Describe the work without phase numbers or member identifiers.
- Commit changes on the working branch and run the required checks before merging into `main`.
- Merge the completed branch into `main` when the user authorizes the merge.
- Push branches or commits to GitHub only when the user explicitly asks.
