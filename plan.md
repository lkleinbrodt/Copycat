Of course. Here is a comprehensive plan to expand your test suite, focusing on the new multi-directory functionality and filling existing gaps. This plan is designed to be followed by an AI agent or a developer to implement the necessary tests.

---

### Detailed Implementation Plan: Test Suite Expansion

#### Step 1: Configure the Test Runner for Multi-Root Workspaces

To properly test multi-root functionality, we need to launch the VS Code test instance with a multi-root workspace. We'll create a temporary workspace configuration file and tell our test runner to use it.

1.  **Create a temporary workspace file.** In your project's root, create a directory and file `test-fixtures/multi-root.code-workspace`. The test setup will dynamically replace placeholder paths.

    - **File:** `test-fixtures/multi-root.code-workspace`
      ```json
      {
        "folders": [
          {
            "path": "__PROJECT_A_PATH__"
          },
          {
            "path": "__PROJECT_B_PATH__"
          }
        ]
      }
      ```

2.  **Update the test runner script** to use this workspace file.

    - **File to modify:** `src/test/runTest.ts`
    - **Action:** Modify the `main` function to accept a workspace path. We will point this to our temporary workspace file during the test setup.

    ```typescript
    import * as path from "path";
    import { runTests } from "@vscode/test-electron";

    async function main() {
      try {
        const extensionDevelopmentPath = path.resolve(__dirname, "../../");
        const extensionTestsPath = path.resolve(__dirname, "./suite/index");

        // The path to the multi-root workspace file.
        // This will be prepared by the test setup logic.
        const workspacePath = path.resolve(
          extensionDevelopmentPath,
          "test-fixtures/test.code-workspace"
        );

        // Launch the test instance with the specified workspace.
        await runTests({
          extensionDevelopmentPath,
          extensionTestsPath,
          launchArgs: [workspacePath],
        });
      } catch (err) {
        console.error("Failed to run tests");
        process.exit(1);
      }
    }

    main();
    ```

---

#### Step 2: Create a New Test Suite for Multi-Root Workspaces

This suite will contain tests that specifically validate the multi-root behavior.

1.  **Create the new test file.**

    - **File to create:** `src/test/suite/multi-root.test.ts`

