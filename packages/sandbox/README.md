# Sandbox Extension

OS-level and application-level sandboxing for the pi coding agent, restricting filesystem access
and network calls. Includes interactive permission prompts that let you grant access for a session,
project, or globally — without restarting pi.

## Origin

Based on the [original sandbox extension](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent/examples/extensions/sandbox)
from pi-mono. The original only sandboxes `bash` commands at the OS level — pi's built-in tools
(`read`, `write`, `edit`, `grep`, `find`, `ls`) bypass the OS sandbox entirely because they run
in-process via Node.js `fs`, not through a shell. This extension closes that gap by adding a
**tool guard** layer that intercepts all built-in tool calls and enforces the same filesystem
restrictions before they reach the `fs` module.

## Use Case

LLM agents execute arbitrary tool calls. Without sandboxing, the agent can:

- **Read secrets**: `~/.ssh/id_rsa`, `~/.aws/credentials`, `~/.gnupg/` keys
- **Write sensitive files**: `.env`, `*.pem`, `*.key`
- **Exfiltrate data**: `curl` to arbitrary domains
- **Modify system files**: write outside the project directory

This extension enforces restrictions at two independent layers so that both shell commands and
built-in tools are constrained.

## Security Boundary

```
┌──────────────────────────────────────────────────────┐
│                      LLM Agent                       │
│                                                      │
│   bash commands              built-in tools          │
│   (cat, curl, rm, ...)       (read, write, edit,     │
│                               grep, find, ls)        │
│         │                          │                 │
│         ▼                          ▼                 │
│   ┌───────────┐            ┌─────────────┐           │
│   │  OS-Level │            │  Path Guard │           │
│   │  Sandbox  │            │  (tool_call │           │
│   │           │            │   handler)  │           │
│   │ sandbox-  │            │             │           │
│   │ exec/bwrap│            │ path-guard  │           │
│   └───────────┘            │ .ts         │           │
│         │                  └──────┬──────┘           │
│         │                        │                   │
│         │   ┌────────────────────┴──────────────┐    │
│         │   │  Interactive Prompts (prompt.ts)  │    │
│         │   │  ┌─ Abort (keep blocked)          │    │
│         │   │  ├─ Allow for session (in-memory) │    │
│         │   │  ├─ Allow for project (.pi/)      │    │
│         │   │  └─ Allow for all projects (~/)   │    │
│         │   └───────────────────────────────────┘    │
│         │                        │                   │
│         ▼                        ▼                   │
│                 Filesystem / Network                 │
└──────────────────────────────────────────────────────┘
```

**Layer 1 — OS sandbox** (`sandbox-exec` on macOS, `bubblewrap` on Linux): Kernel-enforced
restrictions on all bash commands. Handles filesystem deny/allow rules and network domain filtering
at the process level.

**Layer 2 — Path guard** (`tool_call` event handler): Application-level interception of pi's
built-in file tools before they reach the Node.js `fs` module. Enforces the same
`denyRead`/`allowWrite`/`denyWrite` rules from the sandbox config.

### What Is Protected

| Tool | Layer | Mechanism |
|------|-------|-----------|
| `bash` | OS sandbox | Command wrapped via `SandboxManager.wrapWithSandbox()` |
| `read` | Path guard | `tool_call` handler checks `denyRead` directories |
| `write` | Path guard | `tool_call` handler checks `denyWrite` patterns + `allowWrite` paths |
| `edit` | Path guard | `tool_call` handler checks `denyWrite` patterns + `allowWrite` paths |
| `grep` | Path guard | `tool_call` handler checks `denyRead` directories |
| `find` | Path guard | `tool_call` handler checks `denyRead` directories |
| `ls` | Path guard | `tool_call` handler checks `denyRead` directories |
| User `!` bash | OS sandbox | `user_bash` event handler wraps command |
| Network (bash) | OS sandbox + prompt | `SandboxAskCallback` prompts for unknown domains |

### Interactive Permission Prompts

When a write or network block is triggered and the UI is available, the user is prompted with four
options:

| Option | Effect |
|--------|--------|
| **Abort** | Keep blocked, no changes |
| **Allow for this session** | Stored in memory only — resets when pi restarts |
| **Allow for this project** | Written to `<cwd>/.pi/sandbox.json` |
| **Allow for all projects** | Written to `~/.pi/agent/sandbox.json` |

