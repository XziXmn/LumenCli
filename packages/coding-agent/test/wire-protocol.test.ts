import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type {
	WireContentPart,
	WireEvent,
	WireToolCall,
	WireToolResult,
	WireTurnBegin,
	WireTurnEnd,
} from "../src/core/wire/index.js";
import {
	createWireHub,
	createWireTraceWriter,
	readWireTrace,
	WIRE_PROTOCOL_VERSION,
	wireEventBase,
} from "../src/core/wire/index.js";

describe("Wire Protocol", () => {
	const tempDirs: string[] = [];

	afterEach(() => {
		for (const dir of tempDirs) {
			try {
				rmSync(dir, { recursive: true, force: true });
			} catch {
				// best-effort cleanup
			}
		}
		tempDirs.length = 0;
	});

	function makeTempDir(): string {
		const dir = mkdtempSync(join(tmpdir(), "wire-test-"));
		tempDirs.push(dir);
		return dir;
	}

	it("creates a WireHub that publishes events to subscribers", () => {
		const hub = createWireHub({ sessionId: "test-session" });
		const received: WireEvent[] = [];
		hub.subscribe((event) => received.push(event));

		const event: WireTurnBegin = {
			...wireEventBase(hub, "test-session"),
			type: "TurnBegin",
			turnId: "turn-1",
			triggerSource: "user_prompt",
		};
		hub.publish(event);

		expect(received).toHaveLength(1);
		expect(received[0]).toMatchObject({
			type: "TurnBegin",
			turnId: "turn-1",
			triggerSource: "user_prompt",
			version: WIRE_PROTOCOL_VERSION,
			seq: 1,
			sessionId: "test-session",
		});
		hub.dispose();
	});

	it("supports multiple subscribers and isolates errors", () => {
		const hub = createWireHub({ sessionId: "s1" });
		const good: WireEvent[] = [];
		hub.subscribe(() => {
			throw new Error("subscriber crash");
		});
		hub.subscribe((event) => good.push(event));

		const event: WireTurnEnd = {
			...wireEventBase(hub, "s1"),
			type: "TurnEnd",
			turnId: "turn-1",
			reason: "complete",
		};
		hub.publish(event);

		expect(good).toHaveLength(1);
		expect(good[0].type).toBe("TurnEnd");
		hub.dispose();
	});

	it("replays history to a new subscriber", () => {
		const hub = createWireHub({ sessionId: "s2" });

		hub.publish({
			...wireEventBase(hub, "s2"),
			type: "TurnBegin",
			turnId: "t1",
			triggerSource: "user_prompt",
		} satisfies WireTurnBegin);

		hub.publish({
			...wireEventBase(hub, "s2"),
			type: "ContentPart",
			turnId: "t1",
			contentIndex: 0,
			delta: "hello",
		} satisfies WireContentPart);

		const replayed: WireEvent[] = [];
		hub.replay((event) => replayed.push(event));

		expect(replayed).toHaveLength(2);
		expect(replayed[0].type).toBe("TurnBegin");
		expect(replayed[1].type).toBe("ContentPart");
		expect(replayed[0].seq).toBe(1);
		expect(replayed[1].seq).toBe(2);
		hub.dispose();
	});

	it("increments seq monotonically", () => {
		const hub = createWireHub({ sessionId: "s3" });
		expect(hub.getNextSeq()).toBe(1);

		hub.publish({
			...wireEventBase(hub, "s3"),
			type: "StatusUpdate",
			status: "working",
		});
		expect(hub.getNextSeq()).toBe(2);

		hub.publish({
			...wireEventBase(hub, "s3"),
			type: "StatusUpdate",
			status: "idle",
		});
		expect(hub.getNextSeq()).toBe(3);
		hub.dispose();
	});

	it("persists events to JSONL and reads them back (round-trip)", () => {
		const dir = makeTempDir();
		const writer = createWireTraceWriter(dir);
		const hub = createWireHub({ sessionId: "s4", onPersist: writer });

		const turnBegin: WireTurnBegin = {
			...wireEventBase(hub, "s4"),
			type: "TurnBegin",
			turnId: "t1",
			triggerSource: "user_prompt",
		};
		hub.publish(turnBegin);

		const toolCall: WireToolCall = {
			...wireEventBase(hub, "s4"),
			type: "ToolCall",
			turnId: "t1",
			toolCallId: "tc-1",
			toolName: "read",
			args: { filePath: "src/main.ts" },
		};
		hub.publish(toolCall);

		const toolResult: WireToolResult = {
			...wireEventBase(hub, "s4"),
			type: "ToolResult",
			turnId: "t1",
			toolCallId: "tc-1",
			toolName: "read",
			result: { content: [{ type: "text", text: "file content" }] },
			isError: false,
		};
		hub.publish(toolResult);

		const turnEnd: WireTurnEnd = {
			...wireEventBase(hub, "s4"),
			type: "TurnEnd",
			turnId: "t1",
			reason: "complete",
		};
		hub.publish(turnEnd);

		// Flush async buffer to disk before reading back
		writer.flushSync();

		// Read back from file
		const events = readWireTrace(dir);
		expect(events).toHaveLength(4);
		expect(events[0].type).toBe("TurnBegin");
		expect(events[1].type).toBe("ToolCall");
		expect(events[2].type).toBe("ToolResult");
		expect(events[3].type).toBe("TurnEnd");

		// Round-trip: serialized → deserialized should be equivalent
		expect(events[0]).toMatchObject({ turnId: "t1", triggerSource: "user_prompt", seq: 1 });
		expect(events[1]).toMatchObject({ toolCallId: "tc-1", toolName: "read", seq: 2 });
		expect(events[2]).toMatchObject({ toolCallId: "tc-1", isError: false, seq: 3 });
		expect(events[3]).toMatchObject({ turnId: "t1", reason: "complete", seq: 4 });

		hub.dispose();
	});

	it("skips malformed lines when reading trace", () => {
		const dir = makeTempDir();
		const writer = createWireTraceWriter(dir);
		const hub = createWireHub({ sessionId: "s5", onPersist: writer });

		hub.publish({
			...wireEventBase(hub, "s5"),
			type: "StatusUpdate",
			status: "working",
		});
		writer.flushSync();
		hub.dispose();

		// Manually append a malformed line
		const { appendFileSync } = require("node:fs");
		const { join: pathJoin } = require("node:path");
		appendFileSync(pathJoin(dir, "wire-trace.jsonl"), "not valid json\n", "utf-8");
		appendFileSync(
			pathJoin(dir, "wire-trace.jsonl"),
			`${JSON.stringify({ type: "StatusUpdate", seq: 99, timestamp: "t", sessionId: "s5", version: "1.0", status: "idle" })}\n`,
			"utf-8",
		);

		const events = readWireTrace(dir);
		expect(events).toHaveLength(2);
		expect(events[0].seq).toBe(1);
		expect(events[1].seq).toBe(99);
	});

	it("returns empty array when trace file does not exist", () => {
		const dir = makeTempDir();
		const events = readWireTrace(dir);
		expect(events).toHaveLength(0);
	});

	it("unsubscribe stops delivery", () => {
		const hub = createWireHub({ sessionId: "s6" });
		const received: WireEvent[] = [];
		const unsub = hub.subscribe((event) => received.push(event));

		hub.publish({ ...wireEventBase(hub, "s6"), type: "StatusUpdate", status: "a" });
		unsub();
		hub.publish({ ...wireEventBase(hub, "s6"), type: "StatusUpdate", status: "b" });

		expect(received).toHaveLength(1);
		hub.dispose();
	});
});
