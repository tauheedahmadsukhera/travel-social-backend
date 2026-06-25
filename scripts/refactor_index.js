const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, 'src', 'index.js');
let content = fs.readFileSync(indexPath, 'utf8');

console.log('Original size:', content.length);

// 1. Remove enrichPostsWithUserData
content = content.replace(/async function enrichPostsWithUserData\(posts\) \{[\s\S]*?\n\}\n/, '');

// 2. Remove /api/posts/location-count up to /api/posts/:postId PATCH
const locationCountStart = content.indexOf("// GET /api/posts/location-count");
const commentsRoutesStart = content.indexOf("// Comments routes");
if (locationCountStart !== -1 && commentsRoutesStart !== -1) {
  content = content.substring(0, locationCountStart) + content.substring(commentsRoutesStart);
}

// 3. Remove GET /api/posts
const getPostsStart = content.indexOf("app.get('/api/posts', async (req, res, next) => {");
const escapeRegExpStart = content.indexOf("function escapeRegExp(str) {");
if (getPostsStart !== -1 && escapeRegExpStart !== -1) {
  content = content.substring(0, getPostsStart) + content.substring(escapeRegExpStart);
}

// 4. Remove helper functions
const isPostVisibleStart = content.indexOf("function isPostVisibleToViewer");
const locationSuggestStart = content.indexOf("app.get('/api/locations/suggest'");

if (escapeRegExpStart !== -1 && locationSuggestStart !== -1) {
  content = content.substring(0, escapeRegExpStart) + content.substring(locationSuggestStart);
}

// 5. Insert imports and router mount
const mountCode = `
const { enrichPostsWithUserData, isPostVisibleToViewer, escapeRegExp, uniqueLocationKeys, normalizePostLocation } = require('../utils/postHelpers');
app.use('/api/posts', require('../routes/posts_extended'));

// Comments routes
`;
content = content.replace("// Comments routes", mountCode);

fs.writeFileSync(indexPath, content, 'utf8');
console.log('New size:', content.length);
console.log('Refactoring successful!');
