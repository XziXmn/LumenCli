import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function widgetPlacementExtension(pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI) return;
		ctx.ui.setWidget("widget-above", ["Upper extension slot below the editor"]);
		ctx.ui.setWidget("widget-below", ["Lower extension slot below the editor"], { placement: "belowEditor" });
	});
}
