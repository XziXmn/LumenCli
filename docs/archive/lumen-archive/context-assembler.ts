import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { MemoryStore } from "@lumen/memory";
import type { AgentMessage, MemoryEntry } from "@lumen/shared-schema";

export interface BuildContextOptions {
  cwd: string;
  memory: MemoryStore;
  messages: AgentMessage[];
  maxChars?: number;
}

export interface ContextSection {
  title: string;
  content: string;
}

export interface BuiltContext {
  sections: ContextSection[];
  rendered: string;
}

const RULE_FILES = ["AGENTS.md", "LUMEN.md", ".lumen/context.md"];
const IGNORED_ENTRIES = new Set([".git", "node_modules", "dist", "references", ".tmp"]);

export async function buildContext(options: BuildContextOptions): Promise<BuiltContext> {
  const maxChars = options.maxChars ?? 12_000;
  const sections = [
    ...(await buildRuleSections(options.cwd)),
    await buildWorkspaceSection(options.cwd),
    await buildNovelSection(options.cwd),
    buildRecentMessagesSection(options.messages),
    await buildMemorySection(options.memory),
  ].filter((section) => section.content.trim().length > 0);

  return {
    sections,
    rendered: limitText(renderSections(sections), maxChars),
  };
}

async function buildRuleSections(cwd: string): Promise<ContextSection[]> {
  const sections: ContextSection[] = [];

  for (const file of RULE_FILES) {
    try {
      const content = await readFile(join(cwd, file), "utf8");
      sections.push({
        title: `Project Rules: ${file}`,
        content,
      });
    } catch {
      // Missing context files are normal.
    }
  }

  return sections;
}

async function buildWorkspaceSection(cwd: string): Promise<ContextSection> {
  const entries = await readdir(cwd, { withFileTypes: true });
  const visibleEntries = entries
    .filter((entry) => !IGNORED_ENTRIES.has(entry.name))
    .map((entry) => `${entry.isDirectory() ? "dir " : "file"} ${entry.name}`)
    .sort();
  const isGitRepo = await exists(join(cwd, ".git"));

  return {
    title: "Workspace",
    content: [`cwd: ${cwd}`, `git: ${isGitRepo ? "yes" : "no"}`, ...visibleEntries].join("\n"),
  };
}

function buildRecentMessagesSection(messages: AgentMessage[]): ContextSection {
  const recentMessages = messages.slice(-8);

  return {
    title: "Recent Messages",
    content: recentMessages
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n\n"),
  };
}

async function buildMemorySection(memory: MemoryStore): Promise<ContextSection> {
  const entries = await memory.list();

  return {
    title: "Memory",
    content: renderMemory(entries),
  };
}

// ---------------------------------------------------------------------------
// .novel project detection (S1.8)
// ---------------------------------------------------------------------------

export interface NovelProjectInfo {
  /** Absolute path to the .novel directory. */
  root: string;
  /** Project title from .novel/project.yaml or project.json (if present). */
  title?: string;
  /** Synopsis / logline (first non-empty line of synopsis file). */
  synopsis?: string;
  /** Manuscript file paths, relative to cwd. */
  manuscriptFiles: string[];
  /** Character / world / outline note file paths, relative to cwd. */
  noteFiles: string[];
}

/**
 * Detect a .novel project at the given cwd. Returns undefined if not a
 * .novel workspace. Looks for these conventions (adapted from Lumen-Rebuild):
 *   - <cwd>/.novel/project.yaml or project.json (metadata)
 *   - <cwd>/.novel/synopsis.md (short project summary)
 *   - <cwd>/manuscript/**.md (chapters/scenes)
 *   - <cwd>/notes/**.md (character, worldbuilding, outline notes)
 */
export async function detectNovelProject(cwd: string): Promise<NovelProjectInfo | undefined> {
  const novelRoot = join(cwd, ".novel");
  if (!(await exists(novelRoot))) return undefined;

  const info: NovelProjectInfo = {
    root: novelRoot,
    manuscriptFiles: [],
    noteFiles: [],
  };

  // Read project metadata (minimal parsing: one key-value per line)
  const metadataPaths = [
    join(novelRoot, "project.yaml"),
    join(novelRoot, "project.yml"),
    join(novelRoot, "project.json"),
  ];
  for (const metaPath of metadataPaths) {
    try {
      const text = await readFile(metaPath, "utf8");
      const title = extractTitle(text, metaPath);
      if (title) info.title = title;
      break;
    } catch {
      // Try next
    }
  }

  // Read synopsis
  try {
    const synopsis = await readFile(join(novelRoot, "synopsis.md"), "utf8");
    const firstLine = synopsis.split("\n").find((l) => l.trim().length > 0);
    if (firstLine) info.synopsis = firstLine.trim().replace(/^#+\s*/, "");
  } catch {
    // Optional
  }

  // Discover manuscript + notes
  info.manuscriptFiles = await listMarkdownFiles(join(cwd, "manuscript"), cwd);
  info.noteFiles = await listMarkdownFiles(join(cwd, "notes"), cwd);

  return info;
}

async function buildNovelSection(cwd: string): Promise<ContextSection> {
  const info = await detectNovelProject(cwd);
  if (!info) return { title: ".novel", content: "" };

  const lines: string[] = [];
  lines.push(`检测到 .novel 写作项目`);
  if (info.title) lines.push(`标题: ${info.title}`);
  if (info.synopsis) lines.push(`简介: ${info.synopsis}`);
  if (info.manuscriptFiles.length > 0) {
    lines.push(`手稿: ${info.manuscriptFiles.length} 个文件`);
    for (const file of info.manuscriptFiles.slice(0, 8)) {
      lines.push(`  - ${file}`);
    }
    if (info.manuscriptFiles.length > 8) {
      lines.push(`  ... (+${info.manuscriptFiles.length - 8} 更多)`);
    }
  }
  if (info.noteFiles.length > 0) {
    lines.push(`笔记: ${info.noteFiles.length} 个文件`);
    for (const file of info.noteFiles.slice(0, 5)) {
      lines.push(`  - ${file}`);
    }
    if (info.noteFiles.length > 5) {
      lines.push(`  ... (+${info.noteFiles.length - 5} 更多)`);
    }
  }

  return { title: ".novel Project", content: lines.join("\n") };
}

function extractTitle(text: string, path: string): string | undefined {
  if (path.endsWith(".json")) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (typeof parsed.title === "string") return parsed.title;
    } catch {
      return undefined;
    }
  }
  // YAML-ish: look for `title:` line
  for (const line of text.split("\n")) {
    const m = line.match(/^title:\s*["']?(.+?)["']?\s*$/);
    if (m) return m[1].trim();
  }
  return undefined;
}

async function listMarkdownFiles(dir: string, cwd: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        const relative = join(dir, entry.name).slice(cwd.length + 1).replace(/\\/g, "/");
        results.push(relative);
      }
    }
  } catch {
    // Directory doesn't exist, return empty
  }
  return results.sort();
}

function renderMemory(entries: MemoryEntry[]): string {
  if (entries.length === 0) {
    return "";
  }

  return entries.map((entry) => `- [${entry.kind}] ${entry.content}`).join("\n");
}

function renderSections(sections: ContextSection[]): string {
  return sections.map((section) => `## ${section.title}\n\n${section.content}`).join("\n\n");
}

function limitText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, maxChars)}\n\n[Context truncated]`;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
