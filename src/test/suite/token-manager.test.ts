import * as assert from "assert";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

import { IgnoreManager } from "../../utils/IgnoreManager";
import { TokenEstimator } from "../../utils/TokenEstimator";
import { TokenManager } from "../../utils/TokenManager";

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
    await fs.writeFile(path.join(tempDir, "ignored.txt"), "ignored content");
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
    tokenManager = new TokenManager(tempDir, ignoreManager, mockWorkspaceState);
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
    assert.strictEqual(tokenCount, 1, "File with 4 chars should be 1 token");
    assert.strictEqual(
      tokenManager.getTokenCountSync(filePath),
      1,
      "Sync count should match"
    );
  });

  test("should index a directory and sum child tokens", async () => {
    // We will call indexPath directly to test its summing logic
    const dirTokenCount = await tokenManager.indexPath(tempDir);
    // file1.txt (4 chars -> 1 token) + file2.txt (8 chars -> 2 tokens) = 3 tokens
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
