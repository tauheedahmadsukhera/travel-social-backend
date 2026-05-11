const fs = require('fs');
const path = require('path');
const filesToMove = ['auth.js', 'follow.js', 'groups.js', 'passport.js', 'public.js', 'upload.js'];
for (const file of filesToMove) {
  const srcPath = path.join(__dirname, 'routes', file);
  const destPath = path.join(__dirname, 'src', 'routes', file);
  if (fs.existsSync(srcPath)) {
    let content = fs.readFileSync(srcPath, 'utf8');
    content = content.replace(/require\(['"`]\.\.\/src\//g, "require('../");
    fs.writeFileSync(destPath, content);
    console.log('Moved and fixed: ' + file);
  } else {
    console.log('Not found: ' + file);
  }
}
