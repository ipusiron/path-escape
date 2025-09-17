# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PathEscape is an educational web application that simulates directory traversal vulnerabilities. It's a client-side only application that demonstrates `../` path traversal attacks through staged challenges using a virtual file system.

**Important**: This is a security education tool. The vulnerabilities are intentional for learning purposes.

## Architecture

The application uses a simple client-side architecture:

- **Virtual File System**: Defined in `data/vfs.json`, simulates a filesystem structure with public and "secret" files
- **Path Resolution**:
  - `js/normalize.js`: Handles path normalization (resolves `..` segments)
  - Vulnerable mode: No base directory checks (allows traversal)
  - Safe mode: Enforces base directory restrictions at `/app/files/`
- **UI Components**:
  - File tree viewer (shows only `/app/files/` directory)
  - Path input with Fetch button
  - Output viewer for file contents
  - Stage selector (Beginner/Intermediate/Advanced)
  - Mode selector (Vulnerable/Safe)

## Key Files

- `index.html`: Main UI entry point
- `js/script.js`: Core application logic, handles path resolution strategies and UI interactions
- `js/vfs-loader.js`: Loads the virtual filesystem from JSON
- `js/normalize.js`: Path normalization utilities
- `data/vfs.json`: Virtual filesystem definition
- `css/style.css`: Application styles

## Development Commands

This is a static HTML/CSS/JavaScript application with no build process. To run locally:

```bash
# Serve the files locally (Python 3)
python -m http.server 8000

# Or with Node.js
npx serve .
```

The application is deployed to GitHub Pages at: https://ipusiron.github.io/path-escape/

## Testing Approach

Manual testing is the primary method. Test cases are documented in `tests/manual-checklist.md` and `tests/demo-cases.md`. Key test scenarios:

1. Basic file access within `/app/files/`
2. Directory traversal attempts using `../`
3. Filter bypass techniques in Intermediate/Advanced stages
4. Mode switching between Vulnerable and Safe
5. Hint system functionality

## Path Resolution Behavior

The application intentionally demonstrates both vulnerable and safe path resolution:

- **Base directory**: `/app/files/`
- **Vulnerable mode**: Allows `../../etc/passwd` to access `/etc/passwd`
- **Safe mode**: Restricts all access to within `/app/files/` using path normalization and base checks
- Path normalization resolves `..` segments after combining base + user input

## Security Context

This tool intentionally contains vulnerabilities for educational purposes. The "vulnerable" behaviors are designed to teach about directory traversal attacks. Never implement similar unprotected path resolution in production code.