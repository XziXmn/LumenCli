/**
 * TUI mode entry point.
 * Launches the Lumen-native OpenTUI + SolidJS terminal interface.
 */

import { runLumenTui } from "../../../../lumen-tui/src/app.js";
import type { AgentSessionRuntime } from "../../core/agent-session-runtime.js";
import { createAgentSessionTuiRuntime } from "./adapter/agent-session-runtime.js";

export interface TuiModeOptions {
	/** Initial message to send on startup */
	initialMessage?: string;
}

export async function runTuiMode(runtime: AgentSessionRuntime, options: TuiModeOptions = {}): Promise<void> {
	const session = runtime.session;
	const cwd = session.sessionManager.getCwd();

	const tuiRuntime = createAgentSessionTuiRuntime({
		runtime,
		session,
		cwd,
		version: "0.1.0",
	});

	await runLumenTui({ runtime: tuiRuntime, initialMessage: options.initialMessage });
}
