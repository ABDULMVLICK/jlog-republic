#!/bin/bash

# Try to load NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

# Check if nvm is available
if command -v nvm &> /dev/null; then
    echo "Switching to Node 20..."
    nvm use 20
else
    echo "NVM not found. Please ensure Node 20 is installed and active."
fi

# Check current node version
CURRENT_NODE=$(node -v)
echo "Using Node version: $CURRENT_NODE"

# Run Strapi
echo "Starting Strapi..."
cd "$(dirname "$0")"
npm run develop
