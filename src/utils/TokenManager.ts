import * as path from "path";
import * as vscode from "vscode";

import { IgnoreManager } from "./IgnoreManager";
import { TokenEstimator } from "./TokenEstimator";
import { promises as fs } from "fs";

interface TokenCacheEntry {
  tokenCount: number;
  mtime: number;
  isIndexed: boolean;
  isDirectory: boolean;
}

interface IndexingTask {
  path: string;
  priority: number; // Lower number = higher priority
}

export class TokenManager {
  private cache = new Map<string, TokenCacheEntry>();
  private estimator = new TokenEstimator();
  private ignoreManager: IgnoreManager;
  private indexingQueue: IndexingTask[] = [];
  private isIndexing = false;
  private workspaceState: vscode.Memento;

  private _onTokensUpdated = new vscode.EventEmitter<string[]>();
  public readonly onTokensUpdated = this._onTokensUpdated.event;

  constructor(
    private workspaceRoot: string,
    ignoreManager: IgnoreManager,
    workspaceState: vscode.Memento
  ) {
    this.ignoreManager = ignoreManager;
    this.workspaceState = workspaceState;
    this.loadCacheFromWorkspace();
  }

  /**
   * Get token count for a file or directory.
   * Returns cached value if available, otherwise returns undefined and queues for indexing.
   */
  getTokenCount(filePath: string): number | undefined {
    const entry = this.cache.get(filePath);
    if (entry?.isIndexed) {
      return entry.tokenCount;
    }

    // Queue for indexing if not already queued
    if (!this.isInQueue(filePath)) {
      this.queueForIndexing(filePath, this.calculatePriority(filePath));
    }

    return undefined;
  }

  /**
   * Get token count synchronously, returning 0 if not yet indexed
   */
  getTokenCountSync(filePath: string): number {
    const entry = this.cache.get(filePath);
    return entry?.isIndexed ? entry.tokenCount : 0;
  }

  /**
   * Check if a path has been indexed
   */
  isIndexed(filePath: string): boolean {
    const entry = this.cache.get(filePath);
    return entry?.isIndexed ?? false;
  }

  /**
   * Start progressive background indexing
   */
  async startBackgroundIndexing(): Promise<void> {
    if (this.isIndexing) {
      return;
    }

    this.isIndexing = true;

    // Queue the workspace root for indexing
    this.queueForIndexing(this.workspaceRoot, 1);

    await this.processIndexingQueue();
  }

  /**
   * Index a specific file or directory immediately
   */
  async indexPath(filePath: string, force = false): Promise<number> {
    try {
      const stat = await fs.stat(filePath);
      const existing = this.cache.get(filePath);

      // Check if we need to re-index
      if (!force && existing?.isIndexed && existing.mtime >= stat.mtimeMs) {
        return existing.tokenCount;
      }

      // Skip ignored files
      if (this.ignoreManager.isIgnored(filePath)) {
        return 0;
      }

      let tokenCount = 0;
      const isDirectory = stat.isDirectory();

      if (isDirectory) {
        tokenCount = await this.indexDirectory(filePath);
      } else {
        tokenCount = await this.indexFile(filePath);
      }

      // Update cache
      this.cache.set(filePath, {
        tokenCount,
        mtime: stat.mtimeMs,
        isIndexed: true,
        isDirectory,
      });

      // Cascade update to parent directories
      await this.updateParentDirectories(filePath);

      // Emit update event
      this._onTokensUpdated.fire([filePath]);

      return tokenCount;
    } catch (error) {
      console.warn(`Failed to index ${filePath}:`, error);
      // Cache as 0 tokens to avoid repeated failures
      this.cache.set(filePath, {
        tokenCount: 0,
        mtime: Date.now(),
        isIndexed: true,
        isDirectory: false,
      });
      return 0;
    }
  }

  /**
   * Handle file system changes
   */
  async onFileChanged(filePath: string): Promise<void> {
    await this.indexPath(filePath, true);
  }

  async onFileDeleted(filePath: string): Promise<void> {
    this.cache.delete(filePath);
    await this.updateParentDirectories(filePath);
    this._onTokensUpdated.fire([path.dirname(filePath)]);
  }

  async onFileCreated(filePath: string): Promise<void> {
    // Check if this is an ignore file
    const fileName = path.basename(filePath);
    if (fileName === ".gitignore" || fileName === ".contextignore") {
      // Reload ignore manager and clear cache for affected files
      await this.handleIgnoreFileChange();
    } else {
      await this.indexPath(filePath, true);
    }
  }

