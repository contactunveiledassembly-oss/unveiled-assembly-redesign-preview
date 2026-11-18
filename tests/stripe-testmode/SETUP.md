# Stripe test-mode run — local setup

This runs a genuine Stripe **test-mode** purchase against the local
Firebase emulators. No live payments, no real cards, no real database.

## 1. Use a separate, empty Stripe Sandbox

Your existing Stripe test environment has a webhook that points at the
deployed sandbox functions, which share the live Firebase project. Test
events sent there would reach those functions. To keep this run fully
separate:

1. In the Stripe Dashboard, open the account menu (top left) →
   **Sandboxes** → **Create sandbox**. Give it a name such as
   "UA local test run".
2. Switch into that sandbox. Do **not** add any webhook endpoints to it.
3. Optional, for receipt emails: in that sandbox go to **Settings →
   Business → Customer emails** and turn on **Successful payments**.
4. Open **Developers → API keys** and copy the **Secret key**. It begins
   with `sk_test_`. Never use a key beginning with `sk_live_`.

The run stops by itself if that sandbox has any enabled webhook endpoint.

## 2. Put the key in the git-ignored file

Edit `functions/.secret.local`. This file is ignored by git, and a local
pre-commit check refuses to commit it or anything that looks like a key.

Change **only** the `STRIPE_SECRET_KEY=` line so it reads
`STRIPE_SECRET_KEY=` followed directly by your `sk_test_…` key, with no
spaces or quotes. Leave the `STRIPE_WEBHOOK_SECRET=` line as it is.

To do this:

- Open it in your editor (VS Code → File → Open →
  `functions/.secret.local`), paste over the old value after the `=`,
  and save.

Do not paste the key into chat, email, or any other file.

## 3. Tell Claude it is in place

Claude then runs `zsh tests/stripe-testmode/run.sh`. That script:

- refuses to run unless the key starts with `sk_test_`;
- passes the key only through the environment;
- hides anything shaped like a key or secret in all output;
- creates a one-run local webhook secret and deletes it afterwards.

The automated test suite never uses the key: it runs in offline mode and
never contacts Stripe.

## 4. Afterwards

You may leave the test key in place for later test runs, or remove it
by restoring the line to `STRIPE_SECRET_KEY=sk_test_dummy_not_real`.
Deleting the Stripe Sandbox afterwards removes all of its test data.
