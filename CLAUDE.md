# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PathEscape is an educational web application that simulates directory traversal vulnerabilities. It's a client-side only application that demonstrates `../` path traversal attacks through staged challenges using a virtual file system.

**Important**: This is a security education tool. The vulnerabilities are intentional for learning purposes.

## Development Commands

This is a static HTML/CSS/JavaScript application with no build process. To run locally:

```bash
# Serve the files locally (Python 3)
python -m http.server 8000

# Or with Node.js
npx serve .
```

Open `http://localhost:8000` in a browser. The VFS must be loaded via HTTP (not file://), as it uses fetch().

Live demo: https://ipusiron.github.io/path-escape/

## Architecture

### Module Dependencies

```
vfs-loader.js → (loads) → data/vfs.json → window.VFS
normalize.js  → (exports) → normalizePath()
script.js     → (uses) → window.VFS, normalizePath()
```

`script.js` waits for the `vfs:loaded` custom event before initializing the file tree and fetch handlers.

### Core Components

- **Virtual File System (VFS)**: `data/vfs.json` defines all files as a flat JSON object with absolute paths as keys
- **Path Normalization**: `js/normalize.js` resolves `..` segments using a stack-based algorithm
- **Path Resolution Modes**:
  - `vulnerableFetch()`: Allows traversal outside `/app/files/` (intentional vulnerability)
  - `safeFetch()`: Enforces base directory restriction via `startsWith()` check

### Filter Stages

- **Beginner**: No filter, all techniques work
- **Intermediate**: Blocks raw `..` but allows URL-encoded bypasses (`%2e%2e`)
- **Advanced**: Blocks decoded `..` but allows double-slash (`..//..//`), mixed encoding (`..%2f`), and null byte (`%00`) bypasses

## Testing

Manual testing only. See `tests/manual-checklist.md` for verification steps and `tests/demo-cases.md` for input/output examples.

Key test paths:
- `../../etc/passwd` - basic traversal
- `%2e%2e/%2e%2e/etc/passwd` - URL-encoded bypass
- `..//..//etc/passwd` - double-slash bypass
- `../../secrets/flag.txt` - flag capture (shows badge)

## Security Context

The vulnerabilities are intentional for educational purposes. The `isBlockedByFilter()` function has deliberate gaps to allow bypass techniques. Never use similar patterns in production code.
