const fs = require('fs');
const path = require('path');
const routesDir = path.join(__dirname, 'routes');
if (fs.existsSync(routesDir)) {
  const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));
  for (const file of files) {
    const p = path.join(routesDir, file);
    let content = fs.readFileSync(p, 'utf8');
    if (content.includes("require('../src/services/")) {
      content = content.replace(/require\(['"`]\.\.\/src\/services\//g, "require('../services/");
      fs.writeFileSync(p, content);
      console.log('Reverted services path in: ' + file);
    }
  }
}
