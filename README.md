# pi-extensions

Improved extensions for the [pi coding agent](https://github.com/nicholasgasior/pi-mono).


## [`sandbox`](packages/sandbox/)
- Integrated OS- and APP-level sandboxing with configurable filesystem and network restrictions.
- See also: [Your Agent Has Root | sysid blog](https://sysid.github.io/your-agent-has-root/)
- requires `@anthropic-ai/sandbox-runtime`.

```bash
pi install npm:@sysid/pi-sandbox-extended
```


## [`vim`](packages/vim-editor/)
- Simple modal vim editing for the pi input editor.

```bash
pi install npm:@sysid/pi-vim
```

## Development

```bash
make test          # run all tests
make lint          # biome check
make check         # lint + test
make test-watch    # watch mode
```

See [HowTo.md](HowTo.md) for the full development guide.

### Project Structure

```
pi-extensions/
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
