import * as vscode from 'vscode';
import { promises as fs } from 'fs';
import * as path from 'path';
import { ContextNode } from '../tree/ContextNode';

export class ClipboardHandler {
    constructor(private workspaceRoot: string) {}

    async bundleAndCopyToClipboard(selectedNodes: ContextNode[]): Promise<void> {
        let bundled = '';
        for (const node of selectedNodes) {
            const relative = path.relative(this.workspaceRoot, node.resourceUri.fsPath);
            const content = await fs.readFile(node.resourceUri.fsPath, 'utf-8');
            bundled += `// ${relative}\n\n${content}\n\n`;
        }
        await vscode.env.clipboard.writeText(bundled);
        vscode.window.showInformationMessage(`Copied ${selectedNodes.length} files to clipboard!`);
    }
}