2.  **Add the test code.** This suite will set up two separate project directories, create the temporary `.code-workspace` file pointing to them, and then run tests against this environment.

    ```typescript
    import * as assert from "assert";
    import * as vscode from "vscode";
    import * as fs from "fs/promises";
    import * as path from "path";
    import * as os from "os";
    import { ContextTreeProvider } from "../../tree/ContextTreeProvider";
    import { ClipboardHandler } from "../../utils/ClipboardHandler";
    import { IgnoreManager } from "../../utils/IgnoreManager";
    import { TokenManager } from "../../utils/TokenManager";

    suite("Multi-Root Workspace Test Suite", () => {
      let projectAPath: string;
      let projectBPath: string;
      const workspaceFilePath = path.resolve(
        __dirname,
        "../../test-fixtures/test.code-workspace"
      );

      // Setup: Create two separate project directories
      suiteSetup(async () => {
        projectAPath = await fs.mkdtemp(
          path.join(os.tmpdir(), "copycat-test-a-")
        );
        projectBPath = await fs.mkdtemp(
          path.join(os.tmpdir(), "copycat-test-b-")
        );

        // Populate Project A
        await fs.writeFile(
          path.join(projectAPath, "fileA.ts"),
          'console.log("A");'
        );
        await fs.writeFile(
          path.join(projectAPath, ".gitignore"),
          "ignoredA.txt"
        );
        await fs.writeFile(path.join(projectAPath, "ignoredA.txt"), "ignored");

        // Populate Project B
        await fs.writeFile(
          path.join(projectBPath, "fileB.ts"),
          'console.log("B");'
        );
        await fs.writeFile(
          path.join(projectBPath, ".gitignore"),
          "ignoredB.txt"
        );
        await fs.writeFile(path.join(projectBPath, "ignoredB.txt"), "ignored");

        // Create the dynamic workspace file for the test runner
        const workspaceConfig = {
          folders: [{ path: projectAPath }, { path: projectBPath }],
        };
        await fs.writeFile(workspaceFilePath, JSON.stringify(workspaceConfig));
      });

      // Teardown: Clean up the directories and workspace file
      suiteTeardown(async () => {
        await fs.rm(projectAPath, { recursive: true, force: true });
        await fs.rm(projectBPath, { recursive: true, force: true });
        await fs.rm(workspaceFilePath, { force: true });
      });

      test("Tree provider should render multiple roots", async () => {
        assert.ok(
          vscode.workspace.workspaceFolders,
          "Workspace folders should be defined"
        );
        assert.strictEqual(
          vscode.workspace.workspaceFolders.length,
          2,
          "Should have two workspace folders"
        );

        const provider = new ContextTreeProvider(
          vscode.workspace.workspaceFolders,
          new Map(),
          new Map()
        );
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
        for (const folder of vscode.workspace.workspaceFolders!) {
          ignoreManagers.set(
            folder.uri.fsPath,
            new IgnoreManager(folder.uri.fsPath)
          );
        }
        const provider = new ContextTreeProvider(
          vscode.workspace.workspaceFolders,
          new Map(),
          ignoreManagers
        );
        const topLevelNodes = await provider.getChildren();
        const projectANode = topLevelNodes.find(
          (n) => n.label === path.basename(projectAPath)
        )!;
        const projectAChildren = await provider.getChildren(projectANode);

        const fileA = projectAChildren.find((c) => c.label === "fileA.ts");
        const ignoredA = projectAChildren.find(
          (c) => c.label === "ignoredA.txt"
        );

        assert.ok(fileA, "fileA.ts should be visible");
        assert.ok(!fileA.isIgnored, "fileA.ts should not be ignored");

        // We need to enable showIgnoredNodes to see the ignored file
        const config = vscode.workspace.getConfiguration("copyCatBundler");
        await config.update(
          "showIgnoredNodes",
          true,
          vscode.ConfigurationTarget.Workspace
        );
        provider.refresh(); // Manually refresh to apply config

        // Re-fetch children after config change and refresh
        const refreshedChildrenA = await provider.getChildren(projectANode);
        const ignoredANode = refreshedChildrenA.find(
          (c) => c.label === "ignoredA.txt"
        );
        assert.ok(
          ignoredANode?.isIgnored,
          "ignoredA.txt should be marked as ignored in Project A"
        );

        // Now check that Project B's ignore file doesn't affect Project A
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
        ); // Cleanup
      });

      test("Clipboard handler should format output correctly for multiple roots", async () => {
        const handler = new ClipboardHandler(
          vscode.workspace.workspaceFolders!
        );

        // Create dummy ContextNodes for selection
        const nodeA = new vscode.TreeItem(
          vscode.Uri.file(path.join(projectAPath, "fileA.ts"))
        );
        (nodeA as any).workspaceRoot = projectAPath;
        const nodeB = new vscode.TreeItem(
          vscode.Uri.file(path.join(projectBPath, "fileB.ts"))
        );
        (nodeB as any).workspaceRoot = projectBPath;

        // Mock clipboard to capture output
        let clipboardContent = "";
        const originalWriteText = vscode.env.clipboard.writeText;
        (vscode.env.clipboard as any).writeText = (text: string) => {
          clipboardContent = text;
          return Promise.resolve();
        };

        await handler.bundleAndCopyToClipboard(
          [nodeA, nodeB] as any,
          undefined,
          undefined,
          "none"
        );

        assert.ok(
          clipboardContent.includes(`Project: ${path.basename(projectAPath)}`),
          "Output should contain Project A's header"
        );
        assert.ok(
          clipboardContent.includes(`File: fileA.ts`),
          "Output should contain Project A's file"
        );
        assert.ok(
          clipboardContent.includes(`console.log("A");`),
          "Output should contain Project A's content"
        );

        assert.ok(
          clipboardContent.includes(`Project: ${path.basename(projectBPath)}`),
          "Output should contain Project B's header"
        );
        assert.ok(
          clipboardContent.includes(`File: fileB.ts`),
          "Output should contain Project B's file"
        );
        assert.ok(
          clipboardContent.includes(`console.log("B");`),
          "Output should contain Project B's content"
        );

        // Restore clipboard
        (vscode.env.clipboard as any).writeText = originalWriteText;
      });
    });
    ```

