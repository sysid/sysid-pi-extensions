import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addDomainToConfig, addWritePathToConfig, createSessionState } from "./session-state.js";

describe("session-state", () => {
	describe("createSessionState", () => {
		it("returns empty arrays", () => {
			const state = createSessionState();
			expect(state.domains).toEqual([]);
			expect(state.writePaths).toEqual([]);
		});
	});

	describe("config file persistence", () => {
		let tmpDir: string;

		beforeEach(() => {
			tmpDir = join(tmpdir(), `sandbox-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
			mkdirSync(tmpDir, { recursive: true });
		});

		afterEach(() => {
			rmSync(tmpDir, { recursive: true, force: true });
		});

		describe("addDomainToConfig", () => {
			it("creates config file with domain when file does not exist", () => {
				const configPath = join(tmpDir, ".pi", "sandbox.json");
				addDomainToConfig(configPath, "example.com");

				const config = JSON.parse(readFileSync(configPath, "utf-8"));
				expect(config.network.allowedDomains).toContain("example.com");
			});

			it("merges into existing config", () => {
				const configPath = join(tmpDir, "sandbox.json");
				writeFileSync(
					configPath,
					JSON.stringify({
						enabled: true,
						network: { allowedDomains: ["github.com"], deniedDomains: [] },
						filesystem: { denyRead: ["~/.ssh"] },
					}),
				);

				addDomainToConfig(configPath, "npm.org");

				const config = JSON.parse(readFileSync(configPath, "utf-8"));
				expect(config.network.allowedDomains).toEqual(["github.com", "npm.org"]);
				expect(config.enabled).toBe(true);
				expect(config.filesystem.denyRead).toEqual(["~/.ssh"]);
			});

			it("skips duplicates", () => {
				const configPath = join(tmpDir, "sandbox.json");
				writeFileSync(configPath, JSON.stringify({ network: { allowedDomains: ["example.com"] } }));

				addDomainToConfig(configPath, "example.com");

				const config = JSON.parse(readFileSync(configPath, "utf-8"));
				expect(config.network.allowedDomains).toEqual(["example.com"]);
			});

			it("creates parent directories if missing", () => {
				const configPath = join(tmpDir, "deep", "nested", "sandbox.json");
				addDomainToConfig(configPath, "example.com");

				expect(existsSync(configPath)).toBe(true);
			});
		});

		describe("addWritePathToConfig", () => {
			it("creates config file with write path when file does not exist", () => {
				const configPath = join(tmpDir, ".pi", "sandbox.json");
				addWritePathToConfig(configPath, "/home/user/projects");

				const config = JSON.parse(readFileSync(configPath, "utf-8"));
				expect(config.filesystem.allowWrite).toContain("/home/user/projects");
			});

			it("merges into existing config", () => {
				const configPath = join(tmpDir, "sandbox.json");
				writeFileSync(
					configPath,
					JSON.stringify({
						filesystem: { allowWrite: ["."], denyRead: ["~/.ssh"], denyWrite: [".env"] },
					}),
				);

				addWritePathToConfig(configPath, "/tmp");

				const config = JSON.parse(readFileSync(configPath, "utf-8"));
				expect(config.filesystem.allowWrite).toEqual([".", "/tmp"]);
				expect(config.filesystem.denyRead).toEqual(["~/.ssh"]);
				expect(config.filesystem.denyWrite).toEqual([".env"]);
			});

			it("skips duplicates", () => {
				const configPath = join(tmpDir, "sandbox.json");
				writeFileSync(configPath, JSON.stringify({ filesystem: { allowWrite: ["/tmp"] } }));

				addWritePathToConfig(configPath, "/tmp");

				const config = JSON.parse(readFileSync(configPath, "utf-8"));
				expect(config.filesystem.allowWrite).toEqual(["/tmp"]);
			});
		});
	});
});
