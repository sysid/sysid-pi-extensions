# sysid-pi-extensions

Custom extensions for the [pi coding agent](https://github.com/nicholasgasior/pi-mono) — OS sandboxing, access control, and modal editing.

## Extensions

| Package | Description |
|---------|-------------|
| [`sandbox`](packages/sandbox/) | OS-level + application-level sandboxing (macOS sandbox-exec, Linux bubblewrap) with configurable filesystem and network restrictions |
| [`access-guard`](packages/access-guard/) | Lightweight path-based access control — blocks read/write to configured patterns via `tool_call` interception |
| [`vim-editor`](packages/vim-editor/) | Modal vim editing (normal/insert modes, motions, operators, counts) for the pi input editor |

## Install

Each extension can be installed independently — no need to clone the full repo.

### Single extension (recommended)

Download just the extension you need into pi's extensions directory:

```bash
# Create extensions directory
mkdir -p ~/.pi/agent/extensions

# Install sandbox
gh repo clone sysid/sysid-pi-extensions -- --depth 1 --filter=blob:none --sparse /tmp/sysid-pi-extensions
cd /tmp/sysid-pi-extensions
git sparse-checkout set packages/sandbox
cp -r packages/sandbox ~/.pi/agent/extensions/sandbox
cd ~/.pi/agent/extensions/sandbox && npm install
rm -rf /tmp/sysid-pi-extensions

# Install access-guard (no dependencies, just copy)
# Same sparse checkout, replace "sandbox" with "access-guard"

# Install vim-editor (no dependencies, just copy)
# Same sparse checkout, replace "sandbox" with "vim-editor"
```

Or download a specific release from [GitHub Releases](https://github.com/sysid/sysid-pi-extensions/releases).

### All extensions

```bash
git clone https://github.com/sysid/sysid-pi-extensions.git
cd sysid-pi-extensions
npm install
```

### Use with pi

```bash
# From installed location
pi -e ~/.pi/agent/extensions/sandbox
pi -e ~/.pi/agent/extensions/vim-editor

# Or from cloned repo
pi -e ./packages/sandbox

# Combine extensions
pi -e ~/.pi/agent/extensions/sandbox -e ~/.pi/agent/extensions/vim-editor
```

> **Note:** `access-guard` and `vim-editor` have no npm dependencies — copying the directory is sufficient.
> `sandbox` requires `npm install` for `@anthropic-ai/sandbox-runtime`.

## Development

```bash
make test          # run all tests
make lint          # biome check
make check         # lint + test
make test-watch    # watch mode
```

### Versioning

Each extension is versioned independently using [semantic versioning](https://semver.org/).
Git tags are prefixed with the package name (e.g. `sandbox-v1.2.0`).

```bash
make bump-sandbox-patch     # 1.0.0 → 1.0.1, tag, GitHub release
make bump-sandbox-minor     # 1.0.0 → 1.1.0
make bump-sandbox-major     # 1.0.0 → 2.0.0
# Same pattern for access-guard and vim-editor
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
