import {
	Container,
	type Focusable,
	fuzzyFilter,
	getKeybindings,
	Input,
	Spacer,
	TruncatedText,
} from "@earendil-works/pi-tui";
import type { AuthStatus, AuthStorage } from "../../../core/auth-storage.js";
import { theme } from "../theme/theme.js";
import { DynamicBorder } from "./dynamic-border.js";

export type AuthSelectorProvider = {
	id: string;
	name: string;
	authType: "oauth" | "api_key";
};

/**
 * Component that renders an auth provider selector
 */
export class OAuthSelectorComponent extends Container implements Focusable {
	private searchInput: Input;

	// Focusable implementation - propagate to search input for IME cursor positioning
	private _focused = false;
	get focused(): boolean {
		return this._focused;
	}
	set focused(value: boolean) {
		this._focused = value;
		this.searchInput.focused = value;
	}

	private listContainer: Container;
	private allProviders: AuthSelectorProvider[];
	private filteredProviders: AuthSelectorProvider[];
	private selectedIndex: number = 0;
	private mode: "login" | "logout";
	private authStorage: AuthStorage;
	private getAuthStatus: (providerId: string) => AuthStatus;
	private onSelectCallback: (providerId: string) => void;
	private onCancelCallback: () => void;

	constructor(
		mode: "login" | "logout",
		authStorage: AuthStorage,
		providers: AuthSelectorProvider[],
		onSelect: (providerId: string) => void,
		onCancel: () => void,
		getAuthStatus?: (providerId: string) => AuthStatus,
	) {
		super();

		this.mode = mode;
		this.authStorage = authStorage;
		this.getAuthStatus = getAuthStatus ?? ((providerId) => this.authStorage.getAuthStatus(providerId));
		this.allProviders = providers;
		this.filteredProviders = providers;
		this.onSelectCallback = onSelect;
		this.onCancelCallback = onCancel;

		// Add top border
		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));

		// Add title
		const title = mode === "login" ? "选择要配置的模型提供方：" : "选择要退出登录的模型提供方：";
		this.addChild(new TruncatedText(theme.fg("accent", theme.bold(title)), 1, 0));
		this.addChild(new Spacer(1));

		this.searchInput = new Input();
		this.searchInput.onSubmit = () => {
			const selectedProvider = this.filteredProviders[this.selectedIndex];
			if (selectedProvider) {
				this.onSelectCallback(selectedProvider.id);
			}
		};
		this.addChild(this.searchInput);
		this.addChild(new Spacer(1));

		// Create list container
		this.listContainer = new Container();
		this.addChild(this.listContainer);

		this.addChild(new Spacer(1));

		// Add bottom border
		this.addChild(new DynamicBorder());

		// Initial render
		this.filterProviders("");
	}

	private filterProviders(query: string): void {
		this.filteredProviders = query
			? fuzzyFilter(this.allProviders, query, (provider) => `${provider.name} ${provider.id} ${provider.authType}`)
			: this.allProviders;
		this.selectedIndex = Math.max(0, Math.min(this.selectedIndex, Math.max(0, this.filteredProviders.length - 1)));
		this.updateList();
	}

	private updateList(): void {
		this.listContainer.clear();

		const maxVisible = 8;
		const startIndex = Math.max(
			0,
			Math.min(this.selectedIndex - Math.floor(maxVisible / 2), this.filteredProviders.length - maxVisible),
		);
		const endIndex = Math.min(startIndex + maxVisible, this.filteredProviders.length);

		for (let i = startIndex; i < endIndex; i++) {
			const provider = this.filteredProviders[i];
			if (!provider) continue;

			const isSelected = i === this.selectedIndex;

			const statusIndicator = this.formatStatusIndicator(provider);
			let line = "";
			if (isSelected) {
				const prefix = theme.fg("accent", "→ ");
				const text = theme.fg("accent", provider.name);
				line = prefix + text + statusIndicator;
			} else {
				const text = `  ${theme.fg("text", provider.name)}`;
				line = text + statusIndicator;
			}

			this.listContainer.addChild(new TruncatedText(line, 1, 0));
		}

		if (startIndex > 0 || endIndex < this.filteredProviders.length) {
			const scrollInfo = theme.fg("muted", `  (${this.selectedIndex + 1}/${this.filteredProviders.length})`);
			this.listContainer.addChild(new TruncatedText(scrollInfo, 1, 0));
		}

		// Show "no providers" if empty
		if (this.filteredProviders.length === 0) {
			const message =
				this.allProviders.length === 0
					? this.mode === "login"
						? "当前没有可用的模型提供方"
						: "当前没有已登录的模型提供方，请先使用 /login。"
					: "没有匹配的模型提供方";
			this.listContainer.addChild(new TruncatedText(theme.fg("muted", `  ${message}`), 1, 0));
		}
	}

	private formatStatusIndicator(provider: AuthSelectorProvider): string {
		const credential = this.authStorage.get(provider.id);
		if (credential?.type === provider.authType) return theme.fg("success", " ✓ 已配置");
		if (credential) {
			const label = credential.type === "oauth" ? "订阅已配置" : "API 密钥已配置";
			return theme.fg("muted", " • ") + theme.fg("warning", label);
		}
		if (provider.authType !== "api_key") return theme.fg("muted", " • 未配置");

		const status = this.getAuthStatus(provider.id);
		switch (status.source) {
			case "environment":
				return theme.fg("success", ` ✓ 环境变量: ${status.label ?? "API 密钥"}`);
			case "runtime":
				return theme.fg("success", " ✓ 运行时 API 密钥");
			case "fallback":
				return theme.fg("success", " ✓ 自定义 API 密钥");
			case "models_json_key":
				return theme.fg("success", " ✓ models.json 中的密钥");
			case "models_json_command":
				return theme.fg("success", " ✓ models.json 中的命令");
			default:
				return theme.fg("muted", " • 未配置");
		}
	}

	handleInput(keyData: string): void {
		const kb = getKeybindings();
		// Up arrow
		if (kb.matches(keyData, "tui.select.up")) {
			if (this.filteredProviders.length === 0) return;
			this.selectedIndex = Math.max(0, this.selectedIndex - 1);
			this.updateList();
		}
		// Down arrow
		else if (kb.matches(keyData, "tui.select.down")) {
			if (this.filteredProviders.length === 0) return;
			this.selectedIndex = Math.min(this.filteredProviders.length - 1, this.selectedIndex + 1);
			this.updateList();
		}
		// Enter
		else if (kb.matches(keyData, "tui.select.confirm")) {
			const selectedProvider = this.filteredProviders[this.selectedIndex];
			if (selectedProvider) {
				this.onSelectCallback(selectedProvider.id);
			}
		}
		// Escape or Ctrl+C
		else if (kb.matches(keyData, "tui.select.cancel")) {
			this.onCancelCallback();
		}
		// Pass everything else to search input
		else {
			this.searchInput.handleInput(keyData);
			this.filterProviders(this.searchInput.getValue());
		}
	}
}
