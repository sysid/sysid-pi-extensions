import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";

export interface SandboxFilesystemConfig {
	denyRead?: string[];
	allowWrite?: string[];
	denyWrite?: string[];
}

export interface SandboxConfigForGuard {
	filesystem?: SandboxFilesystemConfig;
}

/**
 * Expand ~ and relative paths in config patterns to absolute paths.
 * - ~ → homedir
 * - . or ./foo → resolve against cwd
 * - absolute → unchanged
 * - bare relative (e.g. "src") → resolve against cwd
 */
export function expandPath(pattern: string, cwd: string): string {
	if (pattern === "~" || pattern.startsWith("~/")) {
		return resolve(homedir(), pattern.slice(2));
	}
	if (pattern.startsWith("/")) {
		return pattern;
	}
	// Relative path (., ./foo, or bare like "src")
	return resolve(cwd, pattern);
}

/**
 * Check if filePath is located under dirPath (or equals it).
 * Uses path separators to avoid prefix false positives
 * (e.g. /home/.sshkeys is NOT under /home/.ssh).
 * Follows symlinks via realpath when paths exist on disk.
 */
export function isUnderDirectory(filePath: string, dirPath: string): boolean {
	const normalizedFile = resolve(filePath);
	const normalizedDir = resolve(dirPath);

	// First check without realpath (handles non-existent paths)
	if (normalizedFile === normalizedDir || normalizedFile.startsWith(`${normalizedDir}/`)) {
		return true;
	}

	// Follow symlinks: both paths must resolve for a valid comparison
	try {
		const realFile = realpathSync(normalizedFile);
		const realDir = realpathSync(normalizedDir);
		return realFile === realDir || realFile.startsWith(`${realDir}/`);
	} catch {
		return false;
	}
}

/**
 * Check if a file's basename matches a glob-like pattern.
 * Supports:
 * - Literal match: ".env", ".gitignore"
 * - Suffix glob: "*.pem", "*.key" → basename ends with ".pem"
 * - Prefix glob: ".env.*" → basename starts with ".env."
 */
export function matchesFilePattern(filePath: string, pattern: string): boolean {
	const name = basename(filePath);
	if (pattern.startsWith("*")) {
		// *.pem → check suffix
		const suffix = pattern.slice(1); // ".pem"
		return name.endsWith(suffix);
	}
	if (pattern.endsWith("*")) {
		// .env.* → check prefix
		const prefix = pattern.slice(0, -1); // ".env."
		return name.startsWith(prefix);
	}
	// Exact basename match
	return name === pattern;
}

/**
 * Resolve a file path that may contain ~ or be relative, to absolute.
 */
function resolveFilePath(filePath: string, cwd: string): string {
	if (filePath === "~" || filePath.startsWith("~/")) {
		return resolve(homedir(), filePath.slice(2));
	}
	return resolve(cwd, filePath);
}

export function isReadBlocked(
	filePath: string,
	config: SandboxConfigForGuard,
	cwd: string,
): { blocked: boolean; reason?: string } {
	const denyRead = config.filesystem?.denyRead;
	if (!denyRead || denyRead.length === 0) {
		return { blocked: false };
	}

	const resolved = resolveFilePath(filePath, cwd);

	for (const pattern of denyRead) {
		const expanded = expandPath(pattern, cwd);
		if (isUnderDirectory(resolved, expanded)) {
			return { blocked: true, reason: `Read denied: ${filePath} is under restricted path ${pattern}` };
		}
	}

	return { blocked: false };
}

export function isWriteBlocked(
	filePath: string,
	config: SandboxConfigForGuard,
	cwd: string,
): { blocked: boolean; reason?: string } {
	const fs = config.filesystem;
	if (!fs) {
		return { blocked: false };
	}

	const resolved = resolveFilePath(filePath, cwd);

	// Check denyWrite first (takes precedence over allowWrite)
	const denyWrite = fs.denyWrite;
	if (denyWrite) {
		for (const pattern of denyWrite) {
			if (matchesFilePattern(resolved, pattern)) {
				return { blocked: true, reason: `Write denied: ${filePath} matches restricted pattern ${pattern}` };
			}
		}
	}

	// Check allowWrite (default-deny: must be under an allowed path)
	const allowWrite = fs.allowWrite;
	if (!allowWrite || allowWrite.length === 0) {
		return { blocked: true, reason: `Write denied: ${filePath} is not under any allowed write path` };
	}

	for (const pattern of allowWrite) {
		const expanded = expandPath(pattern, cwd);
		if (isUnderDirectory(resolved, expanded)) {
			return { blocked: false };
		}
	}

	return { blocked: true, reason: `Write denied: ${filePath} is not under any allowed write path` };
}
