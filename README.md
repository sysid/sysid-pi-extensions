# sysid-pi-extensions

Custom extensions for the [pi coding agent](https://github.com/nicholasgasior/pi-mono) — OS sandboxing, access control, and modal editing.

Background: [Your Agent Has Root | sysid blog](https://sysid.github.io/your-agent-has-root/)

## Extensions

| Package | Description |
|---------|-------------|
| [`sandbox`](packages/sandbox/) | OS-level + application-level sandboxing (macOS sandbox-exec, Linux bubblewrap) with configurable filesystem and network restrictions |
| [`vim-editor`](packages/vim-editor/) | Modal vim editing (normal/insert modes, motions, operators, counts) for the pi input editor |

## Install

See README in respective package directory.

> **Note:** `vim-editor` has no npm dependencies — copying the directory is sufficient.
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
