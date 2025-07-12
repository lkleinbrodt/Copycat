import * as vscode from "vscode";

import { ClipboardHandler, FileTreeMode } from "./utils/ClipboardHandler";

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
  const treeView = vscode.window.createTreeView("copyCatBundlerView", {
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
    async () => {
      if (!clipboardHandler) {
        vscode.window.showWarningMessage("No workspace opened.");
        return;
      }
      const selected = await treeProvider.getSelectedNodes();
      if (selected.length === 0) {
        vscode.window.showWarningMessage("No files selected.");
        return;
      }
      await clipboardHandler.bundleAndCopyToClipboard(selected);
    }
  );

  const copyWithPromptCmd = vscode.commands.registerCommand(
    "copycat.copyToClipboardWithPrompt",
    async () => {
      if (!clipboardHandler) {
        vscode.window.showWarningMessage("No workspace opened.");
        return;
      }
      const selected = await treeProvider.getSelectedNodes();
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
      const config = vscode.workspace.getConfiguration("copyCatBundler");
      const systemPrompt = config.get<string>("systemPrompt", "");

      if (prompt) {
        await clipboardHandler.bundleAndCopyToClipboard(
          selected,
          prompt,
          systemPrompt
        );
      }
    }
  );

  // File tree mode commands
  const setFileTreeModeCmd = vscode.commands.registerCommand(
    "copycat.setFileTreeMode",
    async () => {
      const config = vscode.workspace.getConfiguration("copyCatBundler");
      const currentMode = config.get<FileTreeMode>("fileTreeMode", "relevant");

      const mode = await vscode.window.showQuickPick(
        [
          {
            label: "Full Tree",
            description: "Include complete project structure",
            value: "full" as FileTreeMode,
          },
          {
            label: "Relevant Tree",
            description: "Include only selected files and folders",
            value: "relevant" as FileTreeMode,
          },
          {
            label: "No Tree",
            description: "Exclude file tree entirely",
            value: "none" as FileTreeMode,
          },
        ],
        {
          placeHolder: `Current: ${
            currentMode === "full"
              ? "Full Tree"
              : currentMode === "relevant"
              ? "Relevant Tree"
              : "No Tree"
          }`,
          canPickMany: false,
        }
      );

      if (mode) {
        await config.update(
          "fileTreeMode",
          mode.value,
          vscode.ConfigurationTarget.Workspace
        );
        const modeText =
          mode.value === "full"
            ? "Full Tree"
            : mode.value === "relevant"
            ? "Relevant Tree"
            : "No Tree";
        vscode.window.showInformationMessage(
          `File tree mode set to: ${modeText}`
        );
      }
    }
  );

  const setSystemPromptCmd = vscode.commands.registerCommand(
    "copycat.setSystemPrompt",
    async () => {
      const config = vscode.workspace.getConfiguration("copyCatBundler");
      const currentPrompt = config.get<string>("systemPrompt", "");

      const presets = [
        {
          label: "Planner",
          description:
            "Generate detailed step-by-step plans for AI coding agents",
          value:
            "You are a senior software architect and planning expert. Your role is to analyze the provided codebase and user request, then generate a comprehensive, detailed step-by-step plan that an AI coding agent can follow to accomplish the task.\n\nYour plan must include:\n1. **Context Analysis**: Summarize the relevant codebase structure, patterns, and technologies\n2. **Objective Breakdown**: Clearly define what needs to be accomplished\n3. **Detailed Steps**: Provide specific, actionable steps with file paths, function names, and implementation details\n4. **Dependencies**: Identify any new dependencies, imports, or setup requirements\n5. **Testing Strategy**: Suggest how to verify the implementation works correctly\n6. **Edge Cases**: Consider potential issues and how to handle them\n\nRemember: The coding agent will only have access to the files you've selected, so provide all necessary context and be extremely specific about what needs to be done.",
        },
        {
          label: "Custom...",
          description: "Enter your own system prompt",
          value: "CUSTOM",
        },
        {
          label: "Clear",
          description: "Remove system prompt",
          value: "",
        },
      ];

      const selected = await vscode.window.showQuickPick(presets, {
        placeHolder: `Current: ${
          currentPrompt ? `${currentPrompt.substring(0, 50)}...` : "None set"
        }`,
        canPickMany: false,
      });

      if (selected) {
        let finalPrompt = selected.value;

        if (selected.value === "CUSTOM") {
          const customPrompt = await vscode.window.showInputBox({
            prompt: "Enter your custom system prompt",
            placeHolder: "You are a...",
            value: currentPrompt,
            validateInput: (value) => {
              if (value && value.length > 2000) {
                return "System prompt should be under 2000 characters";
              }
              return null;
            },
          });

          if (customPrompt === undefined) {
            return; // User cancelled
          }
          finalPrompt = customPrompt;
        }

        await config.update(
          "systemPrompt",
          finalPrompt,
          vscode.ConfigurationTarget.Workspace
        );

        const action = finalPrompt ? "updated" : "cleared";
        vscode.window.showInformationMessage(
          `System prompt ${action}! ${
            finalPrompt ? `(${finalPrompt.length} characters)` : ""
          }`
        );
      }
    }
  );

  const debugCmd = vscode.commands.registerCommand(
    "copycat.debugSettings",
    () => {
      const config = vscode.workspace.getConfiguration("copyCatBundler");
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
      if (event.affectsConfiguration("copyCatBundler.showIgnoredNodes")) {
        treeProvider.refresh();
      }

      // Handle changes to default ignore patterns
      if (event.affectsConfiguration("copyCatBundler.defaultIgnorePatterns")) {
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
    setFileTreeModeCmd,
    setSystemPromptCmd,
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