---

#### Step 3: Create a Dedicated `ClipboardHandler` Test Suite

This new suite will focus exclusively on the output format generated by `ClipboardHandler`, which is currently untested.

1.  **Create the new test file.**

    - **File to create:** `src/test/suite/clipboard-handler.test.ts`

2.  **Add the test code.**

    ````typescript
    import * as assert from "assert";
    import * as vscode from "vscode";
    import * as fs from "fs/promises";
    import * as path from "path";
    import * as os from "os";
    import { ClipboardHandler } from "../../utils/ClipboardHandler";
    import { ContextNode } from "../../tree/ContextNode";

    suite("ClipboardHandler Test Suite", () => {
      let tempDir: string;
      let handler: ClipboardHandler;
      let selectedNodes: ContextNode[];

      // Setup a single-root workspace for these tests
      suiteSetup(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "copycat-ch-test-"));
        const subDir = path.join(tempDir, "src");
        await fs.mkdir(subDir);
        await fs.writeFile(path.join(tempDir, "README.md"), "# Test Project");
        await fs.writeFile(
          path.join(subDir, "index.ts"),
          'console.log("hello");'
        );

        const wsFolders = [
          {
            uri: vscode.Uri.file(tempDir),
            name: path.basename(tempDir),
            index: 0,
          },
        ];
        handler = new ClipboardHandler(wsFolders);

        // Create dummy nodes
        const readmeUri = vscode.Uri.file(path.join(tempDir, "README.md"));
        const indexUri = vscode.Uri.file(path.join(subDir, "index.ts"));

        const readmeNode = new ContextNode(
          readmeUri,
          "README.md",
          vscode.FileType.File
        );
        readmeNode.workspaceRoot = tempDir;
        const indexNode = new ContextNode(
          indexUri,
          "index.ts",
          vscode.FileType.File
        );
        indexNode.workspaceRoot = tempDir;
        selectedNodes = [readmeNode, indexNode];
      });

      suiteTeardown(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
      });

      // Helper to capture clipboard content
      async function getClipboardContent(
        callback: () => Promise<void>
      ): Promise<string> {
        let clipboardContent = "";
        const originalWriteText = vscode.env.clipboard.writeText;
        (vscode.env.clipboard as any).writeText = (text: string) => {
          clipboardContent = text;
          return Promise.resolve();
        };
        await callback();
        (vscode.env.clipboard as any).writeText = originalWriteText;
        return clipboardContent;
      }

      test('should generate "full" tree output correctly', async () => {
        const content = await getClipboardContent(() =>
          handler.bundleAndCopyToClipboard(
            selectedNodes,
            undefined,
            undefined,
            "full"
          )
        );
        assert.ok(
          content.includes("## Project File Structure"),
          "Should have file structure section"
        );
        assert.ok(
          content.includes("├── README.md"),
          "Tree should contain README.md"
        );
        assert.ok(
          content.includes("└── src/"),
          "Tree should contain src directory"
        );
        assert.ok(
          content.includes("    └── index.ts"),
          "Tree should contain index.ts"
        );
      });

      test('should generate "relevant" tree output correctly', async () => {
        const content = await getClipboardContent(() =>
          handler.bundleAndCopyToClipboard(
            selectedNodes,
            undefined,
            undefined,
            "relevant"
          )
        );
        assert.ok(
          content.includes("## Project File Structure"),
          "Should have file structure section"
        );
        assert.ok(
          content.includes("├── README.md"),
          "Tree should contain README.md"
        );
        assert.ok(
          content.includes("└── src/"),
          "Tree should contain src directory"
        );
        assert.ok(
          content.includes("    └── index.ts"),
          "Tree should contain index.ts"
        );
      });

      test('should generate "none" tree output correctly', async () => {
        const content = await getClipboardContent(() =>
          handler.bundleAndCopyToClipboard(
            selectedNodes,
            undefined,
            undefined,
            "none"
          )
        );
        assert.ok(
          !content.includes("## Project File Structure"),
          "Should NOT have file structure section"
        );
      });

      test("should include user prompt correctly", async () => {
        const userPrompt = "Please refactor this code.";
        const systemPrompt = "You are an expert developer.";
        const content = await getClipboardContent(() =>
          handler.bundleAndCopyToClipboard(
            selectedNodes,
            userPrompt,
            systemPrompt,
            "none"
          )
        );
        assert.ok(
          content.includes("## User Request & Instructions"),
          "Should have request section"
        );
        assert.ok(
          content.includes(userPrompt),
          "Should contain the user prompt"
        );
        assert.ok(
          content.includes(systemPrompt),
          "Should contain the system prompt"
        );
      });

      test("should add correct language hint for typescript", async () => {
        const content = await getClipboardContent(() =>
          handler.bundleAndCopyToClipboard(
            selectedNodes,
            undefined,
            undefined,
            "none"
          )
        );
        const tsFileSection = content.substring(
          content.indexOf("File: src/index.ts")
        );
        assert.ok(
          tsFileSection.includes("```typescript"),
          "Should have typescript language hint"
        );
      });
    });
    ````

