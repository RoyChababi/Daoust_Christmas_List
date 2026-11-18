# Family Christmas List 🎄

A private website where the family posts wish lists and claims gifts for each
other, so nobody buys the same gift twice. When someone claims a gift, everyone
else can see it, but the person who asked for the gift never can.

- **Cost:** $0. It runs on GitHub Pages and the Supabase free tier.
- **Tech:** plain HTML, CSS and JavaScript with no build step. The data lives in Supabase (Postgres).
- **Privacy:** the database enforces it, not the browser. See [How privacy works](#how-privacy-works).

---

## Setup (about 15 minutes)

### 1. Create the Supabase project

1. Go to <https://supabase.com>, sign up (free), and click **New project**.
   Choose any name and a strong database password. Pick the region closest to you (e.g. *Canada (Central)*).
2. Wait for the project to finish setting up (about 1 minute).

### 2. Create the database

1. Open [`supabase/schema.sql`](supabase/schema.sql) and edit the **Seed data** section at the bottom:
   - Replace `'change-me'` with the family passcode you'll text everyone. Capital letters don't matter.
   - Replace `('Example Person')` with the real names, one per line:
     ```sql
     insert into public.members (name) values
       ('Marie'),
       ('Paul'),
       ('Sophie')
     on conflict do nothing;
     ```
     You can also skip this and add people later on the **Admin** page.
2. In Supabase, open **SQL Editor** → **New query**, paste the whole file, and click **Run**.
   It should say *Success. No rows returned*.
3. *(Optional, recommended)* Paste [`supabase/tests.sql`](supabase/tests.sql) into a new query and run it.
   It should end with **`ALL TESTS PASSED (all test data rolled back)`**. The script reports this as an
   error on purpose: raising the error is what undoes the test data.

> Running `schema.sql` again later is safe. It updates the functions and doesn't delete any data
> (the passcode and names in the seed section are only inserted if they're missing).

### 3. Connect the website to Supabase

1. In Supabase, go to **Project Settings → API** (or click **Connect**).
2. Copy the **Project URL** and the **anon / public** key.
3. Paste them into [`config.js`](config.js):
   ```js
   window.CONFIG = {
     SUPABASE_URL: 'https://abcdefgh.supabase.co',
     SUPABASE_ANON_KEY: 'eyJhbGciOi...',
   };
   ```
   The anon key is meant to be public, so committing it is fine. Never put the
   **service_role** key in this file.

### 4. Publish on GitHub Pages

1. Create a repository on GitHub (it can be private if you have GitHub Pro; otherwise public is fine,
   because no family data is stored in the repo).
2. Push this folder:
   ```bash
   git add .
   git commit -m "Family Christmas list"
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   branch **main**, folder **/ (root)** → **Save**.
4. After a minute the site is live at `https://<you>.github.io/<repo>/`.

### 5. First login (Roy / admin)

1. Open the site, enter the passcode, pick **Roy**, and choose a 4-digit PIN.
2. The **Admin** tab appears. From there you can:
   - add, rename or remove family members
   - reset a PIN (when someone forgets theirs, or to fix a mix-up)
   - make someone else an admin
   - change the family passcode
   - start a new season (see below)
3. Text the family the link and the passcode. When each person first picks their
   name, they choose their own PIN.

---

## Everyday use

| Page | What it does |
|---|---|
| **My List** | Your own wish list. Add, edit or delete items one at a time, or download the Excel file, fill it in, and upload it. You never see claims here. |
| **Family** | Everyone else's lists. Tap **Claim** to reserve a gift. Items someone else claimed show as crossed out with "Claimed by …". |
| **My Claims** | Your shopping list, grouped by person, with a private **Bought** checkbox and totals. |
| **Admin** | Roy (and any other admins) only. |

**Excel upload:** the upload *replaces* your list with what's in the file. Items are matched by
name, ignoring capital letters, punctuation and extra spaces, so `Red Sweater!` matches
`red sweater`. If you change the other columns of a matching item, the item is updated and any
claim on it is kept. A preview ("3 new, 1 updated, 2 removed") shows the changes before anything is saved.

**Admins clearing claims:** on any family member's list, an admin sees a **Clear claim (admin)**
button under each item someone else has claimed.

### New year

On **Admin → New year**, enter the new year and choose:

- **Archive and start new season**: hides all current lists and claims but keeps them in the
  database. If you switch back to the old year, they come back.
- **Wipe everything**: permanently deletes every list and claim. To confirm, you have to type WIPE.

Either way, everyone keeps their name and PIN.

---

## How privacy works

The anon key in `config.js` is public, so the browser can't be trusted. The database itself is locked down:

- **Row Level Security** is enabled on every table with **no policies**, and the `anon` role has no
  table privileges at all. Reading a table directly returns `permission denied`.
- The site can only call the functions in `schema.sql` (`SECURITY DEFINER`). Each one first checks
  the passcode or a session token. Helper functions live in a `private` schema that the API can't reach.
- `get_my_list` returns your items **without** any claim columns and without items you removed.
  Claim data for your own items never leaves the database for you.
- `get_family_list` refuses to show you your own list.
- The passcode and PINs are stored as bcrypt hashes (`pgcrypto`), never in plain text.
- After 5 wrong PINs, the account locks for 10 minutes. Each wrong passcode attempt is slowed down by 1 second.
- Claiming is atomic. A unique index on `claims.item_id` means that if two people tap **Claim** at the
  same moment, exactly one wins and the other sees "Already claimed by …".

## Known limits

- **Supabase pauses free projects after about a week with no activity.** If the site says it can't reach the
  server, log in to <https://supabase.com/dashboard> and click **Restore project** (it takes a minute or two).
  To avoid this during December, just make sure someone visits the site every few days.
- Someone who has the passcode could still try to guess another person's 4-digit PIN. The 10-minute lock after
  5 wrong tries makes that very slow, and the admin can reset a PIN at any time.
- Sessions last a year on each device. **Switch user** logs out on that device.

## Updating the site later

- **Code changes:** edit the files and push. GitHub Pages redeploys in about a minute. Browsers cache files for
  about 10 minutes. To force everyone to get the new version right away, bump the `?v=1` numbers in `index.html`.
- **Database changes:** re-run `schema.sql` in the SQL Editor.

## Adding French later

All the text on screen lives in [`js/strings.js`](js/strings.js). To add French, copy the `en` block to `fr`,
translate the values, and change `AVAILABLE` to `['en', 'fr']`. An EN/FR button then appears in the header
automatically. The Excel upload already recognizes French column titles (*Article, Lien, Prix, Taille / Couleur,
Priorité, Remarques*) and priorities (*Haute, Moyenne, Basse*).

## Files

```
index.html            the single page
config.js             Supabase URL + anon key (edit this)
css/styles.css        styles (mobile first)
js/strings.js         all UI text (for translation)
js/api.js             calls to the database functions
js/excel.js           Excel template + upload parsing (SheetJS, loaded only when needed)
js/app.js             screens and logic
supabase/schema.sql   tables, security, all functions, seed data
supabase/tests.sql    automated checks for the merge, claim and privacy rules
docs/TEST_CHECKLIST.md  manual test checklist
```