Session allowances are held in closure-scoped JavaScript memory. The agent cannot read or modify
them. They are never written to disk and are reset when the extension reloads or pi restarts.

### What Gets Prompted vs. Hard-Blocked

| Rule | Behaviour |
|------|-----------|
| Path not in `allowWrite` | **Prompted** (write/edit tools) |
| Domain not in `allowedDomains` | **Prompted** (via `SandboxAskCallback` for bash network) |
| Path in `denyRead` | Hard-blocked, no prompt |
| Path in `denyWrite` | Hard-blocked, no prompt |
| Domain in `deniedDomains` | Hard-blocked at OS level, no prompt |
| No UI available (`hasUI=false`) | Hard-blocked, no prompt |

After granting access, the sandbox config is hot-reloaded via `SandboxManager.updateConfig()`
without restarting pi.

## Installation

### From npm

```bash
npm install @sysid/pi-sandbox-extended
pi -e @sysid/pi-sandbox-extended
# or
pi install npm:@sysid/pi-sandbox-extended
```

### From source

1. Clone this repo
2. Run `npm install` at the repo root
3. Linux additionally requires: `bubblewrap`, `socat`, `ripgrep`

To use a custom fork of `@anthropic-ai/sandbox-runtime` instead of the official npm package:

```bash
make use-sysid-sandbox    # switch to sysid fork (hides change from git)
make use-official-sandbox  # switch back to official npm package
```

## Usage

```bash
# Run with sandbox enabled (default config)
pi -e ./packages/sandbox

# Run with sandbox explicitly disabled
pi -e ./packages/sandbox --no-sandbox

# Inside a session, inspect the active config
/sandbox
```

## Configuration

Config files are loaded and merged in order (later wins):

1. Built-in defaults (see below)
2. `~/.pi/agent/sandbox.json` (global)
3. `<cwd>/.pi/sandbox.json` (project-local)

### Example `.pi/sandbox.json`

```json
{
  "enabled": true,
  "network": {
    "allowedDomains": ["github.com", "*.github.com", "registry.npmjs.org"],
    "deniedDomains": []
  },
  "filesystem": {
    "denyRead": ["~/.ssh", "~/.aws", "~/.gnupg"],
    "allowWrite": [".", "/tmp"],
    "denyWrite": [".env", ".env.*", "*.pem", "*.key"]
  }
}
```

### Configuration Fields

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | `boolean` | Enable/disable the entire sandbox. Default: `true` |
| `network.allowedDomains` | `string[]` | Domains the agent can reach. Supports `*` wildcards. |
| `network.deniedDomains` | `string[]` | Domains explicitly blocked. |
| `filesystem.denyRead` | `string[]` | Directory paths the agent cannot read from. Supports `~` and `.` expansion. |
| `filesystem.allowWrite` | `string[]` | Directory paths the agent can write to. Default-deny: writes outside these paths are blocked. Supports `~` and `.` expansion. |
| `filesystem.denyWrite` | `string[]` | Filename patterns the agent cannot write, even inside allowed directories. Takes precedence over `allowWrite`. |
| `ignoreViolations` | `Record<string, string[]>` | Passed to `@anthropic-ai/sandbox-runtime`. Suppress specific OS-level violation categories. |
| `enableWeakerNestedSandbox` | `boolean` | Passed to `@anthropic-ai/sandbox-runtime`. Allow weaker nested sandbox profiles. |
| `enableWeakerNetworkIsolation` | `boolean` | Passed to `@anthropic-ai/sandbox-runtime`. Allows macOS `com.apple.trustd.agent` for TLS certificate validation (needed by tools like `gh` that fail with `x509: OSStatus -26276` under strict network isolation). |

### Default Configuration

```json
{
  "enabled": true,
  "network": {
    "allowedDomains": [
      "npmjs.org", "*.npmjs.org", "registry.npmjs.org",
      "registry.yarnpkg.com",
      "pypi.org", "*.pypi.org",
      "github.com", "*.github.com", "api.github.com",
      "raw.githubusercontent.com"
    ],
    "deniedDomains": []
  },
  "filesystem": {
    "denyRead": ["~/.ssh", "~/.aws", "~/.gnupg"],
    "allowWrite": [".", "/tmp"],
    "denyWrite": [".env", ".env.*", "*.pem", "*.key"]
  }
}
```

