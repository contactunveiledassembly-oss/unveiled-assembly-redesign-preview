#!/bin/zsh
# Genuine Stripe TEST-MODE purchase run against the local Firebase
# emulators (project demo-uastripetest — no real database or files).
#
#   zsh tests/stripe-testmode/run.sh
#
# Needs a Stripe TEST secret key on the STRIPE_SECRET_KEY= line of
# functions/.secret.local (git-ignored; see SETUP.md). This script:
#   - refuses to run unless that key starts with sk_test_ (never live);
#   - never prints the key: every line of output is passed through a
#     filter that hides anything shaped like a Stripe key or secret;
#   - makes a fresh random local webhook secret for this run only, and
#     deletes it (and every log) afterwards.
set -u
cd "${0:A:h}/../.."
SECRET_FILE=functions/.secret.local
ENV_FILE=functions/.env.demo-uastripetest
redact(){ sed -E 's/(sk|rk|pk)_(test|live)_[A-Za-z0-9*]+/[hidden-key]/g; s/whsec_[A-Za-z0-9_*]+/[hidden-secret]/g'; }

if ! git check-ignore -q "$SECRET_FILE"; then echo "Stopped: $SECRET_FILE is not git-ignored."; exit 1; fi
if grep -Eq '^STRIPE_SECRET_KEY=(sk|rk)_live_' "$SECRET_FILE"; then echo "Stopped: that is a LIVE key. Only a test key (sk_test_…) may be used here."; exit 1; fi
if ! grep -Eq '^STRIPE_SECRET_KEY=sk_test_[A-Za-z0-9]{20,}' "$SECRET_FILE"; then echo "Stopped: no Stripe test key found on the STRIPE_SECRET_KEY= line of $SECRET_FILE (see tests/stripe-testmode/SETUP.md)."; exit 1; fi

export JAVA_HOME="${JAVA_HOME:-/private/tmp/claude-501/-Users-yaunahlove/3f5ef4da-4a2b-441c-8f0e-25031016718f/scratchpad/jdk/jdk-21.0.13+9/Contents/Home}"
export PATH="$JAVA_HOME/bin:$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"

# Key goes into this process's environment only (not a file, not argv).
export STRIPE_API_KEY="$(sed -n 's/^STRIPE_SECRET_KEY=//p' "$SECRET_FILE" | head -1)"
# One-run local signing secret for relayed test events.
export UA_RUN_WEBHOOK_SECRET="whsec_$(openssl rand -hex 24)"
umask 077
printf 'UA_EMULATOR_WEBHOOK_SECRET=%s\n' "$UA_RUN_WEBHOOK_SECRET" > "$ENV_FILE"
cleanup(){ rm -f "$ENV_FILE" firestore-debug.log firebase-debug.log ui-debug.log database-debug.log pubsub-debug.log; unset STRIPE_API_KEY UA_RUN_WEBHOOK_SECRET; }
trap cleanup EXIT

node_modules/.bin/firebase emulators:exec --project demo-uastripetest --only auth,firestore,storage,functions \
  "node tests/stripe-testmode/purchase-run.manual.mjs" 2>&1 | redact | grep -vE '^\s*>\s*\{"verifications"'
exit ${pipestatus[1]}
