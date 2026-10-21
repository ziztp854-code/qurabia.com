# Native session integration

The Android client reuses the existing NextAuth v4 routes without changing their
contracts:

1. GET /api/auth/csrf/, retaining its HttpOnly CSRF cookie.
2. POST /api/auth/callback/credentials/ as application/x-www-form-urlencoded with
   csrfToken, email, password, a fixed same-origin callbackUrl and json=true.
3. GET /api/auth/session/, accepting an active identity and future expiry only.
4. POST /api/auth/signout/ with a fresh CSRF token, then erase local credentials.

No password, CSRF token, callback cookie or serialized profile is persisted.
Opaque server-issued session cookie chunks are encrypted with expo-secure-store,
bound to the configured HTTPS origin, and rotated from session responses. Session
expiry and revocation remain authoritative on the server. This is a native
credential store, not JavaScript access to a browser's HttpOnly cookies.

The API client canonicalizes extensionless /api/ paths with a trailing slash before
query parameters to match the existing Next.js trailingSlash:true configuration.
File-like paths retain the Next.js extension exception. Known same-origin binary
asset routes use the same canonical form. Redirects remain forbidden.

All authenticated JSON requests use expo/fetch with credentials=omit (a private
jar, not Android's shared WebView cookie store) and redirect=error. Origin is the
configured server origin to satisfy voiceOrigin. Requests never accept a caller-
provided Cookie, Origin or absolute API URL. Requests are not automatically
retried, since a timed-out write may have committed.

EXPO_PUBLIC_API_URL is public build configuration, not a secret or a deep-link
parameter. It must be an HTTPS origin without a path. It defaults to the existing
site https://qurabia.com. Use an approved isolated service origin for live
credential or write tests. Never embed test account passwords in builds or CI.

Use AuthProvider/useAuth from AuthProvider.tsx. API consumers use apiClient.request
or apiRequest from ../api/client.ts. assetSource attaches session cookies only to
known same-origin binary API routes; external public HTTPS images receive none.

The SecureStore config plugin must exclude its encrypted preferences from Android
backup. If secure storage fails, there is no plaintext fallback. A failed remote
logout still removes the device session and reports that remote logout was not
confirmed. A failed local deletion is surfaced for retry.

The unit tests inject transport and encrypted-storage interfaces. They exercise
the actual NextAuth request format, cookie scoping/chunking/expiry, revocation,
callback rejection and logout. They do not prove connectivity to a running
NextAuth server, Android Keystore behavior or device cookie/header transport.
These require an approved live test environment and Android execution.

Account creation and password recovery in this repository are Next.js server
actions, not verified native REST endpoints. Google browser OAuth does not expose
an audited native exchange flow here. No fake registration, browser-auth
substitute, mobile bearer endpoint or server secret is introduced.
