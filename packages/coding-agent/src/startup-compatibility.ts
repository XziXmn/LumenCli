import type { PackageCompatibilityReevaluationResult } from "./core/package-manager.js";

export interface StartupCompatibilityNotice {
	level: "status" | "warning";
	message: string;
}

export interface StartupCompatibilityNoticeInput {
	reevaluation?: PackageCompatibilityReevaluationResult;
	riskyPackageCount: number;
	extensionIssueCount: number;
	skillIssueCount: number;
}

function getReevaluationCounts(result: PackageCompatibilityReevaluationResult): {
	direct: number;
	lightAdapt: number;
	needsAiReview: number;
} {
	return {
		direct: result.audits.filter((audit) => audit.status === "direct").length,
		lightAdapt: result.audits.filter((audit) => audit.status === "light-adapt").length,
		needsAiReview: result.audits.filter((audit) => audit.status === "needs-ai-review").length,
	};
}

export function formatCompatibilityReevaluationSummary(
	result: PackageCompatibilityReevaluationResult,
): string | undefined {
	if (result.updatedSources.length === 0) {
		return undefined;
	}

	const { direct, lightAdapt, needsAiReview } = getReevaluationCounts(result);
	const parts: string[] = [];
	if (direct > 0) parts.push(`${direct} directly usable`);
	if (lightAdapt > 0) parts.push(`${lightAdapt} needing light adaptation`);
	if (needsAiReview > 0) parts.push(`${needsAiReview} needing AI review`);

	const sourceLabel = result.updatedSources.length === 1 ? "source" : "sources";
	if (parts.length === 0) {
		return `Re-evaluated ${result.updatedSources.length} installed plugin/package ${sourceLabel}`;
	}

	return `Re-evaluated ${result.updatedSources.length} installed plugin/package ${sourceLabel}: ${parts.join(", ")}`;
}

export function formatCompatibilityReevaluationMessage(
	result: PackageCompatibilityReevaluationResult,
): string | undefined {
	const summary = formatCompatibilityReevaluationSummary(result);
	if (!summary) {
		return undefined;
	}

	const { lightAdapt, needsAiReview } = getReevaluationCounts(result);
	const hasRisk = lightAdapt > 0 || needsAiReview > 0;
	const action = hasRisk
		? "Run /compat to debug compatibility. After fixes, run /reload. If it still fails, remove the plugin/package."
		: "Run /compat to inspect compatibility details.";

	return `${summary}. ${action}`;
}

export function formatStartupCompatibilityNotice(
	input: StartupCompatibilityNoticeInput,
): StartupCompatibilityNotice | undefined {
	const summary = input.reevaluation ? formatCompatibilityReevaluationSummary(input.reevaluation) : undefined;
	const reevaluationHasRisk = input.reevaluation
		? input.reevaluation.audits.some((audit) => audit.status !== "direct")
		: false;
	const parts: string[] = [];

	if (input.riskyPackageCount > 0) {
		parts.push(
			`${input.riskyPackageCount} package/plugin compatibility issue${input.riskyPackageCount === 1 ? "" : "s"}`,
		);
	}
	if (input.extensionIssueCount > 0) {
		parts.push(`${input.extensionIssueCount} extension load issue${input.extensionIssueCount === 1 ? "" : "s"}`);
	}
	if (input.skillIssueCount > 0) {
		parts.push(`${input.skillIssueCount} skill issue${input.skillIssueCount === 1 ? "" : "s"}`);
	}

	if (!summary && parts.length === 0) {
		return undefined;
	}

	if (parts.length === 0) {
		return {
			level: reevaluationHasRisk ? "warning" : "status",
			message: `${summary}. ${
				reevaluationHasRisk
					? "Run /compat to debug compatibility. After fixes, run /reload. If it still fails, remove the plugin/package."
					: "Run /compat to inspect compatibility details."
			}`,
		};
	}

	const prefix = summary ? `${summary}. ` : "";
	return {
		level: "warning",
		message: `${prefix}Detected ${parts.join(", ")} during startup compatibility checks. Run /compat to inspect the current compatibility report. After fixes, run /reload. If an item still fails, remove the plugin/package or delete the skill.`,
	};
}
