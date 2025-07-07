# Context Bundler - Project Overview for AI

This document summarizes the codebase for LLM agents that need to understand or modify the project.

## Purpose

The extension helps developers collect multiple files from a workspace and copy them as a single formatted text snippet. It estimates token usage and respects `.gitignore` rules.

## Repository Structure

```
context-bundler/
├── package.json          # Extension manifest, scripts and dependencies
├── tsconfig.json         # TypeScript compiler options
├── src/
│   ├── extension.ts           # Entry point: registers tree view, commands and file watchers
│   ├── tree/
│   │   ├── ContextTreeProvider.ts # Implements TreeDataProvider and selection logic
│   │   └── ContextNode.ts         # Node model representing files and folders
│   └── utils/
│       ├── IgnoreManager.ts    # Applies .gitignore rules
│       ├── TokenEstimator.ts   # Estimates tokens (1 token ≈ 4 characters)
│       └── ClipboardHandler.ts # Bundles selected files and writes to clipboard
```

Compiled JavaScript is emitted to the `out/` directory when running `npm run compile`.

## Key Concepts

- **extension.ts** sets up the sidebar tree (`ContextTreeProvider`), listens for selections and handles the `copyToClipboard` command.
- **ContextTreeProvider** builds a live tree of the workspace using VS Code's `TreeDataProvider` API. It tracks selection state for each `ContextNode` and updates token counts using `TokenEstimator`. It respects the `showIgnoredNodes` setting to either hide or grey out ignored files.
- **IgnoreManager** loads `.gitignore` patterns and filters out ignored files when building the tree.
- **ClipboardHandler** reads selected files, formats them with their relative paths and content, then writes the result to the system clipboard.
- **TokenEstimator** currently uses a heuristic of 1 token per 4 characters.

## Ignored File Handling

The extension has a configurable setting `contextBundler.showIgnoredNodes` (default: false) that controls how ignored files are displayed:

- **When false**: Ignored files are completely hidden from the tree view
- **When true**: Ignored files are shown but greyed out with "(ignored)" in the description

Ignored files are never selectable, even during auto-selection operations like clicking on a parent directory. The tree automatically refreshes when this setting is changed.

## Development Workflow

1. Install dependencies: `npm install`.
2. Compile TypeScript: `npm run compile`.
3. Launch an Extension Development Host from VS Code (`F5`).
4. Use the _Context Bundler_ view to select files and copy them to the clipboard.

This repo intentionally has no network access or external APIs beyond the VS Code extension API. The code is self-contained and focuses on packaging files for LLM context windows.
