import * as fs from "fs";
import * as languageMap from "./languageMap.json";
import * as path from "path";
import * as vscode from "vscode";

import { ContextNode } from "../tree/ContextNode";
import { IgnoreManager } from "./IgnoreManager";
import { promises as fsPromises } from "fs";

export type FileTreeMode = "full" | "relevant" | "none";

// Define an interface for what we need from the clipboard
interface IClipboard {
  writeText(text: string): Thenable<void>;
}

export class ClipboardHandler {
  private workspaceFolders: readonly vscode.WorkspaceFolder[];
  private ignoreManagers = new Map<string, IgnoreManager>();
  private clipboard: IClipboard;

  constructor(
    workspaceFolders: readonly vscode.WorkspaceFolder[],
    clipboard: IClipboard = vscode.env.clipboard
  ) {
    this.workspaceFolders = workspaceFolders;
    this.clipboard = clipboard;
    for (const folder of workspaceFolders) {
      this.ignoreManagers.set(
        folder.uri.fsPath,
        new IgnoreManager(folder.uri.fsPath)
      );
    }
  }

  private getLanguageHint(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    return (languageMap as { [key: string]: string })[ext] || "";
  }

  private async generateFileTree(
    mode: FileTreeMode,
    selectedNodes: ContextNode[],
    workspaceRoot: string
  ): Promise<string> {
    if (mode === "none") {
      return "";
    }

    const treeLines: string[] = [];
    const projectName = path.basename(workspaceRoot);
    treeLines.push(`${projectName}/`);

    if (mode === "full") {
      await this.buildTreeRecursive(
        workspaceRoot,
        "",
        treeLines,
        0,
        workspaceRoot
      );
    } else if (mode === "relevant" && selectedNodes) {
      await this.buildRelevantTree(selectedNodes, treeLines, workspaceRoot);
    }

    return treeLines.join("\n");
  }

  private async buildTreeRecursive(
    currentPath: string,
    relativePath: string,
    treeLines: string[],
    depth: number,
    workspaceRoot: string
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
      const ignoreManager = this.ignoreManagers.get(workspaceRoot);
      for (const entry of sortedEntries) {
        const entryPath = path.join(currentPath, entry!.name);
        if (!ignoreManager || !ignoreManager.isIgnored(entryPath)) {
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
            entryPath,
            workspaceRoot
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
            depth + 1,
            workspaceRoot
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
    treeLines: string[],
    workspaceRoot: string
  ): Promise<void> {
    // Get all unique paths that need to be shown
    const relevantPaths = new Set<string>();

    for (const node of selectedNodes) {
      if (node.workspaceRoot !== workspaceRoot) continue;
      const relativePath = path.relative(
        workspaceRoot,
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
      const fullPath = path.join(workspaceRoot, relativePath);
      let stat: fs.Stats;
      try {
        stat = await fsPromises.stat(fullPath);
      } catch {
        continue;
      }
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

  private async hasNonIgnoredChildren(
    dirPath: string,
    workspaceRoot: string
  ): Promise<boolean> {
    const ignoreManager = this.ignoreManagers.get(workspaceRoot);
    try {
      const entries = await fsPromises.readdir(dirPath);
      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry);
        if (!ignoreManager || !ignoreManager.isIgnored(entryPath)) {
          return true;
        }
      }
    } catch {
      // ignore
    }
    return false;
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
    // Get file tree mode from settings
    const config = vscode.workspace.getConfiguration("copyCatBundler");
    const effectiveFileTreeMode =
      fileTreeMode || config.get<FileTreeMode>("fileTreeMode", "full");

    // 1. Group selected nodes by their workspace root
    const nodesByRoot = new Map<string, ContextNode[]>();
    for (const node of selectedNodes) {
      if (!node.workspaceRoot) continue;
      if (!nodesByRoot.has(node.workspaceRoot)) {
        nodesByRoot.set(node.workspaceRoot, []);
      }
      nodesByRoot.get(node.workspaceRoot)!.push(node);
    }

    let bundled = "# Codebase Analysis Request\n\n";

    // 2. Add introductory message
    if (nodesByRoot.size > 1) {
      bundled += `*Note: The user has selected files from ${nodesByRoot.size} separate directories. Each directory's context is provided below.*\n\n`;
    } else {
      bundled +=
        "Below is a codebase with its file structure and selected source files. Please analyze this code and provide assistance based on the user's request.\n\n";
    }

    // 3. Loop through each root and generate its section
    for (const [rootPath, nodesInRoot] of nodesByRoot.entries()) {
      const folderName = path.basename(rootPath);
      bundled += `---\n\n## Project: ${folderName}\n\n`;

      // A. Add file tree for this root
      const fileTree = await this.generateFileTree(
        effectiveFileTreeMode,
        nodesInRoot,
        rootPath
      );
      if (fileTree) {
        bundled +=
          "### Project File Structure\n\n```\n" + fileTree + "\n```\n\n";
      }

      // B. Add file contents for this root
      bundled += "### Source Code Files\n\n";
      for (const node of nodesInRoot) {
        const relativePath = path.relative(rootPath, node.resourceUri.fsPath);
        const content = await fsPromises.readFile(
          node.resourceUri.fsPath,
          "utf-8"
        );
        const languageHint = this.getLanguageHint(node.resourceUri.fsPath);

        bundled += `#### File: ${relativePath}\n\n`;
        bundled += `\  ${languageHint}\n${content}\n  \n\n`;
      }
    }

    // 4. Add the final prompt section (this part is unchanged)
    if ((systemPrompt && systemPrompt.trim()) || (prompt && prompt.trim())) {
      bundled += "---\n\n";
      if (systemPrompt && systemPrompt.trim()) {
        bundled += `**System Prompt:**\n\n${systemPrompt.trim()}\n\n`;
      }
      if (prompt && prompt.trim()) {
        bundled += `**User Request:**\n\n${prompt.trim()}\n`;
      }
    }

    await this.clipboard.writeText(bundled);
    vscode.window.showInformationMessage(
      `Copied ${selectedNodes.length} files from ${nodesByRoot.size} director(y/ies) to clipboard!`
    );
  }
}
