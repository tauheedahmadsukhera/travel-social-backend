const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, 'routes');
const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));

for (const file of files) {
  const p = path.join(routesDir, file);
  let content = fs.readFileSync(p, 'utf8');
  let changed = false;

  // We are replacing require('../xxx/yyy')
  content = content.replace(/require\(['"`]\.\.\/([a-zA-Z0-9_\-\/]+)['"`]\)/g, (match, importPath) => {
    // importPath could be 'models/User' or 'utils/logger' or 'src/utils/logger'
    
    // Ignore if it's already pointing to src/
    if (importPath.startsWith('src/')) return match;

    const possiblePath1 = path.join(__dirname, importPath + '.js');
    const possiblePath2 = path.join(__dirname, importPath, 'index.js');
    const possibleSrcPath1 = path.join(__dirname, 'src', importPath + '.js');
    const possibleSrcPath2 = path.join(__dirname, 'src', importPath, 'index.js');

    if (fs.existsSync(possibleSrcPath1) || fs.existsSync(possibleSrcPath2)) {
      if (!fs.existsSync(possiblePath1) && !fs.existsSync(possiblePath2)) {
        changed = true;
        return `require('../src/${importPath}')`;
      }
    }
    return match;
  });

  if (changed) {
    fs.writeFileSync(p, content);
    console.log('Fixed paths dynamically in: ' + file);
  }
}
