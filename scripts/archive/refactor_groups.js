const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, 'src', 'index.js');
let content = fs.readFileSync(indexPath, 'utf8');

console.log('Original size:', content.length);

// Remove Group model and routes
const groupStart = content.indexOf("const groupSchema = new mongoose.Schema({");
const groupEnd = content.indexOf("// ============= END GROUPS =============");

if (groupStart !== -1 && groupEnd !== -1) {
  // We want to remove from just before the try/catch around the Group definition
  const actualStart = content.lastIndexOf("try {", groupStart);
  if (actualStart !== -1) {
    content = content.substring(0, actualStart) + content.substring(groupEnd + "// ============= END GROUPS =============".length);
  }
}

// Insert Group router mount
const mountPoint = "app.use('/api/posts', require('../routes/posts_extended'));";
const mountCode = `\napp.use('/api/groups', require('../routes/groups'));`;
content = content.replace(mountPoint, mountPoint + mountCode);

fs.writeFileSync(indexPath, content, 'utf8');
console.log('New size:', content.length);
console.log('Refactoring groups successful!');
