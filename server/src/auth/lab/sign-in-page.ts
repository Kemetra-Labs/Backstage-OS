// The loopback owner-lab sign-in page (K-ID-1b). One static HTML page with one nonce'd inline script. It runs
// the Descope sign-in flow in the browser, then posts only the resulting session JWT to this same origin
// (POST /auth/session, Bearer, no body) and prints the id /auth/me returns. It never stores a token itself and
// never talks to any other host. Everything it renders from a response goes through textContent.
// The Descope component keeps its own tokens in browser storage (persisting is hard-coded on in 4.6.3), so after
// the exchange settles (ok, refused, rate limited or a network error) the page calls the component's SDK logout: it revokes the Descope refresh token (the stored one
// is attached by the SDK) and clears the SDK's storage. The Kawalys session cookie is independent of it.
import { PROJECT_ID_RE } from "../identity/descope-verifier";

const COMPONENT_VERSION = "4.6.3";
export const COMPONENT_URL = `https://unpkg.com/@descope/web-component@${COMPONENT_VERSION}/dist/index.js`;
// Subresource Integrity for COMPONENT_URL, computed on 2026-11-23 (UTC) as
//   curl -sL https://unpkg.com/@descope/web-component@4.6.3/dist/index.js | openssl dgst -sha384 -binary | openssl base64 -A
// Recompute it whenever COMPONENT_VERSION changes; a mismatch makes the browser refuse to run the script.
export const COMPONENT_INTEGRITY = "sha384-CwUnbA5u8HZBlD27/Y7nuMdoXk4K2R6Bni3szahNbudgvfMIBYhQfRtCQ+oKj1ep";

const NONCE_RE = /^[A-Za-z0-9_-]{1,128}$/;

/** The strict policy for the page. The nonce must be the one on the inline script. */
export function labContentSecurityPolicy(nonce: string): string {
  if (!NONCE_RE.test(nonce)) throw new Error("invalid CSP nonce");
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' https://unpkg.com`,
    "connect-src 'self' https://api.descope.com",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

function inlineScript(): string {
  return `(function () {
  'use strict';
  var out = document.getElementById('result');
  var cleared = document.getElementById('descope-status');
  function show(text) { out.textContent = text; }
  function showCleared(ok) {
    cleared.textContent = ok ? 'Descope session cleared' : 'Could not clear the Descope session; clear site data now';
  }
  var failed = 'Sign-in did not complete';
  var flow = document.querySelector('descope-wc');
  flow.addEventListener('error', function () { show(failed); });
  flow.addEventListener('success', function (event) {
    var detail = event.detail;
    if (!detail || typeof detail.sessionJwt !== 'string') { show(failed); return; }
    show('Signing in...');
    fetch('/auth/session', { method: 'POST', headers: { Authorization: 'Bearer ' + detail.sessionJwt } })
      .then(function (res) {
        if (!res.ok) throw new Error('session');
        return fetch('/auth/me');
      })
      .then(function (res) {
        if (!res.ok) throw new Error('me');
        return res.json();
      })
      .then(function (body) { show('Signed in as ' + String(body.user.id)); })
      .catch(function () { show(failed); })
      .finally(function () {
        try {
          Promise.resolve(flow.sdk.logout()).then(
            function (result) { showCleared(!!result && result.ok === true); },
            function () { showCleared(false); }
          );
        } catch (ignored) { showCleared(false); }
      });
  });
})();`;
}

/** Renders the page. Both values are validated first, so nothing unvetted reaches the markup. */
export function renderSignInPage(projectId: string, nonce: string): string {
  if (!PROJECT_ID_RE.test(projectId)) throw new Error("invalid Descope project id");
  if (!NONCE_RE.test(nonce)) throw new Error("invalid CSP nonce");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>Kawalys owner sign-in lab</title>
</head>
<body>
<h1>Kawalys owner sign-in lab</h1>
<p>Lab tool. Loopback only. English only.</p>
<p>After use, clear site data for this address.</p>
<descope-wc project-id="${projectId}" flow-id="sign-in" store-last-authenticated-user="false"></descope-wc>
<p id="result" role="status" aria-live="polite"></p>
<p id="descope-status" role="status" aria-live="polite"></p>
<script src="${COMPONENT_URL}" integrity="${COMPONENT_INTEGRITY}" crossorigin="anonymous"></script>
<script nonce="${nonce}">
${inlineScript()}
</script>
</body>
</html>
`;
}
