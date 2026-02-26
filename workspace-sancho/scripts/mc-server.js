const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 18790;
const BASE = path.join(__dirname, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const ALLOWED = [
  'mission-control.html',
  'mc-data.js',
  'clients.js',
  'skills-data.js',
  'agents-data.js',
];

http.createServer((req, res) => {
  let url = req.url.split('?')[0];
  // Strip /mc/ prefix (Tailscale serve routes /mc → this server)
  if (url.startsWith('/mc/')) url = url.slice(3);
  if (url === '/' || url === '/mc') url = '/mission-control.html';
  
  const filename = path.basename(url);
  if (!ALLOWED.includes(filename)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const filePath = path.join(BASE, filename);
  try {
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filename);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Mission Control server on http://127.0.0.1:${PORT}`);
});
