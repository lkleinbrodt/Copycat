import * as assert from "assert";

import { TokenFormatter } from "../../utils/TokenFormatter";

suite("TokenFormatter", () => {
  test("formats tokens correctly", () => {
    // Less than 1k - exact count
    assert.strictEqual(TokenFormatter.formatTokens(0), "0 tokens");
    assert.strictEqual(TokenFormatter.formatTokens(847), "847 tokens");
    assert.strictEqual(TokenFormatter.formatTokens(999), "999 tokens");

    // 1k and above - rounded to nearest 0.1k
    assert.strictEqual(TokenFormatter.formatTokens(1000), "1k tokens");
    assert.strictEqual(TokenFormatter.formatTokens(1500), "1.5k tokens");
    assert.strictEqual(TokenFormatter.formatTokens(1549), "1.5k tokens");
    assert.strictEqual(TokenFormatter.formatTokens(1550), "1.6k tokens");
    assert.strictEqual(TokenFormatter.formatTokens(601409), "601.4k tokens");
    assert.strictEqual(TokenFormatter.formatTokens(1000000), "1000k tokens");
  });

  test("handles undefined/null safely", () => {
    assert.strictEqual(
      TokenFormatter.formatTokensSafe(undefined),
      "calculating..."
    );
    assert.strictEqual(TokenFormatter.formatTokensSafe(null), "calculating...");
    assert.strictEqual(TokenFormatter.formatTokensSafe(0), "calculating...");
    assert.strictEqual(TokenFormatter.formatTokensSafe(100), "100 tokens");
  });
});
