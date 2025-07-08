import * as vscode from "vscode";

import { ClipboardHandler } from "./utils/ClipboardHandler";
import { ContextTreeProvider } from "./tree/ContextTreeProvider";
import { IgnoreManager } from "./utils/IgnoreManager";
import { TokenFormatter } from "./utils/TokenFormatter";
import { TokenManager } from "./utils/TokenManager";

export function activate(context: vscode.ExtensionContext) {
  console.log('Extension "copycat" is now active!');

  const rootPath =
    vscode.workspace.workspaceFolders &&
    vscode.workspace.workspaceFolders.length > 0
      ? vscode.workspace.workspaceFolders[0].uri.fsPath
      : undefined;

  // Initialize TokenManager if we have a workspace
  let tokenManager: TokenManager | undefined;
  let ignoreManager: IgnoreManager | undefined;
  if (rootPath) {
    ignoreManager = new IgnoreManager(rootPath);
    tokenManager = new TokenManager(
      rootPath,
      ignoreManager,
      context.workspaceState
    );

    // Start background indexing
    tokenManager.startBackgroundIndexing();
  }

  const treeProvider = new ContextTreeProvider(rootPath, tokenManager);
  const treeView = vscode.window.createTreeView("contextBundlerView", {
    treeDataProvider: treeProvider,
  });
  treeProvider.onSelectionChange((total) => {
    treeView.description = `~${TokenFormatter.formatTokens(total)} selected`;
  });

  const toggleCmd = vscode.commands.registerCommand(
    "copycat.toggleNode",
    (node: any) => {
      treeProvider.toggleNode(node);
    }
  );

  const clipboardHandler = rootPath
    ? new ClipboardHandler(rootPath)
    : undefined;

  const copyCmd = vscode.commands.registerCommand(
    "copycat.copyToClipboard",
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

  const copyWithPromptCmd = vscode.commands.registerCommand(
    "copycat.copyToClipboardWithPrompt",
    async () => {
      if (!clipboardHandler) {
        vscode.window.showWarningMessage("No workspace opened.");
        return;
      }
      const selected = treeProvider.getSelectedNodes();
      if (selected.length === 0) {
        vscode.window.showWarningMessage("No files selected.");
        return;
      }

      // Prompt the user for input
      const prompt = await vscode.window.showInputBox({
        prompt: "Enter your request or feature description",
        placeHolder: "e.g., Add a new feature to handle user authentication",
        value: "",
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return "Please enter a request or description";
          }
          return null;
        },
      });

      // Get system prompt from settings
      const config = vscode.workspace.getConfiguration("contextBundler");
      const systemPrompt = config.get<string>("systemPrompt", "");

      if (prompt) {
        clipboardHandler.bundleAndCopyToClipboard(
          selected,
          prompt,
          systemPrompt
        );
      }
    }
  );

  const debugCmd = vscode.commands.registerCommand(
    "copycat.debugSettings",
    () => {
      const config = vscode.workspace.getConfiguration("contextBundler");
      const showIgnoredNodes = config.get("showIgnoredNodes", false);
      const defaultIgnorePatterns = config.get<string[]>(
        "defaultIgnorePatterns",
        []
      );

      let message = `CopyCat Settings:\n- Show Ignored Nodes: ${showIgnoredNodes}\n- Default Ignore Patterns: ${
        defaultIgnorePatterns.length
      } patterns\n- Workspace Root: ${rootPath || "None"}`;

      if (tokenManager) {
        const stats = tokenManager.getCacheStats();
        message += `\n\nToken Manager Stats:\n- Total Files: ${stats.total}\n- Indexed: ${stats.indexed}\n- Pending: ${stats.pending}`;

        // Show some example token formatting
        message += `\n\nToken Formatting Examples:\n- 847 → ${TokenFormatter.formatTokens(
          847
        )}\n- 1500 → ${TokenFormatter.formatTokens(
          1500
        )}\n- 601409 → ${TokenFormatter.formatTokens(601409)}`;
      }

      // Show first few default ignore patterns as examples
      if (defaultIgnorePatterns.length > 0) {
        const examples = defaultIgnorePatterns.slice(0, 5).join(", ");
        message += `\n\nDefault Ignore Pattern Examples:\n${examples}${
          defaultIgnorePatterns.length > 5 ? "..." : ""
        }`;
      }

      vscode.window.showInformationMessage(message);
      console.log("CopyCat Debug Info:", {
        showIgnoredNodes,
        defaultIgnorePatterns: defaultIgnorePatterns.length,
        workspaceRoot: rootPath,
        hasIgnoreManager: !!treeProvider["ignoreManager"],
        tokenManagerStats: tokenManager?.getCacheStats(),
      });
    }
  );

  const clearCacheCmd = vscode.commands.registerCommand(
    "copycat.clearCache",
    async () => {
      if (!tokenManager) {
        vscode.window.showWarningMessage("No workspace opened.");
        return;
      }

      tokenManager.clearCache();
      await tokenManager.startBackgroundIndexing();
      vscode.window.showInformationMessage(
        "Token cache cleared and re-indexing started."
      );
    }
  );

  const watcher = rootPath
    ? vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(rootPath, "**/*")
      )
    : undefined;

  // Enhanced file watchers that update TokenManager
  watcher?.onDidCreate((uri) => {
    if (tokenManager) {
      tokenManager.onFileCreated(uri.fsPath);
    } else {
      treeProvider.refresh();
    }
  });

  watcher?.onDidDelete((uri) => {
    if (tokenManager) {
      tokenManager.onFileDeleted(uri.fsPath);
    } else {
      treeProvider.refresh();
    }
  });

  watcher?.onDidChange((uri) => {
    if (tokenManager) {
      tokenManager.onFileChanged(uri.fsPath);
    } else {
      treeProvider.refresh();
    }
  });

  // Listen for configuration changes to refresh the tree
  const configChangeListener = vscode.workspace.onDidChangeConfiguration(
    (event) => {
      if (event.affectsConfiguration("contextBundler.showIgnoredNodes")) {
        treeProvider.refresh();
      }

      // Handle changes to default ignore patterns
      if (event.affectsConfiguration("contextBundler.defaultIgnorePatterns")) {
        if (ignoreManager) {
          ignoreManager.reloadRules();
          // Clear token cache and re-index since ignore rules changed
          if (tokenManager) {
            tokenManager.clearCache();
            tokenManager.startBackgroundIndexing();
          }
        }
        treeProvider.refresh();
      }
    }
  );

  if (watcher) {
    context.subscriptions.push(watcher);
  }
  context.subscriptions.push(
    copyCmd,
    copyWithPromptCmd,
    toggleCmd,
    debugCmd,
    clearCacheCmd,
    treeView,
    configChangeListener
  );
}

export function deactivate() {
  // Clean up TokenManager resources if needed
}
