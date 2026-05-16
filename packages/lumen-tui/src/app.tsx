import { type CliRendererConfig, createCliRenderer } from "@opentui/core";
import { KeymapProvider } from "@opentui/keymap/solid";
import { render } from "@opentui/solid";
import { AppShell } from "./components/AppShell.js";
import { configureKeybindings, createLumenKeymap, loadKeybindingOverrides } from "./components/keybindings.js";
import type { TuiRuntime } from "./runtime/types.js";

export interface LumenTuiInput {
	runtime: TuiRuntime;
	initialMessage?: string;
}

function rendererConfig(): CliRendererConfig {
	return {
		externalOutputMode: "passthrough",
		targetFps: 30,
		gatherStats: false,
		exitOnCtrlC: false,
		useKittyKeyboard: {},
		autoFocus: false,
		openConsoleOnError: false,
		useMouse: true,
	};
}

export async function runLumenTui(input: LumenTuiInput): Promise<void> {
	configureKeybindings(loadKeybindingOverrides(input.runtime.state.ui.cwd));
	const renderer = await createCliRenderer(rendererConfig());
	const { keymap, dispose: disposeKeymap } = createLumenKeymap(renderer);

	return new Promise<void>((resolve, reject) => {
		let resolved = false;
		const exit = () => {
			if (resolved) return;
			resolved = true;
			disposeKeymap();
			input.runtime.dispose();
			renderer.destroy();
			resolve();
		};

		void render(
			() => (
				<KeymapProvider keymap={keymap}>
					<AppShell runtime={input.runtime} initialMessage={input.initialMessage} onExit={exit} />
				</KeymapProvider>
			),
			renderer,
		)
			.then(() => {
				renderer.start();
				renderer.requestRender();
			})
			.catch((error: unknown) => {
				disposeKeymap();
				input.runtime.dispose();
				renderer.destroy();
				reject(error);
			});
	});
}