## Enforcement Rules

### Read Restrictions

`denyRead` entries are **directory paths**. Path specials (`~`, `.`, `./sub`) are expanded at runtime.

A read is **blocked** if the resolved file path equals or is under any `denyRead` directory:

```
read ~/.ssh/id_rsa
  → resolved: /Users/you/.ssh/id_rsa
  → denyRead: ~/.ssh → /Users/you/.ssh
  → /Users/you/.ssh/id_rsa is under /Users/you/.ssh
  → BLOCKED
```

### Write Restrictions

Writes are checked in two stages — **deny first, then allow**:

1. **`denyWrite`** (filename patterns, checked first — deny wins):
   - Literal: `.env` matches only `.env`
   - Suffix glob: `*.pem` matches `cert.pem`, `server.pem`
   - Prefix glob: `.env.*` matches `.env.local`, `.env.production`

2. **`allowWrite`** (directory paths, default-deny):
   - The resolved file path must be under at least one `allowWrite` directory
   - If not under any allowed path → **BLOCKED**

```
write /work/project/.env.local
  → denyWrite: .env.* matches .env.local
  → BLOCKED (deny wins, even though /work/project is under allowWrite ".")

write /work/project/src/main.ts
  → denyWrite: no pattern matches
  → allowWrite: "." → /work/project, file is under it
  → ALLOWED

write /etc/passwd
  → denyWrite: no pattern matches
  → allowWrite: "." → /work/project, "/tmp"
  → /etc/passwd is under neither
  → BLOCKED
```

## Fail-Closed Behavior

The extension is designed to fail safely:

| Scenario | Behavior |
|----------|----------|
| Sandbox init succeeds | All restrictions enforced |
| Sandbox init **fails** | Bash commands are **blocked**; tool guard remains active. Error message shown. |
| `--no-sandbox` flag | All restrictions disabled (explicit user choice) |
| `enabled: false` in config | All restrictions disabled (explicit user choice) |
| Unsupported platform | OS sandbox disabled; tool guard remains active |

If sandbox initialization fails, the agent cannot run bash commands at all. Tool guard still applies to built-in tools. Use `--no-sandbox` to explicitly opt out of **all** protection.

## Known Limitations

**Symlinks**: The path guard follows symlinks via `realpathSync()` when both the file and directory
exist on disk. However, if a symlink target does not yet exist at check time, the guard falls back
to string-based path comparison. A symlink created between the check and the actual I/O operation
could bypass the guard (TOCTOU).

**TOCTOU**: There is an inherent time-of-check-to-time-of-use gap between the `tool_call` path
check and the actual filesystem operation. The OS-level sandbox does not have this issue since it's
enforced atomically by the kernel.

**Custom tools**: Only built-in tools (`bash`, `read`, `write`, `edit`, `grep`, `find`, `ls`) are
guarded. Tools registered by other extensions are not intercepted by the path guard.

**Config reload**: Configuration is loaded at session start and re-read when a permission prompt
grants project or global access. Manual edits to `sandbox.json` during a session are not picked up
until the next session or the next interactive prompt grant.

**Pattern matching**: `denyWrite` uses simple basename patterns (literal, `*.ext`, `prefix.*`).
Full glob or regex patterns are not supported. `denyRead` uses directory containment, not filename
patterns.

**Platform support**: OS-level sandboxing requires macOS (`sandbox-exec`) or Linux (`bubblewrap`).
Windows is not supported. The path guard layer works on all platforms and activates whenever the
sandbox config is enabled (even if OS sandboxing is unavailable).

**macOS `com.apple.provenance`**: When `npm install` runs inside a sandboxed process, macOS stamps
files with the `com.apple.provenance` extended attribute. Subsequent sandboxed processes may get
`EPERM` when reading those files. Fix with `xattr -r -d com.apple.provenance node_modules/` or
reinstall outside of a sandbox.


## Ackowledgements
Based on code from [badlogic/pi-mono](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/extensions/sandbox/index.ts)
by Mario Zechner, used under the [MIT License](https://github.com/badlogic/pi-mono/blob/main/LICENSE).

And
[carderne/pi-sandbox](https://github.com/carderne/pi-sandbox) by Chris Arderne, used under the [MIT License](https://github.com/carderne/pi-sandbox/blob/main/LICENSE)
