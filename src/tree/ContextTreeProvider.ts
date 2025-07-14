import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import { ContextNode, SelectionState } from "./ContextNode";

import { IgnoreManager } from "../utils/IgnoreManager";
import { TokenFormatter } from "../utils/TokenFormatter";
import { TokenManager } from "../utils/TokenManager";

export class ContextTreeProvider
  implements vscode.TreeDataProvider<ContextNode>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    ContextNode | undefined | void
  > = new vscode.EventEmitter();
  readonly onDidChangeTreeData: vscode.Event<ContextNode | undefined | void> =
    this._onDidChangeTreeData.event;

  private _onSelectionChange: vscode.EventEmitter<number> =
    new vscode.EventEmitter();
  readonly onSelectionChange: vscode.Event<number> =
    this._onSelectionChange.event;

  private allNodes: Map<string, ContextNode> = new Map();
  private selectionCache: Map<string, SelectionState> = new Map();
  private tokenManagers: Map<string, TokenManager>;
  private ignoreManagers: Map<string, IgnoreManager>;
  private workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined;

  constructor(
    workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined,
    tokenManagers: Map<string, TokenManager>,
    ignoreManagers: Map<string, IgnoreManager>
  ) {
    this.workspaceFolders = workspaceFolders;
    this.tokenManagers = tokenManagers;
    this.ignoreManagers = ignoreManagers;
    // Listen for token updates and refresh affected nodes for all managers
    for (const manager of this.tokenManagers.values()) {
      manager.onTokensUpdated((updatedPaths) => {
        this.onTokensUpdated(updatedPaths);
      });
    }
  }

  private get showIgnoredNodes(): boolean {
    return vscode.workspace
      .getConfiguration("copyCatBundler")
      .get("showIgnoredNodes", false);
  }

  refresh(): void {
    for (const [p, node] of this.allNodes) {
      this.selectionCache.set(p, node.selectionState);
    }
    this.allNodes.clear();
    this._onDidChangeTreeData.fire();
  }

  private onTokensUpdated(updatedPaths: string[]): void {
    // Find nodes that need to be refreshed
    const nodesToRefresh: ContextNode[] = [];

    for (const updatedPath of updatedPaths) {
      const node = this.allNodes.get(updatedPath);
      if (node) {
        nodesToRefresh.push(node);
      }
    }

    // Fire change events for updated nodes
    if (nodesToRefresh.length > 0) {
      this._onDidChangeTreeData.fire();
      this.emitSelectionTokens(); // Update selection totals
    }
  }

  getTreeItem(element: ContextNode): vscode.TreeItem {
    switch (element.selectionState) {
      case "checked":
        element.iconPath = new vscode.ThemeIcon("check");
        break;
      case "indeterminate":
        element.iconPath = new vscode.ThemeIcon("dash");
        break;
      default:
        element.iconPath = new vscode.ThemeIcon("circle-large-outline");
    }

    // Get updated token count from TokenManager
    if (
      element.workspaceRoot &&
      this.tokenManagers.has(element.workspaceRoot)
    ) {
      const tokenManager = this.tokenManagers.get(element.workspaceRoot);
      if (tokenManager) {
        const tokenCount = tokenManager.getTokenCount(
          element.resourceUri.fsPath
        );
        if (tokenCount !== undefined) {
          element.tokenCount = tokenCount;
        }
      }
    }

    if (element.tokenCount > 0) {
      element.description = TokenFormatter.formatTokens(element.tokenCount);
    } else if (
      element.description !== TokenFormatter.formatTokensSafe(undefined)
    ) {
      element.description = undefined;
    }

    // Handle ignored nodes
    if (element.isIgnored) {
      element.tooltip = "Ignored file/folder";
      element.contextValue = "ignored";
      // Grey out ignored nodes by using a different icon and description
      element.iconPath = new vscode.ThemeIcon("circle-large-outline");
      element.description = element.description
        ? `${element.description} (ignored)`
        : "(ignored)";
      // Use a different theme icon that appears more muted
      element.iconPath = new vscode.ThemeIcon(
        "circle-large-outline",
        new vscode.ThemeColor("descriptionForeground")
      );
    }

    element.command = {
      command: "copycat.toggleNode",
      title: "Toggle",
      arguments: [element],
    };
    return element;
  }

  async getChildren(element?: ContextNode): Promise<ContextNode[]> {
    if (!this.workspaceFolders) {
      vscode.window.showInformationMessage("No folder or workspace opened");
      return [];
    }

    if (!element) {
      // ROOT LEVEL: Create a node for each workspace folder
      const rootNodes: ContextNode[] = [];
      for (const folder of this.workspaceFolders) {
        const rootUri = folder.uri;
        const rootStat = await vscode.workspace.fs.stat(rootUri);
        const rootNode = await this.createNode(
          rootUri,
          rootStat,
          undefined,
          folder.uri.fsPath
        );
        rootNode.workspaceRoot = folder.uri.fsPath;
        (rootNode as any).displayName = folder.name;
        rootNodes.push(rootNode);
      }
      return rootNodes;
    }

    if (element.fileType === vscode.FileType.Directory) {
      return this.getDirectoryChildren(element);
    }
    return [];
  }

  private async getDirectoryChildren(
    parent: ContextNode
  ): Promise<ContextNode[]> {
    const entries = await vscode.workspace.fs.readDirectory(parent.resourceUri);
    const nodes: ContextNode[] = [];
    for (const [name, type] of entries) {
      const uri = vscode.Uri.joinPath(parent.resourceUri, name);
      let isIgnored = false;
      if (
        parent.workspaceRoot &&
        this.ignoreManagers.has(parent.workspaceRoot)
      ) {
        isIgnored =
          this.ignoreManagers
            .get(parent.workspaceRoot)
            ?.isIgnored(uri.fsPath) ?? false;
      }

      // Debug logging
      console.log(
        `Processing ${name}: isIgnored=${isIgnored}, showIgnoredNodes=${
          this.showIgnoredNodes
        }, type=${type === vscode.FileType.Directory ? "directory" : "file"}`
      );

      // Skip ignored nodes if showIgnoredNodes is false
      if (isIgnored && !this.showIgnoredNodes) {
        console.log(`Skipping ignored node: ${name}`);
        continue;
      }

      // For directories, check if they have any non-ignored children when showIgnoredNodes is false
      if (type === vscode.FileType.Directory && !this.showIgnoredNodes) {
        try {
          const dirEntries = await vscode.workspace.fs.readDirectory(uri);
          let hasNonIgnoredChildren = false;
          if (
            parent.workspaceRoot &&
            this.ignoreManagers.has(parent.workspaceRoot)
          ) {
            for (const [childName, childType] of dirEntries) {
              const childUri = vscode.Uri.joinPath(uri, childName);
              const childIsIgnored = this.ignoreManagers
                .get(parent.workspaceRoot)
                ?.isIgnored(childUri.fsPath);
              if (!childIsIgnored) {
                hasNonIgnoredChildren = true;
                break;
              }
            }
          }
          if (!hasNonIgnoredChildren) {
            console.log(
              `Skipping directory with no non-ignored children: ${name}`
            );
            continue;
          }
        } catch (error) {
          console.log(`Error checking directory ${name}:`, error);
        }
      }

      const node = await this.createNode(uri, type, parent);
      if (isIgnored) {
        node.isIgnored = true;
        console.log(`Marked node as ignored: ${name}`);
      }
      nodes.push(node);
    }
    return nodes;
  }

  private async createNode(
    uri: vscode.Uri,
    fileTypeOrStat: vscode.FileType | vscode.FileStat,
    parent?: ContextNode,
    workspaceRoot?: string
  ): Promise<ContextNode> {
    const fileType =
      (fileTypeOrStat as vscode.FileStat).type !== undefined
        ? (fileTypeOrStat as vscode.FileStat).type
        : (fileTypeOrStat as vscode.FileType);
    const label = path.basename(uri.fsPath);
    const root = workspaceRoot || parent?.workspaceRoot;
    if (!root) {
      throw new Error("workspaceRoot must be defined for ContextNode");
    }
    const node = new ContextNode(uri, label, fileType, root);
    node.workspaceRoot = root;
    this.allNodes.set(uri.fsPath, node);
    parent?.children.push(node);

    // Check if this node is ignored
    const ignoreManager = this.ignoreManagers.get(root);
    const tokenManager = this.tokenManagers.get(root);
    const isIgnored = ignoreManager && ignoreManager.isIgnored(uri.fsPath);
    if (isIgnored) {
      node.isIgnored = true;
    }

    // Get token count from TokenManager
    if (tokenManager) {
      const tokenCount = tokenManager.getTokenCount(uri.fsPath);
      if (tokenCount !== undefined) {
        node.tokenCount = tokenCount;
      } else {
        node.tokenCount = 0;
        if (fileType === vscode.FileType.File) {
          node.description = TokenFormatter.formatTokensSafe(undefined);
        }
      }
    }
    return node;
  }

  toggleNode(node: ContextNode): void {
    // Prevent ignored nodes from being selected
    if (node.isIgnored) {
      return;
    }

    const newState: SelectionState =
      node.selectionState === "checked" ? "unchecked" : "checked";
    this.setNodeState(node, newState);
    this._onDidChangeTreeData.fire(node);
    this.propagateStateUp(node);
    this.emitSelectionTokens();
  }

  private setNodeState(node: ContextNode, state: SelectionState): void {
    node.selectionState = state;
    this.selectionCache.set(node.resourceUri.fsPath, state);
    if (
      state !== "indeterminate" &&
      node.fileType === vscode.FileType.Directory
    ) {
      node.children.forEach((child) => {
        // Skip ignored children during propagation
        if (!child.isIgnored) {
          this.setNodeState(child, state);
        }
      });
    }
  }

  private propagateStateUp(node: ContextNode): void {
    const parent = this.findParent(node);
    if (!parent) {
      return;
    }

    // Only consider non-ignored children when determining parent state
    const nonIgnoredChildren = parent.children.filter((c) => !c.isIgnored);
    const childStates = nonIgnoredChildren.map((c) => c.selectionState);

    // If all children are ignored, parent should be unchecked
    if (nonIgnoredChildren.length === 0) {
      parent.selectionState = "unchecked";
    } else {
      const allChecked = childStates.every((s) => s === "checked");
      const allUnchecked = childStates.every((s) => s === "unchecked");
      if (allChecked) {
        parent.selectionState = "checked";
      } else if (allUnchecked) {
        parent.selectionState = "unchecked";
      } else {
        parent.selectionState = "indeterminate";
      }
    }

    this.selectionCache.set(parent.resourceUri.fsPath, parent.selectionState);
    this._onDidChangeTreeData.fire(parent);
    this.propagateStateUp(parent);
  }

  private emitSelectionTokens(): void {
    let total = 0;
    const countedPaths = new Set<string>();

    // Get all checked nodes (both files and directories)
    for (const node of this.allNodes.values()) {
      if (node.selectionState === "checked" && !node.isIgnored) {
        const nodePath = node.resourceUri.fsPath;

        // Check if this path is already counted by a parent directory
        let isChildOfCountedDirectory = false;
        for (const countedPath of countedPaths) {
          if (
            nodePath.startsWith(countedPath + path.sep) ||
            nodePath === countedPath
          ) {
            isChildOfCountedDirectory = true;
            break;
          }
        }

        if (!isChildOfCountedDirectory) {
          if (
            node.workspaceRoot &&
            this.tokenManagers.has(node.workspaceRoot)
          ) {
            const tokenManager = this.tokenManagers.get(node.workspaceRoot);
            if (tokenManager) {
              const tokenCount = tokenManager.getTokenCountSync(nodePath);
              total += tokenCount;
            }
          } else {
            total += node.tokenCount;
          }
          countedPaths.add(nodePath);
        }
      }
    }

    this._onSelectionChange.fire(total);
  }

  private findParent(child: ContextNode): ContextNode | undefined {
    for (const node of this.allNodes.values()) {
      if (node.children.includes(child)) {
        return node;
      }
    }
    return undefined;
  }

  getSelectedNodes(): Promise<ContextNode[]> {
    const nodes: ContextNode[] = [];

    // For clipboard purposes, we want all individual files that are selected
    // This includes files that are selected directly, or files that are selected
    // because their parent directory is selected
    for (const node of this.allNodes.values()) {
      if (
        node.selectionState === "checked" &&
        node.fileType === vscode.FileType.File &&
        !node.isIgnored
      ) {
        nodes.push(node);
      }
    }

    // Additionally, for selected directories, we need to recursively discover
    // all files within them, even if they haven't been loaded into the tree yet
    const discoverPromises: Promise<ContextNode[]>[] = [];
    for (const node of this.allNodes.values()) {
      if (
        node.selectionState === "checked" &&
        node.fileType === vscode.FileType.Directory &&
        !node.isIgnored
      ) {
        // Recursively discover all files in this directory
        discoverPromises.push(
          this.discoverFilesInDirectory(node.resourceUri.fsPath)
        );
      }
    }

    return Promise.all(discoverPromises).then((discoveredFilesArrays) => {
      // De-duplicate files that might have been added individually
      for (const discoveredFiles of discoveredFilesArrays) {
        for (const file of discoveredFiles) {
          if (
            !nodes.some((n) => n.resourceUri.fsPath === file.resourceUri.fsPath)
          ) {
            nodes.push(file);
          }
        }
      }
      return nodes;
    });
  }

  /**
   * Recursively discover all files within a directory, respecting ignore rules
   */
  private async discoverFilesInDirectory(
    dirPath: string
  ): Promise<ContextNode[]> {
    const files: ContextNode[] = [];

    try {
      // Use an async recursive function
      const discoverRecursive = async (currentPath: string): Promise<void> => {
        const entries = await fs.promises.readdir(currentPath);

        for (const entry of entries) {
          const entryPath = path.join(currentPath, entry);

          const parentNode = this.findParent(
            this.allNodes.get(entryPath) as ContextNode
          );
          if (
            parentNode &&
            parentNode.workspaceRoot &&
            this.ignoreManagers.has(parentNode.workspaceRoot)
          ) {
            if (
              this.ignoreManagers
                .get(parentNode.workspaceRoot)
                ?.isIgnored(entryPath)
            ) {
              continue;
            }
          }

          const stat = await fs.promises.stat(entryPath);

          if (stat.isDirectory()) {
            await discoverRecursive(entryPath);
          } else {
            // Create a temporary ContextNode for this file
            const uri = vscode.Uri.file(entryPath);
            const node = new ContextNode(
              uri,
              path.basename(entryPath),
              vscode.FileType.File
            );

            // Get token count if available
            const parentNode2 = this.findParent(
              this.allNodes.get(entryPath) as ContextNode
            );
            if (
              parentNode2 &&
              parentNode2.workspaceRoot &&
              this.tokenManagers.has(parentNode2.workspaceRoot)
            ) {
              const tokenManager = this.tokenManagers.get(
                parentNode2.workspaceRoot
              );
              if (tokenManager) {
                const tokenCount = tokenManager.getTokenCountSync(entryPath);
                if (tokenCount !== undefined) {
                  node.tokenCount = tokenCount;
                }
              }
            }

            files.push(node);
          }
        }
      };

      await discoverRecursive(dirPath);
    } catch (error) {
      console.warn(`Error discovering files in directory ${dirPath}:`, error);
    }

    return files;
  }
}
