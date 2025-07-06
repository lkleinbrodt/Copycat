import * as vscode from 'vscode';
import { ContextTreeProvider } from './tree/ContextTreeProvider';
import { ClipboardHandler } from './utils/ClipboardHandler';

export function activate(context: vscode.ExtensionContext) {
    console.log('Extension "context-bundler" is now active!');

    const rootPath = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
        ? vscode.workspace.workspaceFolders[0].uri.fsPath
        : undefined;

    const treeProvider = new ContextTreeProvider(rootPath);
    const treeView = vscode.window.createTreeView('contextBundlerView', {
        treeDataProvider: treeProvider
    });
    treeProvider.onSelectionChange(total => {
        treeView.description = `~${total} tokens selected`;
    });

    const toggleCmd = vscode.commands.registerCommand('context-bundler.toggleNode', (node: any) => {
        treeProvider.toggleNode(node);
    });

    const clipboardHandler = rootPath ? new ClipboardHandler(rootPath) : undefined;

    const copyCmd = vscode.commands.registerCommand('context-bundler.copyToClipboard', () => {
        if (!clipboardHandler) {
            vscode.window.showWarningMessage('No workspace opened.');
            return;
        }
        const selected = treeProvider.getSelectedNodes();
        if (selected.length === 0) {
            vscode.window.showWarningMessage('No files selected.');
            return;
        }
        clipboardHandler.bundleAndCopyToClipboard(selected);
    });

    const watcher = rootPath ? vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(rootPath, '**/*')) : undefined;
    watcher?.onDidCreate(uri => {
        if (uri.path.endsWith('.gitignore') || uri.path.endsWith('.contextignore')) {
            treeProvider.reloadIgnoreRules();
        }
        treeProvider.onFileChange(uri);
    });
    watcher?.onDidDelete(uri => {
        if (uri.path.endsWith('.gitignore') || uri.path.endsWith('.contextignore')) {
            treeProvider.reloadIgnoreRules();
        }
        treeProvider.onFileDelete(uri);
    });
    watcher?.onDidChange(uri => {
        if (uri.path.endsWith('.gitignore') || uri.path.endsWith('.contextignore')) {
            treeProvider.reloadIgnoreRules();
        }
        treeProvider.onFileChange(uri);
    });

    if (watcher) context.subscriptions.push(watcher);
    context.subscriptions.push(copyCmd, toggleCmd, treeView);
}

export function deactivate() {}
