import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverAgents } from "../src/core/lumen-task.ts";

describe("project agent templates", () => {
	it("uses English descriptions for built-in project subagents", () => {
		const repoRoot = resolve(process.cwd(), "..", "..");
		const agents = discoverAgents(repoRoot);
		const byName = new Map(agents.map((agent) => [agent.name, agent]));

		expect(byName.get("explore")?.description).toBe(
			"Fast code reconnaissance that returns compact context for other agents",
		);
		expect(byName.get("planner")?.description).toBe("Produce a detailed implementation plan without making changes");
		expect(byName.get("reviewer")?.description).toBe("Review code for correctness, safety, and consistency");
		expect(byName.get("worker")?.description).toBe(
			"General execution agent that can read, edit, write, and run commands",
		);
	});
});
