import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import { ContextNode } from "../tree/ContextNode";
import { IgnoreManager } from "./IgnoreManager";
import { promises as fsPromises } from "fs";

export type FileTreeMode = "full" | "relevant" | "none";

export class ClipboardHandler {
  private ignoreManager: IgnoreManager;

  constructor(private workspaceRoot: string) {
    this.ignoreManager = new IgnoreManager(workspaceRoot);
  }

  private getLanguageHint(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();

    // Map of common file extensions to language hints (supporting ~20 most common types)
    const languageMap: { [key: string]: string } = {
      // Web technologies
      ".js": "javascript",
      ".jsx": "javascript",
      ".ts": "typescript",
      ".tsx": "typescript",
      ".html": "html",
      ".css": "css",
      ".scss": "scss",
      ".sass": "sass",
      ".less": "less",

      // Python
      ".py": "python",
      ".pyw": "python",

      // Java
      ".java": "java",

      // C/C++
      ".c": "c",
      ".cpp": "cpp",
      ".cc": "cpp",
      ".cxx": "cpp",
      ".h": "c",
      ".hpp": "cpp",

      // C#
      ".cs": "csharp",

      // Go
      ".go": "go",

      // Rust
      ".rs": "rust",

      // Ruby
      ".rb": "ruby",

      // PHP
      ".php": "php",

      // Swift
      ".swift": "swift",

      // Kotlin
      ".kt": "kotlin",
      ".kts": "kotlin",

      // Scala
      ".scala": "scala",

      // Shell scripts
      ".sh": "bash",
      ".bash": "bash",
      ".zsh": "bash",
      ".fish": "bash",

      // PowerShell
      ".ps1": "powershell",

      // SQL
      ".sql": "sql",

      // JSON
      ".json": "json",

      // YAML
      ".yml": "yaml",
      ".yaml": "yaml",

      // XML
      ".xml": "xml",

      // Markdown
      ".md": "markdown",
      ".markdown": "markdown",

      // Configuration files
      ".toml": "toml",
      ".ini": "ini",
      ".cfg": "ini",
      ".conf": "ini",

      // Docker
      ".dockerfile": "dockerfile",
      ".dockerignore": "dockerfile",

      // Git
      ".gitignore": "gitignore",
      ".gitattributes": "gitattributes",

      // Make
      ".makefile": "makefile",
      ".mk": "makefile",

      // R
      ".r": "r",

      // MATLAB
      ".m": "matlab",

      // Julia
      ".jl": "julia",

      // Haskell
      ".hs": "haskell",

      // F#
      ".fs": "fsharp",
      ".fsx": "fsharp",

      // Clojure
      ".clj": "clojure",
      ".cljs": "clojurescript",

      // Elixir
      ".ex": "elixir",
      ".exs": "elixir",

      // Erlang
      ".erl": "erlang",
      ".hrl": "erlang",

      // Lua
      ".lua": "lua",

      // Perl
      ".pl": "perl",
      ".pm": "perl",

      // Dart
      ".dart": "dart",

      // Nim
      ".nim": "nim",

      // V
      ".v": "v",

      // Zig
      ".zig": "zig",

      // Assembly
      ".asm": "assembly",
      ".s": "assembly",

      // Fortran
      ".f90": "fortran",
      ".f95": "fortran",
      ".f03": "fortran",

      // COBOL
      ".cob": "cobol",
      ".cbl": "cobol",

      // Ada
      ".adb": "ada",
      ".ads": "ada",

      // Prolog
      ".pro": "prolog",

      // Lisp
      ".lisp": "lisp",
      ".lsp": "lisp",
      ".cl": "lisp",

      // Scheme
      ".scm": "scheme",
      ".ss": "scheme",

      // OCaml
      ".ml": "ocaml",
      ".mli": "ocaml",

      // Standard ML
      ".sml": "sml",

      // Clean
      ".icl": "clean",
      ".dcl": "clean",

      // Curry
      ".curry": "curry",

      // Agda
      ".agda": "agda",

      // Isabelle
      ".thy": "isabelle",

      // Lean
      ".lean": "lean",

      // Idris
      ".idr": "idris",

      // ATS
      ".dats": "ats",
      ".sats": "ats",

      // Unison
      ".u": "unison",

      // Koka
      ".kk": "koka",

      // Roc
      ".roc": "roc",

      // Gleam
      ".gleam": "gleam",

      // Elm
      ".elm": "elm",

      // PureScript
      ".purs": "purescript",

      // Reason
      ".re": "reason",
      ".rei": "reason",

      // ReScript
      ".res": "rescript",
      ".resi": "rescript",

      // CoffeeScript
      ".coffee": "coffeescript",
      ".litcoffee": "coffeescript",

      // LiveScript
      ".ls": "livescript",

      // JavaScript modules
      ".mjs": "javascript",
      ".cjs": "javascript",
    };

    return languageMap[ext] || "";
  }

