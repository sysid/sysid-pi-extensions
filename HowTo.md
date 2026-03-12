# HowTo — Development & Usage Guide

A practical guide for working with this repo, aimed at TypeScript beginners who want to develop or use pi extensions.

## Prerequisites

- **Node.js** ≥ 20 (check with `node --version`)
- **npm** (comes with Node.js)
- **pi** installed and working ([pi-mono](https://github.com/nicholasgasior/pi-mono))

## Initial Setup

```bash
git clone https://github.com/sysid/pi-extensions.git
cd pi-extensions
npm install
```

`npm install` installs all dependencies for all packages at once — npm workspaces hoists shared deps to `node_modules/` at the repo root.

## How Extensions Work

Pi extensions are TypeScript files that export a default function receiving an `ExtensionAPI` object. Pi loads them at runtime using [jiti](https://github.com/nicholasgasior/pi-mono), so **no build step is needed** — `.ts` files are loaded directly.

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
    // Register event handlers, tools, commands, flags
    pi.on("tool_call", async (event, ctx) => {
        // Intercept tool calls
    });

    pi.registerCommand("my-command", {
        description: "Does something",
        handler: async (args, ctx) => {
            ctx.ui.notify("Hello!", "info");
        },
    });
}
```

### Extension Discovery

Each package has a `package.json` with a `pi` section that tells pi where to find the extension entry point:

```json
{
    "pi": {
        "extensions": ["./index.ts"]
    }
}
```

### Key Extension API Concepts

| Method | Purpose |
|--------|---------|
| `pi.on("tool_call", handler)` | Intercept tool calls before execution. Return `{ block: true, reason }` to block. |
| `pi.on("session_start", handler)` | Run setup when a session begins. |
| `pi.on("session_shutdown", handler)` | Run cleanup when a session ends. |
| `pi.on("user_bash", handler)` | Intercept user `!` bash commands. |
| `pi.registerTool(tool)` | Register a custom tool (replaces built-in if same name). |
| `pi.registerCommand(name, cmd)` | Register a `/command` available in the session. |
| `pi.registerFlag(name, opts)` | Register a CLI flag (e.g. `--no-sandbox`). |
| `pi.getFlag(name)` | Read a flag's value at runtime. |
| `ctx.ui.notify(msg, level)` | Show a notification (`"info"`, `"warning"`, `"error"`). |
| `ctx.ui.setStatus(key, text)` | Set a persistent status line entry. |

### Type-Safe Tool Narrowing

When handling `tool_call` events, use `isToolCallEventType()` to narrow the event type safely:

```typescript
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

pi.on("tool_call", async (event, ctx) => {
    if (isToolCallEventType("read", event)) {
        // event.input.path is now typed as string
        console.log("Reading:", event.input.path);
    }
});
```

Direct `event.toolName === "read"` comparison doesn't narrow the type — always use the helper.

## Using Extensions

```bash
# Load a single extension
pi -e ./packages/sandbox

# Load multiple extensions
pi -e ./packages/sandbox -e ./packages/vim-editor

# Pass flags to extensions
pi -e ./packages/sandbox --no-sandbox

# Install to ~/.pi for global availability
cp -r packages/sandbox ~/.pi/agent/extensions/sandbox
cd ~/.pi/agent/extensions/sandbox && npm install
pi -e ~/.pi/agent/extensions/sandbox
```

## Running Tests

```bash
# All tests from repo root
make test
# or: npx vitest run

# Specific test file
npx vitest run packages/sandbox/path-guard.test.ts

# Watch mode (re-runs on file changes)
make test-watch

# Verbose output
make test-verbose
```

### Test Structure

Tests use [vitest](https://vitest.dev/) with `globals: true` (no need to import `describe`/`it`/`expect`).

- **Unit tests** (`path-guard.test.ts`): Pure function tests, no mocking needed
- **Integration tests** (`sandbox-extension.test.ts`): Mock the extension API and sandbox runtime to test the full extension lifecycle

### Mocking Pattern for Integration Tests

The sandbox integration test demonstrates a common pattern:

```typescript
// 1. Hoist mocks (must be before any imports that use the mocked module)
const { mockThing } = vi.hoisted(() => ({
    mockThing: { doStuff: vi.fn() },
}));

// 2. Mock the module
vi.mock("some-module", () => ({ Thing: mockThing }));

// 3. Import after mocking
import { Thing } from "some-module";

// 4. Use in tests
it("does stuff", () => {
    mockThing.doStuff.mockReturnValue("result");
    // ...
});
```

## Linting & Formatting

```bash
# Check for lint errors
make lint
# or: npx biome check .

# Auto-fix
make lint-fix
# or: npx biome check --write .
```

The project uses [Biome](https://biomejs.dev/) with tabs, indent width 3, line width 120 — matching pi-mono conventions.

## Type Checking (Optional)

```bash
npx tsc --noEmit
```

This requires pi-mono to be cloned alongside this repo at `../../forked/pi-mono` with its packages built (`dist/` containing `.d.ts` files). The `tsconfig.json` paths point there for `@mariozechner/pi-coding-agent` and `@mariozechner/pi-tui` type resolution.

At runtime, pi provides these packages — they're host dependencies, not npm packages. The `peerDependencies` in each `package.json` document this relationship.

## Adding a New Extension

1. Create `packages/my-extension/`:

```bash
mkdir packages/my-extension
```

2. Create `packages/my-extension/package.json`:

```json
{
    "name": "pi-extension-my-extension",
    "private": true,
    "version": "1.0.0",
    "type": "module",
    "pi": {
        "extensions": ["./index.ts"]
    },
    "peerDependencies": {
        "@mariozechner/pi-coding-agent": "*"
    },
    "peerDependenciesMeta": {
        "@mariozechner/pi-coding-agent": {
            "optional": true
        }
    }
}
```

3. Create `packages/my-extension/index.ts`:

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
    pi.on("session_start", (_event, ctx) => {
        ctx.ui.notify("My extension loaded!", "info");
    });
}
```

4. Run `npm install` at repo root (registers the new workspace).

5. Test it: `pi -e ./packages/my-extension`

## Repo Layout

```
pi-extensions/
├── packages/
│   ├── sandbox/                      # OS + application sandboxing
│   │   ├── index.ts                  # Main extension entry point
│   │   ├── path-guard.ts             # Path enforcement logic
│   │   ├── path-guard.test.ts        # Unit tests (41 tests)
│   │   ├── sandbox-extension.test.ts # Integration tests (3 tests)
│   │   ├── package.json              # Package config + sandbox-runtime dep
│   │   ├── Makefile                  # Package-level make targets
│   │   └── README.md                 # Detailed sandbox documentation
│   ├── access-guard/                 # Configurable access restrictions
│   │   ├── index.ts                  # Extension entry point
│   │   └── package.json
│   └── vim-editor/                   # Modal vim editing
│       ├── index.ts                  # Extension entry point
│       └── package.json
├── package.json                      # Root workspace config
├── tsconfig.base.json                # Shared compiler options
├── tsconfig.json                     # Paths to local pi-mono for types
├── biome.json                        # Linter/formatter rules
├── vitest.config.ts                  # Test configuration
├── Makefile                          # Root dev targets
├── .gitignore
├── README.md                         # Project overview
├── HowTo.md                         # This file
└── CLAUDE.md                         # Instructions for Claude Code
```

## Troubleshooting

### `npm install` fails with git dependency errors

The sandbox extension depends on `github:sysid/sandbox-runtime#sysid`. Ensure you have git access to that repository.

### Tests fail with "Cannot find module '@mariozechner/pi-coding-agent'"

This is expected for `import type` statements — they're erased at runtime. If actual runtime imports fail, ensure pi-mono types are available (see Type Checking section). The `vite-tsconfig-paths` plugin in `vitest.config.ts` resolves these paths during test transpilation.

### Biome reports import ordering errors

Run `make lint-fix` to auto-fix. Biome enforces alphabetical import ordering.
