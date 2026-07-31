import { getCurrentUser, signIn, signOut } from "aws-amplify/auth";

export type SignInResult = {
  isSignedIn: boolean;
  nextStep: { signInStep: string };
};

/** Thrown only when automatic recovery itself couldn't complete (e.g. a
 * network blip during the sign-out call) — distinct from a normal auth
 * failure, so the UI can show a manual "sign out and continue" fallback
 * instead of a generic error message for this one specific case. */
export class StaleSessionRecoveryError extends Error {
  constructor() {
    super("Couldn't automatically clear the existing session.");
    this.name = "StaleSessionRecoveryError";
  }
}

/** Amplify refuses to call signIn() at all while ANY session is already
 * cached locally — even a stale one — and surfaces that as
 * "UserAlreadyAuthenticatedException" / "There is already a signed in
 * user," an error normal users have no way to act on themselves (see
 * @aws-amplify/auth's assertUserNotAuthenticated, which every signIn()
 * call runs first). This wraps signIn() with automatic recovery:
 *
 * - Amplify's own pre-check that decided to throw already ran
 *   getCurrentUser() internally and got a result — repeating that call
 *   here mirrors it exactly. If it still succeeds, the existing session
 *   is genuinely valid; there's nothing to fix, this reports back as an
 *   already-completed sign-in so the caller just proceeds (redirects)
 *   like any other successful sign-in.
 * - If it now fails, the cached session is actually stale (refresh token
 *   expired/revoked between when it was cached and now) — sign it out
 *   and retry the sign-in the user actually asked for, with the
 *   credentials they just entered.
 *
 * Every signIn() call in this app should go through this wrapper, not the
 * raw Amplify function, so this recovery applies uniformly regardless of
 * which flow (sign-in, sign-up's auto-sign-in, post-verification
 * sign-in) hit the stale session. */
export async function signInWithRecovery(
  username: string,
  password: string,
): Promise<SignInResult> {
  try {
    return await signIn({ username, password });
  } catch (err) {
    if (!(err instanceof Error) || err.name !== "UserAlreadyAuthenticatedException") {
      throw err;
    }

    try {
      await getCurrentUser();
      return { isSignedIn: true, nextStep: { signInStep: "DONE" } };
    } catch {
      // Confirmed stale — getCurrentUser() just failed where Amplify's own
      // internal check (moments ago, inside the signIn() call above)
      // succeeded, so the session expired/was revoked in between.
    }

    try {
      await signOut();
    } catch {
      throw new StaleSessionRecoveryError();
    }
    return signIn({ username, password });
  }
}
