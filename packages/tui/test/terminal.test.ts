import assert from "node:assert";
import { describe, it } from "node:test";
import { normalizeAppleTerminalInput, ProcessTerminal } from "../src/terminal.ts";

describe("normalizeAppleTerminalInput", () => {
	it("rewrites Apple Terminal Return to CSI-u Shift+Enter when Shift is pressed", () => {
		assert.equal(normalizeAppleTerminalInput("\r", true, true), "\x1b[13;2u");
	});

	it("leaves Apple Terminal Return unchanged when Shift is not pressed", () => {
		assert.equal(normalizeAppleTerminalInput("\r", true, false), "\r");
	});

	it("leaves non-Apple Terminal Return unchanged when Shift is pressed", () => {
		assert.equal(normalizeAppleTerminalInput("\r", false, true), "\r");
	});

	it("leaves non-Return input unchanged", () => {
		assert.equal(normalizeAppleTerminalInput("\x1b[13;2u", true, true), "\x1b[13;2u");
		assert.equal(normalizeAppleTerminalInput("a", true, true), "a");
	});
});

describe("ProcessTerminal dimensions", () => {
	it("falls back to COLUMNS and LINES before default dimensions", () => {
		const previousColumnsDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "columns");
		const previousRowsDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "rows");
		const previousColumns = process.env.COLUMNS;
		const previousLines = process.env.LINES;

		try {
			Object.defineProperty(process.stdout, "columns", { value: undefined, configurable: true });
			Object.defineProperty(process.stdout, "rows", { value: undefined, configurable: true });
			process.env.COLUMNS = "123";
			process.env.LINES = "45";

			const terminal = new ProcessTerminal();

			assert.equal(terminal.columns, 123);
			assert.equal(terminal.rows, 45);
		} finally {
			if (previousColumnsDescriptor) {
				Object.defineProperty(process.stdout, "columns", previousColumnsDescriptor);
			} else {
				Reflect.deleteProperty(process.stdout, "columns");
			}
			if (previousRowsDescriptor) {
				Object.defineProperty(process.stdout, "rows", previousRowsDescriptor);
			} else {
				Reflect.deleteProperty(process.stdout, "rows");
			}
			if (previousColumns === undefined) {
				delete process.env.COLUMNS;
			} else {
				process.env.COLUMNS = previousColumns;
			}
			if (previousLines === undefined) {
				delete process.env.LINES;
			} else {
				process.env.LINES = previousLines;
			}
		}
	});
});

describe("ProcessTerminal startup Windows DSR handling", () => {
	it("replies to a startup DSR query on Windows only", () => {
		const terminal = new ProcessTerminal();
		const originalPlatform = process.platform;
		const originalWrite = process.stdout.write;

		const writes: string[] = [];
		const forwarded: string[] = [];

		Object.defineProperty(process, "platform", {
			value: "win32",
			configurable: true,
		});
		(process.stdout.write as unknown as (chunk: string) => boolean) = ((chunk: string) => {
			writes.push(chunk);
			return true;
		}) as typeof process.stdout.write;

		try {
			(terminal as any).inputHandler = (data: string) => forwarded.push(data);
			(terminal as any).startupWindowsDsrPending = true;
			(terminal as any).setupStdinBuffer();
			const buffer = (terminal as any).stdinBuffer;

			buffer.process("\x1b[6n");

			assert.ok(writes.includes("\x1b[1;1R"));
			assert.deepStrictEqual(forwarded, []);

			writes.length = 0;
			(terminal as any).startupWindowsDsrPending = false;
			buffer.process("\x1b[6n");
			assert.deepStrictEqual(forwarded, ["\x1b[6n"]);
			assert.deepStrictEqual(writes, []);
		} finally {
			Object.defineProperty(process, "platform", {
				value: originalPlatform,
				configurable: true,
			});
			process.stdout.write = originalWrite;
		}
	});
});