---

#### Step 4: Create a `TokenManager` Test Suite

The token estimation and caching logic is a critical, untested part of the extension.

1.  **Create the new test file.**

    - **File to create:** `src/test/suite/token-manager.test.ts`

2.  **Add the test code.**

    ```typescript
    import * as assert from "assert";
    import * as vscode from "vscode";
    import * as fs from "fs/promises";
    import * as path from "path";
    import * as os from "os";
    import { TokenManager } from "../../utils/TokenManager";
    import { IgnoreManager } from "../../utils/IgnoreManager";
    import { TokenEstimator } from "../../utils/TokenEstimator";

    suite("TokenManager Test Suite", () => {
      let tempDir: string;
      let tokenManager: TokenManager;
      let mockWorkspaceState: vscode.Memento;
      let state: { [key: string]: any } = {};

      suiteSetup(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "copycat-tm-test-"));
        await fs.writeFile(path.join(tempDir, ".gitignore"), "ignored.txt");
        await fs.writeFile(path.join(tempDir, "file1.txt"), "1234"); // 1 token
        await fs.writeFile(path.join(tempDir, "file2.txt"), "12345678"); // 2 tokens
        await fs.writeFile(
          path.join(tempDir, "ignored.txt"),
          "ignored content"
        );
      });

      suiteTeardown(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
      });

      // Mock vscode.Memento
      setup(() => {
        state = {};
        mockWorkspaceState = {
          get: <T>(key: string, defaultValue?: T): T | undefined =>
            state[key] || defaultValue,
          update: (key: string, value: any): Promise<void> => {
            state[key] = value;
            return Promise.resolve();
          },
          keys: () => Object.keys(state),
        };
        const ignoreManager = new IgnoreManager(tempDir);
        tokenManager = new TokenManager(
          tempDir,
          ignoreManager,
          mockWorkspaceState
        );
      });

      test("TokenEstimator should estimate tokens correctly", () => {
        const estimator = new TokenEstimator();
        assert.strictEqual(estimator.estimateTokens(""), 0);
        assert.strictEqual(estimator.estimateTokens("123"), 1);
        assert.strictEqual(estimator.estimateTokens("1234"), 1);
        assert.strictEqual(estimator.estimateTokens("12345"), 2);
      });

      test("should index a single file correctly", async () => {
        const filePath = path.join(tempDir, "file1.txt");
        const tokenCount = await tokenManager.indexPath(filePath);
        assert.strictEqual(
          tokenCount,
          1,
          "File with 4 chars should be 1 token"
        );
        assert.strictEqual(
          tokenManager.getTokenCountSync(filePath),
          1,
          "Sync count should match"
        );
      });

      test("should index a directory and sum child tokens", async () => {
        // Note: indexPath on a directory does not currently sum children in the implementation.
        // This test assumes a future or corrected implementation where it would.
        // For now, let's test that it correctly processes children during a full index.
        await tokenManager.startBackgroundIndexing();

        // Wait for indexing to finish (in a real scenario, this would need events)
        await new Promise((resolve) => setTimeout(resolve, 500));

        const dirTokenCount = tokenManager.getTokenCountSync(tempDir);
        assert.strictEqual(
          dirTokenCount,
          3,
          "Directory should sum tokens of non-ignored files (1 + 2)"
        );
      });

      test("should not count ignored files", async () => {
        await tokenManager.startBackgroundIndexing();
        await new Promise((resolve) => setTimeout(resolve, 500));
        const ignoredPath = path.join(tempDir, "ignored.txt");
        assert.strictEqual(
          tokenManager.isIndexed(ignoredPath),
          false,
          "Ignored file should not be indexed"
        );
      });

      test("should save and load cache from workspace state", async () => {
        const filePath = path.join(tempDir, "file1.txt");
        await tokenManager.indexPath(filePath);
        await tokenManager.saveCacheToWorkspace();

        // Create a new manager with the same state to simulate a reload
        const newIgnoreManager = new IgnoreManager(tempDir);
        const newManager = new TokenManager(
          tempDir,
          newIgnoreManager,
          mockWorkspaceState
        );

        // Should get the value from the loaded cache without re-indexing
        assert.strictEqual(
          newManager.isIndexed(filePath),
          true,
          "isIndexed should be true from cache"
        );
        assert.strictEqual(
          newManager.getTokenCountSync(filePath),
          1,
          "Should load token count from cache"
        );
      });
    });
    ```

