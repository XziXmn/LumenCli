/**
 * Lumen Secrets Redaction
 *
 * 自动检测并屏蔽 tool 输出中的敏感信息（API keys、tokens、密码等）。
 *
 * [Provenance] 来源: oh-my-pi/packages/coding-agent/src/secrets/ + codex-rs/secrets/
 * [Provenance] 移植方式: 参考重写
 * [Provenance] 适配改动: Pi extension API 接口，纯正则实现
 */

import type { ExtensionAPI } from "./extensions/types.ts";

export interface SecretPattern {
	name: string;
	pattern: RegExp;
	replacement: string;
}

const BUILT_IN_PATTERNS: SecretPattern[] = [
	// API Keys
	{ name: "anthropic", pattern: /sk-ant-[a-zA-Z0-9_-]{20,}/g, replacement: "[REDACTED:anthropic-key]" },
	{ name: "openai", pattern: /sk-[a-zA-Z0-9]{20,}/g, replacement: "[REDACTED:openai-key]" },
	{ name: "openai-proj", pattern: /sk-proj-[a-zA-Z0-9_-]{20,}/g, replacement: "[REDACTED:openai-proj-key]" },

	// GitHub tokens
	{ name: "github-pat", pattern: /ghp_[a-zA-Z0-9]{36,}/g, replacement: "[REDACTED:github-pat]" },
	{ name: "github-oauth", pattern: /gho_[a-zA-Z0-9]{36,}/g, replacement: "[REDACTED:github-oauth]" },
	{ name: "github-app", pattern: /ghs_[a-zA-Z0-9]{36,}/g, replacement: "[REDACTED:github-app]" },
	{ name: "github-refresh", pattern: /ghr_[a-zA-Z0-9]{36,}/g, replacement: "[REDACTED:github-refresh]" },

	// AWS
	{ name: "aws-access", pattern: /AKIA[0-9A-Z]{16}/g, replacement: "[REDACTED:aws-access-key]" },
	{
		name: "aws-secret",
		pattern: /(?<=AWS_SECRET_ACCESS_KEY[=:]\s*)[A-Za-z0-9/+=]{40}/g,
		replacement: "[REDACTED:aws-secret]",
	},

	// Bearer tokens
	{ name: "bearer", pattern: /Bearer\s+[a-zA-Z0-9_\-.]{20,}/g, replacement: "Bearer [REDACTED:token]" },

	// Generic API key patterns
	{
		name: "generic-key",
		pattern: /(?<=(?:api[_-]?key|apikey|secret[_-]?key|access[_-]?token)[=:]\s*["']?)[a-zA-Z0-9_-]{20,}/gi,
		replacement: "[REDACTED:key]",
	},

	// Private keys
	{
		name: "private-key",
		pattern:
			/-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
		replacement: "[REDACTED:private-key]",
	},

	// Connection strings with passwords
	{ name: "connection-string", pattern: /(?<=:\/\/[^:]+:)[^@\s]{8,}(?=@)/g, replacement: "[REDACTED:password]" },
];

/** Collect known secret values from environment variables */
function collectEnvSecrets(): Set<string> {
	const secrets = new Set<string>();
	const secretEnvNames = [
		"ANTHROPIC_API_KEY",
		"OPENAI_API_KEY",
		"GEMINI_API_KEY",
		"DEEPSEEK_API_KEY",
		"GROQ_API_KEY",
		"XAI_API_KEY",
		"OPENROUTER_API_KEY",
		"MISTRAL_API_KEY",
		"XIAOMI_API_KEY",
		"AWS_SECRET_ACCESS_KEY",
		"AWS_SESSION_TOKEN",
		"GITHUB_TOKEN",
		"GH_TOKEN",
		"CLOUDFLARE_API_KEY",
	];

	for (const name of secretEnvNames) {
		const value = process.env[name];
		if (value && value.length >= 8) {
			secrets.add(value);
		}
	}

	return secrets;
}

export function redact(text: string, extraPatterns?: SecretPattern[]): string {
	let result = text;

	// Apply regex patterns
	const patterns = extraPatterns ? [...BUILT_IN_PATTERNS, ...extraPatterns] : BUILT_IN_PATTERNS;
	for (const { pattern, replacement } of patterns) {
		// Reset lastIndex for global regexes
		pattern.lastIndex = 0;
		result = result.replace(pattern, replacement);
	}

	// Redact known env var values
	const envSecrets = collectEnvSecrets();
	for (const secret of envSecrets) {
		if (result.includes(secret)) {
			result = result.replaceAll(secret, "[REDACTED:env-secret]");
		}
	}

	return result;
}

export default function lumenSecretsExtension(pi: ExtensionAPI): void {
	pi.on("tool_result", (event) => {
		let modified = false;
		const newContent = event.content.map((block) => {
			if (block.type === "text" && block.text) {
				const redacted = redact(block.text);
				if (redacted !== block.text) {
					modified = true;
					return { ...block, text: redacted };
				}
			}
			return block;
		});

		if (modified) {
			return { content: newContent };
		}
		return undefined;
	});
}
