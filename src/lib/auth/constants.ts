export const DEFAULT_SESSION_COOKIE = "nextgen_session";

export function getSessionCookieName() {
  return process.env.SESSION_COOKIE_NAME ?? DEFAULT_SESSION_COOKIE;
}
