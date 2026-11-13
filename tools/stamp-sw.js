#!/usr/bin/env node
/*
 * Atualiza a VERSION do sw.js com um hash do conteúdo do app.
 * Rode antes de publicar:  node tools/stamp-sw.js
 * (Sem mudar a versão, quem já instalou o app não recebe as novidades.)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const IGNORE = new Set(['sw.js', 'tools', 'node_modules', '.git', 'README.md']);

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir).sort()) {
    if (IGNORE.has(name) || name.startsWith('.')) continue;
    const full = path.join(dir, name);
    fs.statSync(full).isDirectory() ? walk(full, out) : out.push(full);
  }
  return out;
}

const hash = crypto.createHash('sha1');
walk(root).forEach((f) => {
  hash.update(path.relative(root, f));
  hash.update(fs.readFileSync(f));
});
const version = hash.digest('hex').slice(0, 10);

const swPath = path.join(root, 'sw.js');
const sw = fs.readFileSync(swPath, 'utf8');
fs.writeFileSync(swPath, sw.replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`));
console.log('sw.js VERSION =', version);
