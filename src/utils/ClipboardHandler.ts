import * as fs from "fs";
import * as languageMap from "./languageMap.json";
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
    return (languageMap as { [key: string]: string })[ext] || "";
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

      // Pre-fetch all stats asynchronously
      const entriesWithStats = await Promise.all(
        entries.map(async (entry) => {
          const entryPath = path.join(currentPath, entry);
          try {
            return { name: entry, stat: await fsPromises.stat(entryPath) };
          } catch {
            return null; // Handle errors, e.g., broken symlinks
          }
        })
      );

      // Sort entries: directories first, then files, both alphabetically
      const sortedEntries = entriesWithStats
        .filter((e) => e !== null) // Filter out failed stats
        .sort((a, b) => {
          const aStat = a!.stat;
          const bStat = b!.stat;
          if (aStat.isDirectory() && !bStat.isDirectory()) {
            return -1;
          }
          if (!aStat.isDirectory() && bStat.isDirectory()) {
            return 1;
          }
          return a!.name.localeCompare(b!.name);
        });

      // Filter out ignored entries first
      const nonIgnoredEntries: { name: string; stat: fs.Stats }[] = [];
      for (const entry of sortedEntries) {
        const entryPath = path.join(currentPath, entry!.name);
        if (!this.ignoreManager.isIgnored(entryPath)) {
          nonIgnoredEntries.push({ name: entry!.name, stat: entry!.stat });
        }
      }

      // For directories, check if they have any non-ignored children
      const visibleEntries: { name: string; stat: fs.Stats }[] = [];
      for (const entry of nonIgnoredEntries) {
        const entryPath = path.join(currentPath, entry.name);

        if (entry.stat.isDirectory()) {
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
        const entryPath = path.join(currentPath, entry.name);
        const entryRelativePath = relativePath
          ? path.join(relativePath, entry.name)
          : entry.name;

        const isLast = i === visibleEntries.length - 1;
        const prefix = this.getTreePrefix(depth, isLast);

        if (entry.stat.isDirectory()) {
          treeLines.push(`${prefix}${entry.name}/`);
          await this.buildTreeRecursive(
            entryPath,
            entryRelativePath,
            treeLines,
            depth + 1
          );
        } else {
          treeLines.push(`${prefix}${entry.name}`);
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
      const config = vscode.workspace.getConfiguration("copyCatBundler");
      fileTreeMode = config.get<FileTreeMode>("fileTreeMode", "full");
    }

    let bundled = "";

    // Add introduction message
    bundled += "# Codebase Analysis Request\n\n";
    bundled +=
      "Below is a codebase with its file structure and selected source files. Please analyze this code and provide assistance based on the user's request.\n\n";

    // Add file tree based on mode
    const fileTree = await this.generateFileTree(fileTreeMode, selectedNodes);
    if (fileTree) {
      bundled += "## Project File Structure\n\n";

      // Add a note about the tree mode
      if (fileTreeMode === "relevant") {
        bundled +=
          "*Note: This tree shows only a subset of the project's files and folders, as requested by the user.*\n\n";
      } else if (fileTreeMode === "full") {
        // Do nothing
      }

      bundled += "```\n";
      bundled += fileTree;
      bundled += "\n```\n\n";
    }

    // Add selected files
    bundled += "## Source Code Files\n\n";
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
      bundled += `### File: ${relative}\n\n`;
      if (languageHint) {
        bundled += `\`\`\`${languageHint}\n${content}\n\`\`\`\n\n`;
      } else {
        bundled += `\`\`\`\n${content}\n\`\`\`\n\n`;
      }
    }

    // Add prompt section if provided
    if ((systemPrompt && systemPrompt.trim()) || (prompt && prompt.trim())) {
      bundled += "## User Request & Instructions\n\n";

      if (systemPrompt && systemPrompt.trim()) {
        bundled += `**Context & Guidelines:**\n${systemPrompt.trim()}\n\n`;
      }

      if (prompt && prompt.trim()) {
        bundled += `**Task/Question:**\n${prompt.trim()}\n\n`;
      }

      bundled += "---\n\n";
      bundled +=
        "**Please provide a comprehensive response that addresses the user's request. Consider the code structure, patterns, and implementation details when formulating your answer.**\n\n";
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
