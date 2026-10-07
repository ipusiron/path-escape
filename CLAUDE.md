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

All scripts are plain (non-module) scripts so the page works from `file://`. Each script puts one object on `globalThis`.

### Module Dependencies

```
js/vfs-data.js → (sets) → window.VFS, dispatches 'vfs:loaded'
js/pe-core.js  → (exports) → window.PathEscapeCore (normalize, filters, resolve)
js/script.js   → (uses) → window.VFS, window.PathEscapeCore
```

`script.js` initializes on `vfs:loaded` or `DOMContentLoaded` (whichever makes `window.VFS` ready).

### Core Components

- **Virtual File System (VFS)**: `js/vfs-data.js` sets `window.VFS` directly (embedded, no fetch — so `file://` works). A flat object with absolute paths as keys
- **`js/pe-core.js` (`PathEscapeCore`)**: pure logic, no DOM. `normalizePath` (stack-based), `urlDecodeOnce`, `truncateAtNull`, `resolve(input, stage, mode, vfs)` and the filter stages
- **Modes**: `vulnerable` skips the base check; `safe` blocks anything resolving outside `/app/files/`

### Filter Stages (coherent model)

Each stage models one flawed filter, and exactly one technique defeats it. `STAGE_INFO` maps each stage to its working bypass and example.

| Stage (id) | Flaw | Defeated by |
|---|---|---|
| none | no filter | anything that resolves |
| raw | checks the raw (pre-decode) input for `..` | URL-encode `%2e%2e` |
| strip | removes `../` without re-scanning | nested `....//` |
| decode | decodes once, checks, forwards the decoded form (which is decoded again) | double-encode `%252e` |
| ext | allows only image extensions; the fetch truncates at `\0` | null byte `%00` |

The fetch always decodes once and truncates at `\0` before the VFS lookup. Never advertise a technique that does not actually reach the flag against the selected stage — `test/core.test.js` pins the full stage×technique truth table.

## Testing

```bash
node --test
```

- Node 22+, no dependencies (`node:test`). Runs in GitHub Actions on push and pull request. `test/load.js` loads the plain scripts with `vm.runInThisContext`
- `test/core.test.js` pins the stage×technique truth table, safe mode, normalization, decode and null-byte handling. Expected values are a hand-designed table, not the implementation's output
- `tests/demo-cases.md` and `tests/manual-checklist.md` are manual references for the UI

## Security Context

The vulnerabilities are intentional for education. The filter stages in `pe-core.js` have deliberate flaws so a specific technique defeats each one. Never use similar patterns in production code.
