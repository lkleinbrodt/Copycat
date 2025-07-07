import * as path from "path";
import * as vscode from "vscode";

import { ContextNode, SelectionState } from "./ContextNode";

import { IgnoreManager } from "../utils/IgnoreManager";
import { TokenEstimator } from "../utils/TokenEstimator";
import { promises as fs } from "fs";

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
  private ignoreManager?: IgnoreManager;
  private estimator = new TokenEstimator();

  constructor(private workspaceRoot: string | undefined) {
    if (workspaceRoot) {
      this.ignoreManager = new IgnoreManager(workspaceRoot);
    }
  }

  private get showIgnoredNodes(): boolean {
    return vscode.workspace
      .getConfiguration("contextBundler")
      .get("showIgnoredNodes", false);
  }

  refresh(): void {
    for (const [p, node] of this.allNodes) {
      this.selectionCache.set(p, node.selectionState);
    }
    this.allNodes.clear();
    this._onDidChangeTreeData.fire();
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
    if (element.tokenCount) {
      element.description = `${element.tokenCount}t`;
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
      command: "context-bundler.toggleNode",
      title: "Toggle",
      arguments: [element],
    };
    return element;
  }

  async getChildren(element?: ContextNode): Promise<ContextNode[]> {
    if (!this.workspaceRoot) {
      vscode.window.showInformationMessage("No folder or workspace opened");
      return [];
    }

    if (!element) {
      const rootUri = vscode.Uri.file(this.workspaceRoot);
      const rootStat = await vscode.workspace.fs.stat(rootUri);
      const rootNode = await this.createNode(rootUri, rootStat);
      return [rootNode];
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
      const isIgnored =
        this.ignoreManager && this.ignoreManager.isIgnored(uri.fsPath);

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

          for (const [childName, childType] of dirEntries) {
            const childUri = vscode.Uri.joinPath(uri, childName);
            const childIsIgnored =
              this.ignoreManager &&
              this.ignoreManager.isIgnored(childUri.fsPath);
            if (!childIsIgnored) {
              hasNonIgnoredChildren = true;
              break;
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
    parent?: ContextNode
  ): Promise<ContextNode> {
    const fileType =
      (fileTypeOrStat as vscode.FileStat).type !== undefined
        ? (fileTypeOrStat as vscode.FileStat).type
        : (fileTypeOrStat as vscode.FileType);
    const label = path.basename(uri.fsPath);
    const node = new ContextNode(uri, label, fileType);
    this.allNodes.set(uri.fsPath, node);
    parent?.children.push(node);

    // Check if this node is ignored
    const isIgnored =
      this.ignoreManager && this.ignoreManager.isIgnored(uri.fsPath);
    if (isIgnored) {
      node.isIgnored = true;
      // Ignored nodes should always start as unchecked
      node.selectionState = "unchecked";
    } else {
      const cached = this.selectionCache.get(uri.fsPath);
      if (cached) {
        node.selectionState = cached;
      } else if (parent && parent.selectionState !== "indeterminate") {
        node.selectionState = parent.selectionState;
      }
    }

    if (fileType === vscode.FileType.File) {
      try {
        const content = await fs.readFile(uri.fsPath, "utf-8");
        node.tokenCount = this.estimator.estimateTokens(content);
      } catch {
        node.tokenCount = 0;
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
    const total = this.getSelectedNodes().reduce(
      (sum, n) => sum + n.tokenCount,
      0
    );
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

  getSelectedNodes(): ContextNode[] {
    const nodes: ContextNode[] = [];
    for (const node of this.allNodes.values()) {
      if (
        node.selectionState === "checked" &&
        node.fileType === vscode.FileType.File &&
        !node.isIgnored
      ) {
        nodes.push(node);
      }
    }
    return nodes;
  }
}
