# Context Bundler

Context Bundler is a simple VS Code extension for packaging selected files into a single block of text. It helps you share code with large language models without manually copying each file.

## Getting Started

1. Install dependencies and compile the extension:
   ```bash
   npm install
   npm run compile
   ```
2. Open the folder in VS Code and press `F5` to launch the extension in a new Extension Development Host window.
3. In the *Context Bundler* view of the Explorer, check the files or folders you want to include. Token counts appear next to each file.
4. Click the clipboard icon or run the `Context Bundler: Copy Selected Files to Clipboard` command.
5. Paste the result into your LLM conversation.

The extension respects `.gitignore` rules automatically and also loads patterns from an optional `.contextignore` file at the workspace root. Use `.contextignore` to exclude files that are not tracked by git but should still be ignored by the bundler.

## TODO

- Use an actual tokenizer for more accurate token counts.
- Add unit tests for the utility classes.
