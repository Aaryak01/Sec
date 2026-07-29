"use client";

import { Amplify } from "aws-amplify";

// Points Amplify's Auth module directly at a Cognito User Pool — manually
// configured here, deliberately NOT reading from amplify_outputs.json or the
// amplify/ Gen 2 backend folder in this repo, which is unused scaffolding
// from an earlier `ampx sandbox` attempt. There's no `region` field here:
// Amplify derives it from the User Pool ID's own prefix (`us-east-1_...`).
//
// This is a SECOND pool, not the one originally given
// (us-east-1_HC94wHqcq / 5ta4f2q0mti5qr69bflnvt4ka1). That one is unusable
// from this app for two independent reasons:
//   1. Its app client has a secret, which a browser SPA can't use — computing
//      the required SECRET_HASH would mean shipping the secret in public JS.
//   2. Its schema requires gender, phone_number, and name at sign-up (fixed
//      permanently at pool creation, no API can relax it), which doesn't
//      match this app's email + password only sign-up form.
// This pool mirrors the original's other settings (password policy, email
// verification by code, no MFA, email as a sign-in alias) but only requires
// email, and its app client has no secret.
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: "us-east-1_UxXCCbziP",
      userPoolClientId: "64g72j9o1huchdbj2g12cr5u92",
      loginWith: {
        email: true,
      },
    },
  },
});

// Module-scope `Amplify.configure` above runs once when this client module
// first loads in the browser — before any component that calls signUp/
// signIn/getCurrentUser mounts, as long as this is rendered near the root.
// Renders nothing; it exists purely to guarantee that side effect runs.
export default function ConfigureAmplify() {
  return null;
}
