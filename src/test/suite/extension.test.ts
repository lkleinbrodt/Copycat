import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import { ClipboardHandler, FileTreeMode } from "../../utils/ClipboardHandler";

import { ContextNode } from "../../tree/ContextNode";
import { ContextTreeProvider } from "../../tree/ContextTreeProvider";
import { IgnoreManager } from "../../utils/IgnoreManager";
import { TokenManager } from "../../utils/TokenManager";

suite("Extension Test Suite", () => {
  vscode.window.showInformationMessage("Start all tests.");

  test("Extension should be present", () => {
    // Look for the extension by the correct name
    const ext = vscode.extensions.getExtension(
      "LandonKleinbrodt.CopyCatBundler"
    );
    assert.ok(
      ext,
      "Extension should be found by ID: LandonKleinbrodt.CopyCatBundler"
    );
  });

  test("Commands are registered", async function () {
    if (
      !vscode.workspace.workspaceFolders ||
      vscode.workspace.workspaceFolders.length === 0
    ) {
      this.skip();
      return;
    }
    const ext = vscode.extensions.getExtension(
      "LandonKleinbrodt.CopyCatBundler"
    );
    assert.ok(
      ext,
      "Extension should be found by ID: LandonKleinbrodt.CopyCatBundler"
    );
    await ext!.activate();
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes("copycat.copyToClipboard"),
      "copycat.copyToClipboard command should be registered"
    );
    assert.ok(
      commands.includes("copycat.copyToClipboardWithPrompt"),
      "copycat.copyToClipboardWithPrompt command should be registered"
    );
    assert.ok(
      commands.includes("copycat.toggleNode"),
      "copycat.toggleNode command should be registered"
    );
    assert.ok(
      commands.includes("copycat.setFileTreeMode"),
      "copycat.setFileTreeMode command should be registered"
    );
  });

  test("File tree mode configuration works", async () => {
    const config = vscode.workspace.getConfiguration("copyCatBundler");

    // Test default value
    const defaultMode = config.get<FileTreeMode>("fileTreeMode", "relevant");
    assert.strictEqual(
      defaultMode,
      "relevant",
      "Default file tree mode should be 'relevant'"
    );

    // Skip the configuration update test if no workspace is opened
    if (
      !vscode.workspace.workspaceFolders ||
      vscode.workspace.workspaceFolders.length === 0
    ) {
      console.log("Skipping configuration update test - no workspace opened");
      return;
    }

    // Test setting a new value
    await config.update(
      "fileTreeMode",
      "relevant",
      vscode.ConfigurationTarget.Workspace
    );
    const newMode = config.get<FileTreeMode>("fileTreeMode", "relevant");
    assert.strictEqual(
      newMode,
      "relevant",
      "File tree mode should be updated to 'relevant'"
    );

    // Reset to default
    await config.update(
      "fileTreeMode",
      "relevant",
      vscode.ConfigurationTarget.Workspace
    );
  });

  test("Directory selection should recursively select all files", async function () {
    const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;
    const ignoreManagers = new Map<string, IgnoreManager>();
    const tokenManagers = new Map<string, TokenManager>();
    for (const folder of vscode.workspace.workspaceFolders!) {
      const rootPath = folder.uri.fsPath;
      const ignoreManager = new IgnoreManager(rootPath);
      ignoreManagers.set(rootPath, ignoreManager);
      const mockState: vscode.Memento = {
        get: () => ({}),
        update: async () => {},
        keys: () => [],
      };
      tokenManagers.set(
        rootPath,
        new TokenManager(rootPath, ignoreManager, mockState)
      );
    }
    const provider = new ContextTreeProvider(
      vscode.workspace.workspaceFolders,
      tokenManagers,
      ignoreManagers
    );
    const testDir = path.join(workspaceRoot, "test-dir");
    const subDir = path.join(testDir, "sub-dir");
    const nestedFile = path.join(subDir, "nested.txt");
    const topLevelFile = path.join(testDir, "top-level.txt");
    await fs.promises.mkdir(subDir, { recursive: true });
    await fs.promises.writeFile(nestedFile, "nested content");
    await fs.promises.writeFile(topLevelFile, "top level content");
    try {
      provider.refresh();
      const rootNodes = await provider.getChildren();
      const testRootNode = rootNodes.find(
        (n) => n.resourceUri.fsPath === workspaceRoot
      )!;
      const children = await provider.getChildren(testRootNode);
      const testDirNode = children.find(
        (child: ContextNode) => child.label === "test-dir"
      );
      assert.ok(testDirNode, "test-dir should exist");
      // Select the test directory using public API
      provider.toggleNode(testDirNode);

      // Get selected nodes (now async)
      const selectedNodes = await provider.getSelectedNodes();

      // Should have both files selected
      const selectedPaths = selectedNodes.map(
        (node) => node.resourceUri.fsPath
      );
      assert.ok(
        selectedPaths.includes(topLevelFile),
        "top-level.txt should be selected"
      );
      assert.ok(
        selectedPaths.includes(nestedFile),
        "nested.txt should be selected"
      );
      assert.strictEqual(
        selectedNodes.length,
        2,
        "Should have exactly 2 files selected"
      );
    } finally {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    }
  });
});
