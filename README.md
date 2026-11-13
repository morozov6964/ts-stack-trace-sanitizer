# ts-stack-trace-sanitizer

Parses a Node.js or browser stack string, strips `node_modules` and framework
internals, and returns only the frames originating from application source.

```js
import { sanitizeStack } from 'ts-stack-trace-sanitizer';

const stack = [
  'Error: boom',
  '    at app (/srv/app/index.js:10:5)',
  '    at require (node:internal/modules/cjs/helpers:102:18)',
  '    at f (/srv/app/node_modules/left-pad/index.js:5:9)',
].join('\n');

console.log(sanitizeStack(stack));
// Error: boom
//     at app (/srv/app/index.js:10:5)
```

## Why this exists

Raw stacks from Node and browsers are dominated by frames the reader did not
write: `node_modules`, `node:` internals, and framework plumbing. Filtering
them by hand is tedious and easy to get wrong, so this library does it with a
small, explicit rule set. The trade-off is that it only recognises a fixed list
of framework internals (`express`, `next`, `react`, `react-dom`). Anything else
is treated as application code. That is intentional: a false positive hides a
real frame, which is worse than showing a framework frame.

## API

- `parseStack(stack)` — returns `{ header, frames, other }`.
- `isApplicationFrame(frame)` — `true` when the frame is not in
  `node_modules`, not a `node:` internal, and not a known framework internal.
- `sanitizeStack(stack)` — returns a new stack string with only application
  frames.
- `extractPath(frame)` — returns the raw path from a frame line, or `''`.

## Edge cases

A frame with no recognisable path is dropped, because the library cannot prove
it is application code. Non-frame lines (source extracts, `^` markers) are
dropped too, since they only make sense next to the frames that were removed.
The header line is preserved verbatim.

## Performance

The window keeps a bounded buffer, so `push` is constant time and memory does not
grow with the length of the stream. `peak` and `trough` are linear in the window
size, which is the trade that keeps `push` cheap.

