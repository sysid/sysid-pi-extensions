<p align="left">
  <img src="../../doc/pi-vim-logo.png" alt="pi-vim logo" width="300">
</p>


Modal vim editing for the pi coding agent. Replaces the default text input with a vim-like editor supporting normal and insert modes.

## Installation

### From npm

```bash
npm install @sysid/pi-vim
pi -e @sysid/pi-vim
# or
pi install npm:@sysid/pi-vim
```

### From source

1. Clone this repo
2. Run `npm install` at the repo root

```bash
pi -e ./packages/vim-editor
```

## Modes

- **INSERT** — All input is passed through (default)
- **NORMAL** — Vim motions and operators

## Normal Mode Keys

| Category | Keys |
|----------|------|
| Motion | `h`/`j`/`k`/`l`, `w`/`b`/`e`, `0`/`$`, `^`, `gg`/`G` |
| Insert | `i`/`a`/`I`/`A`/`o`/`O` |
| Edit | `x`/`X`, `dd`/`cc`/`yy`, `D`/`C`, `p`/`P`, `J`, `r{char}`, `u` |
| Operators | `d`/`c`/`y` + motion |
| Count | Prefix any command with a number |
