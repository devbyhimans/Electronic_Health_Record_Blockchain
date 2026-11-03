'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const files = [];

function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(fullPath);
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(fullPath);
  }
}

for (const directory of ['src', 'test', 'scripts']) visit(path.join(root, directory));
for (const file of files) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
process.stdout.write(`Syntax check passed for ${files.length} JavaScript files.\n`);
