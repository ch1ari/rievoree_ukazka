# DB-COMMANDS-v2.md — auth rework (email invites, self-reset, deactivation, scoping)

> Builds on the first change. Run these yourself. Claude did not touch the DB.

## 1. New migration
- `supabase/migrations/20260629000001_user_mgmt_company_scope.sql`

```bash
supabase db push            # remote
# or local: supabase migration up
```

What it changes (user-management surface only; app-data RLS untouched):
- **super_admin** → global (sees/manages all users) — that's you, the platform owner.
- **admin** → their COMPANY only (users sharing an entity), can manage up to manager.
- Adds helpers `am_i_super_admin`, `do_i_own_entity`, `private.shares_entity_with`;
  rewrites `list_org_members`, `can_manage_user`, `admin_set_member_role`,
  `admin_set_user_active`.

> Make sure YOUR account is `super_admin`. Use `super@demo.local`, or promote your
> own user in SQL editor:
> ```sql
> select public.admin_set_member_role('<your-user-id>', 'super_admin');
> ```
> (run it as an existing super_admin, or temporarily via service role).

## 2. Redeploy the updated edge function
```bash
supabase functions deploy admin-users
```
(invite-by-email + email password reset replaced the old temp-password flow.)

## 3. Set the app base URL for invite/reset links
```bash
supabase secrets set APP_BASE_URL="https://rievoree-ukazka.vercel.app"
```

## 4. Allow the redirect URL in Auth
Dashboard → **Authentication → URL Configuration → Redirect URLs** → add:
```
https://rievoree-ukazka.vercel.app/reset-password
https://rievoree-ukazka.vercel.app/**
```
(and `http://localhost:5173/reset-password` for local).

## 5. SMTP — so invite / reset emails actually send
Hosted Supabase's built-in email only reaches a few addresses and is rate-limited.
For real delivery, set up SMTP (Resend free tier is enough):

1. Create an account at the provider (e.g. Resend), verify a sending domain, get SMTP creds.
2. Dashboard → **Authentication → Emails → SMTP Settings** → enable, fill host/port/user/pass + sender.
3. (Optional) customize the **Invite** and **Reset password** email templates.

Without SMTP the flows still work code-wise, just delivery is limited.

## 6. Smoke test
- Sign in as **super_admin** → Users → invite a real email → they get an invite → set password → land in app.
- **Forgot password** on /login → email → /reset-password → new password.
- Account → **Change password** (self-service).
- As super_admin: **Disable** a user → that user, on next load, sees only the "Account deactivated" screen.
- As a **company admin** (a registered admin): you see only your company's users, manage up to manager.
