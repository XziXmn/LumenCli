/**
 * TUI mode entry point.
 * Launches the Lumen-native OpenTUI + SolidJS terminal interface.
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentSessionRuntime } from "../../core/agent-session-runtime.js";
import { createSessionStore, type SessionStore } from "./adapter/session-store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface TuiModeOptions {
	/** Initial message to send on startup */
	initialMessage?: string;
}

export async function runTuiMode(runtime: AgentSessionRuntime, options: TuiModeOptions = {}): Promise<void> {
	const session = runtime.session;
	const cwd = session.sessionManager.getCwd();

	const store = createSessionStore({
		session,
		cwd,
		version: "0.1.0",
	});

	const appPath = resolve(__dirname, "../../../../lumen-tui/src/app.js");
	const appModule = (await import(appPath)) as { runLumenTui: RunLumenTuiFn };
	await appModule.runLumenTui({ store, initialMessage: options.initialMessage });
}

type RunLumenTuiFn = (input: { store: SessionStore; initialMessage?: string }) => Promise<void>;
