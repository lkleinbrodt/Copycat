import * as fs from 'fs';
import * as path from 'path';
import ignore from 'ignore';

export class IgnoreManager {
    private ig = ignore();

    constructor(private workspaceRoot: string) {
        this.loadRulesSync();
    }

    private loadRulesSync() {
        this.ig.add('.git');
        try {
            const gitignorePath = path.join(this.workspaceRoot, '.gitignore');
            const content = fs.readFileSync(gitignorePath, 'utf-8');
            this.ig.add(content);
        } catch {
            // ignore
        }
        try {
            const contextignorePath = path.join(this.workspaceRoot, '.contextignore');
            const content = fs.readFileSync(contextignorePath, 'utf-8');
            this.ig.add(content);
        } catch {
            // ignore
        }
    }

    reloadRules() {
        this.ig = ignore();
        this.loadRulesSync();
    }

    isIgnored(filePath: string): boolean {
        const relativePath = path.relative(this.workspaceRoot, filePath);
        return this.ig.ignores(relativePath);
    }
}
