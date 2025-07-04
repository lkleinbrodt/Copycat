import * as vscode from 'vscode';
import { promises as fs } from 'fs';
import * as path from 'path';
import ignore from 'ignore';

export class IgnoreManager {
    private ig = ignore();

    constructor(private workspaceRoot: string) {}

    async loadRules() {
        this.ig.add('.git');
        try {
            const gitignorePath = path.join(this.workspaceRoot, '.gitignore');
            const content = await fs.readFile(gitignorePath, 'utf-8');
            this.ig.add(content);
        } catch {
            // ignore
        }
    }

    isIgnored(filePath: string): boolean {
        const relativePath = path.relative(this.workspaceRoot, filePath);
        return this.ig.ignores(relativePath);
    }
}
