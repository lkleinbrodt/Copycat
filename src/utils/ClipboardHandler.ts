import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import { ContextNode } from "../tree/ContextNode";
import { promises as fsPromises } from "fs";

export class ClipboardHandler {
  constructor(private workspaceRoot: string) {}

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

  private async generateFileTree(): Promise<string> {
    const treeLines: string[] = [];
    const projectName = path.basename(this.workspaceRoot);

    treeLines.push(`${projectName}/`);

    await this.buildTreeRecursive(this.workspaceRoot, "", treeLines, 0);

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

        if (aStat.isDirectory() && !bStat.isDirectory()) return -1;
        if (!aStat.isDirectory() && bStat.isDirectory()) return 1;
        return a.localeCompare(b);
      });

      for (let i = 0; i < sortedEntries.length; i++) {
        const entry = sortedEntries[i];
        const entryPath = path.join(currentPath, entry);
        const entryRelativePath = relativePath
          ? path.join(relativePath, entry)
          : entry;

        // Check if this entry should be ignored
        const isIgnored = await this.isIgnored(entryPath);
        if (isIgnored) {
          continue;
        }

        const stat = await fsPromises.stat(entryPath);
        const isLast = i === sortedEntries.length - 1;
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

  private getTreePrefix(depth: number, isLast: boolean): string {
    const indent = "    ".repeat(depth);
    const connector = isLast ? "└── " : "├── ";
    return indent + connector;
  }

  private async isIgnored(filePath: string): Promise<boolean> {
    try {
      // Simple ignore check - we'll use the same patterns as the extension
      const relativePath = path.relative(this.workspaceRoot, filePath);

      // Check for common ignore patterns
      const ignorePatterns = [
        /^\.git\//,
        /^node_modules\//,
        /^\.vscode\//,
        /^out\//,
        /^dist\//,
        /^build\//,
        /^\.DS_Store$/,
        /^Thumbs\.db$/,
        /\.log$/,
        /\.tmp$/,
        /\.temp$/,
      ];

      for (const pattern of ignorePatterns) {
        if (pattern.test(relativePath)) {
          return true;
        }
      }

      // Check .gitignore if it exists
      const gitignorePath = path.join(this.workspaceRoot, ".gitignore");
      try {
        const gitignoreContent = await fsPromises.readFile(
          gitignorePath,
          "utf-8"
        );
        const patterns = gitignoreContent
          .split("\n")
          .filter((line) => line.trim() && !line.startsWith("#"));

        for (const pattern of patterns) {
          if (this.matchesPattern(relativePath, pattern)) {
            return true;
          }
        }
      } catch {
        // .gitignore doesn't exist, continue
      }

      return false;
    } catch (error) {
      console.warn(`Error checking if ${filePath} is ignored:`, error);
      return false;
    }
  }

  private matchesPattern(filePath: string, pattern: string): boolean {
    // Simple pattern matching for common gitignore patterns
    const cleanPattern = pattern.trim();
    if (!cleanPattern) return false;

    // Handle directory patterns (ending with /)
    if (cleanPattern.endsWith("/")) {
      const dirPattern = cleanPattern.slice(0, -1);
      return filePath.includes(dirPattern + "/") || filePath === dirPattern;
    }

    // Handle wildcard patterns
    if (cleanPattern.includes("*")) {
      const regexPattern = cleanPattern
        .replace(/\./g, "\\.")
        .replace(/\*/g, ".*");
      const regex = new RegExp(regexPattern);
      return regex.test(filePath);
    }

    // Exact match
    return filePath === cleanPattern || filePath.endsWith("/" + cleanPattern);
  }

  async bundleAndCopyToClipboard(
    selectedNodes: ContextNode[],
    prompt?: string,
    systemPrompt?: string
  ): Promise<void> {
    let bundled = "";

    // Add introduction message
    bundled += "# Codebase Overview\n\n";
    bundled +=
      "This is a codebase with the following structure. The selected files are provided below with their full contents.\n\n";

    // Add file tree
    bundled += "## File Structure\n\n";
    bundled += "```\n";
    bundled += await this.generateFileTree();
    bundled += "\n```\n\n";

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
    vscode.window.showInformationMessage(
      `Copied ${selectedNodes.length} files to clipboard!${
        prompt ? " (with prompt)" : ""
      }`
    );
  }
}
