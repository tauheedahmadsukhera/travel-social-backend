const { spawnSync } = require('child_process');
const path = require('path');

const easPath = path.resolve(__dirname, 'node_modules', 'eas-cli', 'bin', 'run');

console.log('Using Node version:', process.version);
console.log('Node Path:', process.execPath);
console.log('EAS Path:', easPath);
console.log('CWD:', process.cwd());
console.log('PATH:', process.env.PATH);
console.log('Module Paths:', module.paths);

const result = spawnSync(process.execPath, [
  easPath,
  'build',
  '--platform', 'android',
  '--profile', 'production-apk',
  '--non-interactive',
  '--no-wait'
], { stdio: 'inherit', shell: true });

process.exit(result.status);
