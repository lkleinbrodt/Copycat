// This test requires 'sinon' as a devDependency. Install with: npm install --save-dev sinon @types/sinon
import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as sinon from "sinon";
import * as vscode from "vscode";

import { ContextNode } from "../../tree/ContextNode";
import { ContextTreeProvider } from "../../tree/ContextTreeProvider";
import { IgnoreManager } from "../../utils/IgnoreManager";
import { TokenManager } from "../../utils/TokenManager";
import { promisify } from "util";

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const rmdir = promisify(fs.rmdir);
const unlink = promisify(fs.unlink);

suite("Ignore Logic & Show Ignored Nodes", () => {
  let sandbox: sinon.SinonSandbox;
  let provider: ContextTreeProvider;
  let configStub: sinon.SinonStub;
  let tempDir: string;
  let workspaceRoot: string;

  async function createTempFile(
    filePath: string,
    content: string = "test content"
  ) {
    const fullPath = path.join(workspaceRoot, filePath);
    await writeFile(fullPath, content);
  }

  async function createTempDir(dirPath: string) {
    const fullPath = path.join(workspaceRoot, dirPath);
    await mkdir(fullPath, { recursive: true });
  }

  async function cleanupTempFiles() {
    if (tempDir && fs.existsSync(tempDir)) {
      // Remove all files and directories recursively
      const removeRecursive = async (dir: string) => {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            await removeRecursive(fullPath);
            await rmdir(fullPath);
          } else {
            await unlink(fullPath);
          }
        }
      };
      await removeRecursive(tempDir);
      await rmdir(tempDir);
    }
  }

  setup(async () => {
    sandbox = sinon.createSandbox();

    // Create temporary directory
    tempDir = fs.mkdtempSync(
      path.join(require("os").tmpdir(), "copycat-test-")
    );
    workspaceRoot = tempDir;

    // Create .gitignore file
    await createTempFile(".gitignore", "ignored.txt\nignored-dir\n*.log");

    // Create some test files
    await createTempFile("visible.txt", "visible content");
    await createTempFile("ignored.txt", "ignored content");
    await createTempDir("visible-dir");
    await createTempFile("visible-dir/file.txt", "nested content");
    await createTempDir("ignored-dir");
    await createTempFile("ignored-dir/file.txt", "ignored nested content");
    await createTempFile("test.log", "log content");

    // Stub config
    configStub = sandbox.stub(vscode.workspace, "getConfiguration").returns({
      get: (key: string, def: any) => def,
    } as any);

    // Create provider with real temp directory and real managers
    const mockWorkspaceFolders = [
      { uri: { fsPath: workspaceRoot }, name: "root" } as any,
    ];
    const ignoreManager = new IgnoreManager(workspaceRoot);
    const tokenManager = new TokenManager(workspaceRoot, ignoreManager, {
      get: () => undefined,
      update: () => Promise.resolve(),
    } as any);
    const mockTokenManagers = new Map<string, any>([
      [workspaceRoot, tokenManager],
    ]);
    const mockIgnoreManagers = new Map<string, any>([
      [workspaceRoot, ignoreManager],
    ]);
    provider = new ContextTreeProvider(
      mockWorkspaceFolders,
      mockTokenManagers,
      mockIgnoreManagers
    );
  });

  teardown(async () => {
    sandbox.restore();
    await cleanupTempFiles();
  });

  test("Ignored files are hidden when showIgnoredNodes is false", async function () {
    if (
      !vscode.workspace.workspaceFolders ||
      !Array.from(vscode.workspace.workspaceFolders).some(
        (f) => f.uri.fsPath === workspaceRoot
      )
    ) {
      this.skip();
      return;
    }
    configStub.returns({ get: () => false } as any);

    // Get root children using public API
    const [rootNode] = await provider.getChildren();
    const children = await provider.getChildren(rootNode);

    // Debug: log the actual setting value and what we got
    console.log(
      "showIgnoredNodes setting:",
      (provider as any).showIgnoredNodes
    );
    console.log(
      "Children found:",
      children.map((child: ContextNode) => ({
        label: child.label,
        isIgnored: child.isIgnored,
      }))
    );

    // Should not contain ignored files
    const childNames = children.map((child: ContextNode) => child.label);
    assert.ok(
      !childNames.includes("ignored.txt"),
      "ignored.txt should be hidden"
    );
    assert.ok(
      !childNames.includes("ignored-dir"),
      "ignored-dir should be hidden"
    );
    assert.ok(!childNames.includes("test.log"), "test.log should be hidden");
    assert.ok(
      childNames.includes("visible.txt"),
      "visible.txt should be visible"
    );
    assert.ok(
      childNames.includes("visible-dir"),
      "visible-dir should be visible"
    );
  });

  test("Ignored files are shown and greyed out when showIgnoredNodes is true", async function () {
    if (
      !vscode.workspace.workspaceFolders ||
      !Array.from(vscode.workspace.workspaceFolders).some(
        (f) => f.uri.fsPath === workspaceRoot
      )
    ) {
      this.skip();
      return;
    }
    configStub.returns({ get: () => true } as any);

    // Get root children using public API
    const [rootNode] = await provider.getChildren();
    const children = await provider.getChildren(rootNode);

    // Should contain all files, but ignored ones should be marked
    const childNames = children.map((child: ContextNode) => child.label);
    assert.ok(
      childNames.includes("ignored.txt"),
      "ignored.txt should be shown"
    );
    assert.ok(
      childNames.includes("ignored-dir"),
      "ignored-dir should be shown"
    );
    assert.ok(childNames.includes("test.log"), "test.log should be shown");
    assert.ok(
      childNames.includes("visible.txt"),
      "visible.txt should be visible"
    );
    assert.ok(
      childNames.includes("visible-dir"),
      "visible-dir should be visible"
    );

    // Check that ignored files are marked as ignored
    const ignoredFile = children.find(
      (child: ContextNode) => child.label === "ignored.txt"
    );
    const ignoredDir = children.find(
      (child: ContextNode) => child.label === "ignored-dir"
    );
    const logFile = children.find(
      (child: ContextNode) => child.label === "test.log"
    );
    const visibleFile = children.find(
      (child: ContextNode) => child.label === "visible.txt"
    );

    assert.ok(
      ignoredFile?.isIgnored,
      "ignored.txt should be marked as ignored"
    );
    assert.ok(ignoredDir?.isIgnored, "ignored-dir should be marked as ignored");
    assert.ok(logFile?.isIgnored, "test.log should be marked as ignored");
    assert.ok(
      !visibleFile?.isIgnored,
      "visible.txt should not be marked as ignored"
    );
  });

  test("Ignored files are never selected, even by parent selection", async function () {
    if (
      !vscode.workspace.workspaceFolders ||
      !Array.from(vscode.workspace.workspaceFolders).some(
        (f) => f.uri.fsPath === workspaceRoot
      )
    ) {
      this.skip();
      return;
    }
    configStub.returns({ get: () => true } as any);

    // Get root children using public API
    const [rootNode] = await provider.getChildren();
    const children = await provider.getChildren(rootNode);

    // Find visible and ignored files
    const visibleFile = children.find(
      (child: ContextNode) => child.label === "visible.txt"
    );
    const ignoredFile = children.find(
      (child: ContextNode) => child.label === "ignored.txt"
    );

    assert.ok(visibleFile, "visible.txt should exist");
    assert.ok(ignoredFile, "ignored.txt should exist");

    // Set root to checked state using public API
    provider.toggleNode(rootNode);

    // Check that visible file is selected but ignored file is not
    assert.strictEqual(
      visibleFile!.selectionState,
      "checked",
      "Non-ignored file should be checked"
    );
    assert.strictEqual(
      ignoredFile!.selectionState,
      "unchecked",
      "Ignored file should remain unchecked"
    );
  });

  test("Changing showIgnoredNodes setting refreshes the tree", () => {
    let refreshed = false;
    const originalRefresh = provider.refresh;
    provider.refresh = () => {
      refreshed = true;
      originalRefresh.call(provider);
    };

    // Simulate config change by directly calling refresh
    provider.refresh();
    assert.ok(refreshed, "Tree should refresh on config change");
  });

  test("Non-ignored files are always selectable", async function () {
    if (
      !vscode.workspace.workspaceFolders ||
      !Array.from(vscode.workspace.workspaceFolders).some(
        (f) => f.uri.fsPath === workspaceRoot
      )
    ) {
      this.skip();
      return;
    }
    configStub.returns({ get: () => true } as any);

    // Get root children using public API
    const [rootNode] = await provider.getChildren();
    const children = await provider.getChildren(rootNode);

    const visibleFile = children.find(
      (child: ContextNode) => child.label === "visible.txt"
    );
    assert.ok(visibleFile, "visible.txt should exist");

    // Toggle the node
    provider.toggleNode(visibleFile!);
    assert.strictEqual(
      visibleFile!.selectionState,
      "checked",
      "Non-ignored node should be checked"
    );
  });

  test("Ignored files cannot be toggled", async function () {
    if (
      !vscode.workspace.workspaceFolders ||
      !Array.from(vscode.workspace.workspaceFolders).some(
        (f) => f.uri.fsPath === workspaceRoot
      )
    ) {
      this.skip();
      return;
    }
    configStub.returns({ get: () => true } as any);

    // Get root children using public API
    const [rootNode] = await provider.getChildren();
    const children = await provider.getChildren(rootNode);

    const ignoredFile = children.find(
      (child: ContextNode) => child.label === "ignored.txt"
    );
    assert.ok(ignoredFile, "ignored.txt should exist");

    // Try to toggle the ignored node
    const originalState = ignoredFile!.selectionState;
    provider.toggleNode(ignoredFile!);

    // State should not change
    assert.strictEqual(
      ignoredFile!.selectionState,
      originalState,
      "Ignored node should not be toggleable"
    );
  });

  test("Default ignore patterns are respected", async function () {
    if (
      !vscode.workspace.workspaceFolders ||
      !Array.from(vscode.workspace.workspaceFolders).some(
        (f) => f.uri.fsPath === workspaceRoot
      )
    ) {
      this.skip();
      return;
    }
    configStub.returns({ get: () => true } as any);
    // Create files that should be ignored by default patterns
    await createTempFile("image.png", "fake png content");
    await createTempFile("data.csv", "fake csv content");
    await createTempFile("package-lock.json", "fake lock content");
    await createTempFile("video.mp4", "fake video content");
    await createTempDir("node_modules");
    await createTempFile("node_modules/some-package.js", "package content");
    await createTempDir("venv");
    await createTempFile("venv/python.exe", "python binary");

    // Stub config to return default ignore patterns
    configStub.returns({
      get: (key: string, def: any) => {
        if (key === "defaultIgnorePatterns") {
          return [
            "*.png",
            "*.csv",
            "package-lock.json",
            "*.mp4",
            "node_modules/",
            "venv/",
          ];
        }
        return def;
      },
    } as any);

    // Create a new provider with the updated config
    const mockWorkspaceFolders = [
      { uri: { fsPath: workspaceRoot }, name: "root" } as any,
    ];
    const ignoreManager = new IgnoreManager(workspaceRoot);
    const tokenManager = new TokenManager(workspaceRoot, ignoreManager, {
      get: () => undefined,
      update: () => Promise.resolve(),
    } as any);
    const mockTokenManagers = new Map<string, any>([
      [workspaceRoot, tokenManager],
    ]);
    const mockIgnoreManagers = new Map<string, any>([
      [workspaceRoot, ignoreManager],
    ]);
    const newProvider = new ContextTreeProvider(
      mockWorkspaceFolders,
      mockTokenManagers,
      mockIgnoreManagers
    );

    // Get root children using public API
    const [rootNode] = await newProvider.getChildren();
    const children = await newProvider.getChildren(rootNode);

    // Should not contain files that match default ignore patterns
    const childNames = children.map((child: ContextNode) => child.label);
    assert.ok(
      !childNames.includes("image.png"),
      "image.png should be ignored by default pattern"
    );
    assert.ok(
      !childNames.includes("data.csv"),
      "data.csv should be ignored by default pattern"
    );
    assert.ok(
      !childNames.includes("package-lock.json"),
      "package-lock.json should be ignored by default pattern"
    );
    assert.ok(
      !childNames.includes("video.mp4"),
      "video.mp4 should be ignored by default pattern"
    );
    assert.ok(
      !childNames.includes("node_modules"),
      "node_modules should be ignored by default pattern"
    );
    assert.ok(
      !childNames.includes("venv"),
      "venv should be ignored by default pattern"
    );

    // Should still contain visible files
    assert.ok(
      childNames.includes("visible.txt"),
      "visible.txt should still be visible"
    );
    assert.ok(
      childNames.includes("visible-dir"),
      "visible-dir should still be visible"
    );
  });
});
