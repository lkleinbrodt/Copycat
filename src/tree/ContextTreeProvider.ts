import * as vscode from 'vscode';
import { promises as fs } from 'fs';
import * as path from 'path';
import { ContextNode, SelectionState } from './ContextNode';
import { IgnoreManager } from '../utils/IgnoreManager';
import { TokenEstimator } from '../utils/TokenEstimator';

export class ContextTreeProvider implements vscode.TreeDataProvider<ContextNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<ContextNode | undefined | void> = new vscode.EventEmitter();
    readonly onDidChangeTreeData: vscode.Event<ContextNode | undefined | void> = this._onDidChangeTreeData.event;

    private _onSelectionChange: vscode.EventEmitter<number> = new vscode.EventEmitter();
    readonly onSelectionChange: vscode.Event<number> = this._onSelectionChange.event;

    private allNodes: Map<string, ContextNode> = new Map();
    private selectionCache: Map<string, SelectionState> = new Map();
    private tokenCache: Map<string, { mtime: number; tokens: number }> = new Map();
    private ignoreManager?: IgnoreManager;
    private estimator = new TokenEstimator();

    constructor(private workspaceRoot: string | undefined) {
        if (workspaceRoot) {
            this.ignoreManager = new IgnoreManager(workspaceRoot);
        }
    }

    reloadIgnoreRules() {
        this.ignoreManager?.reloadRules();
    }

    onFileChange(file: vscode.Uri) {
        this.tokenCache.delete(file.fsPath);
        this.refresh();
    }

    onFileDelete(file: vscode.Uri) {
        this.tokenCache.delete(file.fsPath);
        this.selectionCache.delete(file.fsPath);
        this.refresh();
    }

    refresh(): void {
        for (const [p, node] of this.allNodes) {
            this.selectionCache.set(p, node.selectionState);
        }
        this.allNodes.clear();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ContextNode): vscode.TreeItem {
        switch (element.selectionState) {
            case 'checked':
                element.iconPath = new vscode.ThemeIcon('check');
                break;
            case 'indeterminate':
                element.iconPath = new vscode.ThemeIcon('dash');
                break;
            default:
                element.iconPath = new vscode.ThemeIcon('circle-large-outline');
        }
        if (element.tokenCount) {
            element.description = `${element.tokenCount}t`;
        }
        element.command = {
            command: 'context-bundler.toggleNode',
            title: 'Toggle',
            arguments: [element]
        };
        return element;
    }

    async getChildren(element?: ContextNode): Promise<ContextNode[]> {
        if (!this.workspaceRoot) {
            vscode.window.showInformationMessage('No folder or workspace opened');
            return [];
        }

        if (!element) {
            const rootUri = vscode.Uri.file(this.workspaceRoot);
            const rootStat = await vscode.workspace.fs.stat(rootUri);
            const rootNode = await this.createNode(rootUri, rootStat);
            await this.getDirectoryChildren(rootNode);
            return [rootNode];
        }

        if (element.fileType === vscode.FileType.Directory) {
            if (element.children.length === 0) {
                return this.getDirectoryChildren(element);
            }
            return element.children;
        }
        return [];
    }

    private async getDirectoryChildren(parent: ContextNode): Promise<ContextNode[]> {
        const entries = await vscode.workspace.fs.readDirectory(parent.resourceUri);
        const nodes: ContextNode[] = [];
        for (const [name, type] of entries) {
            const uri = vscode.Uri.joinPath(parent.resourceUri, name);
            if (this.ignoreManager && this.ignoreManager.isIgnored(uri.fsPath)) {
                continue;
            }
            const node = await this.createNode(uri, type, parent);
            nodes.push(node);
        }
        parent.tokenCount = nodes.reduce((sum, n) => sum + n.tokenCount, 0);
        return nodes;
    }

    private async createNode(uri: vscode.Uri, fileTypeOrStat: vscode.FileType | vscode.FileStat, parent?: ContextNode): Promise<ContextNode> {
        const fileType = (fileTypeOrStat as vscode.FileStat).type !== undefined ? (fileTypeOrStat as vscode.FileStat).type : fileTypeOrStat as vscode.FileType;
        const label = path.basename(uri.fsPath);
        const node = new ContextNode(uri, label, fileType);
        this.allNodes.set(uri.fsPath, node);
        parent?.children.push(node);

        const cached = this.selectionCache.get(uri.fsPath);
        if (cached) {
            node.selectionState = cached;
        } else if (parent && parent.selectionState !== 'indeterminate') {
            node.selectionState = parent.selectionState;
        }

        if (fileType === vscode.FileType.File) {
            try {
                const stat = await vscode.workspace.fs.stat(uri);
                const cachedToken = this.tokenCache.get(uri.fsPath);
                if (cachedToken && cachedToken.mtime === stat.mtime) {
                    node.tokenCount = cachedToken.tokens;
                } else {
                    const content = await fs.readFile(uri.fsPath, 'utf-8');
                    node.tokenCount = this.estimator.estimateTokens(content);
                    this.tokenCache.set(uri.fsPath, { mtime: stat.mtime, tokens: node.tokenCount });
                }
            } catch {
                node.tokenCount = 0;
            }
        }
        return node;
    }

    toggleNode(node: ContextNode): void {
        const newState: SelectionState = node.selectionState === 'checked' ? 'unchecked' : 'checked';
        this.setNodeState(node, newState);
        this._onDidChangeTreeData.fire(node);
        this.propagateStateUp(node);
        this.emitSelectionTokens();
    }

    private setNodeState(node: ContextNode, state: SelectionState): void {
        node.selectionState = state;
        this.selectionCache.set(node.resourceUri.fsPath, state);
        if (state !== 'indeterminate' && node.fileType === vscode.FileType.Directory) {
            node.children.forEach(child => this.setNodeState(child, state));
        }
    }

    private propagateStateUp(node: ContextNode): void {
        const parent = this.findParent(node);
        if (!parent) { return; }
        const childStates = parent.children.map(c => c.selectionState);
        const allChecked = childStates.every(s => s === 'checked');
        const allUnchecked = childStates.every(s => s === 'unchecked');
        if (allChecked) {
            parent.selectionState = 'checked';
        } else if (allUnchecked) {
            parent.selectionState = 'unchecked';
        } else {
            parent.selectionState = 'indeterminate';
        }
        this.selectionCache.set(parent.resourceUri.fsPath, parent.selectionState);
        this._onDidChangeTreeData.fire(parent);
        this.propagateStateUp(parent);
    }

    private emitSelectionTokens(): void {
        const total = this.getSelectedNodes().reduce((sum, n) => sum + n.tokenCount, 0);
        this._onSelectionChange.fire(total);
    }

    private findParent(child: ContextNode): ContextNode | undefined {
        for (const node of this.allNodes.values()) {
            if (node.children.includes(child)) {
                return node;
            }
        }
        return undefined;
    }

    getSelectedNodes(): ContextNode[] {
        const nodes: ContextNode[] = [];
        for (const node of this.allNodes.values()) {
            if (node.selectionState === 'checked' && node.fileType === vscode.FileType.File) {
                nodes.push(node);
            }
        }
        return nodes;
    }
}