  private async generateFileTree(
    mode: FileTreeMode,
    selectedNodes?: ContextNode[]
  ): Promise<string> {
    if (mode === "none") {
      return "";
    }

    const treeLines: string[] = [];
    const projectName = path.basename(this.workspaceRoot);

    treeLines.push(`${projectName}/`);

    if (mode === "full") {
      await this.buildTreeRecursive(this.workspaceRoot, "", treeLines, 0);
    } else if (mode === "relevant" && selectedNodes) {
      await this.buildRelevantTree(selectedNodes, treeLines);
    }

    return treeLines.join("\n");
  }

  private async buildTreeRecursive(
    currentPath: string,
    relativePath: string,
    treeLines: string[],
    depth: number
  ): Promise<void> {
    try {
      const entries = await fsPromises.readdir(currentPath);
      const sortedEntries = entries.sort((a, b) => {
        // Directories first, then files, both alphabetically
        const aPath = path.join(currentPath, a);
        const bPath = path.join(currentPath, b);
        const aStat = fs.statSync(aPath);
        const bStat = fs.statSync(bPath);

        if (aStat.isDirectory() && !bStat.isDirectory()) {
          return -1;
        }
        if (!aStat.isDirectory() && bStat.isDirectory()) {
          return 1;
        }
        return a.localeCompare(b);
      });

      // Filter out ignored entries first
      const nonIgnoredEntries: string[] = [];
      for (const entry of sortedEntries) {
        const entryPath = path.join(currentPath, entry);
        if (!this.ignoreManager.isIgnored(entryPath)) {
          nonIgnoredEntries.push(entry);
        }
      }

      // For directories, check if they have any non-ignored children
      const visibleEntries: string[] = [];
      for (const entry of nonIgnoredEntries) {
        const entryPath = path.join(currentPath, entry);
        const stat = await fsPromises.stat(entryPath);

        if (stat.isDirectory()) {
          // Check if directory has any non-ignored children
          const hasNonIgnoredChildren = await this.hasNonIgnoredChildren(
            entryPath
          );
          if (hasNonIgnoredChildren) {
            visibleEntries.push(entry);
          }
        } else {
          visibleEntries.push(entry);
        }
      }

      for (let i = 0; i < visibleEntries.length; i++) {
        const entry = visibleEntries[i];
        const entryPath = path.join(currentPath, entry);
        const entryRelativePath = relativePath
          ? path.join(relativePath, entry)
          : entry;

        const stat = await fsPromises.stat(entryPath);
        const isLast = i === visibleEntries.length - 1;
        const prefix = this.getTreePrefix(depth, isLast);

        if (stat.isDirectory()) {
          treeLines.push(`${prefix}${entry}/`);
          await this.buildTreeRecursive(
            entryPath,
            entryRelativePath,
            treeLines,
            depth + 1
          );
        } else {
          treeLines.push(`${prefix}${entry}`);
        }
      }
    } catch (error) {
      console.warn(`Error reading directory ${currentPath}:`, error);
    }
  }

  private async buildRelevantTree(
    selectedNodes: ContextNode[],
    treeLines: string[]
  ): Promise<void> {
    // Get all unique paths that need to be shown
    const relevantPaths = new Set<string>();

    for (const node of selectedNodes) {
      const relativePath = path.relative(
        this.workspaceRoot,
        node.resourceUri.fsPath
      );
      const pathParts = relativePath.split(path.sep);

      // Add all parent directories
      let currentPath = "";
      for (const part of pathParts) {
        currentPath = currentPath ? path.join(currentPath, part) : part;
        relevantPaths.add(currentPath);
      }
    }

    // Sort paths to maintain tree structure
    const sortedPaths = Array.from(relevantPaths).sort((a, b) => {
      const aParts = a.split(path.sep);
      const bParts = b.split(path.sep);

      // Sort by depth first, then alphabetically
      if (aParts.length !== bParts.length) {
        return aParts.length - bParts.length;
      }

      return a.localeCompare(b);
    });

    // Build the tree structure
    for (const relativePath of sortedPaths) {
      const fullPath = path.join(this.workspaceRoot, relativePath);
      const stat = await fsPromises.stat(fullPath);
      const pathParts = relativePath.split(path.sep);
      const depth = pathParts.length - 1;

      // Determine if this is the last item at this depth
      const isLast = this.isLastAtDepth(sortedPaths, relativePath, depth);
      const prefix = this.getTreePrefix(depth, isLast);

      if (stat.isDirectory()) {
        treeLines.push(`${prefix}${pathParts[pathParts.length - 1]}/`);
      } else {
        treeLines.push(`${prefix}${pathParts[pathParts.length - 1]}`);
      }
    }
  }

