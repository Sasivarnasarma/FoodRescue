# Donor verification check

Use synthetic accounts. Put the Firebase client configuration in this checkout's root
`.env` file and start the mobile app from the repository root with `pnpm mobile`.
Email/Password authentication and the Phase 1 Firestore rules must be enabled.
Use the provisioned account in the separate admin web app to review submissions.

1. Open FoodRescue and choose **Create a donor account**. Create one with a unique
   synthetic email, then submit a display name and business name. The profile
   should show **Pending review**.
2. Reload the app on Android. Verify that the signed-in account and pending status
   return. Sign out and sign back in to the same account.
3. With the donor screen open, approve the profile in the admin client. The status
   should update to **Approved** without a refresh. Repeat with another synthetic
   donor and reject it. Its status should change to **Not approved**.
4. Check invalid credentials, then disable the network and retry sign-in. The form
   should give an error and remain usable. A signed-in profile can show cached
   information while it waits for the server. Reconnect and verify that it updates.
5. Sign in with an existing organization account. The donor screen should direct
   you to the organization flow once its branch is integrated, and will never
   submit a donor profile over an organization profile.

The automated authorization checks can be run independently with `pnpm test:rules`.
