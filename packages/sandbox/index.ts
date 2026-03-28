/**
 * Sandbox Extension - OS-level sandboxing for bash commands
 *
 * Uses @sysid/sandbox-runtime-improved to enforce filesystem and network
 * restrictions on bash commands at the OS level (sandbox-exec on macOS,
 * bubblewrap on Linux).
 *
 * Config files (merged, project takes precedence):
 * - ~/.pi/agent/extensions/sandbox.json (global)
 * - <cwd>/.pi/sandbox.json (project-local)
 *
 * Example .pi/sandbox.json:
 * ```json
 * {
 *   "enabled": true,
 *   "network": {
 *     "allowedDomains": ["github.com", "*.github.com"],
 *     "deniedDomains": []
 *   },
 *   "filesystem": {
 *     "denyRead": ["~/.ssh", "~/.aws"],
 *     "allowWrite": [".", "/tmp"],
 *     "denyWrite": [".env"]
 *   }
 * }
 * ```
 *
 * Usage:
 * - `pi -e ./sandbox` - sandbox enabled with default/config settings
 * - `pi -e ./sandbox --no-sandbox` - disable sandboxing
 * - `/sandbox` - show current sandbox configuration
 *
 * Setup:
 * 1. Copy sandbox/ directory to ~/.pi/agent/extensions/
 * 2. Run `npm install` in ~/.pi/agent/extensions/sandbox/
 *
 * Linux also requires: bubblewrap, socat, ripgrep
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type SandboxAskCallback, SandboxManager, type SandboxRuntimeConfig } from "@sysid/sandbox-runtime-improved";
import {
	type BashOperations,
	createBashTool,
	type ExtensionAPI,
	getAgentDir,
	isToolCallEventType,
} from "@mariozechner/pi-coding-agent";
import { expandPath, isReadBlocked, isUnderDirectory, isWriteBlocked } from "./path-guard.js";
import { type PromptChoice, promptDomainBlock, promptWriteBlock } from "./prompt.js";
import { addDomainToConfig, addWritePathToConfig, createSessionState } from "./session-state.js";

interface SandboxConfig extends SandboxRuntimeConfig {
	enabled?: boolean;
	ignoreViolations?: Record<string, string[]>;
	enableWeakerNestedSandbox?: boolean;
	enableWeakerNetworkIsolation?: boolean;
}

const DEFAULT_CONFIG: SandboxConfig = {
	enabled: true,
	network: {
		allowedDomains: [
			"npmjs.org",
			"*.npmjs.org",
			"registry.npmjs.org",
			"registry.yarnpkg.com",
			"pypi.org",
			"*.pypi.org",
			"github.com",
			"*.github.com",
			"api.github.com",
			"raw.githubusercontent.com",
		],
		deniedDomains: [],
	},
	filesystem: {
		denyRead: ["~/.ssh", "~/.aws", "~/.gnupg"],
		allowWrite: [".", "/tmp"],
		denyWrite: [".env", ".env.*", "*.pem", "*.key"],
	},
};

function loadConfig(cwd: string): SandboxConfig {
	const projectConfigPath = join(cwd, ".pi", "sandbox.json");
	// const globalConfigPath = join(homedir(), ".pi", "agent", "sandbox.json");
	const globalConfigPath = join(getAgentDir(), "extensions", "sandbox.json");

	let globalConfig: Partial<SandboxConfig> = {};
	let projectConfig: Partial<SandboxConfig> = {};

	if (existsSync(globalConfigPath)) {
		try {
			globalConfig = JSON.parse(readFileSync(globalConfigPath, "utf-8"));
		} catch (e) {
			console.error(`Warning: Could not parse ${globalConfigPath}: ${e}`);
		}
	}

	if (existsSync(projectConfigPath)) {
		try {
			projectConfig = JSON.parse(readFileSync(projectConfigPath, "utf-8"));
		} catch (e) {
			console.error(`Warning: Could not parse ${projectConfigPath}: ${e}`);
		}
	}

	return deepMerge(deepMerge(DEFAULT_CONFIG, globalConfig), projectConfig);
}

function deepMerge(base: SandboxConfig, overrides: Partial<SandboxConfig>): SandboxConfig {
	const result: SandboxConfig = { ...base };

	if (overrides.enabled !== undefined) result.enabled = overrides.enabled;
	if (overrides.network) {
		result.network = { ...base.network, ...overrides.network };
	}
	if (overrides.filesystem) {
		result.filesystem = { ...base.filesystem, ...overrides.filesystem };
	}

	if (overrides.ignoreViolations) {
		result.ignoreViolations = overrides.ignoreViolations;
	}
	if (overrides.enableWeakerNestedSandbox !== undefined) {
		result.enableWeakerNestedSandbox = overrides.enableWeakerNestedSandbox;
	}
	if (overrides.enableWeakerNetworkIsolation !== undefined) {
		result.enableWeakerNetworkIsolation = overrides.enableWeakerNetworkIsolation;
	}
	if (overrides.allowPty !== undefined) {
		result.allowPty = overrides.allowPty;
	}

	return result;
}

function createSandboxedBashOps(): BashOperations {
	return {
		async exec(command, cwd, { onData, signal, timeout }) {
			if (!existsSync(cwd)) {
				throw new Error(`Working directory does not exist: ${cwd}`);
			}

			const wrappedCommand = await SandboxManager.wrapWithSandbox(command);

			return new Promise((resolve, reject) => {
				const child = spawn("bash", ["-c", wrappedCommand], {
					cwd,
					detached: true,
					stdio: ["ignore", "pipe", "pipe"],
				});

				let timedOut = false;
				let timeoutHandle: NodeJS.Timeout | undefined;

				if (timeout !== undefined && timeout > 0) {
					timeoutHandle = setTimeout(() => {
						timedOut = true;
						if (child.pid) {
							try {
								process.kill(-child.pid, "SIGKILL");
							} catch {
								child.kill("SIGKILL");
							}
						}
					}, timeout * 1000);
				}

				child.stdout?.on("data", onData);
				child.stderr?.on("data", onData);

				child.on("error", (err) => {
					if (timeoutHandle) clearTimeout(timeoutHandle);
					reject(err);
				});

				const onAbort = () => {
					if (child.pid) {
						try {
							process.kill(-child.pid, "SIGKILL");
						} catch {
							child.kill("SIGKILL");
						}
					}
				};

				signal?.addEventListener("abort", onAbort, { once: true });

				child.on("close", (code) => {
					if (timeoutHandle) clearTimeout(timeoutHandle);
					signal?.removeEventListener("abort", onAbort);

					if (signal?.aborted) {
						reject(new Error("aborted"));
					} else if (timedOut) {
						reject(new Error(`timeout:${timeout}`));
					} else {
						resolve({ exitCode: code });
					}
				});
			});
		},
	};
}

export default function (pi: ExtensionAPI) {
	pi.registerFlag("no-sandbox", {
		description: "Disable OS-level sandboxing for bash commands",
		type: "boolean",
		default: false,
	});

	const localCwd = process.cwd();
	const localBash = createBashTool(localCwd);

	let sandboxEnabled = false;
	let sandboxInitialized = false;
	let sandboxFailed = false;
	let toolGuardEnabled = false;
	let activeConfig: SandboxConfig = DEFAULT_CONFIG;
	let sessionState = createSessionState();

	function getConfigPaths(cwd: string) {
		return {
			globalPath: join(getAgentDir(), "extensions", "sandbox.json"),
			projectPath: join(cwd, ".pi", "sandbox.json"),
		};
	}

	function domainMatchesPattern(domain: string, pattern: string): boolean {
		if (pattern.startsWith("*.")) {
			const base = pattern.slice(2);
			return domain === base || domain.endsWith(`.${base}`);
		}
		return domain === pattern;
	}

	function isSessionAllowedWrite(filePath: string, cwd: string): boolean {
		for (const allowed of sessionState.writePaths) {
			const expanded = expandPath(allowed, cwd);
			if (isUnderDirectory(filePath, expanded)) return true;
		}
		return false;
	}

	async function applyAllowance(
		choice: PromptChoice,
		type: "domain" | "writePath",
		value: string,
		cwd: string,
	): Promise<void> {
		const { globalPath, projectPath } = getConfigPaths(cwd);
		if (type === "domain") {
			sessionState.domains.push(value);
			if (choice === "project") addDomainToConfig(projectPath, value);
			if (choice === "global") addDomainToConfig(globalPath, value);
		} else {
			sessionState.writePaths.push(value);
			if (choice === "project") addWritePathToConfig(projectPath, value);
			if (choice === "global") addWritePathToConfig(globalPath, value);
		}
		if (choice !== "session") {
			activeConfig = loadConfig(cwd);
			if (sandboxInitialized) {
				SandboxManager.updateConfig({
					network: activeConfig.network,
					filesystem: activeConfig.filesystem,
					ignoreViolations: activeConfig.ignoreViolations,
					enableWeakerNestedSandbox: activeConfig.enableWeakerNestedSandbox,
					enableWeakerNetworkIsolation: activeConfig.enableWeakerNetworkIsolation,
				});
			}
		}
	}

	pi.registerTool({
		...localBash,
		label: "bash (sandboxed)",
		async execute(id, params, signal, onUpdate, _ctx) {
			if (sandboxFailed) {
				throw new Error("Sandbox initialization failed. Use --no-sandbox to run without protection.");
			}
			if (!sandboxEnabled || !sandboxInitialized) {
				return localBash.execute(id, params, signal, onUpdate);
			}

			const sandboxedBash = createBashTool(localCwd, {
				operations: createSandboxedBashOps(),
			});
			return sandboxedBash.execute(id, params, signal, onUpdate);
		},
	});

	pi.on("user_bash", () => {
		if (!sandboxEnabled || !sandboxInitialized) return;
		return { operations: createSandboxedBashOps() };
	});

	// Guard in-process file-access tools against sandbox filesystem restrictions
	pi.on("tool_call", async (event, ctx) => {
		if (!toolGuardEnabled) return;

		const READ_TOOLS = ["read", "grep", "find", "ls"] as const;
		const WRITE_TOOLS = ["write", "edit"] as const;

		for (const tool of READ_TOOLS) {
			if (isToolCallEventType(tool, event)) {
				const path = event.input.path;
				if (!path) return;
				const result = isReadBlocked(path as string, activeConfig, ctx.cwd);
				if (result.blocked) {
					ctx.ui.notify(`Sandbox blocked read: ${path}`, "warning");
					return { block: true, reason: result.reason };
				}
				return;
			}
		}

		for (const tool of WRITE_TOOLS) {
			if (isToolCallEventType(tool, event)) {
				const path = event.input.path;
				if (!path) return;
				const result = isWriteBlocked(path as string, activeConfig, ctx.cwd);
				if (result.blocked) {
					// denyWrite matches are always hard-blocked, never prompted
					if (result.reason?.includes("matches restricted pattern")) {
						ctx.ui.notify(`Sandbox blocked write: ${path}`, "warning");
						return { block: true, reason: result.reason };
					}
					// Check session allowances before prompting
					if (isSessionAllowedWrite(path as string, ctx.cwd)) {
						return;
					}
					// Prompt if UI available
					if (ctx.hasUI) {
						const choice = await promptWriteBlock(ctx.ui, path as string);
						if (choice !== "abort") {
							await applyAllowance(choice, "writePath", path as string, ctx.cwd);
							return;
						}
					}
					ctx.ui.notify(`Sandbox blocked write: ${path}`, "warning");
					return { block: true, reason: result.reason };
				}
				return;
			}
		}
	});

	pi.on("session_start", async (_event, ctx) => {
		sessionState = createSessionState();

		const noSandbox = pi.getFlag("no-sandbox") as boolean;

		if (noSandbox) {
			sandboxEnabled = false;
			sandboxInitialized = false;
			sandboxFailed = false;
			toolGuardEnabled = false;
			ctx.ui.notify("Sandbox disabled via --no-sandbox", "warning");
			return;
		}

		activeConfig = loadConfig(ctx.cwd);

		if (!activeConfig.enabled) {
			sandboxEnabled = false;
			sandboxInitialized = false;
			sandboxFailed = false;
			toolGuardEnabled = false;
			ctx.ui.notify("Sandbox disabled via config", "info");
			return;
		}

		toolGuardEnabled = true;

		const platform = process.platform;
		if (platform !== "darwin" && platform !== "linux") {
			sandboxEnabled = false;
			sandboxInitialized = false;
			ctx.ui.notify(`OS sandbox not supported on ${platform} (tool guard still active)`, "warning");
			return;
		}

		const askCallback: SandboxAskCallback | undefined = ctx.hasUI
			? async ({ host }) => {
					if (sessionState.domains.some((d) => domainMatchesPattern(host, d))) return true;
					const choice = await promptDomainBlock(ctx.ui, host);
					if (choice === "abort") return false;
					await applyAllowance(choice, "domain", host, ctx.cwd);
					return true;
				}
			: undefined;

		try {
			await SandboxManager.initialize(
				{
					network: activeConfig.network,
					filesystem: activeConfig.filesystem,
					ignoreViolations: activeConfig.ignoreViolations,
					enableWeakerNestedSandbox: activeConfig.enableWeakerNestedSandbox,
					enableWeakerNetworkIsolation: activeConfig.enableWeakerNetworkIsolation,
				},
				askCallback,
			);

			sandboxEnabled = true;
			sandboxInitialized = true;

			const networkCount = activeConfig.network?.allowedDomains?.length ?? 0;
			const writeCount = activeConfig.filesystem?.allowWrite?.length ?? 0;
			ctx.ui.setStatus(
				"sandbox",
				ctx.ui.theme.fg("accent", `🔒 Sandbox: ${networkCount} domains, ${writeCount} write paths`),
			);
			ctx.ui.notify("Sandbox initialized", "info");
		} catch (err) {
			sandboxEnabled = false;
			sandboxFailed = true;
			ctx.ui.notify(
				`Sandbox init failed: ${err instanceof Error ? err.message : err}. Bash commands will be BLOCKED (tool guard still active).`,
				"error",
			);
		}
	});

	pi.on("session_shutdown", async () => {
		if (sandboxInitialized) {
			try {
				await SandboxManager.reset();
			} catch {
				// Ignore cleanup errors
			}
		}
	});

	pi.registerCommand("sandbox", {
		description: "Show sandbox configuration",
		handler: async (_args, ctx) => {
			if (!sandboxEnabled && !toolGuardEnabled) {
				ctx.ui.notify(`Sandbox is ${sandboxFailed ? "FAILED (bash blocked)" : "disabled"}`, "info");
				return;
			}

			const osStatus = sandboxEnabled ? "enabled" : sandboxFailed ? "FAILED (bash blocked)" : "disabled";
			const guardStatus = toolGuardEnabled ? "enabled" : "disabled";

			const lines = [
				"Sandbox Configuration:",
				"",
				"Status:",
				`  OS sandbox: ${osStatus}`,
				`  Tool guard: ${guardStatus}`,
			];
			if (activeConfig.allowPty !== undefined) lines.push(`  Allow PTY: ${activeConfig.allowPty}`);
			if (activeConfig.enableWeakerNestedSandbox !== undefined)
				lines.push(`  Weaker nested sandbox: ${activeConfig.enableWeakerNestedSandbox}`);
			if (activeConfig.enableWeakerNetworkIsolation !== undefined)
				lines.push(`  Weaker network isolation: ${activeConfig.enableWeakerNetworkIsolation}`);

			lines.push(
				"",
				"Network:",
				`  Allowed: ${activeConfig.network?.allowedDomains?.join(", ") || "(none)"}`,
				`  Denied: ${activeConfig.network?.deniedDomains?.join(", ") || "(none)"}`,
			);
			if (activeConfig.network?.allowLocalBinding !== undefined)
				lines.push(`  Local binding: ${activeConfig.network.allowLocalBinding}`);
			if (activeConfig.network?.allowUnixSockets?.length)
				lines.push(`  Unix sockets: ${activeConfig.network.allowUnixSockets.join(", ")}`);
			if (activeConfig.network?.allowAllUnixSockets !== undefined)
				lines.push(`  All unix sockets: ${activeConfig.network.allowAllUnixSockets}`);

			lines.push(
				"",
				"Filesystem:",
				`  Deny Read: ${activeConfig.filesystem?.denyRead?.join(", ") || "(none)"}`,
				`  Allow Write: ${activeConfig.filesystem?.allowWrite?.join(", ") || "(none)"}`,
				`  Deny Write: ${activeConfig.filesystem?.denyWrite?.join(", ") || "(none)"}`,
			);
			if (activeConfig.filesystem?.allowGitConfig !== undefined)
				lines.push(`  Allow git config: ${activeConfig.filesystem.allowGitConfig}`);

			if (activeConfig.ignoreViolations && Object.keys(activeConfig.ignoreViolations).length > 0) {
				lines.push("", "Ignore Violations:");
				for (const [pattern, paths] of Object.entries(activeConfig.ignoreViolations)) {
					lines.push(`  ${pattern}: ${paths.join(", ")}`);
				}
			}

			if (sessionState.domains.length > 0) {
				lines.push("", "Session Allowed Domains:", `  ${sessionState.domains.join(", ")}`);
			}
			if (sessionState.writePaths.length > 0) {
				lines.push("", "Session Allowed Write Paths:", `  ${sessionState.writePaths.join(", ")}`);
			}

			ctx.ui.notify(lines.join("\n"), "info");
		},
	});
}
