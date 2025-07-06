import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { IgnoreManager } from '../../utils/IgnoreManager';

describe('IgnoreManager', () => {
  it('loads patterns from .contextignore', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-'));
    fs.writeFileSync(path.join(tmp, '.contextignore'), 'foo.txt');
    fs.writeFileSync(path.join(tmp, 'foo.txt'), '');
    const mgr = new IgnoreManager(tmp);
    assert.strictEqual(mgr.isIgnored(path.join(tmp, 'foo.txt')), true);
  });

  it('reloadRules picks up file changes', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-'));
    fs.writeFileSync(path.join(tmp, '.gitignore'), '');
    fs.writeFileSync(path.join(tmp, 'bar.txt'), '');
    const mgr = new IgnoreManager(tmp);
    assert.strictEqual(mgr.isIgnored(path.join(tmp, 'bar.txt')), false);
    fs.writeFileSync(path.join(tmp, '.gitignore'), 'bar.txt');
    mgr.reloadRules();
    assert.strictEqual(mgr.isIgnored(path.join(tmp, 'bar.txt')), true);
  });
});
