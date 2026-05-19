export { CLAUDE_SPINNER_VERBS } from "./lib/claude-spinner-verbs.js";

/**
 * Compatibility shim:
 * some local setups referenced this helper file as an extension entry.
 * Exporting a no-op factory avoids startup failures while keeping the shared verb list importable.
 */
export default function () {}
