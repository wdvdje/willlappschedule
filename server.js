// Simple static file server (no external deps). Run: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const ROOT = process.cwd();

const mime = {
  '.html':'text/html', '.js':'application/javascript', '.css':'text/css',
  '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg',
  '.svg':'image/svg+xml', '.ico':'image/x-icon', '.txt':'text/plain'
};

http.createServer((req, res) => {
  try {
    let reqPath = decodeURIComponent(req.url.split('?')[0]);
    if (reqPath === '/' ) reqPath = '/index.html';
    const filePath = path.join(ROOT, reqPath);
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
    fs.stat(filePath, (err, st) => {
      if (err) {
        res.writeHead(404); res.end('Not found');
        return;
      }
      if (st.isDirectory()) {
        res.writeHead(302, { Location: reqPath.endsWith('/') ? (reqPath + 'index.html') : (reqPath + '/index.html') });
        res.end();
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const type = mime[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
      fs.createReadStream(filePath).pipe(res);
    });
  } catch (e) {
    res.writeHead(500); res.end('Server error');
  }
}).listen(PORT, ()=> console.log(`Static server running at http://localhost:${PORT}`));
