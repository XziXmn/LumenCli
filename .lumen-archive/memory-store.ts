import { appendFile, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { MemoryEntry, MemoryKind } from "@lumen/shared-schema";
import { randomUUID } from "node:crypto";

export interface MemoryStore {
  list(kind?: MemoryKind): Promise<MemoryEntry[]>;
  remember(entry: Omit<MemoryEntry, "id" | "createdAt" | "updatedAt">): Promise<MemoryEntry>;
}

export class InMemoryMemoryStore implements MemoryStore {
  private readonly entries: MemoryEntry[] = [];

  async list(kind?: MemoryKind): Promise<MemoryEntry[]> {
    if (!kind) {
      return [...this.entries];
    }
    return this.entries.filter((entry) => entry.kind === kind);
  }

  async remember(entry: Omit<MemoryEntry, "id" | "createdAt" | "updatedAt">): Promise<MemoryEntry> {
    const now = new Date().toISOString();
    const saved: MemoryEntry = {
      ...entry,
      id: `mem_${randomUUID()}`,
      createdAt: now,
      updatedAt: now,
    };
    this.entries.push(saved);
    return saved;
  }
}

export interface JsonlMemoryStoreOptions {
  path: string;
}

export class JsonlMemoryStore implements MemoryStore {
  readonly path: string;

  constructor(options: JsonlMemoryStoreOptions) {
    this.path = options.path;
  }

  async list(kind?: MemoryKind): Promise<MemoryEntry[]> {
    const entries = await this.readEntries();
    if (!kind) {
      return entries;
    }
    return entries.filter((entry) => entry.kind === kind);
  }

  async remember(entry: Omit<MemoryEntry, "id" | "createdAt" | "updatedAt">): Promise<MemoryEntry> {
    const now = new Date().toISOString();
    const saved: MemoryEntry = {
      ...entry,
      id: `mem_${randomUUID()}`,
      createdAt: now,
      updatedAt: now,
    };

    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, `${JSON.stringify(saved)}\n`, "utf8");
    return saved;
  }

  private async readEntries(): Promise<MemoryEntry[]> {
    let content: string;
    try {
      content = await readFile(this.path, "utf8");
    } catch {
      return [];
    }

    return content
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .flatMap((line) => parseMemoryLine(line));
  }
}

export function resolveDefaultMemoryPath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.LUMEN_MEMORY_PATH?.trim()) {
    return resolve(env.LUMEN_MEMORY_PATH);
  }

  return join(homedir(), ".lumen", "memory.jsonl");
}

function parseMemoryLine(line: string): MemoryEntry[] {
  try {
    const parsed = JSON.parse(line) as MemoryEntry;
    if (isMemoryEntry(parsed)) {
      return [parsed];
    }
  } catch {
    return [];
  }

  return [];
}

function isMemoryEntry(value: MemoryEntry): value is MemoryEntry {
  return (
    typeof value?.id === "string" &&
    typeof value.kind === "string" &&
    typeof value.content === "string" &&
    typeof value.source === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}
