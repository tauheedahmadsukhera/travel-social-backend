const fs = require('fs');
const path = require('path');

const legacyDir = path.join(__dirname, '../src/routes/legacy');
const files = fs.readdirSync(legacyDir).filter(f => f.endsWith('.js'));

files.forEach(file => {
  const filePath = path.join(legacyDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace imports that pointed to relative paths from root routes/
  content = content.replace(/require\(['"]\.\.\/src\//g, "require('../../");
  content = content.replace(/require\(['"]\.\.\/services\//g, "require('../../services/");
  content = content.replace(/require\(['"]\.\.\/utils\//g, "require('../../utils/");

  fs.writeFileSync(filePath, content, 'utf8');
});

console.log(`✅ Successfully updated relative import paths in ${files.length} legacy route files.`);
