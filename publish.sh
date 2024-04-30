#!/usr/bin/env bash

# Exit if any command fails
set -e

# Ensure we're on the master branch
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != "main" ]]; then
  echo 'You must be on the master branch to publish.';
  exit 1;
fi

# Ensure the working repository is clean
if ! git diff-index --quiet HEAD --; then
  echo 'The working repository is not clean. Please commit or stash your changes.';
  exit 1;
fi

# Push to origin
echo 'Pushing to origin...'
git push --follow-tags origin master

# Build the project
echo 'Building the project...'
pnpm build

# Publish the package
echo 'Publishing the package...'
npm publish --access public

echo 'Publication completed successfully.'
