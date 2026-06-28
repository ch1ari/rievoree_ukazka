# DB-COMMANDS.md — connectors + user management

> Everything in this file you run yourself. Claude wrote the migrations, edge
> functions and config; it did **not** touch your database. Run the blocks below
> in order. Lines starting with `#` are comments.

New artifacts in this change:

| Kind | Path |
|---|---|
| Migration 29 | `supabase/migrations/20260628000001_connectors.sql` |
| Migration 30 | `supabase/migrations/20260628000002_user_management.sql` |
| Migration 31 | `supabase/migrations/20260628000003_connector_cron.sql` |
| Edge fn | `supabase/functions/connector-webhook` (HMAC inbound, public) |
| Edge fn | `supabase/functions/connector-oauth` (Drive OAuth start) |
| Edge fn | `supabase/functions/connector-callback` (Drive OAuth redirect) |
| Edge fn | `supabase/functions/connector-sync` (Drive pull: manual + cron) |
| Edge fn | `supabase/functions/admin-users` (create / reset password / reset MFA) |
| Shared | `supabase/functions/_shared/{connectors,google}.ts` |

---

## 1. Apply the migrations

### Local (Supabase CLI)

```bash
# Applies all pending migrations to the local stack:
supabase migration up

# …or a clean rebuild (drops + re-seeds local data):
supabase db reset
```

### Remote (your hosted project)

```bash
# Review what will be sent first:
supabase db push --dry-run

# Then apply:
supabase db push
```

> The migrations are idempotent where it matters (`create extension if not
> exists`, guarded cron block). `seed.sql` is never pushed to remote.

---

## 2. Deploy the edge functions

```bash
supabase functions deploy connector-webhook
supabase functions deploy connector-oauth
supabase functions deploy connector-callback
supabase functions deploy connector-sync
supabase functions deploy admin-users
```

Local serving (with secrets from a file — see §3):

```bash
supabase functions serve --env-file supabase/functions/.env
```

---

## 3. Google Drive connector — OAuth app secrets (edge runtime)

Create an OAuth client in Google Cloud Console (type: Web application). Scope
used: `https://www.googleapis.com/auth/drive.readonly`. Add the **callback**
function URL as an authorized redirect URI.

Set the secrets (remote):

```bash
supabase secrets set \
  GOOGLE_OAUTH_CLIENT_ID="<id>.apps.googleusercontent.com" \
  GOOGLE_OAUTH_CLIENT_SECRET="<secret>" \
  GOOGLE_OAUTH_REDIRECT_URI="https://<project-ref>.supabase.co/functions/v1/connector-callback" \
  GOOGLE_OAUTH_APP_REDIRECT="https://<your-frontend>/connectors"
```

Local — put the same keys in `supabase/functions/.env` (gitignored):

```
GOOGLE_OAUTH_CLIENT_ID=<id>.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=<secret>
GOOGLE_OAUTH_REDIRECT_URI=http://127.0.0.1:54321/functions/v1/connector-callback
GOOGLE_OAUTH_APP_REDIRECT=http://127.0.0.1:3000/connectors
```

> `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are injected
> by the platform automatically — you do **not** set them.

Authorized redirect URI in Google Cloud must EXACTLY match `GOOGLE_OAUTH_REDIRECT_URI`.

---

## 4. Social login (Sign in with Google / GitHub)

`config.toml` now enables the `google` and `github` providers from env vars.

```bash
# Remote: push the auth config + set the provider secrets.
supabase config push   # (CLI ≥ 1.150; otherwise set providers in the dashboard)

supabase secrets set \
  SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID="..." \
  SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET="..." \
  SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID="..." \
  SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET="..."
```

Local: export those four vars (or add to your shell env) before `supabase start`.
The buttons render regardless; an unconfigured provider returns a clear error.

> This OAuth app is for **login identity** and is separate from the Drive
> connector's data-access OAuth app in §3.

---

## 5. Connector auto-sync cron (optional)

Migration 31 schedules `private.run_connector_syncs(5)` every 10 min where
pg_cron exists. It reads two Vault secrets — set them once on remote:

```sql
select vault.create_secret(
  'https://<project-ref>.supabase.co/functions/v1/connector-sync',
  'edge_connector_sync_url'
);
-- Reuse the same service_role key secret notify-review uses; create only if absent:
select vault.create_secret('<service_role JWT>', 'edge_service_role_key');
```

Verify the job is scheduled:

```sql
select jobname, schedule, active from cron.job where jobname = 'connector-auto-sync';
```

Without these, auto-sync is a no-op (fail-soft). "Sync now" in the UI always
works regardless of cron.

---

## 6. (Optional) regenerate TypeScript types

```bash
supabase gen types typescript --local > src/lib/database.types.ts   # if you keep generated types
```

---

## 7. Smoke tests

### Webhook connector (no Google needed)

1. In the app: Connectors → add an **HMAC webhook** connector → copy the secret + URL.
2. From a shell:

```bash
URL='https://<project-ref>.supabase.co/functions/v1/connector-webhook?id=<connector-id>'
SECRET='<the secret shown once>'
BODY='account_code,txn_date,debit,credit,currency
4000,2026-06-20,0,13000,EUR'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')
curl -X POST "$URL" -H "content-type: text/csv" -H "x-signature: sha256=$SIG" --data-binary "$BODY"
```

Expect `201 {"status":"created","batch_id":...}`. A wrong signature → `401`.
The batch then appears on the Ingest page at `awaiting_review`.

### User management

- Sign in as `admin@demo.local` / `super@demo.local` (platform admins) to see the
  full table: create user, reset password (returns a recovery link locally),
  reset MFA, assign roles, activate/deactivate.
- A self-registered admin sees only the members of the entities they own and the
  membership tools (invite/remove) — credential ops stay platform-only.

### Drive connector

After §3, add a **Google Drive** connector → **Connect Google Drive** → consent →
you're returned to `/connectors?connected=…`. Drop a CSV into the watched folder
→ **Sync now** → the file flows through the pipeline (idempotent: a second sync
won't re-ingest it).
