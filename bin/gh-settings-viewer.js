#!/usr/bin/env node
// Launcher: checks the Node version, then loads the compiled CLI.
const major = Number(process.versions.node.split('.')[0]);
if (major < 26) {
  console.error(`gh-settings-viewer needs Node.js 26 (the current LTS) or newer. You have ${process.version}.`);
  process.exit(1);
}
await import('../dist/cli/index.js');
