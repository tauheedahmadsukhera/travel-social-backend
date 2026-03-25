const fs = require('fs');
const buffer = fs.readFileSync('crash_dump.txt');
const txt = buffer.toString('utf16le'); // PowerShell uses UTF-16LE for 'Out-File' if we did >
let lines = txt.split('\n');
if (lines.length < 5) {
  // Try utf8
  lines = buffer.toString('utf8').split('\n');
}

const crashIdx = lines.findIndex(l => l.includes('FATAL EXCEPTION') || l.includes(' FATAL '));
if (crashIdx !== -1) {
  console.log('CRASH FOUND at line ' + crashIdx);
  console.log(lines.slice(Math.max(0, crashIdx - 2), crashIdx + 30).join('\n'));
} else {
  console.log('NO FATAL EXCEPTION in dump.');
  // print last 20 lines
  console.log(lines.slice(-20).join('\n'));
}
