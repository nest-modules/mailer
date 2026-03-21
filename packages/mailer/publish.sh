#!/usr/bin/env bash

git push --follow-tags origin main
pnpm run build
npm publish --access public
