# Organization onboarding check

Use synthetic organization and contact names. The account's role is fixed when its first profile is submitted. The admin's review reason remains in the private audit log.

1. Configure the workspace root `.env` using `.env.example` and the existing Firebase project. Confirm Email/Password sign-in, the tested Firestore rules and access to the admin review flow.
2. Run `pnpm install --frozen-lockfile`, then `pnpm mobile` from the workspace root. Open the Android app and create an account and choose **Receive as an organization**.
3. Create an organization account with a test email. Try submitting with either name blank and confirm the form asks for it. Submit both names and wait for **Awaiting verification**.
4. Sign out, reopen FoodRescue and sign in with that email. Confirm the same profile status appears and the form stays closed.
5. Keep the organization screen open while the admin approves the profile. Confirm **Organization approved** appears without refreshing. Use a separate synthetic account to check rejection.
6. Repeat using an existing donor account. Confirm the organization screen offers no profile form. Turn off the network with an approved test profile open and check that any cached status carries the reconnect message. Reconnect and verify that the warning clears when the server confirms the status.

To run the organization state tests from the mobile directory:

```sh
node --experimental-strip-types --test tests/organization-verification.test.mjs
```

Check shared sign-in routes returning accounts to their saved role. Reject, approve and reject again. Confirm Android shows the latest rejection reason.
