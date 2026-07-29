/** Amplify surfaces Cognito's own exception names via `error.name` — these
 * are the standard, documented Cognito error identifiers, not guessed
 * strings. Anything not in this list falls back to the SDK's own message
 * rather than a generic "something went wrong", so unexpected errors are
 * still legible while debugging. */
export function describeAuthError(err: unknown): string {
  if (err instanceof Error) {
    switch (err.name) {
      case "UsernameExistsException":
        return "An account with that email already exists. Try signing in instead.";
      case "NotAuthorizedException":
        return "Incorrect email or password.";
      case "UserNotFoundException":
        return "We couldn't find an account with that email.";
      case "UserNotConfirmedException":
        return "This account hasn't been verified yet — check your email for a code.";
      case "CodeMismatchException":
        return "That code doesn't match. Double-check it and try again.";
      case "ExpiredCodeException":
        return "That code has expired. Request a new one below.";
      case "InvalidPasswordException":
        return "Password must be at least 8 characters and include uppercase, lowercase, a number, and a symbol.";
      case "InvalidParameterException":
        return "Please double-check the information you entered.";
      case "LimitExceededException":
      case "TooManyRequestsException":
        return "Too many attempts. Wait a moment and try again.";
      case "TooManyFailedAttemptsException":
        return "Too many failed attempts. Wait a moment and try again.";
      default:
        return err.message || "Something went wrong. Please try again.";
    }
  }
  return "Something went wrong. Please try again.";
}
