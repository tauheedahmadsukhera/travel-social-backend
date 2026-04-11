const http = require('http');

http.get('http://localhost:5000/api/posts', (res) => {
  let data = '';
  console.log('Status:', res.statusCode);
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Body:', data);
    process.exit(0);
  });
}).on('error', err => {
  console.error('Error:', err.message);
  process.exit(1);
});
