import * as vscode from "vscode";

import { ClipboardHandler } from "./utils/ClipboardHandler";
import { ContextTreeProvider } from "./tree/ContextTreeProvider";

export function activate(context: vscode.ExtensionContext) {
  console.log('Extension "context-bundler" is now active!');

  const rootPath =
    vscode.workspace.workspaceFolders &&
    vscode.workspace.workspaceFolders.length > 0
      ? vscode.workspace.workspaceFolders[0].uri.fsPath
      : undefined;

  const treeProvider = new ContextTreeProvider(rootPath);
  const treeView = vscode.window.createTreeView("contextBundlerView", {
    treeDataProvider: treeProvider,
  });
  treeProvider.onSelectionChange((total) => {
    treeView.description = `~${total} tokens selected`;
  });

  const toggleCmd = vscode.commands.registerCommand(
    "context-bundler.toggleNode",
    (node: any) => {
      treeProvider.toggleNode(node);
    }
  );

  const clipboardHandler = rootPath
    ? new ClipboardHandler(rootPath)
    : undefined;

  const copyCmd = vscode.commands.registerCommand(
    "context-bundler.copyToClipboard",
    () => {
      if (!clipboardHandler) {
        vscode.window.showWarningMessage("No workspace opened.");
        return;
      }
      const selected = treeProvider.getSelectedNodes();
      if (selected.length === 0) {
        vscode.window.showWarningMessage("No files selected.");
        return;
      }
      clipboardHandler.bundleAndCopyToClipboard(selected);
    }
  );

  const debugCmd = vscode.commands.registerCommand(
    "context-bundler.debugSettings",
    () => {
      const config = vscode.workspace.getConfiguration("contextBundler");
      const showIgnoredNodes = config.get("showIgnoredNodes", false);
      vscode.window.showInformationMessage(
        `Context Bundler Settings:\n- Show Ignored Nodes: ${showIgnoredNodes}\n- Workspace Root: ${
          rootPath || "None"
        }`
      );
      console.log("Context Bundler Debug Info:", {
        showIgnoredNodes,
        workspaceRoot: rootPath,
        hasIgnoreManager: !!treeProvider["ignoreManager"],
      });
    }
  );

  const watcher = rootPath
    ? vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(rootPath, "**/*")
      )
    : undefined;
  watcher?.onDidCreate(() => treeProvider.refresh());
  watcher?.onDidDelete(() => treeProvider.refresh());
  watcher?.onDidChange(() => treeProvider.refresh());

  // Listen for configuration changes to refresh the tree
  const configChangeListener = vscode.workspace.onDidChangeConfiguration(
    (event) => {
      if (event.affectsConfiguration("contextBundler.showIgnoredNodes")) {
        treeProvider.refresh();
      }
    }
  );

  if (watcher) {
    context.subscriptions.push(watcher);
  }
  context.subscriptions.push(
    copyCmd,
    toggleCmd,
    debugCmd,
    treeView,
    configChangeListener
  );
}

export function deactivate() {}
