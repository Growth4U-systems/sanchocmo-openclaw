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
  
  // Serve brand/ files as rendered HTML — per client: /brand/:slug/ and /brand/:slug/file.md
  if (url.startsWith('/brand/') || url === '/brand') {
    const brandBase = path.join(BASE, 'brand');
    const STYLE = `<link href="https://fonts.googleapis.com/css2?family=Bangers&family=Comic+Neue:wght@400;700&display=swap" rel="stylesheet">
<style>body{font-family:'Comic Neue',cursive;background:#F5F0E6;color:#1A1A2E;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.7;}
h1{font-family:'Bangers',cursive;color:#C45D35;}h2{color:#1E3A5F;margin-top:24px;}h3{color:#C45D35;}
strong{color:#1A1A2E;}ul{padding-left:20px;}li{margin:4px 0;}a{color:#C45D35;text-decoration:none;font-weight:700;}a:hover{text-decoration:underline;}
.card{margin:10px 0;padding:10px 14px;background:#FDF8EF;border:2px solid #1A1A2E;border-radius:6px;box-shadow:3px 3px 0 #1A1A2E;list-style:none;}
.back{font-size:14px;color:#5D5348;font-weight:400;}</style>`;

    if (url === '/brand' || url === '/brand/') {
      // List all clients (subdirectories)
      try {
        const clients = fs.readdirSync(brandBase).filter(f => fs.statSync(path.join(brandBase, f)).isDirectory() && !f.startsWith('.'));
        const list = clients.map(c => {
          const files = fs.readdirSync(path.join(brandBase, c)).filter(f => f.endsWith('.md')).length;
          return `<div class="card"><a href="/mc/brand/${c}/" style="font-size:18px;">${c}</a><div style="color:#5D5348;font-size:13px;">${files} documentos</div></div>`;
        }).join('\n');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Brand — SanchoCMO</title>${STYLE}</head><body>
<a class="back" href="/mc#">← Mission Control</a>
<h1>📂 Brand por Cliente</h1>${list}</body></html>`);
      } catch { res.writeHead(404); res.end('Brand directory not found'); }
      return;
    }

    // Parse /brand/:slug/ or /brand/:slug/file.md
    const parts = url.replace('/brand/', '').split('/').filter(Boolean);
    const slug = parts[0];
    const file = parts[1] || null;
    if (!slug || slug.includes('..')) { res.writeHead(403); res.end('Forbidden'); return; }
    const clientBrand = path.join(brandBase, slug);

    if (!file || file === '') {
      // List files for this client
      try {
        const files = fs.readdirSync(clientBrand).filter(f => f.endsWith('.md')).sort();
        const list = files.map(f => `<div class="card"><a href="/mc/brand/${slug}/${f}">${f.replace('.md','')}</a></div>`).join('\n');
        const prettyName = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${prettyName} — Brand</title>${STYLE}</head><body>
<a class="back" href="/mc/brand/">← Todos los clientes</a>
<h1>📂 ${prettyName}</h1>${list}</body></html>`);
      } catch { res.writeHead(404); res.end('Client brand not found'); }
      return;
    }

    // Serve individual file
    if (!file.endsWith('.md') || file.includes('..')) { res.writeHead(403); res.end('Forbidden'); return; }
    const filePath = path.join(clientBrand, file);
    try {
      const md = fs.readFileSync(filePath, 'utf-8');
      let html = md
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>\n?)+/g, (m) => '<ul>' + m + '</ul>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');
      html = '<p>' + html + '</p>';
      const title = file.replace('.md','');
      const prettyName = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${title} — ${prettyName}</title>${STYLE}</head><body>
<a class="back" href="/mc/brand/${slug}/">← ${prettyName}</a>
<div>${html}</div></body></html>`);
    } catch { res.writeHead(404); res.end('File not found'); }
    return;
  }

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
