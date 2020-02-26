#!/usr/bin/env bash

git push --follow-tags origin master
npm run build
npm publish --access public
