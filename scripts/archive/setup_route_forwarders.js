const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, '../routes');
const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));

files.forEach(file => {
  const nameWithoutExt = file.replace('.js', '');
  const content = `// Alias forwarding file to guarantee backward compatibility\nmodule.exports = require('../src/routes/legacy/${nameWithoutExt}');\n`;
  fs.writeFileSync(path.join(routesDir, file), content, 'utf8');
});

console.log(`✅ Successfully updated ${files.length} route files with forwarding exports.`);
