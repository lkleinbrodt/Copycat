import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Extension should be present', () => {
    const ext = vscode.extensions.getExtension('codex.context-bundler');
    assert.ok(ext);
  });

  test('Commands are registered', async () => {
    const ext = vscode.extensions.getExtension('codex.context-bundler');
    assert.ok(ext);
    await ext!.activate();
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('context-bundler.copyToClipboard'));
    assert.ok(commands.includes('context-bundler.toggleNode'));
  });
});
