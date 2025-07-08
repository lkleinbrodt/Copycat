import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import ignore from "ignore";

export class IgnoreManager {
  private ig = ignore();

  constructor(private workspaceRoot: string) {
    this.loadRulesSync();
  }

  private loadRulesSync() {
    // Add .git to always be ignored
    this.ig.add(".git");

    // Load default ignore patterns from configuration
    const config = vscode.workspace.getConfiguration("contextBundler");
    const defaultPatterns = config.get<string[]>("defaultIgnorePatterns", []);

    if (defaultPatterns.length > 0) {
      this.ig.add(defaultPatterns.join("\n"));
    }

    // Load .gitignore if it exists
    try {
      const gitignorePath = path.join(this.workspaceRoot, ".gitignore");
      const content = fs.readFileSync(gitignorePath, "utf-8");
      this.ig.add(content);
    } catch {
      // ignore
    }

    // Load .contextignore if it exists
    try {
      const contextignorePath = path.join(this.workspaceRoot, ".contextignore");
      const content = fs.readFileSync(contextignorePath, "utf-8");
      this.ig.add(content);
    } catch {
      // ignore
    }
  }

  isIgnored(filePath: string): boolean {
    const relativePath = path.relative(this.workspaceRoot, filePath);
    // The ignore library doesn't accept empty paths, so we return false for the root
    if (!relativePath) {
      return false;
    }
    return this.ig.ignores(relativePath);
  }

  /**
   * Reload ignore rules from configuration and files
   * This should be called when the configuration changes
   */
  reloadRules(): void {
    this.ig = ignore();
    this.loadRulesSync();
  }
}