---

#### Step 5: Enhance the Existing `ignore.test.ts` Suite

Finally, let's add a couple of missing cases to the `ignore.test.ts` file.

1.  **File to modify:** `src/test/suite/ignore.test.ts`
2.  **Action:** Add the following tests inside the main `suite` block.

    ```typescript
    // Add this test case to the suite in ignore.test.ts

    test(".contextignore is respected", async () => {
      // Create a .contextignore file
      await createTempFile(".contextignore", "context-ignored.txt");
      await createTempFile("context-ignored.txt", "some content");

      // Re-create the provider to load the new file
      provider = new ContextTreeProvider(workspaceRoot);

      // Enable showing ignored nodes to verify
      configStub.returns({
        get: (key: string) => (key === "showIgnoredNodes" ? true : []),
      } as any);
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

    test(".contextignore overrides .gitignore (un-ignore a file)", async () => {
      // Setup: .gitignore ignores all .log files, .contextignore un-ignores special.log
      await createTempFile(".gitignore", "*.log");
      await createTempFile(".contextignore", "!special.log");
      await createTempFile("generic.log", "generic log");
      await createTempFile("special.log", "special log");

      // Re-create the provider to load new files
      provider = new ContextTreeProvider(workspaceRoot);
      provider.refresh();

      const [rootNode] = await provider.getChildren();
      const children = await provider.getChildren(rootNode);
      const childNames = children.map((c: ContextNode) => c.label);

      assert.ok(
        !childNames.includes("generic.log"),
        "generic.log should be ignored by .gitignore"
      );
      assert.ok(
        childNames.includes("special.log"),
        "special.log should be visible due to .contextignore override"
      );
    });
    ```
