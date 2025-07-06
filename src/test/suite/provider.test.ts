import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ContextTreeProvider } from '../../tree/ContextTreeProvider';
import { TokenEstimator } from '../../utils/TokenEstimator';

suite('ContextTreeProvider', () => {
  test('directory token counts sum children', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-'));
    const sub = path.join(tmp, 'sub');
    fs.mkdirSync(sub);
    fs.writeFileSync(path.join(sub, 'a.txt'), 'aaaa');
    fs.writeFileSync(path.join(sub, 'b.txt'), 'bbbb');

    const provider = new ContextTreeProvider(tmp);
    const [root] = await provider.getChildren();
    const [subDir] = await provider.getChildren(root);

    const estimator = new TokenEstimator();
    const expected = estimator.estimateTokens('aaaa') + estimator.estimateTokens('bbbb');
    assert.strictEqual(subDir.tokenCount, expected);
    assert.strictEqual(root.tokenCount, expected);
  });
});
