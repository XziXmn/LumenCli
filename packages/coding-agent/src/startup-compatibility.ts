import type { PackageCompatibilityReevaluationResult } from "./core/package-manager.ts";

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
	if (direct > 0) parts.push(`${direct} 个可直接使用`);
	if (lightAdapt > 0) parts.push(`${lightAdapt} 个需轻度适配`);
	if (needsAiReview > 0) parts.push(`${needsAiReview} 个需 AI 评估`);

	if (parts.length === 0) {
		return `已重新评估 ${result.updatedSources.length} 个已安装插件/包来源`;
	}

	return `已重新评估 ${result.updatedSources.length} 个已安装插件/包来源：${parts.join("，")}`;
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
		? "运行 /compat 排查兼容性；修复后运行 /reload；如果仍失败，请移除对应插件或包。"
		: "运行 /compat 查看兼容性详情。";

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
		parts.push(`${input.riskyPackageCount} 项插件/包兼容性问题`);
	}
	if (input.extensionIssueCount > 0) {
		parts.push(`${input.extensionIssueCount} 项扩展加载问题`);
	}
	if (input.skillIssueCount > 0) {
		parts.push(`${input.skillIssueCount} 项技能问题`);
	}

	if (!summary && parts.length === 0) {
		return undefined;
	}

	if (parts.length === 0) {
		return {
			level: reevaluationHasRisk ? "warning" : "status",
			message: `${summary}. ${
				reevaluationHasRisk
					? "运行 /compat 排查兼容性；修复后运行 /reload；如果仍失败，请移除对应插件或包。"
					: "运行 /compat 查看兼容性详情。"
			}`,
		};
	}

	const prefix = summary ? `${summary}. ` : "";
	return {
		level: "warning",
		message: `${prefix}启动兼容性检查发现${parts.join("、")}。运行 /compat 查看当前兼容性报告；修复后运行 /reload；如果仍失败，请移除对应插件/包或删除相关 skill。`,
	};
}
