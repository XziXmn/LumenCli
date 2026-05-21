/**
 * Legacy shim.
 *
 * Claude-style working / task / queued UI is now owned by
 * the interactive-mode core progress surface.
 *
 * Keep this file as a no-op shim so older local references don't break.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (_pi: ExtensionAPI) {}
