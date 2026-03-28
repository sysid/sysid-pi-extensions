import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { expandPath, isReadBlocked, isUnderDirectory, isWriteBlocked, matchesFilePattern } from "./path-guard.js";

const home = homedir();

describe("path-guard", () => {
	describe("expandPath", () => {
		it("should expand ~ to home directory", () => {
			expect(expandPath("~/.ssh", "/work")).toBe(join(home, ".ssh"));
		});

		it("should expand ~/subpath to home directory", () => {
			expect(expandPath("~/.aws/credentials", "/work")).toBe(join(home, ".aws/credentials"));
		});

		it("should expand . to cwd", () => {
			expect(expandPath(".", "/work/project")).toBe("/work/project");
		});

		it("should expand ./subpath relative to cwd", () => {
			expect(expandPath("./foo", "/work/project")).toBe("/work/project/foo");
		});

		it("should leave absolute paths unchanged", () => {
			expect(expandPath("/tmp", "/work")).toBe("/tmp");
		});

		it("should leave absolute paths with subdirectories unchanged", () => {
			expect(expandPath("/tmp/output", "/work")).toBe("/tmp/output");
		});

		it("should resolve bare relative paths against cwd", () => {
			expect(expandPath("src", "/work/project")).toBe("/work/project/src");
		});
	});

	describe("isUnderDirectory", () => {
		it("should return true for files directly under directory", () => {
			expect(isUnderDirectory("/home/user/.ssh/id_rsa", "/home/user/.ssh")).toBe(true);
		});

		it("should return true for the directory path itself", () => {
			expect(isUnderDirectory("/home/user/.ssh", "/home/user/.ssh")).toBe(true);
		});

		it("should return false for prefix-only matches (not actual children)", () => {
			expect(isUnderDirectory("/home/user/.sshkeys", "/home/user/.ssh")).toBe(false);
		});

		it("should return false for unrelated paths", () => {
			expect(isUnderDirectory("/etc/passwd", "/home/user")).toBe(false);
		});

		it("should return true for deeply nested children", () => {
			expect(isUnderDirectory("/home/user/.ssh/keys/backup/id_rsa", "/home/user/.ssh")).toBe(true);
		});

		it("should return true when directory is root /", () => {
			expect(isUnderDirectory("/home/user", "/")).toBe(true);
		});

		it("should return true for root directory matching itself", () => {
			expect(isUnderDirectory("/", "/")).toBe(true);
		});
	});

	describe("matchesFilePattern", () => {
		it("should match exact filename .env", () => {
			expect(matchesFilePattern("/path/to/.env", ".env")).toBe(true);
		});

		it("should match .env.* pattern for .env.local", () => {
			expect(matchesFilePattern("/path/to/.env.local", ".env.*")).toBe(true);
		});

		it("should match .env.* pattern for .env.production", () => {
			expect(matchesFilePattern("/path/to/.env.production", ".env.*")).toBe(true);
		});

		it("should NOT match .env for .env.local (exact match only)", () => {
			expect(matchesFilePattern("/path/to/.env.local", ".env")).toBe(false);
		});

		it("should match *.pem for cert.pem", () => {
			expect(matchesFilePattern("/path/to/cert.pem", "*.pem")).toBe(true);
		});

		it("should match *.key for server.key", () => {
			expect(matchesFilePattern("/path/to/server.key", "*.key")).toBe(true);
		});

		it("should NOT match *.key for key.txt", () => {
			expect(matchesFilePattern("/path/to/key.txt", "*.key")).toBe(false);
		});

		it("should NOT match *.pem for pem.txt", () => {
			expect(matchesFilePattern("/path/to/pem.txt", "*.pem")).toBe(false);
		});
	});

	describe("isReadBlocked", () => {
		const config = {
			filesystem: {
				denyRead: ["~/.ssh", "~/.aws", "~/.gnupg"],
				allowWrite: ["."],
				denyWrite: [".env"],
			},
		};

		it("should block reading files under ~/.ssh", () => {
			const result = isReadBlocked(join(home, ".ssh/id_rsa"), config, "/work");
			expect(result.blocked).toBe(true);
			expect(result.reason).toBeDefined();
		});

		it("should block reading ~/.ssh directory itself", () => {
			const result = isReadBlocked(join(home, ".ssh"), config, "/work");
			expect(result.blocked).toBe(true);
		});

		it("should block reading files under ~/.aws", () => {
			const result = isReadBlocked(join(home, ".aws/credentials"), config, "/work");
			expect(result.blocked).toBe(true);
		});

		it("should block reading files under ~/.gnupg", () => {
			const result = isReadBlocked(join(home, ".gnupg/secring.gpg"), config, "/work");
			expect(result.blocked).toBe(true);
		});

		it("should allow reading regular project files", () => {
			const result = isReadBlocked("/work/src/main.ts", config, "/work");
			expect(result.blocked).toBe(false);
		});

		it("should resolve relative paths against cwd for read checks", () => {
			// "src/main.ts" from cwd "/work" → "/work/src/main.ts" which is NOT under ~/.ssh
			const result = isReadBlocked("src/main.ts", config, "/work");
			expect(result.blocked).toBe(false);
		});

		it("should resolve ~ in file paths for read checks", () => {
			const result = isReadBlocked("~/.ssh/id_rsa", config, "/work");
			expect(result.blocked).toBe(true);
		});

		it("should allow reading when denyRead is empty", () => {
			const emptyConfig = { filesystem: { denyRead: [], allowWrite: [], denyWrite: [] } };
			const result = isReadBlocked(join(home, ".ssh/id_rsa"), emptyConfig, "/work");
			expect(result.blocked).toBe(false);
		});

		it("should allow reading when no filesystem config exists", () => {
			const result = isReadBlocked("/work/file.ts", {}, "/work");
			expect(result.blocked).toBe(false);
		});
	});

	describe("isWriteBlocked", () => {
		const config = {
			filesystem: {
				denyRead: ["~/.ssh"],
				allowWrite: [".", "/tmp"],
				denyWrite: [".env", ".env.*", "*.pem", "*.key"],
			},
		};

		it("should block writing .env even under allowed write path (deny takes precedence)", () => {
			const result = isWriteBlocked("/work/.env", config, "/work");
			expect(result.blocked).toBe(true);
			expect(result.reason).toContain(".env");
		});

		it("should block writing .env.local (matches .env.* pattern)", () => {
			const result = isWriteBlocked("/work/.env.local", config, "/work");
			expect(result.blocked).toBe(true);
		});

		it("should block writing cert.pem (matches *.pem pattern)", () => {
			const result = isWriteBlocked("/work/cert.pem", config, "/work");
			expect(result.blocked).toBe(true);
		});

		it("should block writing server.key (matches *.key pattern)", () => {
			const result = isWriteBlocked("/work/server.key", config, "/work");
			expect(result.blocked).toBe(true);
		});

		it("should allow writing regular project files under allowWrite path", () => {
			const result = isWriteBlocked("/work/src/main.ts", config, "/work");
			expect(result.blocked).toBe(false);
		});

		it("should allow writing to /tmp", () => {
			const result = isWriteBlocked("/tmp/output.txt", config, "/work");
			expect(result.blocked).toBe(false);
		});

		it("should block writing outside allowed paths (default-deny)", () => {
			const result = isWriteBlocked("/etc/passwd", config, "/work");
			expect(result.blocked).toBe(true);
		});

		it("should block writing to home directory (not in allowWrite)", () => {
			const result = isWriteBlocked(join(home, "random.txt"), config, "/work");
			expect(result.blocked).toBe(true);
		});

		it("should resolve relative paths against cwd for write checks", () => {
			// "src/test.ts" from cwd "/work" → "/work/src/test.ts" which IS under "." = "/work"
			const result = isWriteBlocked("src/test.ts", config, "/work");
			expect(result.blocked).toBe(false);
		});

		it("should resolve ~ in file paths for write checks", () => {
			const result = isWriteBlocked("~/.env", config, "/work");
			expect(result.blocked).toBe(true);
		});

		it("should block all writes when allowWrite is empty", () => {
			const restrictiveConfig = {
				filesystem: { denyRead: [], allowWrite: [], denyWrite: [] },
			};
			const result = isWriteBlocked("/work/file.ts", restrictiveConfig, "/work");
			expect(result.blocked).toBe(true);
		});

		it("should allow all writes when no filesystem config exists", () => {
			// No filesystem config = no restrictions (extension not configured for fs)
			const result = isWriteBlocked("/work/file.ts", {}, "/work");
			expect(result.blocked).toBe(false);
		});
	});
});
