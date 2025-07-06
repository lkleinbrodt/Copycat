import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

export function run(): Promise<void> {
  const mocha = new Mocha({
    ui: 'tdd',
    color: true
  });

  const testsRoot = path.resolve(__dirname, '.');

  return new Promise<void>((c, e) => {
    glob('**/*.test.js', { cwd: testsRoot })
      .then((files: string[]) => {
        for (const f of files) {
          mocha.addFile(path.resolve(testsRoot, f));
        }

        try {
          mocha.run(failures => {
            if (failures > 0) {
              e(new Error(`${failures} tests failed.`));
            } else {
              c();
            }
          });
        } catch (err) {
          console.error(err);
          e(err);
        }
      })
      .catch(err => e(err));
  });
}
