import * as assert from "assert";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

import { ClipboardHandler } from "../../utils/ClipboardHandler";
import { ContextTreeProvider } from "../../tree/ContextTreeProvider";
import { IgnoreManager } from "../../utils/IgnoreManager";
import { TokenManager } from "../../utils/TokenManager";

suite("Multi-Root Workspace Test Suite", () => {
  // Get the workspace folders provided by the test runner
  const wsFolders = vscode.workspace.workspaceFolders!;
  const projectAPath = wsFolders[0].uri.fsPath;
  const projectBPath = wsFolders[1].uri.fsPath;

  // Pre-populate the workspaces with files for the tests
  suiteSetup(async () => {
    await fs.writeFile(
      path.join(projectAPath, "fileA.ts"),
      'console.log("A");'
    );
    await fs.writeFile(path.join(projectAPath, ".gitignore"), "ignoredA.txt");
    await fs.writeFile(path.join(projectAPath, "ignoredA.txt"), "ignored");

    await fs.writeFile(
      path.join(projectBPath, "fileB.ts"),
      'console.log("B");'
    );
    await fs.writeFile(path.join(projectBPath, ".gitignore"), "ignoredB.txt");
    await fs.writeFile(path.join(projectBPath, "ignoredB.txt"), "ignored");
  });

  test("Tree provider should render multiple roots", async () => {
    assert.ok(wsFolders, "Workspace folders should be defined");
    assert.strictEqual(
      wsFolders.length,
      2,
      "Should have two workspace folders"
    );
    const provider = new ContextTreeProvider(wsFolders, new Map(), new Map());
    const topLevelNodes = await provider.getChildren();
    assert.strictEqual(
      topLevelNodes.length,
      2,
      "Tree provider should show two top-level nodes"
    );
    const labels = topLevelNodes.map((n) => n.label).sort();
    assert.deepStrictEqual(
      labels,
      [path.basename(projectAPath), path.basename(projectBPath)].sort()
    );
  });

  test("Ignore rules should be scoped to each root", async () => {
    const ignoreManagers = new Map();
    for (const folder of wsFolders) {
      ignoreManagers.set(
        folder.uri.fsPath,
        new IgnoreManager(folder.uri.fsPath)
      );
    }
    const provider = new ContextTreeProvider(
      wsFolders,
      new Map(),
      ignoreManagers
    );
    const topLevelNodes = await provider.getChildren();
    const projectANode = topLevelNodes.find(
      (n) => n.label === path.basename(projectAPath)
    )!;
    const projectAChildren = await provider.getChildren(projectANode);
    const fileA = projectAChildren.find((c) => c.label === "fileA.ts");
    const ignoredA = projectAChildren.find((c) => c.label === "ignoredA.txt");
    assert.ok(fileA, "fileA.ts should be visible");
    assert.ok(!fileA.isIgnored, "fileA.ts should not be ignored");
    const config = vscode.workspace.getConfiguration("copyCatBundler");
    await config.update(
      "showIgnoredNodes",
      true,
      vscode.ConfigurationTarget.Workspace
    );
    provider.refresh();
    const refreshedChildrenA = await provider.getChildren(projectANode);
    const ignoredANode = refreshedChildrenA.find(
      (c) => c.label === "ignoredA.txt"
    );
    assert.ok(
      ignoredANode?.isIgnored,
      "ignoredA.txt should be marked as ignored in Project A"
    );
    const projectBNode = topLevelNodes.find(
      (n) => n.label === path.basename(projectBPath)
    )!;
    const refreshedChildrenB = await provider.getChildren(projectBNode);
    const ignoredBNodeAsChildOfA = refreshedChildrenA.find(
      (c) => c.label === "ignoredB.txt"
    );
    assert.strictEqual(
      ignoredBNodeAsChildOfA,
      undefined,
      "Project B's ignored file should not appear in Project A"
    );
    await config.update(
      "showIgnoredNodes",
      false,
      vscode.ConfigurationTarget.Workspace
    );
  });

  test("Clipboard handler should format output correctly for multiple roots", async () => {
    // Use a mock clipboard for this test
    const sandbox = require("sinon").createSandbox();
    const mockClipboard = { writeText: sandbox.stub().resolves() };
    const handler = new ClipboardHandler(wsFolders, mockClipboard);
    const nodeA = new vscode.TreeItem(
      vscode.Uri.file(path.join(projectAPath, "fileA.ts"))
    );
    (nodeA as any).workspaceRoot = projectAPath;
    const nodeB = new vscode.TreeItem(
      vscode.Uri.file(path.join(projectBPath, "fileB.ts"))
    );
    (nodeB as any).workspaceRoot = projectBPath;
    await handler.bundleAndCopyToClipboard(
      [nodeA, nodeB] as any,
      undefined,
      undefined,
      "none"
    );
    const content = mockClipboard.writeText.getCall(0).args[0];
    // Only assert on the actual output format
    assert.ok(
      content.includes(`Project: ${path.basename(projectAPath)}`),
      "Output should contain Project A's header"
    );
    assert.ok(
      content.includes(`File: fileA.ts`),
      "Output should contain Project A's file"
    );
    assert.ok(
      content.includes(`console.log("A");`),
      "Output should contain Project A's content"
    );
    assert.ok(
      content.includes(`Project: ${path.basename(projectBPath)}`),
      "Output should contain Project B's header"
    );
    assert.ok(
      content.includes(`File: fileB.ts`),
      "Output should contain Project B's file"
    );
    assert.ok(
      content.includes(`console.log("B");`),
      "Output should contain Project B's content"
    );
  });
});
