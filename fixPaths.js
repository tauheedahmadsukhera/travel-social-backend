const fs = require('fs');
const path = require('path');
const routesDir = path.join(__dirname, 'routes');
if (fs.existsSync(routesDir)) {
  const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));
  for (const file of files) {
    const p = path.join(routesDir, file);
    let content = fs.readFileSync(p, 'utf8');
    let changed = false;
    
    // Fix models
    if (content.includes("require('../models/")) {
      content = content.replace(/require\(['"`]\.\.\/models\//g, "require('../src/models/");
      changed = true;
    }
    // Fix utils
    if (content.includes("require('../utils/")) {
      content = content.replace(/require\(['"`]\.\.\/utils\//g, "require('../src/utils/");
      changed = true;
    }
    // Fix services
    if (content.includes("require('../services/")) {
      content = content.replace(/require\(['"`]\.\.\/services\//g, "require('../src/services/");
      changed = true;
    }
    // Fix middleware
    if (content.includes("require('../middleware/")) {
      content = content.replace(/require\(['"`]\.\.\/middleware\//g, "require('../src/middleware/");
      changed = true;
    }

    if (changed) {
      fs.writeFileSync(p, content);
      console.log('Fixed paths in: ' + file);
    }
  }
}
