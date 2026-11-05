import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractPath,
  isApplicationFrame,
  parseStack,
  sanitizeStack,
} from '../src/core.js';

const APP_STACK = [
  'Error: boom',
  '    at app (/srv/app/index.js:10:5)',
  '    at Object.<anonymous> (/srv/app/lib/util.js:3:1)',
  '    at Module._compile (node:internal/modules/cjs/loader:1101:14)',
  '    at Object.Module._extensions..js (/srv/app/node_modules/left-pad/index.js:5:9)',
  '    at require (node:internal/modules/cjs/helpers:102:18)',
].join('\n');

test('extractPath handles parenthesised frames', () => {
  assert.equal(
    extractPath('    at app (/srv/app/index.js:10:5)'),
    '/srv/app/index.js:10:5',
  );
});

test('extractPath handles bare frames', () => {
  assert.equal(
    extractPath('    at /srv/app/index.js:10:5'),
    '/srv/app/index.js:10:5',
  );
});

test('extractPath returns empty string for non-frames', () => {
  assert.equal(extractPath('Error: boom'), '');
  assert.equal(extractPath(''), '');
  assert.equal(extractPath(null), '');
});

test('isApplicationFrame rejects node_modules', () => {
  assert.equal(
    isApplicationFrame('    at f (/srv/app/node_modules/left-pad/index.js:5:9)'),
    false,
  );
});

test('isApplicationFrame rejects node: internals', () => {
  assert.equal(
    isApplicationFrame('    at require (node:internal/modules/cjs/helpers:102:18)'),
    false,
  );
});

test('isApplicationFrame rejects framework internals', () => {
  assert.equal(
    isApplicationFrame('    at handle (/srv/app/node_modules/express/lib/router/index.js:1:1)'),
    false,
  );
});

test('isApplicationFrame accepts application files', () => {
  assert.equal(
    isApplicationFrame('    at app (/srv/app/index.js:10:5)'),
    true,
  );
});

test('parseStack separates header, frames and other lines', () => {
  const stack = [
    'Error: boom',
    '    at app (/srv/app/index.js:10:5)',
    '    ^',
    '    at other (/srv/app/other.js:1:1)',
  ].join('\n');
  const { header, frames, other } = parseStack(stack);
  assert.equal(header, 'Error: boom');
  assert.deepEqual(frames, [
    '    at app (/srv/app/index.js:10:5)',
    '    at other (/srv/app/other.js:1:1)',
  ]);
  assert.deepEqual(other, ['    ^']);
});

test('parseStack rejects non-strings', () => {
  assert.throws(() => parseStack(undefined), TypeError);
  assert.throws(() => parseStack(42), TypeError);
});

test('parseStack handles empty input', () => {
  assert.deepEqual(parseStack(''), { header: '', frames: [], other: [] });
});

test('sanitizeStack keeps only application frames', () => {
  const out = sanitizeStack(APP_STACK);
  assert.equal(
    out,
    [
      'Error: boom',
      '    at app (/srv/app/index.js:10:5)',
      '    at Object.<anonymous> (/srv/app/lib/util.js:3:1)',
    ].join('\n'),
  );
});

test('sanitizeStack returns header alone when no application frames remain', () => {
  const stack = [
    'Error: boom',
    '    at Module._compile (node:internal/modules/cjs/loader:1101:14)',
    '    at f (/srv/app/node_modules/left-pad/index.js:5:9)',
  ].join('\n');
  assert.equal(sanitizeStack(stack), 'Error: boom');
});

test('sanitizeStack drops non-frame continuation lines', () => {
  const stack = [
    'Error: boom',
    '    at app (/srv/app/index.js:10:5)',
    '    ^',
    '    at other (/srv/app/other.js:1:1)',
  ].join('\n');
  assert.equal(
    sanitizeStack(stack),
    [
      'Error: boom',
      '    at app (/srv/app/index.js:10:5)',
      '    at other (/srv/app/other.js:1:1)',
    ].join('\n'),
  );
});

test('sanitizeStack tolerates CRLF line endings', () => {
  const stack = [
    'Error: boom',
    '    at app (/srv/app/index.js:10:5)',
    '    at require (node:internal/modules/cjs/helpers:102:18)',
  ].join('\r\n');
  assert.equal(
    sanitizeStack(stack),
    ['Error: boom', '    at app (/srv/app/index.js:10:5)'].join('\n'),
  );
});
