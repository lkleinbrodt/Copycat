import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import { ContextNode } from "../../tree/ContextNode";
import { ContextTreeProvider } from "../../tree/ContextTreeProvider";

suite("Extension Test Suite", () => {
  vscode.window.showInformationMessage("Start all tests.");

  test("Extension should be present", () => {
    const ext = vscode.extensions.getExtension("LandonKleinbrodt.copycat");
    assert.ok(ext);
  });

  test("Commands are registered", async () => {
    const ext = vscode.extensions.getExtension("LandonKleinbrodt.copycat");
    assert.ok(ext);
    await ext!.activate();
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("copycat.copyToClipboard"));
    assert.ok(commands.includes("copycat.copyToClipboardWithPrompt"));
    assert.ok(commands.includes("copycat.toggleNode"));
  });

  test("Directory selection should recursively select all files", async function () {
    if (
      !vscode.workspace.workspaceFolders ||
      vscode.workspace.workspaceFolders.length === 0
    ) {
      this.skip();
      return;
    }
    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const provider = new ContextTreeProvider(workspaceRoot);

    // Create a test directory structure
    const testDir = path.join(workspaceRoot, "test-dir");
    const subDir = path.join(testDir, "sub-dir");
    const nestedFile = path.join(subDir, "nested.txt");
    const topLevelFile = path.join(testDir, "top-level.txt");

    // Create directories and files
    await fs.promises.mkdir(testDir, { recursive: true });
    await fs.promises.mkdir(subDir, { recursive: true });
    await fs.promises.writeFile(nestedFile, "nested content");
    await fs.promises.writeFile(topLevelFile, "top level content");

    try {
      // Get the root node and find our test directory
      const rootUri = vscode.Uri.file(workspaceRoot);
      const rootStat = await vscode.workspace.fs.stat(rootUri);
      const rootNode = await (provider as any).createNode(rootUri, rootStat);
      const children = await (provider as any).getDirectoryChildren(rootNode);

      const testDirNode = children.find(
        (child: ContextNode) => child.label === "test-dir"
      );
      assert.ok(testDirNode, "test-dir should exist");

      // Select the test directory
      (provider as any).setNodeState(testDirNode, "checked");

      // Get selected nodes
      const selectedNodes = provider.getSelectedNodes();

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
      // Clean up
      await fs.promises.rm(testDir, { recursive: true, force: true });
    }
  });
});
