# sysid-pi-extensions

Custom extensions for the [pi coding agent](https://github.com/nicholasgasior/pi-mono) — OS sandboxing, access control, and modal editing.

## Extensions

| Package | Description |
|---------|-------------|
| [`sandbox`](packages/sandbox/) | OS-level + application-level sandboxing (macOS sandbox-exec, Linux bubblewrap) with configurable filesystem and network restrictions |
| [`access-guard`](packages/access-guard/) | Lightweight path-based access control — blocks read/write to configured patterns via `tool_call` interception |
| [`vim-editor`](packages/vim-editor/) | Modal vim editing (normal/insert modes, motions, operators, counts) for the pi input editor |

## Quick Start

```bash
# Clone and install
git clone https://github.com/sysid/sysid-pi-extensions.git
cd sysid-pi-extensions
npm install

# Use an extension
pi -e ./packages/sandbox
pi -e ./packages/access-guard
pi -e ./packages/vim-editor

# Combine extensions
pi -e ./packages/sandbox -e ./packages/vim-editor
```

## Development

```bash
make test          # run all tests
make lint          # biome check
make check         # lint + test
make test-watch    # watch mode
```

See [HowTo.md](HowTo.md) for the full development guide.

## Project Structure

```
sysid-pi-extensions/
├── packages/
│   ├── sandbox/          # OS + app sandboxing
│   ├── access-guard/     # Path-based access control
│   └── vim-editor/       # Modal vim editing
├── package.json          # npm workspaces root
├── vitest.config.ts      # Test configuration
├── biome.json            # Linter/formatter config
└── tsconfig.json         # TypeScript (type checking only)
```

## License

MIT
