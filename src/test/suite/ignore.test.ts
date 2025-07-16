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

suite("Ignore Logic & Show Ignored Nodes", () => {
  let sandbox: sinon.SinonSandbox;
  let provider: ContextTreeProvider;
  let configStub: {
    get: (key: string, def?: any) => any;
    update: () => Promise<void>;
    showIgnoredNodesValue: boolean;
  };

  // Use the first workspace folder provided by the test runner
  const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;

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

  setup(async () => {
    sandbox = sinon.createSandbox();

    // Create .gitignore and test files inside the first workspace folder
    await createTempFile(".gitignore", "ignored.txt\nignored-dir/\n*.log");
    await createTempFile("visible.txt", "visible content");
    await createTempFile("ignored.txt", "ignored content");
    await createTempDir("visible-dir");
    await createTempFile("visible-dir/file.txt", "nested content");
    await createTempDir("ignored-dir");
    await createTempFile("ignored-dir/file.txt", "ignored nested content");
    await createTempFile("test.log", "log content");

    configStub = {
      showIgnoredNodesValue: false,
      get: function (key: string, def?: any) {
        if (key === "showIgnoredNodes") return this.showIgnoredNodesValue;
        return def;
      },
      update: () => Promise.resolve(),
    };
    sandbox
      .stub(vscode.workspace, "getConfiguration")
      .returns(configStub as any);

    // Correctly instantiate the provider for a multi-root world
    const ignoreManagers = new Map<string, IgnoreManager>();
    const tokenManagers = new Map<string, TokenManager>();

    for (const folder of vscode.workspace.workspaceFolders!) {
      const rootPath = folder.uri.fsPath;
      const ignoreManager = new IgnoreManager(rootPath);
      ignoreManagers.set(rootPath, ignoreManager);

      // Mock workspace state for TokenManager
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

    provider = new ContextTreeProvider(
      vscode.workspace.workspaceFolders,
      tokenManagers,
      ignoreManagers
    );
  });

  teardown(() => {
    sandbox.restore();
    // No need to cleanup files, test runner will delete the temp workspace
  });

  test("Ignored files are hidden when showIgnoredNodes is false", async () => {
    configStub.showIgnoredNodesValue = false;
    provider.refresh();

    const [rootNode] = await provider.getChildren();
    const children = await provider.getChildren(rootNode);

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
  });

  test("Ignored files are shown and greyed out when showIgnoredNodes is true", async () => {
    configStub.showIgnoredNodesValue = true;
    provider.refresh();

    const [rootNode] = await provider.getChildren();
    const children = await provider.getChildren(rootNode);

    const ignoredFile = children.find(
      (child: ContextNode) => child.label === "ignored.txt"
    );
    assert.ok(
      ignoredFile?.isIgnored,
      "ignored.txt should be marked as ignored"
    );
  });

  test(".contextignore is respected", async () => {
    await createTempFile(".contextignore", "context-ignored.txt");
    await createTempFile("context-ignored.txt", "some content");

    // The IgnoreManager for this workspace needs to be reloaded
    const ignoreManager = (provider as any).ignoreManagers.get(workspaceRoot);
    ignoreManager.reloadRules();
    provider.refresh(); // Refresh to pick up new ignore file

    configStub.showIgnoredNodesValue = true;
    provider.refresh();

    const [rootNode] = await provider.getChildren();
    const children = await provider.getChildren(rootNode);

    const node = children.find(
      (child) => child.label === "context-ignored.txt"
    );
    assert.ok(node, "context-ignored.txt should be shown");
    assert.ok(
      node.isIgnored,
      "context-ignored.txt should be marked as ignored"
    );
  });
});
