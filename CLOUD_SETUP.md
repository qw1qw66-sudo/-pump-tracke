# Cloud Sync Setup for Pump Tracker

This setup converts the current iPhone PWA from local-only storage to cloud sync across multiple phones.

## What was added

- `supabase-schema.sql` — database table and Row Level Security policies.
- `supabase-config.example.js` — template for Supabase URL and public anon key.
- `cloud-sync.js` — sync module that connects the existing localStorage app to Supabase.

## Step 1 — Create Supabase project

1. Go to Supabase.
2. Create a new project.
3. Open **SQL Editor**.
4. Copy and run everything inside `supabase-schema.sql`.

## Step 2 — Add your Supabase keys

Create a new file named:

```txt
supabase-config.js
```

Use this content and replace the values:

```js
window.PUMP_TRACKER_SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
window.PUMP_TRACKER_SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_PUBLIC_KEY';
```

Important: use only the anon public key. Do not use the service_role key in frontend files.

## Step 3 — Connect the sync module to index.html

Before the closing `</body>` tag in `index.html`, add:

```html
<script src="supabase-config.js"></script>
<script type="module" src="cloud-sync.js"></script>
```

## Step 4 — Test on iPhone

1. Open the app link.
2. You should see a small Cloud button at the bottom-left.
3. Tap it.
4. Enter your email.
5. Send magic link.
6. Use the same email on the second iPhone.

## How the sync works

The existing app stores data under this localStorage key:

```txt
pump-tracker-v6
```

The sync module uploads that same data to Supabase and downloads newer changes from other devices.

## Current status

Cloud files are prepared. The last activation step is adding your actual Supabase URL and anon key in `supabase-config.js`, then adding the two script tags to `index.html`.
