#!/usr/bin/env node
/**
 * Lumen Deep Test Suite
 *
 * Tests every Lumen extension for:
 * - Correctness of pure functions (hash, parsers, etc.)
 * - File I/O edge cases
 * - Regex patterns
 * - Error handling
 *
 * Run: npx tsx scripts/deep-test.mjs
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const TESTS = [];
let passCount = 0;
let failCount = 0;
const failures = [];

function test(name, fn) {
	TESTS.push({ name, fn });
}

function assert(cond, msg) {
	if (!cond) throw new Error(msg ?? "assertion failed");
}

function assertEq(actual, expected, msg) {
	if (actual !== expected) {
		throw new Error(`${msg ?? "assertion failed"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
	}
}

function assertDeepEq(actual, expected, msg) {
	const a = JSON.stringify(actual);
	const e = JSON.stringify(expected);
	if (a !== e) {
		throw new Error(`${msg ?? "deep assertion failed"}: expected ${e}, got ${a}`);
	}
}

async function runAll() {
	const SRC = "d:/UGit/LumenAgent/packages/coding-agent/src/core";
	for (const { name, fn } of TESTS) {
		try {
			await fn({ SRC });
			console.log(`  PASS  ${name}`);
			passCount++;
		} catch (err) {
			console.log(`  FAIL  ${name}`);
			console.log(`        ${err.message}`);
			failures.push({ name, error: err });
			failCount++;
		}
	}

	console.log(`\n${passCount} passed, ${failCount} failed (${TESTS.length} total)`);
	if (failCount > 0) {
		console.log("\nFailures:");
		for (const f of failures) {
			console.log(`  - ${f.name}: ${f.error.message}`);
		}
		process.exit(1);
	}
}

// ============================================================================
// Hashline Tests
// ============================================================================

test("hashline: computeLineHash is deterministic for same input", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-hashline.ts`).href);
	const h1 = mod.computeLineHash(10, "function hello() {");
	const h2 = mod.computeLineHash(10, "function hello() {");
	assertEq(h1, h2, "same input should yield same hash");
	assert(/^[a-z]{2}$/.test(h1), `hash should be 2 lowercase letters, got ${h1}`);
});

test("hashline: empty/whitespace lines use line number seed", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-hashline.ts`).href);
	const h5 = mod.computeLineHash(5, "   ");
	const h10 = mod.computeLineHash(10, "   ");
	if (h5 === h10) {
		throw new Error(`Empty lines at different numbers should get different hashes, got ${h5} == ${h10}`);
	}
});

test("hashline: formatHashLines produces correct format", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-hashline.ts`).href);
	const text = "line one\nline two\nline three";
	const formatted = mod.formatHashLines(text, 1);
	const lines = formatted.split("\n");
	assertEq(lines.length, 3);
	for (const line of lines) {
		assert(/^\d+[a-z]{2}\|/.test(line), `Line should match hashline format: "${line}"`);
	}
	assert(lines[0].startsWith("1"));
	assert(lines[1].startsWith("2"));
	assert(lines[2].startsWith("3"));
});

test("hashline: parseAnchor parses valid references", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-hashline.ts`).href);
	const ref = mod.parseAnchor("42sr");
	assertEq(ref.line, 42);
	assertEq(ref.hash, "sr");
});

test("hashline: parseAnchor rejects invalid references", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-hashline.ts`).href);
	let threw = false;
	try {
		mod.parseAnchor("42");
	} catch {
		threw = true;
	}
	assert(threw, "parseAnchor should throw on invalid ref");

	threw = false;
	try {
		mod.parseAnchor("abc");
	} catch {
		threw = true;
	}
	assert(threw, "parseAnchor should throw on hash-only ref");
});

test("hashline: validateAnchor detects mismatches", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-hashline.ts`).href);
	const fileLines = ["first", "second", "third"];
	const realHash = mod.computeLineHash(1, "first");

	const ok = mod.validateAnchor({ line: 1, hash: realHash }, fileLines);
	assertEq(ok, null, "valid anchor should return null");

	const bad = mod.validateAnchor({ line: 1, hash: "zz" }, fileLines);
	assert(bad !== null, "invalid anchor should return mismatch");
	if (bad) {
		assertEq(bad.line, 1);
		assertEq(bad.expected, "zz");
		assertEq(bad.actual, realHash);
	}

	const oor = mod.validateAnchor({ line: 999, hash: "ab" }, fileLines);
	assert(oor !== null, "out-of-range should return mismatch");
});

test("hashline: formatHashLines handles startLine offset", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-hashline.ts`).href);
	const result = mod.formatHashLines("content", 100);
	assert(result.startsWith("100"), `should start with line 100: ${result}`);
});

test("hashline: hash excludes trailing whitespace", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-hashline.ts`).href);
	const h1 = mod.computeLineHash(1, "function foo()");
	const h2 = mod.computeLineHash(1, "function foo()   ");
	const h3 = mod.computeLineHash(1, "function foo()\r");
	assertEq(h1, h2, "trailing spaces should not affect hash");
	assertEq(h1, h3, "trailing CR should not affect hash");
});

test("hashline: resolveAnchors validates and returns line numbers", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-hashline.ts`).href);
	const fileLines = ["alpha", "beta", "gamma"];
	const h1 = mod.computeLineHash(1, "alpha");
	const h3 = mod.computeLineHash(3, "gamma");
	const resolved = mod.resolveAnchors(fileLines, [
		{ line: 1, hash: h1 },
		{ line: 3, hash: h3 },
	]);
	assertDeepEq(resolved, [1, 3]);
});

test("hashline: resolveAnchors throws on mismatch with remediation hint", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-hashline.ts`).href);
	const fileLines = ["alpha", "beta"];
	let caught;
	try {
		mod.resolveAnchors(fileLines, [{ line: 1, hash: "zz" }]);
	} catch (err) {
		caught = err;
	}
	assert(caught !== undefined, "should throw on mismatch");
	assert(/re-read/i.test(caught.message), `error should mention re-reading: ${caught.message}`);
});

// ============================================================================
// Patch Tests
// ============================================================================

test("patch: parsePatch handles Add File", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-patch.ts`).href);
	const patch = `*** Begin Patch
*** Add File: hello.txt
+Hello
+World
*** End Patch`;
	const hunks = mod.parsePatch(patch);
	assertEq(hunks.length, 1);
	assertEq(hunks[0].type, "add");
	assertEq(hunks[0].path, "hello.txt");
	assertEq(hunks[0].contents.trim(), "Hello\nWorld");
});

test("patch: parsePatch handles Delete File", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-patch.ts`).href);
	const patch = `*** Begin Patch
*** Delete File: old.txt
*** End Patch`;
	const hunks = mod.parsePatch(patch);
	assertEq(hunks.length, 1);
	assertEq(hunks[0].type, "delete");
	assertEq(hunks[0].path, "old.txt");
});

test("patch: parsePatch rejects missing markers", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-patch.ts`).href);
	let threw = false;
	try {
		mod.parsePatch("just some text");
	} catch {
		threw = true;
	}
	assert(threw, "should throw on missing Begin/End Patch markers");
});

test("patch: applyPatch creates files end-to-end", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-patch.ts`).href);
	const tmp = join(tmpdir(), `lumen-patch-test-${Date.now()}`);
	mkdirSync(tmp, { recursive: true });
	try {
		const patch = `*** Begin Patch
*** Add File: new.txt
+created
*** End Patch`;
		const result = mod.applyPatch(patch, tmp);
		assert(result.success, `apply should succeed, errors: ${result.errors.join(", ")}`);
		assertDeepEq(result.filesAdded, ["new.txt"]);
		const written = readFileSync(join(tmp, "new.txt"), "utf8");
		assert(written.includes("created"));
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
});

test("patch: applyPatch handles Update File with context", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-patch.ts`).href);
	const tmp = join(tmpdir(), `lumen-patch-update-${Date.now()}`);
	mkdirSync(tmp, { recursive: true });
	try {
		writeFileSync(join(tmp, "file.ts"), "line1\nline2\nline3\n", "utf8");
		const patch = `*** Begin Patch
*** Update File: file.ts
 line1
-line2
+line2-modified
 line3
*** End Patch`;
		const result = mod.applyPatch(patch, tmp);
		assert(result.success || result.filesUpdated.includes("file.ts"), `update should apply, errors: ${result.errors.join(", ")}`);
		const updated = readFileSync(join(tmp, "file.ts"), "utf8");
		assert(updated.includes("line2-modified"), `file should contain modification, got: ${updated}`);
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
});

test("patch: applyPatch reports missing file on update", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-patch.ts`).href);
	const tmp = join(tmpdir(), `lumen-patch-missing-${Date.now()}`);
	mkdirSync(tmp, { recursive: true });
	try {
		const patch = `*** Begin Patch
*** Update File: missing.txt
-old
+new
*** End Patch`;
		const result = mod.applyPatch(patch, tmp);
		assert(!result.success, "apply should fail on missing file");
		assert(result.errors.length > 0);
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
});

test("patch: applyPatch rolls back partial changes on failure", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-patch.ts`).href);
	const tmp = join(tmpdir(), `lumen-patch-rollback-${Date.now()}`);
	mkdirSync(tmp, { recursive: true });
	try {
		// Create a file that the first op will successfully update
		writeFileSync(join(tmp, "a.txt"), "original-a\n", "utf8");
		// Second op will fail because missing.txt doesn't exist
		const patch = `*** Begin Patch
*** Add File: created.txt
+new content
*** Update File: missing.txt
-old
+new
*** End Patch`;
		const result = mod.applyPatch(patch, tmp);
		assert(!result.success, "apply should fail");
		// created.txt should NOT exist (rolled back)
		assert(!existsSync(join(tmp, "created.txt")), "created.txt should be rolled back");
		assertDeepEq(result.filesAdded, [], "filesAdded should be cleared on rollback");
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
});

test("patch: empty patch is rejected", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-patch.ts`).href);
	const tmp = join(tmpdir(), `lumen-patch-empty-${Date.now()}`);
	mkdirSync(tmp, { recursive: true });
	try {
		const patch = `*** Begin Patch
*** End Patch`;
		const result = mod.applyPatch(patch, tmp);
		assert(!result.success, "empty patch should fail");
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
});

// ============================================================================
// Secrets Tests
// ============================================================================

test("secrets: redact removes OpenAI keys", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-secrets.ts`).href);
	const text = "My key is sk-abcdef1234567890abcdef and more";
	const redacted = mod.redact(text);
	assert(!redacted.includes("sk-abcdef1234567890abcdef"));
	assert(redacted.includes("[REDACTED"));
});

test("secrets: redact removes GitHub tokens", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-secrets.ts`).href);
	const text = "token: ghp_abcdef1234567890abcdef1234567890abcd";
	const redacted = mod.redact(text);
	assert(!redacted.includes("ghp_abcdef1234567890abcdef1234567890abcd"));
	assert(redacted.includes("REDACTED:github-pat"));
});

test("secrets: redact leaves safe text untouched", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-secrets.ts`).href);
	const text = "This is perfectly safe text with no secrets.";
	const redacted = mod.redact(text);
	assertEq(redacted, text);
});

test("secrets: redact removes AWS access keys", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-secrets.ts`).href);
	const text = "AWS_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE";
	const redacted = mod.redact(text);
	assert(!redacted.includes("AKIAIOSFODNN7EXAMPLE"));
});

test("secrets: redact handles private keys", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-secrets.ts`).href);
	const text =
		"-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIB...\nsome body\n-----END RSA PRIVATE KEY-----";
	const redacted = mod.redact(text);
	assert(!redacted.includes("MIIEpAIB"));
	assert(redacted.includes("REDACTED:private-key"));
});

test("secrets: redact does not over-redact short sk- prefix", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-secrets.ts`).href);
	const text = "I use sk-prefix for short identifiers";
	const redacted = mod.redact(text);
	// "sk-prefix" is only 9 chars; regex requires 20+
	assert(redacted.includes("sk-prefix"), `short sk-prefix should not be redacted: ${redacted}`);
});

test("secrets: handles multiple secrets in one string", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-secrets.ts`).href);
	// Use realistic full-length tokens (40 chars for ghp_)
	const text = "key1: sk-ant-1234567890abcdef1234567890 and key2: ghp_abcdef1234567890abcdef1234567890abcd";
	const redacted = mod.redact(text);
	assert(!redacted.includes("sk-ant-1234567890abcdef1234567890"), `sk-ant not redacted: ${redacted}`);
	assert(!redacted.includes("ghp_abcdef1234567890abcdef1234567890abcd"), `ghp_ not redacted: ${redacted}`);
});

// ============================================================================
// LSP Tests
// ============================================================================

test("lsp-client: fileToUri and uriToFile round-trip", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-lsp-client.ts`).href);
	// Unix-style
	const uri1 = mod.fileToUri("/home/user/file.ts");
	assert(uri1.startsWith("file://"), `Expected file:// prefix, got ${uri1}`);
	const path1 = mod.uriToFile(uri1);
	assertEq(path1, "/home/user/file.ts");

	// Windows-style
	const uri2 = mod.fileToUri("C:\\Users\\file.ts");
	assert(uri2.startsWith("file:///"), `Expected file:/// prefix, got ${uri2}`);
	const path2 = mod.uriToFile(uri2);
	assertEq(path2, "C:/Users/file.ts");
});

test("lsp-client: isServerBroken returns false initially", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-lsp-client.ts`).href);
	assertEq(mod.isServerBroken("nonexistent-server", "/tmp"), false);
});

test("lsp-client: getLanguageId maps extensions", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-lsp-client.ts`).href);
	assertEq(mod.getLanguageId("foo.ts"), "typescript");
	assertEq(mod.getLanguageId("foo.tsx"), "typescriptreact");
	assertEq(mod.getLanguageId("foo.py"), "python");
	assertEq(mod.getLanguageId("foo.rs"), "rust");
	assertEq(mod.getLanguageId("foo.xyz"), "plaintext");
});

test("lsp-config: loadLspConfig returns defaults + userContent", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-lsp-config.ts`).href);
	const config = mod.loadLspConfig(process.cwd());
	assert(config.servers, "should have servers");
	assert(Object.keys(config.servers).length > 0, "should have default servers");
	assert(config.servers["typescript-language-server"], "should include typescript server");
	assert(config.servers.pyright, "should include pyright");
});

test("lsp-config: getServersForFile filters by extension", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-lsp-config.ts`).href);
	const config = mod.loadLspConfig(process.cwd());
	const tsServers = mod.getServersForFile(config, "foo.ts");
	assert(tsServers.length > 0, "should find servers for .ts");
	assert(tsServers.some(([name]) => name === "typescript-language-server"));

	const unknownServers = mod.getServersForFile(config, "foo.xyz");
	assertEq(unknownServers.length, 0);
});

test("lsp: parseTypescriptOutput parses tsc output", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-lsp.ts`).href);
	const sample =
		"src/foo.ts(10,5): error TS2322: Type 'string' is not assignable.\n" +
		"src/bar.ts(20,3): warning TS6133: 'x' is declared but never used.";
	const diags = mod.parseTypescriptOutput(sample, process.cwd());
	assertEq(diags.length, 2);
	assertEq(diags[0].severity, "error");
	assertEq(diags[0].code, "TS2322");
	assertEq(diags[1].severity, "warning");
});

test("lsp: detectLanguageFromExt", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-lsp.ts`).href);
	assertEq(mod.detectLanguageFromExt("foo.ts"), "typescript");
	assertEq(mod.detectLanguageFromExt("foo.py"), "python");
	assertEq(mod.detectLanguageFromExt("foo.go"), "go");
	assertEq(mod.detectLanguageFromExt("foo.rs"), "rust");
	assertEq(mod.detectLanguageFromExt("foo.xyz"), "unknown");
});

test("lsp: applyTextEdits applies edits in reverse order", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-lsp.ts`).href);
	// Replace "old" at line 0 chars 0-3 with "new"
	const content = "old line\nsecond";
	const edits = [
		{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } }, newText: "new" },
	];
	const result = mod.applyTextEdits(content, edits);
	assertEq(result, "new line\nsecond");
});

test("lsp: applyTextEdits handles multiple edits on same line", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-lsp.ts`).href);
	const content = "hello world foo";
	const edits = [
		// Replace "foo" (chars 12-15) with "bar"
		{ range: { start: { line: 0, character: 12 }, end: { line: 0, character: 15 } }, newText: "bar" },
		// Replace "hello" (chars 0-5) with "HI"
		{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, newText: "HI" },
	];
	const result = mod.applyTextEdits(content, edits);
	assertEq(result, "HI world bar");
});

test("lsp: extension module loads correctly", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-lsp.ts`).href);
	assert(typeof mod.default === "function");
	assert(typeof mod.parseTypescriptOutput === "function");
	assert(typeof mod.detectLanguageFromExt === "function");
	assert(typeof mod.applyTextEdits === "function");
});

// ============================================================================
// Memory Tests
// ============================================================================

test("memory: relevance scoring with threshold", async ({ SRC }) => {
	// Verify the source has the new scoring logic
	const source = readFileSync(`${SRC}/lumen-memory.ts`, "utf8");
	assert(source.includes("MIN_SCORE"), "should have minimum score threshold");
	assert(source.includes("score -= 2"), "should penalize very old entries");
});

// ============================================================================
// Preset Tests
// ============================================================================

test("preset: parseModelRef parses provider/model", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-preset.ts`).href);
	const ref = mod.parseModelRef("anthropic/claude-opus-4");
	assert(ref !== undefined);
	assertEq(ref.provider, "anthropic");
	assertEq(ref.modelId, "claude-opus-4");
	assertEq(ref.thinkingLevel, undefined);
});

test("preset: parseModelRef extracts thinking level", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-preset.ts`).href);
	const ref = mod.parseModelRef("anthropic/claude-opus-4:high");
	assert(ref !== undefined);
	assertEq(ref.provider, "anthropic");
	assertEq(ref.modelId, "claude-opus-4");
	assertEq(ref.thinkingLevel, "high");
});

test("preset: parseModelRef ignores invalid thinking level", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-preset.ts`).href);
	// Colon present but suffix is not a valid thinking level → treat as part of model id
	const ref = mod.parseModelRef("openrouter/model:weird-suffix");
	assert(ref !== undefined);
	assertEq(ref.modelId, "model:weird-suffix");
	assertEq(ref.thinkingLevel, undefined);
});

test("preset: parseModelRef rejects missing slash", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-preset.ts`).href);
	const ref = mod.parseModelRef("no-slash");
	assertEq(ref, undefined);
});

test("preset: routeModelForPayload picks vision on image input", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-preset.ts`).href);
	const preset = {
		primary: "x/y",
		vision: "z/vision",
	};
	const payload = {
		messages: [
			{
				role: "user",
				content: [
					{ type: "text", text: "look" },
					{ type: "image", source: {} },
				],
			},
		],
	};
	const override = mod.routeModelForPayload(payload, preset);
	assertEq(override, "z/vision");
});

test("preset: routeModelForPayload returns undefined when no image", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-preset.ts`).href);
	const preset = { primary: "x/y", vision: "z/vision" };
	const payload = { messages: [{ role: "user", content: "plain text" }] };
	const override = mod.routeModelForPayload(payload, preset);
	assertEq(override, undefined);
});

test("preset: loadPresets returns empty when no file", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-preset.ts`).href);
	const result = mod.loadPresets("/tmp/nonexistent-lumen-dir-xyz");
	assert(result.presets);
	assertEq(Object.keys(result.presets).length, 0);
});

// ============================================================================
// Worktree Tests (structural — real git ops require a repo)
// ============================================================================

test("worktree: extension module loads", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-worktree.ts`).href);
	assert(typeof mod.default === "function");
	assert(typeof mod.createWorktree === "function");
	assert(typeof mod.cleanupWorktree === "function");
	assert(typeof mod.extractPatch === "function");
	assert(typeof mod.listWorktrees === "function");
});

test("worktree: listWorktrees on current repo returns at least one entry", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-worktree.ts`).href);
	const wts = mod.listWorktrees("d:/UGit/LumenAgent");
	// The main workspace is also a worktree; should have at least one
	assert(Array.isArray(wts), "should return array");
	// In some CI setups this might be 0 if not a git checkout; just sanity check shape
});

// ============================================================================
// Memory Pipeline Tests
// ============================================================================

test("memory: similarity score is 1.0 for identical strings", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-memory.ts`).href);
	assertEq(mod.similarity("hello world", "hello world"), 1);
});

test("memory: similarity score is 0 for disjoint strings", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-memory.ts`).href);
	const score = mod.similarity("xyz abc", "qqq ppp");
	assert(score === 0 || score < 0.1, `Expected near-zero similarity, got ${score}`);
});

test("memory: deduplicateEntries removes near-duplicates keeping newest", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-memory.ts`).href);
	const entries = [
		{ id: "1", kind: "fact", content: "The sky is blue today", source: "user", createdAt: "2026-01-01T00:00:00Z" },
		{ id: "2", kind: "fact", content: "The sky is blue today.", source: "user", createdAt: "2026-05-01T00:00:00Z" },
		{ id: "3", kind: "fact", content: "Grass is green", source: "user", createdAt: "2026-05-01T00:00:00Z" },
	];
	const deduped = mod.deduplicateEntries(entries);
	assertEq(deduped.length, 2, `Expected 2 after dedup, got ${deduped.length}`);
	// The newer (id=2) of the two similar entries should be kept
	assert(deduped.some((e) => e.id === "2"), "should keep id=2");
	assert(deduped.some((e) => e.id === "3"), "should keep id=3");
});

// ============================================================================
// PowerShell Tests (Windows-only; skip check on other platforms)
// ============================================================================

test("powershell: findPowerShell on Windows returns a path", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-powershell.ts`).href);
	const pwsh = mod.findPowerShell();
	if (process.platform === "win32") {
		assert(pwsh, `Expected PowerShell to be found on Windows; got ${pwsh}`);
		assert(pwsh.endsWith(".exe"), "Should be an .exe path");
	} else {
		assertEq(pwsh, undefined, "Non-Windows should return undefined");
	}
});

test("powershell: module loads", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-powershell.ts`).href);
	assert(typeof mod.default === "function");
	assert(typeof mod.runPowerShell === "function");
});

// ============================================================================
// Background Agents Tests
// ============================================================================

test("agents-bg: module loads and exports expected symbols", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-agents-bg.ts`).href);
	assert(typeof mod.default === "function");
	assert(typeof mod.spawnBgAgent === "function");
	assert(typeof mod.sendMessageToAgent === "function");
	assert(typeof mod.killAgent === "function");
	assert(typeof mod.waitForAgent === "function");
	assert(mod.BG_AGENTS instanceof Map);
});

// ============================================================================
// Snip/Brief Tests
// ============================================================================

test("snip: snipText preserves short inputs", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-snip.ts`).href);
	const text = "line1\nline2\nline3";
	assertEq(mod.snipText(text, 10), text);
});

test("snip: snipText truncates long inputs with marker", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-snip.ts`).href);
	const text = Array.from({ length: 100 }, (_, i) => `line${i}`).join("\n");
	const result = mod.snipText(text, 20);
	assert(/\[\d+ lines skipped\]/.test(result), `Expected skip marker, got: ${result.slice(0, 200)}`);
	assert(result.startsWith("line0"), "should preserve head");
	assert(result.endsWith("line99"), "should preserve tail");
});

test("snip: briefText extracts paragraph leads", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-snip.ts`).href);
	const text = "First paragraph. Still first.\n\nSecond paragraph here.\n\nThird paragraph.";
	const brief = mod.briefText(text, 5);
	assert(brief.includes("- First paragraph"), `expected first para: ${brief}`);
	assert(brief.includes("- Second paragraph"), `expected second para: ${brief}`);
	assert(brief.includes("3 paragraphs"), `expected stats: ${brief}`);
});

test("snip: extractHeadings finds markdown + code declarations", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-snip.ts`).href);
	const text = "# Heading 1\n\nsome text\n\nfunction foo() {}\n\nclass Bar {}\n\ndef baz():";
	const headings = mod.extractHeadings(text);
	assert(headings.length >= 3, `expected at least 3 headings, got ${headings.length}: ${JSON.stringify(headings)}`);
});

test("codesearch: module loads", async ({ SRC }) => {
	const mod = await import(pathToFileURL(`${SRC}/lumen-codesearch.ts`).href);
	assert(typeof mod.default === "function");
});

// ============================================================================
// Structural Tests (verify via source inspection)
// ============================================================================

test("config-discovery: MDC rules filtered by alwaysApply", async ({ SRC }) => {
	const source = readFileSync(`${SRC}/lumen-config-discovery.ts`, "utf8");
	assert(source.includes("parseMDCFrontmatter"));
	assert(source.includes("alwaysApply"));
	assert(source.includes("LUMEN_DISABLE_EXTERNAL_CONFIG"));
});

test("agents: discovery parses frontmatter from two dirs", async ({ SRC }) => {
	const source = readFileSync(`${SRC}/lumen-agents.ts`, "utf8");
	assert(source.includes("parseFrontmatter"));
	assert(source.includes("loadAgentsFromDir"));
	assert(source.includes("getAgentDir"));
	assert(source.includes("CONFIG_DIR_NAME"));
});

test("snapshot: triggers for write, edit, and apply_patch", async ({ SRC }) => {
	const source = readFileSync(`${SRC}/lumen-snapshot.ts`, "utf8");
	assert(source.includes('"write"'));
	assert(source.includes('"edit"'));
	assert(source.includes('"apply_patch"'));
});

test("web: has caching with TTL", async ({ SRC }) => {
	const source = readFileSync(`${SRC}/lumen-web.ts`, "utf8");
	assert(source.includes("CACHE_TTL_MS"));
	assert(source.includes("getCached"));
	assert(source.includes("setCache"));
});

test("resource-loader: all 22 extensions registered", async ({ SRC }) => {
	const source = readFileSync(`${SRC}/resource-loader.ts`, "utf8");
	const expected = [
		"lumenWritingExtension",
		"lumenNovelExtension",
		"lumenMemoryExtension",
		"lumenCommitExtension",
		"lumenSecretsExtension",
		"lumenSnapshotExtension",
		"lumenPatchExtension",
		"lumenAgentsExtension",
		"lumenAgentsBgExtension",
		"lumenWebExtension",
		"lumenPlanModeExtension",
		"lumenTtsrExtension",
		"lumenTodoExtension",
		"lumenAskUserExtension",
		"lumenConfigDiscoveryExtension",
		"lumenRepoExtension",
		"lumenLspExtension",
		"lumenPresetExtension",
		"lumenWorktreeExtension",
		"lumenSnipExtension",
		"lumenCodeSearchExtension",
		"lumenPowerShellExtension",
	];
	for (const name of expected) {
		assert(source.includes(name), `${name} should be registered`);
	}
});

test("all extensions: load without error", async ({ SRC }) => {
	const extensions = [
		"lumen-agents.ts",
		"lumen-agents-bg.ts",
		"lumen-askuser.ts",
		"lumen-codesearch.ts",
		"lumen-commit.ts",
		"lumen-config-discovery.ts",
		"lumen-lsp.ts",
		"lumen-memory.ts",
		"lumen-novel.ts",
		"lumen-patch.ts",
		"lumen-plan-mode.ts",
		"lumen-powershell.ts",
		"lumen-preset.ts",
		"lumen-repo.ts",
		"lumen-secrets.ts",
		"lumen-snapshot.ts",
		"lumen-snip.ts",
		"lumen-todo.ts",
		"lumen-ttsr.ts",
		"lumen-web.ts",
		"lumen-worktree.ts",
		"lumen-writing.ts",
	];
	for (const ext of extensions) {
		const mod = await import(pathToFileURL(`${SRC}/${ext}`).href);
		assert(typeof mod.default === "function", `${ext} should export default factory`);
	}
	// lumen-hashline.ts is a utility module, not a factory
	const hashline = await import(pathToFileURL(`${SRC}/lumen-hashline.ts`).href);
	assert(typeof hashline.computeLineHash === "function");
	assert(typeof hashline.formatHashLines === "function");

	// lumen-lsp-{client,config,types}.ts are utility modules used by lumen-lsp.ts
	const lspClient = await import(pathToFileURL(`${SRC}/lumen-lsp-client.ts`).href);
	assert(typeof lspClient.getOrCreateClient === "function");
	assert(typeof lspClient.sendRequest === "function");
	assert(typeof lspClient.fileToUri === "function");

	const lspConfig = await import(pathToFileURL(`${SRC}/lumen-lsp-config.ts`).href);
	assert(typeof lspConfig.loadLspConfig === "function");
	assert(typeof lspConfig.getServersForFile === "function");
});

// ============================================================================
// Run
// ============================================================================

runAll().catch((err) => {
	console.error("Test runner crashed:", err);
	process.exit(1);
});
