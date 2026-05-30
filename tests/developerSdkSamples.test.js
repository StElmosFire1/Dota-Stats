'use strict';

// Task #462 — drift guard. Ensures every endpoint in the Developers portal
// ENDPOINTS manifest has a "Use the SDK" sample (SDK_CALLS) AND that both
// official client libraries actually implement the method each sample calls.
// This fails fast when a new /v1 endpoint is added without SDK coverage.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const devSrc = fs.readFileSync(
  path.join(ROOT, 'web/src/pages/Developers.jsx'),
  'utf8',
);
const jsClient = fs.readFileSync(
  path.join(ROOT, 'packages/sdk-js/src/client.ts'),
  'utf8',
);
const pyClient = fs.readFileSync(
  path.join(ROOT, 'packages/sdk-python/src/oce_inhouse/client.py'),
  'utf8',
);

function sliceBlock(src, startMarker, openChar, closeChar) {
  const start = src.indexOf(startMarker);
  assert.notEqual(start, -1, `could not find ${startMarker}`);
  let depth = 0;
  let i = src.indexOf(openChar, start);
  const from = i;
  for (; i < src.length; i++) {
    if (src[i] === openChar) depth++;
    else if (src[i] === closeChar) {
      depth--;
      if (depth === 0) return src.slice(from, i + 1);
    }
  }
  throw new Error(`unbalanced block for ${startMarker}`);
}

const endpointsBlock = sliceBlock(devSrc, 'const ENDPOINTS = [', '[', ']');
const sdkCallsBlock = sliceBlock(devSrc, 'const SDK_CALLS = {', '{', '}');

const endpointIds = [...endpointsBlock.matchAll(/\bid:\s*'([^']+)'/g)].map((m) => m[1]);
const sdkCallKeys = [...sdkCallsBlock.matchAll(/(?:^|\s)['"]?([\w-]+)['"]?\s*:\s*\{/gm)]
  .map((m) => m[1]);

test('every endpoint has a Use-the-SDK sample', () => {
  assert.ok(endpointIds.length >= 15, 'expected the full ENDPOINTS manifest');
  for (const id of endpointIds) {
    assert.ok(
      sdkCallKeys.includes(id),
      `endpoint "${id}" is missing an SDK sample in SDK_CALLS`,
    );
  }
});

test('no orphan SDK samples without a matching endpoint', () => {
  for (const key of sdkCallKeys) {
    assert.ok(
      endpointIds.includes(key),
      `SDK_CALLS has key "${key}" with no matching endpoint id`,
    );
  }
});

test('both SDKs implement every sampled method', () => {
  // Pull each sample's call expression back out of the JSX.
  const calls = [...sdkCallsBlock.matchAll(
    /['"]?[\w-]+['"]?\s*:\s*\{[\s\S]*?js:\s*(['"`])([\s\S]*?)\1[\s\S]*?py:\s*(['"`])([\s\S]*?)\3/g,
  )];
  assert.equal(calls.length, sdkCallKeys.length, 'failed to parse every SDK sample');
  for (const [, , jsCall, , pyCall] of calls) {
    const jsMethod = /\.(\w+)\s*\(/.exec(jsCall.split('client')[1] || jsCall);
    const pyMethod = /\.(\w+)\s*\(/.exec(pyCall.split('client')[1] || pyCall);
    assert.ok(jsMethod, `could not extract a method from JS sample: ${jsCall}`);
    assert.ok(pyMethod, `could not extract a method from Python sample: ${pyCall}`);
    assert.ok(
      jsClient.includes(`${jsMethod[1]}(`),
      `JS SDK is missing method "${jsMethod[1]}()" used by a sample`,
    );
    assert.ok(
      pyClient.includes(`def ${pyMethod[1]}(`),
      `Python SDK is missing method "${pyMethod[1]}()" used by a sample`,
    );
  }
});
