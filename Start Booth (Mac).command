#!/bin/bash
# Double-click this file to start the Career Transformation booth on a Mac.
# Keep the Terminal window open while the booth runs. Close it to stop the booth.
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"   # where the Node.js installer puts node

if ! command -v node >/dev/null 2>&1 || ! node -e 'process.exit(typeof process.loadEnvFile === "function" ? 0 : 1)'; then
  echo "Node.js (version 20.12 or newer) is needed to run the booth."
  osascript -e 'display dialog "The booth needs Node.js (free).\n\nInstall the LTS version from nodejs.org, then double-click Start Booth again." buttons {"Open nodejs.org"} default button 1 with title "Career Transformation"' >/dev/null 2>&1
  open "https://nodejs.org/"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "First start: installing (needs internet, about a minute)..."
  npm install --omit=dev --no-audit --no-fund || { echo "Install failed. Check the internet connection and try again."; read -r -p "Press Enter to close."; exit 1; }
fi

echo ""
echo "Starting the booth. Keep this window open; close it to stop the booth."
echo ""
OPEN_BROWSER=1 node server.js
read -r -p "The booth stopped. Press Enter to close."
