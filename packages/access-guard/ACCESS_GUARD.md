# Access Guard Extension

Blocks the AI agent from reading or writing files matching configurable path patterns.

## Use Case

The built-in `protected-paths.ts` example only blocks **write** operations to a hardcoded list of paths. In practice you also want to prevent the agent from **reading** sensitive files (SSH keys, AWS credentials, GPG keyrings) — not just writing to them.

Access Guard adds read-blocking and loads its configuration from `sandbox.json`, the same file used by the sandbox extension. This means a single config file governs both OS-level sandboxing and application-level path guards.

## Usage

### As a standalone extension

```typescript
// extensions/my-guard.ts
import accessGuard from "./access-guard.js";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  accessGuard(pi);
  // Config loaded automatically from ~/.pi/agent/sandbox.json
}
```

### With explicit config (no file loading)

```typescript
import accessGuard from "./access-guard.js";

export default function (pi: ExtensionAPI) {
  accessGuard(pi, {
    denyRead: ["~/.ssh", "~/.aws", ".env"],
    denyWrite: [".env", "node_modules/", ".git/"],
  });
}
```

### Inspecting effective config at runtime

```
/access-guard
```

Displays the active `denyRead` and `denyWrite` lists.

## Configuration

Config is read from `sandbox.json` — the same file the sandbox extension uses:

| File | Scope |
|---|---|
| `~/.pi/agent/sandbox.json` | Global (all projects) |
| `<cwd>/.pi/sandbox.json` | Project-local (overrides global) |

Only the `filesystem.denyRead` and `filesystem.denyWrite` fields are used:

```json
{
  "filesystem": {
    "denyRead": ["~/.ssh", "~/.aws", "~/.gnupg"],
    "denyWrite": [".env", ".env.*", "*.pem", "*.key"]
  }
}
```

**Merge rule:** When both files exist, the project-local `filesystem.denyRead` / `filesystem.denyWrite` arrays replace (not append to) the global ones. If only the global file exists, its values apply. If neither exists, nothing is blocked.

## Which Tools Are Guarded

| Tool | Blocked by | `path` field |
|---|---|---|
| `read` | `denyRead` | required |
| `grep` | `denyRead` | optional |
| `find` | `denyRead` | optional |
| `ls` | `denyRead` | optional |
| `write` | `denyWrite` | required |
| `edit` | `denyWrite` | required |
| `bash` | not guarded | n/a |

For `grep`, `find`, and `ls`: when no `path` is provided (tool defaults to cwd), the check is skipped.

## Design Decisions

### Substring matching over path resolution

Patterns are matched with simple `String.includes()`. This is intentional:

- Same approach as the built-in `protected-paths.ts` example
- No filesystem access required during matching (no `realpathSync`, no stat calls)
- Patterns like `.env`, `.git/`, `node_modules/` match anywhere in the path

The trade-off: patterns like `~/.ssh` match literally — they won't catch `/Users/tom/.ssh/id_rsa` because `~` is not expanded. For full path resolution with symlink detection, use the sandbox extension's `path-guard.ts` instead.

### Reusing sandbox.json

Rather than introducing a new config file, access-guard reads from `sandbox.json`. This means:

- One file to maintain for both OS-level (sandbox) and app-level (access-guard) path rules
- Existing `sandbox.json` configurations work without changes
- The `/sandbox` and `/access-guard` commands show their respective views of the same config

### Config parameter for testing

The optional second argument (`config?: AccessGuardConfig`) skips file loading and uses the provided config directly. This keeps tests deterministic without needing filesystem mocks.

### No bash guarding

The `bash` tool has no `path` field — it takes a `command` string. Detecting file access from arbitrary shell commands (pipes, subshells, globs) is unreliable at the string level. The sandbox extension handles this at the OS level via `sandbox-exec` / `bubblewrap`.

## Comparison with Related Extensions

| | `protected-paths.ts` | `access-guard.ts` | `sandbox/path-guard.ts` |
|---|---|---|---|
| Blocks reads | no | yes | yes |
| Blocks writes | yes | yes | yes |
| Config source | hardcoded | sandbox.json | sandbox.json |
| Path matching | `includes()` | `includes()` | `expandPath()` + `isUnderDirectory()` |
| `~` expansion | no | no | yes |
| Symlink detection | no | no | yes (`realpathSync`) |
| OS-level sandbox | no | no | yes |
| Standalone | yes | yes | no (part of sandbox) |

## Files

```
examples/extensions/access-guard.ts    # Extension source
test/access-guard.test.ts              # Tests (23 cases)
ACCESS_GUARD.md                        # This file
```