  /**
   * Save cache to workspace state
   */
  async saveCacheToWorkspace(): Promise<void> {
    const serializable = Array.from(this.cache.entries()).reduce(
      (acc, [key, value]) => {
        acc[key] = value;
        return acc;
      },
      {} as Record<string, TokenCacheEntry>
    );

    await this.workspaceState.update("tokenCache", serializable);
  }

  /**
   * Load cache from workspace state
   */
  private loadCacheFromWorkspace(): void {
    const saved =
      this.workspaceState.get<Record<string, TokenCacheEntry>>("tokenCache");
    if (saved) {
      this.cache = new Map(Object.entries(saved));
    }
  }

  /**
   * Index a single file
   */
  private async indexFile(filePath: string): Promise<number> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return this.estimator.estimateTokens(content);
    } catch (error) {
      // Handle binary files, permission errors, etc.
      return 0;
    }
  }

  /**
   * Index a directory by summing non-ignored children
   */
  private async indexDirectory(dirPath: string): Promise<number> {
    try {
      const entries = await fs.readdir(dirPath);
      let totalTokens = 0;

      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry);

        // Skip ignored files
        if (this.ignoreManager.isIgnored(entryPath)) {
          continue;
        }

        const stat = await fs.stat(entryPath);
        let entryTokens = 0;

        if (stat.isDirectory()) {
          entryTokens = await this.indexDirectory(entryPath);
        } else {
          entryTokens = await this.indexFile(entryPath);
        }

        // Cache the entry
        this.cache.set(entryPath, {
          tokenCount: entryTokens,
          mtime: stat.mtimeMs,
          isIndexed: true,
          isDirectory: stat.isDirectory(),
        });

        totalTokens += entryTokens;
      }

      return totalTokens;
    } catch (error) {
      console.warn(`Failed to index directory ${dirPath}:`, error);
      return 0;
    }
  }

  /**
   * Update parent directories when a child changes
   */
  private async updateParentDirectories(filePath: string): Promise<void> {
    const parentDir = path.dirname(filePath);

    // Stop at workspace root
    if (parentDir === this.workspaceRoot || parentDir === filePath) {
      return;
    }

    try {
      // Recalculate parent directory tokens
      await this.indexPath(parentDir, true);

      // Continue up the tree
      await this.updateParentDirectories(parentDir);
    } catch (error) {
      console.warn(`Failed to update parent directory ${parentDir}:`, error);
    }
  }

  /**
   * Queue a path for background indexing
   */
  private queueForIndexing(filePath: string, priority: number): void {
    this.indexingQueue.push({ path: filePath, priority });
    this.indexingQueue.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Check if a path is already in the indexing queue
   */
  private isInQueue(filePath: string): boolean {
    return this.indexingQueue.some((task) => task.path === filePath);
  }

  /**
   * Calculate priority for indexing (lower = higher priority)
   */
  private calculatePriority(filePath: string): number {
    // Prioritize files over directories, and shallower paths over deeper ones
    const relativePath = path.relative(this.workspaceRoot, filePath);
    const depth = relativePath.split(path.sep).length;

    try {
      const stat = require("fs").statSync(filePath);
      const isFile = stat.isFile();
      return depth + (isFile ? 0 : 10);
    } catch {
      // If we can't stat the file, assume it's a file and give it normal priority
      return depth;
    }
  }

  /**
   * Process the indexing queue
   */
  private async processIndexingQueue(): Promise<void> {
    while (this.indexingQueue.length > 0 && this.isIndexing) {
      const task = this.indexingQueue.shift()!;
      await this.indexPath(task.path);

      // Small delay to prevent blocking
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    // Save cache when indexing is complete
    await this.saveCacheToWorkspace();
    this.isIndexing = false;
  }

  /**
   * Stop background indexing
   */
  stopBackgroundIndexing(): void {
    this.isIndexing = false;
    this.indexingQueue = [];
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.cache.clear();
    this.workspaceState.update("tokenCache", undefined);
  }

  /**
   * Handle changes to ignore files (.gitignore, .contextignore)
   */
  private async handleIgnoreFileChange(): Promise<void> {
    // For now, we'll clear the cache and re-index
    // A more sophisticated approach would be to selectively invalidate
    this.clearCache();
    this.queueForIndexing(this.workspaceRoot, 1);
    await this.processIndexingQueue();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { total: number; indexed: number; pending: number } {
    const total = this.cache.size;
    const indexed = Array.from(this.cache.values()).filter(
      (entry) => entry.isIndexed
    ).length;
    const pending = this.indexingQueue.length;

    return { total, indexed, pending };
  }
}
