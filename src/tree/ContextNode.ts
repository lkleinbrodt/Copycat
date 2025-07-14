import * as vscode from "vscode";

export type SelectionState = "checked" | "unchecked" | "indeterminate";

export class ContextNode extends vscode.TreeItem {
  public children: ContextNode[] = [];
  public selectionState: SelectionState = "unchecked";
  public tokenCount = 0;
  public isIgnored = false;
  public workspaceRoot?: string; // Add this property

  constructor(
    public readonly resourceUri: vscode.Uri,
    public readonly label: string,
    public readonly fileType: vscode.FileType,
    workspaceRoot?: string // Add to constructor
  ) {
    super(
      label,
      fileType === vscode.FileType.Directory
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );
    this.id = resourceUri.fsPath;
    this.workspaceRoot = workspaceRoot;
  }
}
