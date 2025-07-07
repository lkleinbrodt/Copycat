# CopyCat - Project Overview for AI

This document summarizes the codebase for LLM agents that need to understand or modify the project.

## Purpose

The extension helps developers collect multiple files from a workspace and copy them as a single formatted text snippet. It estimates token usage and respects `.gitignore` rules.

## Repository Structure

```
copycat/
├── package.json          # Extension manifest, scripts and dependencies
├── tsconfig.json         # TypeScript compiler options
├── src/
│   ├── extension.ts           # Entry point: registers tree view, commands and file watchers
│   ├── tree/
│   │   ├── ContextTreeProvider.ts # Implements TreeDataProvider and selection logic
│   │   └── ContextNode.ts         # Node model representing files and folders
│   └── utils/
│       ├── TokenManager.ts     # Progressive token indexing with caching and persistence
│       ├── IgnoreManager.ts    # Applies .gitignore and .contextignore rules
│       ├── TokenEstimator.ts   # Estimates tokens (1 token ≈ 4 characters)
│       ├── TokenFormatter.ts   # Formats token counts for display
│       └── ClipboardHandler.ts # Bundles selected files and writes to clipboard
```

Compiled JavaScript is emitted to the `out/` directory when running `npm run compile`.

## Key Concepts

- **extension.ts** sets up the sidebar tree (`ContextTreeProvider`), initializes the `TokenManager`, and handles commands and file watchers.
- **ContextTreeProvider** builds a live tree of the workspace using VS Code's `TreeDataProvider` API. It tracks selection state for each `ContextNode` and displays token counts from `TokenManager`. It respects the `showIgnoredNodes` setting to either hide or grey out ignored files.
- **TokenManager** handles progressive token indexing with caching and persistence. It respects ignore rules, provides background indexing, and cascades updates when files change.
- **IgnoreManager** loads `.gitignore` and `.contextignore` patterns and filters out ignored files.
- **ClipboardHandler** reads selected files, formats them with their relative paths and content, then writes the result to the system clipboard.
- **TokenEstimator** uses a heuristic of 1 token per 4 characters.
- **TokenFormatter** formats token counts for display: exact counts under 1k, rounded to nearest 0.1k above 1k.

## Ignored File Handling

The extension has a configurable setting `contextBundler.showIgnoredNodes` (default: false) that controls how ignored files are displayed:

- **When false**: Ignored files are completely hidden from the tree view
- **When true**: Ignored files are shown but greyed out with "(ignored)" in the description

Ignored files are never selectable, even during auto-selection operations like clicking on a parent directory. The tree automatically refreshes when this setting is changed.

## Token Management Architecture

The extension uses a progressive token indexing system:

### **Progressive Indexing**

- **Lazy Loading**: Files are indexed as they're encountered during tree navigation
- **Background Processing**: After initial tree load, remaining files are indexed in the background
- **Priority Queue**: Prioritizes files over directories and shallower paths over deeper ones

### **Caching & Persistence**

- **Memory Cache**: Token counts are stored in memory with file modification times
- **Workspace Persistence**: Cache survives VS Code restarts using workspace state
- **Smart Invalidation**: Only re-indexes files that have changed since last calculation

### **Live Updates**

- **File Watchers**: Automatically update token counts when files change
- **Cascade Updates**: Changes to files trigger updates to parent directory token sums
- **UI Refresh**: Tree view updates progressively as token counts become available

### **Ignore Integration**

- **Respects Rules**: Ignored files are skipped during indexing and don't contribute to directory sums
- **Dynamic Updates**: Changes to `.gitignore` or `.contextignore` trigger cache invalidation and re-indexing

### **Token Display Formatting**

Token counts are formatted for better readability:

- **Under 1,000 tokens**: Exact count (e.g., "847 tokens")
- **1,000+ tokens**: Rounded to nearest 0.1k (e.g., "1.2k tokens", "601.4k tokens")
- **Always includes "tokens"**: Never abbreviated to just "t"
- **Consistent across UI**: Same formatting in tree view, selection totals, and debug info

## Development Workflow

1. Install dependencies: `npm install`.
2. Compile TypeScript: `npm run compile`.
3. Launch an Extension Development Host from VS Code (`F5`).
4. Use the _CopyCat_ view to select files and copy them to the clipboard.

This repo intentionally has no network access or external APIs beyond the VS Code extension API. The code is self-contained and focuses on packaging files for LLM context windows.
