import * as assert from "assert";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";
import * as vscode from "vscode";

import { ClipboardHandler } from "../../utils/ClipboardHandler";
import { ContextNode } from "../../tree/ContextNode";

suite("ClipboardHandler Test Suite", () => {
  let tempDir: string;
  let handler: ClipboardHandler;
  let selectedNodes: ContextNode[];
  let sandbox: sinon.SinonSandbox;
  let mockClipboard: { writeText: sinon.SinonStub };

  // Setup a single-root workspace for these tests
  suiteSetup(async () => {
    tempDir = vscode.workspace.workspaceFolders![0].uri.fsPath;
    const subDir = path.join(tempDir, "src");
    await fs.mkdir(subDir, { recursive: true });
    await fs.writeFile(path.join(tempDir, "README.md"), "# Test Project");
    await fs.writeFile(path.join(subDir, "index.ts"), 'console.log("hello");');

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

  setup(() => {
    sandbox = sinon.createSandbox();
    mockClipboard = {
      writeText: sandbox.stub().resolves(),
    };
    handler = new ClipboardHandler(
      vscode.workspace.workspaceFolders!,
      mockClipboard
    );
  });

  teardown(() => {
    sandbox.restore();
  });

  // Helper to capture clipboard content
  async function getClipboardContent(
    callback: () => Promise<void>
  ): Promise<string> {
    await callback();
    return mockClipboard.writeText.getCall(0).args[0];
  }

  test('should generate "full" tree output correctly', async () => {
    await handler.bundleAndCopyToClipboard(
      selectedNodes,
      undefined,
      undefined,
      "full"
    );
    assert.ok(
      mockClipboard.writeText.calledOnce,
      "clipboard.writeText should be called"
    );
    const content = mockClipboard.writeText.getCall(0).args[0];
    // Check for the src directory and index.ts with correct indentation
    assert.ok(
      content.includes("├── src/"),
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
    await handler.bundleAndCopyToClipboard(
      selectedNodes,
      userPrompt,
      systemPrompt,
      "none"
    );
    assert.ok(
      mockClipboard.writeText.calledOnce,
      "clipboard.writeText should be called"
    );
    const content = mockClipboard.writeText.getCall(0).args[0];
    // Check for the actual headings used in the output
    assert.ok(
      content.includes("**System Prompt:**"),
      "Should have system prompt section"
    );
    assert.ok(
      content.includes("**User Request:**"),
      "Should have user request section"
    );
    assert.ok(content.includes(userPrompt), "Should contain the user prompt");
    assert.ok(
      content.includes(systemPrompt),
      "Should contain the system prompt"
    );
  });

  test("should add correct language hint for typescript", async () => {
    await handler.bundleAndCopyToClipboard(
      selectedNodes,
      undefined,
      undefined,
      "none"
    );
    assert.ok(
      mockClipboard.writeText.calledOnce,
      "clipboard.writeText should be called"
    );
    const content = mockClipboard.writeText.getCall(0).args[0];
    // Check for a line with just 'typescript' before the code
    const tsFileSection = content.substring(
      content.indexOf("File: src/index.ts")
    );
    // Look for a line that is exactly '  typescript' (2 spaces then the word)
    assert.ok(
      /\n\s*typescript\n/.test(tsFileSection),
      "Should have typescript language hint"
    );
  });
});
