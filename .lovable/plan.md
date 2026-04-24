## Problem

The error `MISSING_ADS_SCOPE: Google Ads-scope (adwords) saknas` keeps showing even after disconnecting and reconnecting Google. After reading the code, the diagnosis from the error message is unreliable:

In `supabase/functions/_shared/google-ads.ts`, **any** non-2xx response from `customers:listAccessibleCustomers` whose body starts with `<` (HTML) is reported as "MISSING_ADS_SCOPE". But Google returns an HTML error page in many other cases too:
- Invalid / unapproved `developer-token`
- Invalid `login-customer-id` (MCC)
- Account not linked to the MCC
- API project not enabled for Google Ads API

So the real cause might not be the scope at all. We need to (a) verify the actual stored OAuth scope and (b) see Google's real error body.

## Plan

### 1. Verify the stored scope (no code, just a DB read)
Run a `read_query` against `google_tokens` for the current user to see what scopes Google actually returned. If `adwords` is missing → it's truly a consent issue. If `adwords` is present → the real cause is the developer token / MCC.

### 2. Make the error path honest in `_shared/google-ads.ts`
- Stop guessing "MISSING_ADS_SCOPE" from `<`. Instead:
  - First: load stored `scope` from `google_tokens`. If it does not contain `https://www.googleapis.com/auth/adwords`, throw the explicit MISSING_ADS_SCOPE error before calling Google at all.
  - Otherwise: forward Google's actual status + a trimmed body in the thrown error so we can see whether it is `developer-token` or MCC related.
- Add a clearer error code for `DEVELOPER_TOKEN_INVALID` and `MCC_INVALID` based on response text patterns Google uses (e.g. `developer token is not approved`, `login-customer-id`).

### 3. Tighten `ads-list-customers/index.ts`
- Map the new error codes to the right HTTP status (`403` for scope, `400` for dev-token / MCC) and include a `code` field so the UI can show targeted instructions.

### 4. Update the UI toast in `WorkspaceSettings.tsx`
Show a more specific message based on `code`:
- `MISSING_ADS_SCOPE` → "Återanslut Google på Översikt och bocka i Google Ads"
- `DEVELOPER_TOKEN_INVALID` → "Google Ads developer token saknar godkännande – kontakta admin"
- `MCC_INVALID` → "MCC-konfiguration felaktig – kontakta admin"
- Default → show the raw message from the function

### 5. Add a one-time `/google-oauth/scope` debug endpoint (optional)
A small endpoint that returns the raw `scope` string for the current user, so the UI can display it next to the "Anslut Google" button. This makes scope problems self-diagnosable for the user.

## Files to touch

- `supabase/functions/_shared/google-ads.ts` — replace HTML-guess heuristic with explicit DB scope check + better error parsing.
- `supabase/functions/ads-list-customers/index.ts` — propagate `code` field for UI.
- `supabase/functions/google-oauth/index.ts` — already has a `status` endpoint that returns `scope`; just rely on it (no change needed unless we add `/scope` shortcut).
- `src/pages/workspace/WorkspaceSettings.tsx` — branch toast on `code`.
- `src/pages/workspace/WorkspaceOverview.tsx` — show "Ads-scope: ja/nej" badge based on `status.scope` so the user can see at a glance.

## Expected outcome

After approval I will first run the DB read to know the real cause. Then either:
- If `adwords` is missing from the stored scope → guide you through forcing the consent screen (Google sometimes silently skips it on reconnect when the user already granted scopes to a different client). Fix: revoke the app at https://myaccount.google.com/permissions, then click "Anslut Google" again.
- If `adwords` is present → the developer token or MCC is the real problem; the new clearer error will tell us exactly which.