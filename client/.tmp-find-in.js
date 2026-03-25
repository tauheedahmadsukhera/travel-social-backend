const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const root = process.cwd();
const exts = new Set(['.ts','.tsx','.js','.jsx']);
const ignoreDirs = new Set(['node_modules','.git','android','ios','dist','build','.expo']);
const results = [];

function walk(dir){
  for(const entry of fs.readdirSync(dir, { withFileTypes: true })){
    if(entry.isDirectory()){
      if(ignoreDirs.has(entry.name)) continue;
      walk(path.join(dir, entry.name));
      continue;
    }
    const ext = path.extname(entry.name);
    if(!exts.has(ext)) continue;
    const fp = path.join(dir, entry.name);
    const code = fs.readFileSync(fp, 'utf8');
    let ast;
    try {
      ast = parser.parse(code, {
        sourceType: 'unambiguous',
        plugins: ['typescript','jsx','classProperties','decorators-legacy','objectRestSpread','optionalChaining','nullishCoalescingOperator'],
        errorRecovery: true,
      });
    } catch {
      continue;
    }
    traverse(ast, {
      BinaryExpression(p){
        if(p.node.operator !== 'in') return;
        const loc = p.node.loc?.start;
        const line = loc?.line || 0;
        const col = loc?.column || 0;
        const lines = code.split(/\r?\n/);
        const src = (lines[line-1] || '').trim();
        results.push({ file: path.relative(root, fp), line, col, src });
      }
    });
  }
}

walk(root);
results.sort((a,b)=> a.file.localeCompare(b.file) || a.line - b.line);
for(const r of results){
  console.log(`${r.file}:${r.line}:${r.col} | ${r.src}`);
}
console.log(`TOTAL_IN_OPERATORS=${results.length}`);
