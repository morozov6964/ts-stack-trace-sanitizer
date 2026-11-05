/**
 * Stack trace sanitizer core.
 *
 * A frame is considered "application" when it is not inside node_modules,
 * not a Node.js internal module (node:...), and not a known framework
 * internal (express, next, react-dom, etc.). The list of framework
 * internals is deliberately small and explicit: guessing by directory name
 * produces false positives that hide real user frames.
 *
 * Parsing is line-oriented. A frame is any line that starts with "at ".
 * Continuation lines (e.g. source extracts) are ignored. This keeps the
 * parser simple and avoids depending on V8's exact format, which changes
 * between Node versions.
 */

const NODE_MODULES = /(?:^|[\\/])node_modules[\\/]/;
const NODE_INTERNAL = /(?:^|\()node:/;
const FRAMEWORK_INTERNALS = [
  /(?:^|[\\/])express[\\/]lib[\\/]/,
  /(?:^|[\\/])next[\\/]dist[\\/]/,
  /(?:^|[\\/])react-dom[\\/]cjs[\\/]/,
  /(?:^|[\\/])react[\\/]cjs[\\/]/,
];

/**
 * Extract the file path (or URL) from a frame line.
 *
 * V8 frames look like one of:
 *   at fn (path:line:col)
 *   at path:line:col
 *   at fn (node:internal/foo:1:1)
 *   at async fn (path:line:col)
 *   at Object.<anonymous> (/app/index.js:1:1)
 *
 * We take the last parenthesised group if present, otherwise the last
 * whitespace-separated token. The result is the raw path; callers decide
 * whether it is a file URL.
 */
export function extractPath(frame) {
  if (typeof frame !== 'string') return '';
  const trimmed = frame.trim();
  if (!trimmed.startsWith('at ')) return '';
  const body = trimmed.slice(3).trim();
  const open = body.lastIndexOf('(');
  const close = body.lastIndexOf(')');
  if (open !== -1 && close === body.length - 1 && close > open) {
    return body.slice(open + 1, close);
  }
  const parts = body.split(/\s+/);
  return parts[parts.length - 1] || '';
}

/**
 * Decide whether a frame belongs to application source.
 *
 * A frame with no recognisable path is dropped: we cannot prove it is
 * application code, and including it would defeat the purpose.
 */
export function isApplicationFrame(frame) {
  const path = extractPath(frame);
  if (!path) return false;
  if (NODE_INTERNAL.test(path)) return false;
  if (NODE_MODULES.test(path)) return false;
  for (const re of FRAMEWORK_INTERNALS) {
    if (re.test(path)) return false;
  }
  return true;
}

/**
 * Split a stack string into frame lines and non-frame lines.
 *
 * The first line of a V8 stack is the error message and is preserved
 * as a header. Everything else is classified by the "at " prefix.
 */
export function parseStack(stack) {
  if (typeof stack !== 'string') {
    throw new TypeError('stack must be a string');
  }
  if (stack.length === 0) {
    return { header: '', frames: [], other: [] };
  }
  const lines = stack.split(/\r?\n/);
  // Drop a single trailing empty line produced by a trailing newline.
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  const header = lines[0] || '';
  const frames = [];
  const other = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trimStart().startsWith('at ')) {
      frames.push(line);
    } else {
      other.push(line);
    }
  }
  return { header, frames, other };
}

/**
 * Return a new stack string containing only application frames.
 *
 * The header is preserved verbatim. Non-frame lines are dropped: they are
 * usually source extracts or "Caused by" continuations that only make sense
 * with the frames we removed. Dropping them keeps the output a valid stack.
 */
export function sanitizeStack(stack) {
  const { header, frames } = parseStack(stack);
  const kept = frames.filter(isApplicationFrame);
  const parts = [];
  if (header) parts.push(header);
  for (const frame of kept) parts.push(frame);
  return parts.join('\n');
}
