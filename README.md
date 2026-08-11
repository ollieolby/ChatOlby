# Human Chat

A deliberately non-AI chat service. Users create a unique username and sign in with email and password, keep their conversation history across devices, and start multiple chats; you answer from a phone-friendly private inbox with their username, text, or finger drawings.

## Architecture

- `index.html`: account login, conversation history, and visitor chat, suitable for GitHub Pages
- `operator.html`: private, password-protected phone inbox
- `manifest.webmanifest` and `sw.js`: installable operator PWA and push notification handling
- Supabase Edge Function: validates visitor tokens and operator identity
- Supabase Postgres: stores conversations and messages behind RLS

## Set up Supabase

1. Create a Supabase project.
2. Open the SQL editor and run `supabase/schema.sql`.
3. In Authentication → URL Configuration, add your GitHub Pages URL to Redirect URLs.
4. Install the Supabase CLI, log in, and link this folder to the project.
5. Set the operator email and deploy the function:

```sh
supabase secrets set OPERATOR_EMAIL=you@example.com
supabase functions deploy chat
```

6. Copy `Project URL` and the public `anon` key from Project Settings → API into `config.js`. The anon key is designed to be public; never put the service-role key there.
7. In Authentication → Providers → Email, leave email enabled and disable passwordless-only login. Set the minimum password length to at least 12 under Authentication security settings and enable leaked-password protection if your plan offers it.
8. Create your operator account once through the normal registration page using exactly the email configured in `OPERATOR_EMAIL`, a unique username, and a strong password. After confirming the email, sign out and use `/operator.html`; other users cannot access the operator API.

## Enable phone push notifications

Generate one VAPID key pair on your computer:

```sh
npx web-push generate-vapid-keys
```

Copy the public key into `config.js` as `vapidPublicKey`. Store the public and private keys in Supabase along with a contact URI (use your real email):

```sh
supabase secrets set VAPID_PUBLIC_KEY="YOUR_PUBLIC_KEY"
supabase secrets set VAPID_PRIVATE_KEY="YOUR_PRIVATE_KEY"
supabase secrets set VAPID_SUBJECT="mailto:you@example.com"
supabase functions deploy chat
```

The public key is safe to commit. Never put the private key in `config.js`, GitHub, or any frontend file.

After GitHub Pages is live, install the inbox on your phone:

- **iPhone/iPad (iOS 16.4 or newer):** open `/operator.html` in Safari, tap Share, choose **Add to Home Screen**, open the installed app, sign in, then tap the outlined diamond beside Refresh and allow notifications.
- **Android:** open `/operator.html` in Chrome, choose **Install app** or **Add to Home screen**, open it, sign in, tap the outlined diamond, and allow notifications.

Send a visitor message while the installed inbox is closed. The lock-screen notification intentionally contains no username or message preview; tapping it opens the authenticated conversation, where the username and message are shown. iOS web push requires the site to be installed on the Home Screen. Browser privacy modes and system Focus/Do Not Disturb settings can suppress the visible alert.

Only the account matching the private `OPERATOR_EMAIL` secret can register or remove notification devices. Delivery rechecks that email before every push and deletes subscriptions that no longer belong to the configured operator. Tap the filled diamond in the inbox to revoke notifications from the current device.

Passwords are sent directly over HTTPS to Supabase Auth and are never stored by this site. The operator page cannot create accounts, and the Edge Function independently verifies every session, operator email, and conversation owner. Add only your exact HTTPS site URL under Authentication → URL Configuration; do not use a wildcard redirect in production.

## Publish on GitHub Pages

Push these files to a GitHub repository, then choose **Settings → Pages → Deploy from a branch** and select the main branch at `/ (root)`. Your public chat is at the Pages URL, and the inbox is at `/operator.html`.

GitHub Pages automatically serves the included childlike Microsoft Paint-style `404.html` when a route does not exist.

For a custom domain, add it in the same Pages settings. Put that exact HTTPS URL in Supabase's redirect allow-list too.

## Local preview

Use any static server (modules do not work reliably from `file://`):

```sh
python3 -m http.server 8080
```

Then visit `http://localhost:8080` and `http://localhost:8080/operator.html`.

## Notifications

This first version refreshes the phone inbox every five seconds while it is open. True lock-screen push notifications need one additional delivery channel (for example Telegram, email, or web push); the Edge Function is the right place to add it after the core flow is deployed.
