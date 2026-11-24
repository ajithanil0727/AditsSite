# Test site on Vercel + Neon + Supabase Storage or Cloudflare R2 (free)

A temporary online copy for the company to test. Not the final production setup (see `DEPLOYMENT.md` for that).

| Piece | Service (free plan) | What it holds |
| --- | --- | --- |
| App | Vercel (Hobby) | The website, staff panel and student portal; updates itself from GitHub |
| Database | Neon (Free) | All records |
| Files | Supabase Storage (Free, 1 GB, no card) or Cloudflare R2 (Free, 10 GB, card on file) | Logos, photos, bills, imports |

Who does what: **you** create the three free accounts and paste keys into their screens. **Claude** prepares the code, sets up
the database and data, checks the live site, and gives you the logins for testers. Keys stay on your computer and in the
services' settings: never paste them into chat, email or WhatsApp.

---

## Part 1: You create the accounts (about 20 minutes)

### Step 1. Neon (database)
1. Go to https://neon.tech, click **Sign up**, choose **Continue with GitHub** (the account that owns the AditsSite repo).
2. Create a project:
   - **Name:** `adits-test`
   - **Postgres version:** 17
   - **Region:** **Asia Pacific (Singapore)**
3. On the project dashboard, click **Connect**. In the box that opens:
   - Turn **Connection pooling OFF** (we want the **direct** connection).
   - Copy the connection string. It looks like `postgresql://neondb_owner:xxxx@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`.
4. Keep it for Step 4.

### Step 2a. Supabase Storage (files, no card needed: recommended)
1. Go to https://supabase.com → **Start your project** → **Continue with GitHub**.
2. **New project**: name `adits-files`, region **South Asia (Mumbai)**, any strong database password (its database isn't used).
3. **Storage → New bucket**: name `adits-test`, **Public bucket OFF**.
4. **Project Settings → Storage → S3 Connection**: make sure it's enabled; copy the **Endpoint** and **Region**; click
   **New access key** and copy the **Access key ID** and **Secret access key** (shown once).
5. Free projects pause after about a week without activity: if images stop loading, open Supabase and click **Restore project**.

Skip Step 2b if you use Supabase.

### Step 2b. Cloudflare R2 (files, alternative; needs a card on file)
1. Go to https://dash.cloudflare.com/sign-up and create an account (email + password), verify your email.
2. In the left menu open **R2 Object Storage**. Click **Purchase R2 / Add R2 subscription**: it asks for a card even on the free
   plan (10 GB free; testing uses far less, so nothing is charged).
3. Click **Create bucket**:
   - **Name:** `adits-test`
   - **Location:** Automatic (or hint **Asia-Pacific**)
   - Keep it **private** (don't turn on public access).
4. Back on the R2 overview page, note the **Account ID** shown on the right (a long code). Your endpoint is
   `https://<Account ID>.r2.cloudflarestorage.com`.
5. Click **Manage R2 API tokens** (or **API → Manage API tokens**) → **Create API token**:
   - **Name:** `adits-test-app`
   - **Permissions:** **Object Read & Write**
   - **Specify bucket:** `adits-test` only
   - **TTL:** forever
   - Click **Create**. Copy the **Access Key ID** and the **Secret Access Key** (the secret is shown only once).

### Step 3. Vercel (account only for now)
1. Go to https://vercel.com/signup, choose **Hobby**, **Continue with GitHub**, and allow access to the **AditsSite** repository.
2. Don't create the project yet (Part 3).

### Step 4. Put the keys in one local file
1. In the project folder `D:\ManagementSoftware`, copy `.env.vercel.example` to a new file named **`.env.vercel`**
   (it's ignored by Git, so it never goes to GitHub).
2. Fill in:
   - `DATABASE_URL`: the Neon connection string from Step 1
   - `S3_ENDPOINT`, `S3_REGION`: Supabase: the Endpoint and Region from Step 2a. R2: `https://<Account ID>.r2.cloudflarestorage.com` and `auto`.
   - `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`: from Step 2a (or 2b)
   - `SEED_DEFAULT_PASSWORD`: a password for **all demo logins** on the test site (at least 10 characters, with a letter and a number). Don't use `Demo@12345`: the test site is on the internet.
   - Leave `BETTER_AUTH_SECRET`, `DATA_ENCRYPTION_KEY`, `CRON_SECRET`, `BETTER_AUTH_URL`, `APP_URL` empty: Claude fills them.
3. Save the file and tell Claude "the .env.vercel file is ready".

## Part 2: Claude prepares the database (about 10 minutes)
Claude, on your computer:
1. Fills the three random secrets in `.env.vercel`.
2. Creates all tables in Neon and loads the **demo data** (or a clean setup, if you prefer), with brand images uploaded to file storage.
3. Checks the connection to Neon and the file storage.
4. Commits and pushes the latest code to GitHub (with your OK).

## Part 3: You create the Vercel project (about 10 minutes)
1. On https://vercel.com, click **Add New… → Project**, find **AditsSite**, click **Import**.
2. **Framework preset:** Next.js (detected automatically). Leave the build settings as they are.
3. Open **Environment Variables**. Open `.env.vercel` in Notepad, select everything **except** the `SEED_DEFAULT_PASSWORD` line,
   copy, and paste it into the first **Key** box: Vercel splits it into separate variables by itself.
   (Don't add `NODE_ENV`: Vercel sets it automatically.)
4. Click **Deploy** and wait 2–4 minutes.
5. When it says **Congratulations**, copy the address (e.g. `https://adits-site.vercel.app`, also shown under **Domains**).
6. Go to **Settings → Environment Variables**, edit `BETTER_AUTH_URL` and `APP_URL`, set both to that address (with `https://`,
   no slash at the end). Put the same address in your `.env.vercel`.
7. Go to **Deployments**, open the latest one, click **⋯ → Redeploy** (so the new address takes effect).
8. Optional: **Settings → Domains** lets you change `adits-site` to something nicer (e.g. `adits-test.vercel.app`) for free;
   then update `BETTER_AUTH_URL` / `APP_URL` again and redeploy.

## Part 4: Claude checks the live site
Tell Claude the address. Claude signs in with the demo logins, checks the website, uploads, Excel downloads and the main
screens, and gives you the list of logins to share with testers.

---

## After that
- **Every change Claude pushes to GitHub goes live automatically** in about 2 minutes (Vercel redeploys by itself).
- **Emails** are off on the test site (no email account set up). Student portal invites show the link on screen to copy.
  To turn emails on later, add the `SMTP_…` values in Vercel and redeploy.
- **Database changes** (new tables): Claude runs them against Neon from your computer before pushing.
- **Limits of the free plans:** fine for a team testing; not for the real launch. When you go live, move to the production
  setup in `DEPLOYMENT.md`. Vercel's free plan is meant for non-commercial use, so don't run the business on it.
- **Turning it off:** delete the project in Vercel, the project in Neon, and the Supabase project (or the Cloudflare bucket).
