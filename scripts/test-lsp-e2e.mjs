/**
 * End-to-end LSP test using a mock language server (Node.js echo server).
 *
 * Tests:
 * - JSON-RPC message framing (Content-Length headers)
 * - Request/response correlation
 * - Notification handling (publishDiagnostics)
 * - Client lifecycle (initialize/initialized)
 * - Cleanup (disposeAllClients)
 *
 * Run: npx tsx scripts/test-lsp-e2e.mjs
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const client = await import(
	pathToFileURL("d:/UGit/LumenAgent/packages/coding-agent/src/core/lumen-lsp-client.ts").href
);

// Create a minimal mock LSP server in Node.js
const MOCK_SERVER = `
let buffer = Buffer.alloc(0);
process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const headerEnd = buffer.indexOf('\\r\\n\\r\\n');
    if (headerEnd === -1) return;
    const header = buffer.slice(0, headerEnd).toString();
    const match = header.match(/Content-Length:\\s*(\\d+)/);
    if (!match) { buffer = buffer.slice(headerEnd + 4); continue; }
    const len = parseInt(match[1]);
    if (buffer.length < headerEnd + 4 + len) return;
    const body = buffer.slice(headerEnd + 4, headerEnd + 4 + len).toString();
    buffer = buffer.slice(headerEnd + 4 + len);
    try {
      const msg = JSON.parse(body);
      if (msg.method === 'initialize') {
        const response = JSON.stringify({
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            capabilities: {
              hoverProvider: true,
              definitionProvider: true,
              referencesProvider: true,
              documentSymbolProvider: true,
              textDocumentSync: 1
            }
          }
        });
        process.stdout.write('Content-Length: ' + Buffer.byteLength(response) + '\\r\\n\\r\\n' + response);
      } else if (msg.method === 'textDocument/hover') {
        const response = JSON.stringify({
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            contents: { kind: 'markdown', value: 'mock hover: ' + msg.params.position.line + ':' + msg.params.position.character }
          }
        });
        process.stdout.write('Content-Length: ' + Buffer.byteLength(response) + '\\r\\n\\r\\n' + response);
      } else if (msg.method === 'textDocument/didOpen') {
        setTimeout(() => {
          const notif = JSON.stringify({
            jsonrpc: '2.0',
            method: 'textDocument/publishDiagnostics',
            params: {
              uri: msg.params.textDocument.uri,
              diagnostics: [{
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
                severity: 1,
                code: 'MOCK001',
                message: 'Mock error',
                source: 'mock-lsp'
              }]
            }
          });
          process.stdout.write('Content-Length: ' + Buffer.byteLength(notif) + '\\r\\n\\r\\n' + notif);
        }, 20);
      } else if (msg.id !== undefined) {
        const response = JSON.stringify({
          jsonrpc: '2.0',
          id: msg.id,
          error: { code: -32601, message: 'Method not found: ' + msg.method }
        });
        process.stdout.write('Content-Length: ' + Buffer.byteLength(response) + '\\r\\n\\r\\n' + response);
      }
    } catch (e) { /* skip */ }
  }
});
`;

const tmp = join(tmpdir(), `lsp-e2e-${Date.now()}`);
mkdirSync(tmp, { recursive: true });
const mockServerPath = join(tmp, "mock-server.mjs");
writeFileSync(mockServerPath, MOCK_SERVER, "utf8");

const testFile = join(tmp, "test.ts");
writeFileSync(testFile, "const foo = 42;\n", "utf8");

let passed = 0;
let failed = 0;

async function runTest(name, fn) {
	try {
		await fn();
		console.log(`  PASS  ${name}`);
		passed++;
	} catch (err) {
		console.log(`  FAIL  ${name}`);
		console.log(`        ${err.message}`);
		failed++;
	}
}

const mockConfig = {
	command: process.execPath,
	args: [mockServerPath],
	fileTypes: [".ts"],
	rootMarkers: [],
};

try {
	await runTest("client: initialize with mock server", async () => {
		const c = await client.getOrCreateClient("mock-server", mockConfig, tmp, 5000);
		if (!c.initialized) throw new Error("client not initialized");
		if (!c.serverCapabilities?.hoverProvider) throw new Error("hover capability missing");
	});

	await runTest("client: sendRequest hover returns result", async () => {
		const c = await client.getOrCreateClient("mock-server", mockConfig, tmp, 5000);
		const uri = client.fileToUri(testFile);
		const hover = await client.sendRequest(
			c,
			"textDocument/hover",
			{ textDocument: { uri }, position: { line: 0, character: 5 } },
			undefined,
			5000,
		);
		if (!hover?.contents) throw new Error("no hover response");
		if (!hover.contents.value.includes("mock hover: 0:5")) {
			throw new Error(`unexpected hover: ${JSON.stringify(hover)}`);
		}
	});

	await runTest("client: ensureFileOpen triggers diagnostics", async () => {
		const c = await client.getOrCreateClient("mock-server", mockConfig, tmp, 5000);
		await client.ensureFileOpen(c, testFile);
		const uri = client.fileToUri(testFile);
		const diags = await client.waitForDiagnostics(c, uri, 500);
		if (diags.length === 0) throw new Error("no diagnostics received");
		if (diags[0].code !== "MOCK001") throw new Error(`unexpected diag: ${JSON.stringify(diags[0])}`);
	});

	await runTest("client: unknown method returns error", async () => {
		const c = await client.getOrCreateClient("mock-server", mockConfig, tmp, 5000);
		let threw = false;
		try {
			await client.sendRequest(c, "nonexistent/method", {}, undefined, 2000);
		} catch (e) {
			threw = true;
			if (!e.message.includes("Method not found")) {
				throw new Error(`wrong error: ${e.message}`);
			}
		}
		if (!threw) throw new Error("expected error for unknown method");
	});

	await runTest("client: disposeAllClients kills processes", async () => {
		await client.getOrCreateClient("mock-server", mockConfig, tmp, 5000);
		const before = client.getActiveClients().length;
		if (before === 0) throw new Error("no active clients to dispose");
		client.disposeAllClients();
		const after = client.getActiveClients().length;
		if (after !== 0) throw new Error(`expected 0 active clients after dispose, got ${after}`);
	});

	console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
	if (failed > 0) process.exit(1);
} finally {
	await new Promise((r) => setTimeout(r, 200));
	try {
		rmSync(tmp, { recursive: true, force: true });
	} catch {
		// Windows file locks; ignore
	}
}