  private isLastAtDepth(
    paths: string[],
    currentPath: string,
    depth: number
  ): boolean {
    const currentParts = currentPath.split(path.sep);

    for (let i = paths.length - 1; i >= 0; i--) {
      const pathItem = paths[i];
      const parts = pathItem.split(path.sep);

      if (parts.length === depth + 1) {
        // Found another item at the same depth
        return pathItem === currentPath;
      }
    }

    return true;
  }

  private async hasNonIgnoredChildren(dirPath: string): Promise<boolean> {
    try {
      const entries = await fsPromises.readdir(dirPath);

      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry);

        if (!this.ignoreManager.isIgnored(entryPath)) {
          const stat = await fsPromises.stat(entryPath);

          if (stat.isFile()) {
            return true; // Found a non-ignored file
          } else if (stat.isDirectory()) {
            // Recursively check if this subdirectory has non-ignored children
            const hasChildren = await this.hasNonIgnoredChildren(entryPath);
            if (hasChildren) {
              return true;
            }
          }
        }
      }

      return false; // No non-ignored children found
    } catch (error) {
      console.warn(`Error checking children of ${dirPath}:`, error);
      return false;
    }
  }

  private getTreePrefix(depth: number, isLast: boolean): string {
    const indent = "    ".repeat(depth);
    const connector = isLast ? "└── " : "├── ";
    return indent + connector;
  }

  async bundleAndCopyToClipboard(
    selectedNodes: ContextNode[],
    prompt?: string,
    systemPrompt?: string,
    fileTreeMode?: FileTreeMode
  ): Promise<void> {
    // Get file tree mode from settings if not provided
    if (!fileTreeMode) {
      const config = vscode.workspace.getConfiguration("contextBundler");
      fileTreeMode = config.get<FileTreeMode>("fileTreeMode", "full");
    }

    let bundled = "";

    // Add introduction message
    bundled += "# Codebase Overview\n\n";
    bundled +=
      "This is a codebase with the following structure. The selected files are provided below with their full contents.\n\n";

    // Add file tree based on mode
    const fileTree = await this.generateFileTree(fileTreeMode, selectedNodes);
    if (fileTree) {
      bundled += "## File Structure\n\n";
      bundled += "```\n";
      bundled += fileTree;
      bundled += "\n```\n\n";
    }

    // Add selected files
    bundled += "## Selected Files\n\n";
    for (const node of selectedNodes) {
      const relative = path.relative(
        this.workspaceRoot,
        node.resourceUri.fsPath
      );
      const content = await fsPromises.readFile(
        node.resourceUri.fsPath,
        "utf-8"
      );
      const languageHint = this.getLanguageHint(node.resourceUri.fsPath);

      // Format with markdown heading and fenced code block
      bundled += `# ${relative}\n\n`;
      if (languageHint) {
        bundled += `\`\`\`${languageHint}\n${content}\n\`\`\`\n\n`;
      } else {
        bundled += `\`\`\`\n${content}\n\`\`\`\n\n`;
      }
    }

    // Add prompt section if provided
    if ((systemPrompt && systemPrompt.trim()) || (prompt && prompt.trim())) {
      bundled += "## Request\n\n";
      bundled +=
        "> **Instructions for LLM:** The following section contains a system prompt (for overall guidance) and a user request. Use the system prompt to guide your reasoning and the user request to generate your response.\n\n";
      if (systemPrompt && systemPrompt.trim()) {
        bundled += `**System Prompt:**\n${systemPrompt.trim()}\n\n`;
      }
      if (prompt && prompt.trim()) {
        bundled += `**User Request:**\n${prompt.trim()}\n\n`;
      }
    }

    await vscode.env.clipboard.writeText(bundled);

    const modeText =
      fileTreeMode === "none"
        ? " (no tree)"
        : fileTreeMode === "relevant"
        ? " (relevant tree)"
        : " (full tree)";

    vscode.window.showInformationMessage(
      `Copied ${selectedNodes.length} files to clipboard!${
        prompt ? " (with prompt)" : ""
      }${modeText}`
    );
  }
}
