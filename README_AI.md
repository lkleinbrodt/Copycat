# CopyCat - Codebase Overview for AI

A VS Code extension that helps developers bundle selected files for LLM context windows with configurable file tree inclusion.

## Core Purpose

Collects multiple files from a workspace and formats them as a single text snippet for LLM conversations, with token estimation and smart ignore rules.

## Architecture

```
src/
├── extension.ts              # Entry point, command registration, file watchers
├── tree/
│   ├── ContextTreeProvider.ts # Tree view implementation, selection state
│   └── ContextNode.ts         # File/folder node model
└── utils/
    ├── TokenManager.ts        # Progressive indexing, caching, persistence
    ├── IgnoreManager.ts       # .gitignore + .contextignore + default patterns
    ├── TokenEstimator.ts      # 1 token ≈ 4 characters heuristic
    ├── TokenFormatter.ts      # Display formatting (847 → "847 tokens", 1500 → "1.5k tokens")
    └── ClipboardHandler.ts    # File bundling, tree generation, clipboard output
```

## Key Components

- **ContextTreeProvider**: VS Code TreeDataProvider that shows workspace files with checkboxes for selection
- **TokenManager**: Progressive file indexing with memory cache and workspace persistence. Respects ignore rules, provides background processing
- **IgnoreManager**: Multi-layer ignore system (default patterns → .gitignore → .contextignore)
- **ClipboardHandler**: Bundles selected files with configurable file tree inclusion

## File Tree Modes

Three modes control how file structure is included in output:

1. **Full Tree** (`full`): Complete project structure (default)
2. **Relevant Tree** (`relevant`): Only selected files + parent directories
3. **No Tree** (`none`): File contents only

Controlled by `contextBundler.fileTreeMode` setting and toolbar button.

## Configuration

- `contextBundler.fileTreeMode`: "full" | "relevant" | "none"
- `contextBundler.showIgnoredNodes`: Show/hide ignored files in tree
- `contextBundler.defaultIgnorePatterns`: Built-in ignore patterns
- `contextBundler.systemPrompt`: Default system prompt for LLM requests

## Commands

- `copycat.copyToClipboard`: Basic file copying
- `copycat.copyToClipboardWithPrompt`: Copy with user prompt
- `copycat.toggleFileTreeMode`: Cycle through tree modes
- `copycat.setFileTreeMode`: Select specific tree mode
- `copycat.toggleNode`: Toggle file/folder selection
- `copycat.debugSettings`: Show current settings
- `copycat.clearCache`: Clear token cache

## Output Format

```
# Codebase Overview
[File Structure - based on tree mode]
## Selected Files
[File contents with syntax highlighting]
## Request (if prompt provided)
[System prompt + user request]
```

## Development

- TypeScript/Node.js
- VS Code Extension API
- No external dependencies beyond VS Code
- Progressive token indexing with background processing
- File watchers for live updates
- Cross-platform path handling
