# Setting up accounts (Supabase)

Accounts let players sign in with their email (a 6-digit code, no password) so their save follows
them to every device. Until these steps are done, the game works exactly as before: saves stay on
the device, and Settings shows the usual **Save transfer** button.

This takes about 10 minutes, once.

## 1. Make the project

1. Go to <https://supabase.com> and sign up (the free plan is enough).
2. **New project.** Pick any name (for example `hexbound`), set a database password (keep it
   somewhere safe; the game never needs it), and choose the region closest to you.
3. Wait a minute or two while it sets up.

## 2. Create the save table

1. In the project, open **SQL Editor** (left sidebar) › **New query**.
2. Paste everything from [`supabase/schema.sql`](../supabase/schema.sql) and press **Run**.
   It should say "Success. No rows returned".

## 3. Send a code instead of a link

By default Supabase emails a sign-in *link*. On iPhone a link opens Safari instead of the
installed game, so the game uses the 6-digit *code* instead.

1. Open **Authentication** › **Emails** (or **Email Templates**) › **Magic Link**.
2. Replace the message body with something like:

   ```html
   <h2>Your Hexbound code</h2>
   <p>Enter this code in the game to sign in:</p>
   <p style="font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
   <p>It expires in an hour. If you didn't ask for it, ignore this email.</p>
   ```

3. Do the same for **Confirm signup** (new players get that one the first time).
4. Save.

## 4. Allow the game's address

1. **Authentication** › **URL Configuration**.
2. Set **Site URL** to the game's address (the GitHub Pages link, for example
   `https://moistcaleb.github.io/Creature-Collector-Rougelite-Game/`).

## 5. Give the game the project's address and key

1. **Project Settings** › **API** (or **Data API** / **API Keys**).
2. Copy the **Project URL** and the **anon public** key. These two are meant to be public:
   the row-level security from step 2 keeps every save private to its owner.
   (Never share the `service_role` key.)
3. Put them in `src/net/accountConfig.ts`, or send them to Claude to do it.

Once that's deployed, Settings shows **Account & saves**.

## Good to know

- **Email limits:** Supabase's built-in email sender only sends a few emails an hour, which is
  fine for a few players. For more, add your own email service under
  **Authentication › Emails › SMTP Settings** (Resend, Brevo and others have free tiers).
- **Deleting accounts:** players can delete their own account in the game (Account & saves ›
  Delete my account). You can also delete one under **Authentication › Users**.
- **What's stored:** each player's email and their save. Nothing else.
