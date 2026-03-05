/**
 * Access Guard Extension
 *
 * Blocks read and/or write operations to configured paths.
 * Loads configuration from ~/.pi/agent/sandbox.json (filesystem.denyRead, filesystem.denyWrite)
 * with project-local overrides from <cwd>/.pi/sandbox.json.
 *
 * Usage as standalone extension (loads from sandbox.json):
 *   export default function(pi: ExtensionAPI) { accessGuard(pi); }
 *
 * Usage with explicit config (skips file loading):
 *   accessGuard(pi, { denyRead: ["~/.ssh"], denyWrite: [".env"] });
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ToolCallEvent } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

export interface AccessGuardConfig {
	denyRead?: string[];
	denyWrite?: string[];
}

interface SandboxJson {
	filesystem?: {
		denyRead?: string[];
		denyWrite?: string[];
	};
}

const READ_TOOLS = ["read", "grep", "find", "ls"] as const;
const WRITE_TOOLS = ["write", "edit"] as const;

function getPath(event: ToolCallEvent): string | undefined {
	if ("path" in event.input) return event.input.path as string | undefined;
	return undefined;
}

function matchesDenied(path: string, patterns: string[]): string | undefined {
	return patterns.find((p) => path.includes(p));
}

/**
 * Load denyRead/denyWrite from sandbox.json files.
 * Merge order: global (~/.pi/agent/sandbox.json) then project-local (<cwd>/.pi/sandbox.json).
 * Project-local filesystem section replaces global when present.
 */
export function loadAccessGuardConfig(cwd: string): Required<AccessGuardConfig> {
	const globalPath = join(homedir(), ".pi", "agent", "sandbox.json");
	const projectPath = join(cwd, ".pi", "sandbox.json");

	let denyRead: string[] = [];
	let denyWrite: string[] = [];

	for (const configPath of [globalPath, projectPath]) {
		if (!existsSync(configPath)) continue;
		try {
			const parsed: SandboxJson = JSON.parse(readFileSync(configPath, "utf-8"));
			const fs = parsed.filesystem;
			if (fs) {
				if (fs.denyRead) denyRead = fs.denyRead;
				if (fs.denyWrite) denyWrite = fs.denyWrite;
			}
		} catch (e) {
			console.error(`Warning: Could not parse ${configPath}: ${e}`);
		}
	}

	return { denyRead, denyWrite };
}

export default function accessGuard(pi: ExtensionAPI, config?: AccessGuardConfig) {
	// When no explicit config, load from sandbox.json using process.cwd()
	const effective = config ?? loadAccessGuardConfig(process.cwd());
	const denyRead = effective.denyRead ?? [];
	const denyWrite = effective.denyWrite ?? [];

	pi.on("tool_call", async (event, ctx) => {
		// Check read tools against denyRead
		if (denyRead.length > 0) {
			for (const tool of READ_TOOLS) {
				if (isToolCallEventType(tool, event)) {
					const path = getPath(event);
					if (!path) return undefined;
					const matched = matchesDenied(path, denyRead);
					if (matched) {
						if (ctx.hasUI) {
							ctx.ui.notify(`Blocked read access: ${path}`, "warning");
						}
						return { block: true, reason: `Read denied: "${path}" matches protected pattern "${matched}"` };
					}
					return undefined;
				}
			}
		}

		// Check write tools against denyWrite
		if (denyWrite.length > 0) {
			for (const tool of WRITE_TOOLS) {
				if (isToolCallEventType(tool, event)) {
					const path = getPath(event);
					if (!path) return undefined;
					const matched = matchesDenied(path, denyWrite);
					if (matched) {
						if (ctx.hasUI) {
							ctx.ui.notify(`Blocked write access: ${path}`, "warning");
						}
						return { block: true, reason: `Write denied: "${path}" matches protected pattern "${matched}"` };
					}
					return undefined;
				}
			}
		}

		return undefined;
	});

	pi.registerCommand("access-guard", {
		description: "Show effective access guard configuration",
		handler: async (_args, ctx) => {
			const lines = [
				"Access Guard Configuration:",
				"",
				`  Deny Read:  ${denyRead.length > 0 ? denyRead.join(", ") : "(none)"}`,
				`  Deny Write: ${denyWrite.length > 0 ? denyWrite.join(", ") : "(none)"}`,
			];
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});
}
