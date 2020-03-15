#!/usr/bin/env bash

git push --follow-tags origin master
yarn build && npm publish --access public
