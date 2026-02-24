#!/bin/bash
set -e
mkdir -p dist

ENTRY_FILE="dist/_entry.js"
WIT_FILE="dist/_world.wit"

cat > "$ENTRY_FILE" <<'ENTRY'
import __runFunction from "@shopify/shopify_function/run"
import { run as runRun } from "user-function"
export function run() { return __runFunction(runRun) }
ENTRY

cat > "$WIT_FILE" <<'WIT'
package function:impl;

world shopify-function {
  export %run: func();
}
WIT

npx esbuild "$ENTRY_FILE" \
  --bundle \
  --outfile=dist/function.js \
  --alias:user-function=./src/run.js \
  --format=esm \
  --target=es2022 \
  --legal-comments=none

npx javy-cli compile -d \
  --wit "$WIT_FILE" \
  -n shopify-function \
  -o dist/function.wasm \
  dist/function.js
