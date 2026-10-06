#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

# Cypress is Electron-based; prevent shells configured to run Electron as Node
# from breaking the browser test runner.
unset ELECTRON_RUN_AS_NODE || true

trap 'echo "Deploy aborted - a previous step failed, nothing was committed or deployed." >&2' ERR

echo "Running Email Creator production hosting deploy"
echo "Firebase project context: taliferrotech"
firebase use taliferrotech

echo "Building the production Email Creator bundle..."
npm run build

echo "Running Email Creator unit tests..."
npm run test:ci

echo "Running Email Creator Cypress tests..."
npm run e2e

echo "Running TypeScript validation..."
npm run typecheck

if [ -n "$(git status --porcelain)" ]; then
  echo "Build and checks passed - committing changes before deploy..."
  git add -A
  git commit -m "Deploy Email Creator $(date +'%Y-%m-%d %H:%M:%S')"
else
  echo "No changes to commit - working tree already clean."
fi

echo "Deploying Email Creator to Firebase Hosting site todd-email-creator..."
firebase deploy --project taliferrotech --only hosting:todd-email-creator

echo "Email Creator hosting deploy complete."
