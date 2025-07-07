# Context Bundler

Context Bundler is a simple VS Code extension for packaging selected files into a single block of text. It helps you share code with large language models without manually copying each file.

## Getting Started

1. Install dependencies and compile the extension:
   ```bash
   npm install
   npm run compile
   ```
2. Open the folder in VS Code and press `F5` to launch the extension in a new Extension Development Host window.
3. In the _Context Bundler_ view of the Explorer, check the files or folders you want to include. Token counts appear next to each file.
4. Click the clipboard icon or run the `Context Bundler: Copy Selected Files to Clipboard` command.
5. Paste the result into your LLM conversation.

The extension respects `.gitignore` rules automatically and only reads files inside your workspace.

## Output Format

When you copy files to the clipboard, they are formatted as markdown with:

### 1. Codebase Overview

A brief introduction explaining what the LLM is receiving.

### 2. File Structure

A complete file tree showing the entire project structure, excluding ignored files (those matching `.gitignore` patterns).

### 3. Selected Files

The actual file contents you selected, formatted with markdown headings and fenced code blocks.

Example output:

```markdown
# Codebase Overview

This is a codebase with the following structure. The selected files are provided below with their full contents.

## File Structure
```

Copycat/
├── src/
│ ├── extension.ts
│ ├── tree/
│ │ ├── ContextNode.ts
│ │ └── ContextTreeProvider.ts
│ └── utils/
│ ├── ClipboardHandler.ts
│ ├── IgnoreManager.ts
│ ├── TokenEstimator.ts
│ ├── TokenFormatter.ts
│ └── TokenManager.ts
├── package.json
├── tsconfig.json
└── README.md

````

## Selected Files

# src/main.py

```python
def hello_world():
    print("Hello, World!")
````

# src/config.json

```json
{
  "name": "my-project",
  "version": "1.0.0"
}
```

```

The extension supports language hints for common file types including JavaScript, TypeScript, Python, Java, C/C++, Go, Rust, Ruby, PHP, Swift, Kotlin, Scala, Shell scripts, SQL, JSON, YAML, XML, Markdown, and many others.

## Settings

- **Show Ignored Nodes**: When enabled, ignored files and folders (those matching `.gitignore` or `.contextignore` patterns) will be displayed in the tree view but greyed out. When disabled (default), ignored files are completely hidden from the view. Ignored files can never be selected, even when auto-selecting all files in a directory.
```
