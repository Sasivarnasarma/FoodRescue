# Phase 2 integration and checks

The donor, recipient and device-service features are integrated into main through separate feature branches and merge commits. Each existing worktree retains its corresponding feature branch. The shared mobile dependency installation is reused through directory junctions, so run checks with `$env:pnpm_config_verify_deps_before_run='false'` in those worktrees to avoid automatic dependency repair. Normal project-root installation stays `pnpm install --frozen-lockfile`.

## Implemented flow

Approved donors open their donations from the shared login, save a draft, reopen it, replace or remove an optional photo, and publish. A failed photo upload retains the draft ID so retry continues the same draft. Dates use the device time zone and include optional best-before and use-by fields. A use-by value can be removed while editing. Saved photos are kept if preview loading fails unless the donor explicitly replaces or removes them. Revoked or unconfirmed verification closes donor tools.

Approved organizations browse from the shared login. Discovery hides elapsed deadlines, sorts by deadline, then distance, then ID, and offers bounded pages. Search and categories apply to the current page. GPS is requested from a user action. Manual coordinates are available when GPS is denied or unavailable, and browsing without coordinates displays unavailable distance. Distances are straight-line estimates. Details show storage and allergens as donor-supplied information, pickup times, optional expiry dates, photo fallback and external directions. A cancelled or elapsed listing closes its available detail state. Requests belong to Phase 3.

Native photo configuration disables microphone permission. Gallery selection uses the system picker. The camera requires a permission prompt. Photos are re-encoded as JPEG and checked against the 153,600-byte limit before upload. Permission failures offer retry or manual/optional fallbacks.

## Local checks

From the root:

```powershell
pnpm --dir mobile lint
pnpm --dir mobile format:check
pnpm --dir mobile typecheck
node --experimental-strip-types --test mobile/tests/listing-features.test.mjs
pnpm test:rules
```

## Synthetic scenarios

`firebase/scripts/demo-fixtures.mjs` defines a nearby urgent donation, a nearby later donation, a farther urgent donation and an elapsed donation. Locations and food are synthetic. `seed-donation-demo.mjs` creates synthetic donor and organization accounts and these listings only when both Firebase emulators are configured, and always uses project `demo-foodrescue`.

Run in a separate terminal:

```powershell
pnpm --dir firebase exec firebase emulators:start --only auth,firestore --project demo-foodrescue
```

Then seed with explicit emulator hosts:

```powershell
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099'
pnpm --dir firebase exec node scripts/seed-donation-demo.mjs
```

These fixtures are for emulator checks. The mobile Firebase configuration currently connects to the configured live project. For a live two-phone demo, use admin-reviewed synthetic accounts in that project and create corresponding donations through the donor form. Never include privileged credentials in the mobile client.

## Physical Android acceptance check

1. Deploy reviewed Firestore rules and indexes, then wait for enabled indexes. Start `pnpm admin` and `pnpm mobile` in separate terminals.
2. Sign into approved synthetic donor and organization accounts on two Android phones. Keep an unapproved account available to test denied access.
3. On phone A, deny GPS and enter valid manual latitude/longitude and an address. Try blank and out-of-range coordinates and confirm validation. Save a title-only draft with optional fields blank, leave, reopen and fill in the remaining details.
4. Add a camera or gallery image. Verify the preview and compressed size. Save, reopen, remove the image and save again. Check both permission denial and picker cancellation. Test photo upload failure and confirm retry uses one draft.
5. Publish with a future pickup deadline. Phone B must see the listing without refresh. Open details, check photo fallback, storage, allergens and dates, set location manually or with GPS, and open directions.
6. Cancel from phone A after confirmation. Phone B must remove the listing and stop showing its detail. Check pagination, filtered empty states, offline/cached labels and reconnect. Revoke verification while tools are open and verify access closes.
7. Rehearse the synthetic urgency and distance scenarios, including an elapsed deadline which must be hidden. Confirm that title, quantity, location and time all match the donor form.

Completion of these physical-device and live-project checks must be recorded after actually running them. Automated checks and Android JavaScript export cannot verify native permission prompts or camera hardware.
