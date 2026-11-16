# 12 — Testing Plan and Demonstration Script

## Independent tests

| Area | Required checks |
|---|---|
| Roles | Public signup cannot grant admin, approve itself or access other users' private records. Pending, rejected and suspended accounts cannot publish, request or collect |
| Requests | Only approved organizations can request. Reject forged ownership, repeat submissions, missing storage confirmation, stale times and late writes |
| Approval | Two sessions try to approve different requests. Exactly one succeeds. Reject listing-only, request-only and mismatched transactions |
| Pickup | Manual reference and QR use the same checks. Reject absent, forged or expired confirmation, wrong participant and replay. Collection updates both records atomically |
| Cancellation and expiry | Cancel only permitted states. Release the assignment atomically, reopen only with enough time and block late operations even if cleanup has not run |
| Matching | Exact deadline and cutoff, scoring example, ties, stale proposals, storage declarations and unknown distance |
| Photo | Save one optional JPEG under a draft. Reject nonowner writes, post-publication edits, wrong field types and oversize bytes. Missing or invalid pictures show fallback |
| Two devices | Phone B sees the published listing and assignment without refresh. Phone A sees requests and handover acknowledgement. Test permission denial, offline indications and reconnect |
| Admin | Review requires the admin claim and matching immutable audit |

## Demonstration on two Android phones

1. Prepare the same Firebase Spark project on both phones and the admin web client. Use separate synthetic donor and organization accounts, plus a second seeded organization request.
2. Use the web client to approve demo accounts. Sign into phone A as donor and phone B as organization.
3. On phone A, create a donation with a pickup deadline, location, storage requirement and optional compressed photo. Publish it. Open the listing on phone B and check the photo on detail.
4. On phone B, discover the donation with location access and submit a request with a proposed pickup time. On phone A, compare request scores and approve one. Use a fixture where the organization on phone B is selected. Show the assignment update and directions on phone B.
5. During the pickup window show the QR on phone B, scan on phone A, confirm handover on phone B, and complete on phone A. Verify both show collected.
6. Explain why the top-ranked organization was suggested and demonstrate a stale or repeated pickup being rejected.

Rehearse using synthetic data, fresh pickup windows, valid clocks, working network and camera permissions. Use manual location/reference entry and the bundled image fallback if needed. A seeded competing request must be created with the actual listing ID and valid times before showing rankings. Test the scoring function and Firestore Rules locally before the live demo. The repository includes the mobile and admin clients, Firebase rules and automated tests. Physical two-phone acceptance remains a separate demo requirement.

## Camera permission and mobile layout regression checks

Run `pnpm --filter foodrescue-mobile test`, `pnpm --filter foodrescue-mobile lint`,
`pnpm --filter foodrescue-mobile typecheck`, and
`pnpm --filter foodrescue-mobile format:check --end-of-line auto` from the root.
The formatting option respects this Windows checkout's existing line endings.

On Android, check the following before the team demo:

1. Open Scan / Lookup with camera access already allowed. The camera should appear
   without sending you to Settings.
2. Deny camera access, then allow it in device Settings while the scanner stays
   open. Return to FoodRescue: the scanner must refresh permission and show the
   camera. Repeat with access revoked: the permission fallback must reappear.
3. With permission still requestable, use Grant Camera Access. With permission
   permanently denied, use Open Device Settings. Manual reference entry must work
   in either case. Scan a recipient QR and verify normal donation lookup.
4. At logical widths of 320, 360 and 412, and with Android's large font/display
   settings, check Your Donations with empty and populated pages. Scan / Lookup,
   New Offer, card actions and pagination must stay reachable without horizontal
   clipping. Headings and actions can wrap onto separate rows.
5. Scroll the donation form to Publish donation, Save draft and Cancel. Open the
   scanner in landscape, focus manual entry and scroll to Verify Reference.
   Check that scanner content and bottom tabs clear the system bars with both
   gesture navigation and three-button navigation.

Permission lifecycle tests use controlled native API responses. Actual camera,
keyboard, font scaling and system-bar behavior still require physical-device
verification. These fixes require no Firebase console or rules changes.

## Recipient donation detail regression check

On Android, sign in as an approved organization, open Browse Food and tap a
donation. Confirm the detail panel fills the space between the app header and
bottom navigation, displays the title and Back to Feed action, and scrolls down
to the request section. Test with and without a listing photo, then return and
open a different donation. Repeat by selecting a donation from My Requests.

While details are loading, the loading message and Back to donations action must
remain visible. If the donation is removed or access is denied, verify the
unavailable message and Back action appear. Repeat at a small screen size and
with an offline cached listing. Native layout still requires device verification;
TypeScript and data-logic tests do not exercise Android layout measurement.

## UI regression checks

Run from the repository root:

```powershell
pnpm --filter foodrescue-mobile lint
pnpm --filter foodrescue-mobile typecheck
pnpm --filter foodrescue-mobile format:check --end-of-line auto
pnpm --filter foodrescue-mobile test
pnpm --filter foodrescue-admin lint
pnpm --filter foodrescue-admin typecheck
pnpm --filter foodrescue-admin format:check --end-of-line auto
pnpm --filter foodrescue-admin test
```

The formatting option respects the Windows checkout's existing line endings.
Check these flows on Android at logical widths of 320, 360 and 412, including
large font/display settings and gesture or three-button navigation:

1. Browse several donations, expand location entry, and scroll to the last card
   and load-more controls. Repeat in My Requests with multiple requests. Tabs and system
   bars must not cover the final actions. Open a card, scroll its details to the
   request section, and use Back to Feed. Loading/unavailable details must retain
   a visible Back action.
2. Scroll a new or edited donation through Publish, Save draft and Cancel. Check
   that header buttons, quantity/unit fields, card metadata and request shortcuts
   fit or wrap without horizontal clipping. Open the scanner and check that its
   content clears system bars.
3. Enter unsaved donation or request text, then disconnect and reconnect. Keep
   the form mounted and preserve the input. Display the reconnecting banner and
   disable saving, requesting, withdrawal, approval and pickup mutations until
   the account is confirmed again. A recipient may still view saved pickup and
   QR details. An actual rejection or suspension must still remove donation
   access.
4. Select a large photo and immediately try Save draft or Publish while processing
   is displayed. Both actions stay disabled until processing succeeds, fails or
   is cancelled. On success, preview the photo before publishing.
5. For a future pickup window of 14:00-14:20, choose 30m Before End and confirm
   the selected time stays inside the window. Repeat with an already open window
   and with start timestamps containing seconds. Search for a category absent
   from a donation's title, description and provider; its matching card appears.
6. In the admin directory, verify counts are labelled as belonging to the current
   page. Search/status filters are explicitly page-scoped. A filter with no
   matches shows an explanation instead of an empty table.

These UI fixes require no Firebase console, schema, index or rules changes.
Automated checks cover search and shortcut timing; physical layout, keyboard,
photo processing and reconnect behavior still require device verification.

PR #11 integration retains the newer date/time picker, horizontal selection chips, feed loading and permission settings. Request shortcuts use the tested pickup-window helper rather than fixed offsets from the current time. Combined checks pass 85 mobile tests and 3 admin tests. Android camera/layout, reconnect and photo-processing acceptance remain manual checks.

Known feed limitation from the earlier feed-loading change: increasing the query beyond 50 results is rejected by Firestore rules. This PR preserves that implementation; cursor-based loading beyond 50 requires a separate fix. Do not loosen the rules to accommodate an oversized query.