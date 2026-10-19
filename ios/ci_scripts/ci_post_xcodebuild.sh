#!/bin/bash

echo "Running ci_post_xcodebuild.sh..."

# Upload the archive's dSYMs to Sentry so iOS crashes and app hangs symbolicate —
# without them every in-app frame reads "Unknown function". Only archive actions
# set CI_ARCHIVE_PATH. Deliberately no `set -e`: a Sentry outage or a missing
# token must never fail an App Store build.
if [ -z "$CI_ARCHIVE_PATH" ]; then
    echo "No archive (action: ${CI_XCODEBUILD_ACTION:-unknown}) — skipping Sentry dSYM upload"
    exit 0
fi
if [ -z "$SENTRY_AUTH_TOKEN" ]; then
    echo "warning: SENTRY_AUTH_TOKEN not set — skipping Sentry dSYM upload"
    exit 0
fi

if ! command -v sentry-cli >/dev/null 2>&1; then
    if ! brew install getsentry/tools/sentry-cli; then
        echo "warning: sentry-cli install failed — dSYMs not uploaded"
        exit 0
    fi
fi

# sentry-cli reads SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT from the environment.
if sentry-cli debug-files upload "$CI_ARCHIVE_PATH/dSYMs"; then
    echo "Uploaded dSYMs to Sentry"
else
    echo "warning: Sentry dSYM upload failed — upload $CI_ARCHIVE_PATH/dSYMs manually with sentry-cli"
fi
