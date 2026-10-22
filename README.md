# MSONJO GAS & HOUSE HOLD Inventory

This is a single-business Next.js inventory application for **MSONJO GAS &
HOUSE HOLD**. It uses Supabase Auth and PostgreSQL for shared, persistent data;
the application is designed for deployment to Vercel.

## Local development

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Set these variables in `.env.local` and in the Vercel project settings:

- `MSONJO_SUPABASE_URL` — the dedicated Supabase project URL.
- `MSONJO_SUPABASE_PUBLISHABLE_KEY` — a Supabase publishable key (or legacy
  `anon` key). The app rejects service-role/secret keys.
- `MSONJO_SUPABASE_SERVICE_ROLE_KEY` — required only for the protected admin
  dashboard to create Auth users, assign memberships, and reset passwords.
  Configure it as a Vercel server-side environment secret, never as a
  `NEXT_PUBLIC_*` variable.
- `MSONJO_SITE_URL` — the canonical app origin, such as
  `http://localhost:3000` locally and the HTTPS Vercel domain in production.

The Supabase URL and publishable key are read by server code. The validated
publishable key is provided to the browser only for authenticated Realtime
updates. The service-role key is loaded by a server-only module for admin
operations. **Never configure it in a `NEXT_PUBLIC_*` variable, send it to a
browser, or commit it to the repository.**

Run `npm run typecheck`, `npm run lint`, and `npm run build` for local
validation. Vercel can use its standard Next.js build detection and `npm run
build`; `npm start` runs `next start` for local production-mode checks.

## Supabase database setup and migration

Use a dedicated Supabase project for MSONJO. Review and back up that project's
database before applying migrations. Apply the files in
`supabase/migrations/` in filename order:

1. `20261018000000_bizzflow_multitenant_foundation.sql`
2. `20261018010000_bizzflow_operations_reporting.sql`
3. `20261019010000_bizzflow_sale_payments_edits_and_daily_reports.sql`
4. `20261019020000_bizzflow_typed_manual_sale_items.sql`
5. `20261020000000_msonjo_single_business.sql`
6. `20261021000000_auth_user_membership_and_role_management.sql`

The final migration renames the existing sole business to MSONJO while
preserving its business ID and related product, sale, and stock records. On a
fresh database, it creates the fixed MSONJO business. It also removes
authenticated business updates and drops the public business-creation
function. It **aborts and rolls back** if more than one business exists. This
is deliberate: automatically combining tenant data or memberships could
silently change unique product identifiers, sale idempotency records, and who
can see private financial data. Back up and reconcile any multi-business
database explicitly before retrying; do not delete tenant IDs or bypass its
foreign keys/RLS.

These migrations are versioned SQL files; running this application does not
apply them. Confirm the Supabase project reference before using the Supabase
CLI or SQL editor. The migration state must be checked in the target project;
no remote database migration is claimed here.

The final migration adds an Auth trigger: each user created in Supabase Auth
is automatically added to the MSONJO business with the `attendant` inventory
role. It also adds existing Auth users who do not already have MSONJO
membership. An administrator can change each user's inventory role from the
User administration page. The inventory role is separate from
`app_metadata.role = 'admin'`, which controls access to user administration.
Dashboard-created users keep the role selected during creation.

### Initial administrator and staff accounts

Disable public signups in Supabase Auth. Create the initial admin Auth user
manually in the Supabase dashboard, using a username-based internal email:
`<username>@msonjo-<project-ref>.com` (for example, if the project URL is
`https://abc123.supabase.co`, use `owner@msonjo-abc123.com`). These internal
addresses are never used for email delivery; managed accounts are created
with email confirmation enabled. Set a strong initial password and mark the
email as confirmed. Then set the trusted app metadata and business owner
membership in the dedicated project's SQL editor, replacing the username and
email:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('role', 'admin', 'username', 'owner'),
    raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('name', 'MSONJO Owner')
where lower(email) = lower('owner@msonjo-<project-ref>.com');

insert into public.business_members (business_id, user_id, role)
select business.id, auth_user.id, 'owner'
from public.businesses as business
cross join auth.users as auth_user
where business.slug = 'msonjo-gas-house-hold'
  and lower(auth_user.email) = lower('owner@msonjo-<project-ref>.com')
on conflict (business_id, user_id)
do update set role = excluded.role;
```

Only `app_metadata.role = 'admin'` grants access to User administration;
user-editable `user_metadata` is never used for that check. Sign in with the
admin username or the exact Supabase Auth email and password, then use **User administration** to create
username/password accounts, optionally record a contact email, and assign
their inventory role. Admins can view and update contact emails in the user
list; these are stored as `user_metadata.contact_email` in Supabase Auth.
Changing a contact email does not change the generated Auth sign-in email, so
username/password login continues to work and no email confirmation is sent.
The admin secret is required for this page. Public account creation and
self-service password reset are disabled.

Passwords are stored only by Supabase Auth in its non-reversible password
format. The dashboard never stores or retrieves a user's existing password.
An admin can reset a password; the newly entered password is viewable in that
open form only, so it must be shared with the user before leaving or reloading
the page. Use a unique password and have the user keep it private.

The app creates confirmed internal Auth identities with the email address
`<username>@msonjo-<project-ref>.com`; users can sign in with their username
or that exact Supabase Auth email and password, and do not need a real email
address. A contact email saved in user metadata is not an Auth sign-in email;
users with dashboard-created accounts should use their username. Contact
email is not currently used for notifications or account recovery. App users
cannot add themselves to
`business_members`; authenticated data remains scoped by the existing RLS
policies and membership checks. Products, sales, stock movements, and reports
are shared across devices for authorized MSONJO members, subject to each
member's role.

## Authentication and Vercel

1. Apply and verify the reviewed Supabase migrations, then authorize the
   owner's Supabase Auth account as described above.
2. Import this Next.js project into Vercel. Set the `MSONJO_*`
   environment variables for **Production**, **Preview**, and **Development**
   as appropriate. Configure the service-role key only as a server-side
   secret. Set `MSONJO_SITE_URL` to the matching HTTPS deployment origin for
   production.
3. In Supabase Auth URL configuration, set the production Site URL and allow
   the exact Vercel deployment origin(s). Email delivery is not required for
   username/password accounts.
4. Deploy from Vercel and verify login, inventory reads, sales, stock changes,
   reports, and Realtime updates with authorized accounts on multiple devices.

## Existing functionality and scope

The current codebase implements product management, stock adjustments and
movement history, sales (including payments and sale edits), low-stock
indicators, dashboard summaries, and reports. It does not currently contain
purchase, supplier, or expense modules; this branding/architecture update does
not replace them with mock screens or claim they are implemented.
