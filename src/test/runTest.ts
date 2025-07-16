import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

import { runTests } from "@vscode/test-electron";

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, "../../");
    const extensionTestsPath = path.resolve(__dirname, "./suite/index");

    // --- SETUP MULTI-ROOT WORKSPACE ---
    // 1. Create two temporary project directories
    const projectAPath = await fs.mkdtemp(
      path.join(os.tmpdir(), "copycat-test-a-")
    );
    const projectBPath = await fs.mkdtemp(
      path.join(os.tmpdir(), "copycat-test-b-")
    );

    // 2. Define a path for our temporary workspace file
    const workspaceFilePath = path.join(
      os.tmpdir(),
      "copycat-test-workspace.code-workspace"
    );

    // 3. Create the workspace file content
    const workspaceConfig = {
      folders: [{ path: projectAPath }, { path: projectBPath }],
      settings: {
        "files.exclude": {
          "**/.git": true,
          "**/.svn": true,
          "**/.hg": true,
          "**/CVS": true,
          "**/.DS_Store": true,
        },
      },
    };
    await fs.writeFile(
      workspaceFilePath,
      JSON.stringify(workspaceConfig, null, 2)
    );

    console.log(`Test workspace created at: ${workspaceFilePath}`);
    console.log(`  - Project A: ${projectAPath}`);
    console.log(`  - Project B: ${projectBPath}`);

    // --- RUN TESTS ---
    // Launch the test instance with our temporary multi-root workspace
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [workspaceFilePath], // This is the key change
    });
  } catch (err) {
    console.error("Failed to run tests");
    process.exit(1);
  }
}

main();
