export class TokenFormatter {
  /**
   * Format token count for display
   * - < 1k: exact count (e.g., "847 tokens")
   * - >= 1k: rounded to nearest k (e.g., "1.2k tokens", "601k tokens")
   */
  static formatTokens(tokenCount: number): string {
    if (tokenCount < 1000) {
      return `${tokenCount} tokens`;
    } else {
      const kCount = Math.round(tokenCount / 100) / 10; // Round to nearest 0.1k
      return `${kCount}k tokens`;
    }
  }

  /**
   * Format token count for display with fallback for undefined/null
   */
  static formatTokensSafe(tokenCount: number | undefined | null): string {
    if (tokenCount === undefined || tokenCount === null || tokenCount === 0) {
      return "calculating...";
    }
    return this.formatTokens(tokenCount);
  }
}
