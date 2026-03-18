const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync, exec: execCb } = require('child_process');

const PORT = 18790;
const BASE = path.join(__dirname, '..');
const API_HEALTH_FILE = path.join(BASE, '_system', 'api-health.json');
const CLIENTS_FILE = path.join(BASE, 'clients.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const ALLOWED_FILES = [
  'mission-control.html',
  'mc-data.js',
  'clients.js',
  'skills-data.js',
  'agents-data.js',
];

// Directories accessible via /docs/ viewer

// Foundation section order (matches actual directory structure + foundation-state.json)
const FOUNDATION_ORDER = [
  { cat: '🏢 La Empresa', folder: 'company-brief', pillarsKey: 'skills' },
  { cat: '📊 El Mercado & Nosotros', folder: 'market-and-us', pillarsKey: 'pillars' },
  { cat: '🎯 Go-To-Market', folder: 'go-to-market', pillarsKey: 'pillars' },
  { cat: '🎨 Brand Identity', folder: 'brand-identity', pillarsKey: 'pillars' },
];
const PILLAR_FLAT = FOUNDATION_ORDER.map(g => g.folder);

// Recursive .md file counter (skips _ and . dirs)
function countMdFiles(dirPath) {
  let count = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) count += countMdFiles(full);
      else if (entry.name.endsWith('.md')) count++;
    }
  } catch {}
  return count;
}

const DOC_ROOTS = {
  'brand':  path.join(BASE, 'brand'),
  'prds':   path.join(BASE, '_system', 'prds'),
  'skills': path.join(BASE, 'skills'),
  'memory': path.join(BASE, 'memory'),
};

const STYLE = `<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Nunito:ital,wght@0,400;0,600;0,700;1,400;1,600&display=swap" rel="stylesheet">
<style>
body{font-family:'Nunito',sans-serif;background:#FFFDF9;color:#1A1A2E;max-width:1200px;margin:40px auto;padding:0 40px;line-height:1.85;font-size:17px;}
h1{font-family:'Space Grotesk';font-size:2.2em,cursive;color:#C45D35;}h2{color:#1E3A5F;margin-top:24px;}h3{color:#C45D35;}h4{color:#5D5348;}
strong{color:#1A1A2E;}ul{padding-left:20px;}li{margin:1px 0;line-height:1.4;padding:0;}ul{margin:8px 0;line-height:1.4;}ol{margin:8px 0;line-height:1.4;}li p{margin:0;padding:0;line-height:1.4;display:inline;}ul ul{margin:2px 0;}p+ul{margin-top:-8px;}p+ol{margin-top:-8px;}
a{color:#C45D35;text-decoration:none;font-weight:700;}a:hover{text-decoration:underline;}
.card{margin:8px 0;padding:10px 14px;background:#FDF8EF;border:2px solid #1A1A2E;border-radius:6px;box-shadow:3px 3px 0 #1A1A2E;}
.card a{font-size:16px;}
.card .meta{color:#5D5348;font-size:13px;margin-top:2px;}
.back{font-size:14px;color:#5D5348;font-weight:400;}
.nav{display:flex;gap:16px;margin:16px 0;flex-wrap:wrap;}
.nav a{padding:6px 14px;background:#FDF8EF;border:2px solid #1A1A2E;border-radius:6px;font-size:14px;box-shadow:2px 2px 0 #1A1A2E;}
.nav a:hover{background:#C45D35;color:#FDF8EF;}
table{border-collapse:collapse;width:100%;margin:12px 0;}
th,td{border:2px solid #1A1A2E;padding:10px 14px;text-align:left;font-size:16px;}
th{background:#1A1A2E;color:#F5F0E6;font-family:'Space Grotesk',sans-serif;letter-spacing:0.5px;}
tr:nth-child(even){background:#FDF8EF;}
code{background:#FDF8EF;padding:2px 6px;border-radius:4px;font-size:13px;border:1px solid #D4C9B0;}
pre{background:#FDF8EF;padding:12px;border:2px solid #1A1A2E;border-radius:6px;overflow-x:auto;font-size:13px;}
pre code{border:none;padding:0;}
blockquote{border-left:4px solid #C45D35;margin:12px 0;padding:8px 16px;background:#FDF8EF;font-style:italic;}
</style>`;

function renderMarkdown(md) {
  // Use marked.js loaded in browser for rendering
  // Server-side: return raw markdown wrapped in a div that client-side marked.js will render
  // Since marked.js runs client-side, we pass the raw markdown and render in browser
  // For server-side rendering, use a simple but robust approach:
  
  // Protect code blocks
  const codeBlocks = [];
  let processed = md.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    codeBlocks.push(`<pre><code>${code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').trim()}</code></pre>`);
    return `%%CODEBLOCK_${codeBlocks.length - 1}%%`;
  });
  
  // Return markdown in a special div that will be rendered client-side by marked.js
  // But also include a noscript fallback
  const escaped = processed.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  
  // Restore code blocks in escaped version
  let result = escaped.replace(/%%CODEBLOCK_(\d+)%%/g, (_, i) => codeBlocks[i]);
  
  // Actually, let's do server-side with marked since it's simpler
  // We'll pass raw md to the browser and render there
  return `<div class="md-raw" style="display:none;">${md.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div><div class="md-rendered"></div>
<script>
if (typeof marked !== 'undefined') {
  const raw = document.querySelector('.md-raw');
  const rendered = document.querySelector('.md-rendered');
  if (raw && rendered) {
    marked.setOptions({ breaks: true, gfm: true });
    rendered.innerHTML = marked.parse(raw.textContent);
    raw.style.display = 'none';
    // Style links
    rendered.querySelectorAll('a').forEach(a => { a.style.color = '#C45D35'; a.target = '_blank'; });
  }
}
</script>`;
}

function page(title, breadcrumb, content, opts = {}) {
  const editJS = opts.editable ? `
<link rel="stylesheet" href="https://uicdn.toast.com/editor/latest/toastui-editor.min.css">
<script src="https://uicdn.toast.com/editor/latest/toastui-editor-all.min.js"></script>
<script>
let editor = null;
function toggleEdit() {
  const view = document.getElementById('doc-view');
  const edit = document.getElementById('doc-edit');
  if (edit.style.display === 'none') {
    edit.style.display = 'block'; view.style.display = 'none';
    if (!editor) {
      editor = new toastui.Editor({
        el: document.getElementById('editor-container'),
        height: '75vh',
        initialEditType: 'wysiwyg',
        previewStyle: 'vertical',
        initialValue: document.getElementById('doc-raw').textContent,
        toolbarItems: [
          ['heading', 'bold', 'italic', 'strike'],
          ['hr', 'quote'],
          ['ul', 'ol', 'task'],
          ['table', 'link'],
          ['code', 'codeblock'],
          ['scrollSync']
        ]
      });
    }
  } else {
    edit.style.display = 'none'; view.style.display = 'block';
  }
}
async function saveDoc() {
  const btn = document.getElementById('save-btn');
  const status = document.getElementById('save-status');
  btn.disabled = true; btn.textContent = 'Guardando...';
  try {
    const md = editor.getMarkdown();
    const res = await fetch(window.location.pathname, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
      body: md
    });
    if (res.ok) {
      status.textContent = '✅ Guardado'; status.style.color = 'var(--green,#2a9d2a)';
      setTimeout(() => location.reload(), 500);
    } else {
      status.textContent = '❌ Error: ' + res.statusText; status.style.color = 'var(--rust,#C45D35)';
    }
  } catch(e) { status.textContent = '❌ ' + e.message; status.style.color = 'var(--rust,#C45D35)'; }
  btn.disabled = false; btn.textContent = '💾 Guardar';
}
</script>` : '';

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${title} — SanchoCMO</title>${STYLE}
<style>#edit-area{width:100%;min-height:75vh;font-family:'Nunito',monospace;font-size:14px;padding:12px;border:2px solid var(--ink,#1A1A2E);border-radius:6px;background:var(--paper,#FDF8EF);resize:vertical;line-height:1.6;}
.edit-bar{display:flex;gap:10px;align-items:center;margin:10px 0;}.edit-btn{padding:6px 14px;background:var(--paper,#FDF8EF);border:2px solid var(--ink,#1A1A2E);border-radius:6px;cursor:pointer;font-family:'Nunito',sans-serif;font-weight:700;font-size:14px;box-shadow:2px 2px 0 var(--ink,#1A1A2E);}.edit-btn:hover{background:var(--rust,#C45D35);color:var(--paper,#FDF8EF);}</style>
</head><body>
${breadcrumb}${opts.editable ? ' <button class="edit-btn" onclick="toggleEdit()" style="float:right;margin-top:-30px;">✏️ Editar</button>' : ''}
<div id="doc-view">${content}</div>
${opts.editable ? `<div id="doc-edit" style="display:none;"><div class="edit-bar"><button id="save-btn" class="edit-btn" onclick="saveDoc()">💾 Guardar</button><button class="edit-btn" onclick="toggleEdit()">✖ Cancelar</button><span id="save-status"></span></div><div id="editor-container"></div></div><script type="text/plain" id="doc-raw">${opts.rawMd || ''}</script>` : ''}
${editJS}
</body></html>`;
}

function listDir(dirPath, urlPrefix, opts = {}) {
  const entries = fs.readdirSync(dirPath);
  const allDirs = entries.filter(f => {
    try { return fs.statSync(path.join(dirPath, f)).isDirectory() && !f.startsWith('.'); } catch { return false; }
  });
  const files = entries.filter(f => f.endsWith('.md') || f.endsWith('.html')).sort();

  // Detect if this is a brand/{slug} level (pillar listing)
  const isBrandClient = opts.brandPillars || false;
  const brandSection = opts.brandSection || null;

  let html = '';

  // === Section-level view: brand/{slug}/{section}/ ===
  if (brandSection) {
    let fSections = {};
    try {
      const stateFile = path.join(dirPath, '..', 'foundation-state.json');
      const stateData = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
      fSections = stateData.sections || {};
    } catch {}

    const section = fSections[brandSection.section] || {};
    const group = FOUNDATION_ORDER.find(g => g.folder === brandSection.section);
    const pillarsKey = group ? group.pillarsKey : 'pillars';
    const pillars = section[pillarsKey] || {};
    const syntheses = section.syntheses || {};

    // Map pillar names to directory names (for linking)
    const pillarDirMap = {
      'market-analysis': 'market',
      'competitor-analysis': 'competitors',
      'self-analysis': 'self',
      'swot': 'swot',
      'niche-discovery': 'ecps',
      'existing-customer-data': 'existing-customer-data',
      'positioning': 'positioning',
      'pricing': 'pricing',
      'brand-voice': 'voice-profile',
      'visual-identity': 'visual-identity',
      // company-brief skills
      'company-context': null,
      'business-model': null,
      'budget': null,
    };

    const statusIcon = (s) => {
      if (s === 'approved' || s === 'done') return '✅';
      if (s === 'generated') return '📝';
      if (s === 'in-progress' || s === 'draft' || s === 'pending-review' || s === 'pending-approval') return '⚠️';
      return '⬜';
    };
    const statusLabel = (s) => {
      const labels = { 'approved': 'Validado', 'done': 'Completado', 'in-progress': 'En progreso', 'draft': 'Borrador', 'pending-review': 'Pendiente revisión', 'pending-approval': 'Pendiente aprobación', 'generated': 'Generado', 'not-started': 'No iniciado', 'not-generated': 'No generado' };
      return labels[s] || s;
    };

    // Show pillars
    html += '<h2 style="font-family:\'Space Grotesk\',sans-serif;color:#C45D35;margin-bottom:12px;">Pilares</h2>\n';
    for (const [pName, pData] of Object.entries(pillars)) {
      const pStatus = pData.status || 'not-started';
      const icon = statusIcon(pStatus);
      const label = statusLabel(pStatus);
      const displayName = pName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const optional = pData.optional ? ' <span style="font-size:11px;color:#5D5348;">(opcional)</span>' : '';
      const dirName = pillarDirMap[pName] || pName;
      const dirExists = dirName && (() => { try { return fs.statSync(path.join(dirPath, dirName)).isDirectory(); } catch { return false; } })();
      const fileCount = dirExists ? countMdFiles(path.join(dirPath, dirName)) : 0;

      const cardStyle = pStatus === 'approved' || pStatus === 'done' ? '' : pStatus === 'not-started' ? 'opacity:0.55;' : 'border-left:4px solid #E5A100;';
      const metaColor = pStatus === 'approved' || pStatus === 'done' ? '' : pStatus === 'not-started' ? 'color:#999;' : 'color:#B8860B;';

      if (dirExists) {
        html += `<div class="card" style="${cardStyle}"><a href="${urlPrefix}${dirName}/">${icon} ${displayName}</a>${optional}<div class="meta" style="${metaColor}">${label} · ${fileCount} docs</div></div>\n`;
      } else {
        html += `<div class="card" style="${cardStyle}"><span>${icon} ${displayName}</span>${optional}<div class="meta" style="${metaColor}">${label}</div></div>\n`;
      }
    }

    // Show syntheses
    const synthKeys = Object.keys(syntheses);
    if (synthKeys.length > 0) {
      html += '<h2 style="font-family:\'Space Grotesk\',sans-serif;color:#C45D35;margin:20px 0 12px;">Síntesis</h2>\n';
      for (const [sName, sData] of Object.entries(syntheses)) {
        const sStatus = sData.status || 'not-generated';
        const icon = statusIcon(sStatus);
        const label = statusLabel(sStatus);
        const displayName = sName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const dirName = sName;
        const dirExists = (() => { try { return fs.statSync(path.join(dirPath, dirName)).isDirectory(); } catch { return false; } })();
        const cardStyle = sStatus === 'generated' || sStatus === 'pending-approval' ? 'border-left:4px solid #4A90D9;' : 'opacity:0.55;';

        if (dirExists) {
          html += `<div class="card" style="${cardStyle}"><a href="${urlPrefix}${dirName}/">${icon} ${displayName}</a> <span style="font-size:11px;color:#5D5348;">(síntesis)</span><div class="meta">${label}</div></div>\n`;
        } else {
          html += `<div class="card" style="${cardStyle}"><span>${icon} ${displayName}</span> <span style="font-size:11px;color:#5D5348;">(síntesis)</span><div class="meta">${label}</div></div>\n`;
        }
      }
    }

    // Show remaining dirs (_qa, sources, etc.)
    const knownDirs = new Set(Object.values(pillarDirMap).filter(Boolean));
    Object.keys(syntheses).forEach(s => knownDirs.add(s));
    const remainingDirs = allDirs.filter(d => !knownDirs.has(d) && d !== '_archive').sort();
    if (remainingDirs.length > 0) {
      html += '<h2 style="font-family:\'Space Grotesk\',sans-serif;color:#C45D35;margin:20px 0 12px;">Otros</h2>\n';
      for (const d of remainingDirs) {
        const subFiles = countMdFiles(path.join(dirPath, d));
        html += `<div class="card"><a href="${urlPrefix}${d}/">📂 ${d}</a><div class="meta">${subFiles} documentos</div></div>\n`;
      }
    }

    // Show loose .md files at this level
    for (const f of files) {
      const stat2 = fs.statSync(path.join(dirPath, f));
      const size = stat2.size > 1024 ? `${(stat2.size / 1024).toFixed(1)}KB` : `${stat2.size}B`;
      html += `<div class="card"><a href="${urlPrefix}${f}">${f.replace('.md', '')}</a><div class="meta">${size}</div></div>\n`;
    }

    if (!html) html = '<p style="color:#5D5348;">No hay documentos aquí.</p>';
    return html;
  }

  if (isBrandClient) {
    // Load foundation-state.json for section/pillar statuses
    let fSections = {};
    try {
      const stateFile = path.join(dirPath, 'foundation-state.json');
      const stateData = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
      fSections = stateData.sections || {};
    } catch {}

    const existing = new Set(allDirs);
    for (const group of FOUNDATION_ORDER) {
      const d = group.folder;
      const section = fSections[d] || {};
      const sectionStatus = section.status || 'not-started';
      const pillars = section[group.pillarsKey] || {};
      const pillarNames = Object.keys(pillars);
      const approvedCount = pillarNames.filter(p => pillars[p].status === 'approved').length;
      const totalCount = pillarNames.length;

      html += `<h2 style="margin:24px 0 10px;font-family:'Space Grotesk',sans-serif;font-size:1.4em;color:#C45D35;">${group.cat}</h2>\n`;

      if (existing.has(d)) {
        existing.delete(d);
        const subFiles = countMdFiles(path.join(dirPath, d));

        // Section card with link
        const sIcon = sectionStatus === 'approved' ? '✅' : '⚠️';
        const sStyle = sectionStatus === 'approved'
          ? ''
          : 'border-left:4px solid #E5A100;';
        const sMeta = sectionStatus === 'approved'
          ? `${subFiles} documentos · Validado`
          : `${subFiles} documentos · ${approvedCount}/${totalCount} pilares validados`;
        const sMetaStyle = sectionStatus === 'approved' ? '' : 'color:#B8860B;';
        html += `<div class="card" style="${sStyle}"><a href="${urlPrefix}${d}/">${sIcon} ${d}</a><div class="meta" style="${sMetaStyle}">${sMeta}</div></div>\n`;

        // Individual pillar statuses within the section
        if (pillarNames.length > 0) {
          html += '<div style="margin-left:24px;margin-bottom:8px;">\n';
          for (const pName of pillarNames) {
            const p = pillars[pName];
            const pStatus = p.status || 'not-started';
            const displayName = pName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            const optional = p.optional ? ' <span style="font-size:10px;color:#5D5348;">(opcional)</span>' : '';
            if (pStatus === 'approved') {
              html += `<div style="padding:3px 0;font-size:14px;">✅ ${displayName}${optional}</div>\n`;
            } else if (pStatus === 'draft' || pStatus === 'in-progress' || pStatus === 'pending-review') {
              html += `<div style="padding:3px 0;font-size:14px;color:#B8860B;">⚠️ ${displayName}${optional}</div>\n`;
            } else {
              html += `<div style="padding:3px 0;font-size:14px;opacity:0.45;">⬜ ${displayName}${optional}</div>\n`;
            }
          }
          html += '</div>\n';
        }

        // Syntheses
        const syntheses = section.syntheses || {};
        const synthNames = Object.keys(syntheses);
        if (synthNames.length > 0) {
          for (const sn of synthNames) {
            const sv = syntheses[sn];
            const st = sv.status || 'not-generated';
            const icon = st === 'generated' ? '📝' : '⬜';
            const opacity = st === 'generated' ? '1' : '0.45';
            html += `<div style="margin-left:24px;padding:3px 0;font-size:14px;font-style:italic;opacity:${opacity};">${icon} ${sn.replace(/-/g, ' ')} <span style="font-size:10px;color:#5D5348;">(síntesis)</span></div>\n`;
          }
        }
      } else {
        html += `<div class="card" style="opacity:0.45;"><span>⬜ ${d}</span><div class="meta">No existe</div></div>\n`;
      }
    }
    // Any remaining dirs not in Foundation order
    const foundationFolders = new Set(FOUNDATION_ORDER.map(g => g.folder));
    const remaining = [...existing].filter(d => !foundationFolders.has(d) && d !== '_archive').sort();
    if (remaining.length) {
      html += `<h2 style="margin:24px 0 10px;font-family:'Space Grotesk',sans-serif;font-size:1.4em;color:#C45D35;">📁 Otros</h2>\n`;
      for (const d of remaining) {
        const subFiles = countMdFiles(path.join(dirPath, d));
        html += `<div class="card"><a href="${urlPrefix}${d}/">📂 ${d}</a><div class="meta">${subFiles} documentos</div></div>\n`;
      }
    }
  } else {
    // Default alphabetical listing
    const dirs = allDirs.sort();
    for (const d of dirs) {
      const subFiles = countMdFiles(path.join(dirPath, d));
      html += `<div class="card"><a href="${urlPrefix}${d}/">📂 ${d}</a><div class="meta">${subFiles} documentos</div></div>\n`;
    }
  }

  // Files
  for (const f of files) {
    const stat = fs.statSync(path.join(dirPath, f));
    const size = stat.size > 1024 ? `${(stat.size / 1024).toFixed(1)}KB` : `${stat.size}B`;
    const modified = stat.mtime.toISOString().slice(0, 16).replace('T', ' ');
    html += `<div class="card"><a href="${urlPrefix}${f}">${f.replace('.md', '')}</a><div class="meta">${size} · ${modified}</div></div>\n`;
  }

  if (!html) html = '<p style="color:#5D5348;">No hay documentos aquí.</p>';
  return html;
}

// ========== Env Var Management ==========
const ENV_FILE = path.join(BASE, '..', '.env');

// Map service → env var names needed
const SERVICE_ENV_MAP = {
  anthropic:  [{ key: 'ANTHROPIC_API_KEY', label: 'API Key', placeholder: 'sk-ant-...' }],
  openrouter: [{ key: 'OPENROUTER_API_KEY', label: 'API Key', placeholder: 'sk-or-...' }],
  openai:     [{ key: 'OPENAI_API_KEY', label: 'API Key', placeholder: 'sk-...' }],
  gemini:     [{ key: 'GEMINI_API_KEY', label: 'API Key', placeholder: 'AIza...' }],
  xai:        [{ key: 'XAI_API_KEY', label: 'API Key', placeholder: 'xai-...' }],
  minimax:    [{ key: 'MINIMAX_API_KEY', label: 'API Key', placeholder: 'eyJ...' }],
  brave:      [{ key: 'BRAVE_API_KEY', label: 'API Key', placeholder: 'BSA...' }],
  apify:      [{ key: 'APIFY_API_KEY', label: 'API Key', placeholder: 'apify_api_...' }],
  firecrawl:  [{ key: 'FIRECRAWL_API_KEY', label: 'API Key', placeholder: 'fc-...' }],
  serper:     [{ key: 'SERPER_API_KEY', label: 'API Key', placeholder: '' }],
  dataforseo: [{ key: 'DATAFORSEO_LOGIN', label: 'Login (email)', placeholder: 'you@email.com' }, { key: 'DATAFORSEO_PASSWORD', label: 'Password', placeholder: '' }],
  notion:     [{ key: 'NOTION_API_KEY', label: 'Integration Token', placeholder: 'ntn_...' }],
  supabase:   [{ key: 'SUPABASE_URL', label: 'Project URL', placeholder: 'https://xxx.supabase.co' }, { key: 'SUPABASE_ANON_KEY', label: 'Anon Key', placeholder: 'eyJ...' }],
  fal:        [{ key: 'FAL_API_KEY', label: 'API Key', placeholder: '' }],
  wavespeed:  [{ key: 'WAVESPEED_API_KEY', label: 'API Key', placeholder: '' }],
  dumpling:   [{ key: 'DUMPLING_API_KEY', label: 'API Key', placeholder: '' }],
  instantly:  [{ key: 'INSTANTLY_API_KEY', label: 'API Key', placeholder: '' }],
  metricool:  [{ key: 'METRICOOL_API_KEY', label: 'API Key', placeholder: '' }],
};

function maskKey(val) {
  if (!val || val.length < 8) return val ? '••••' : '';
  return val.slice(0, 4) + '•'.repeat(Math.min(val.length - 8, 20)) + val.slice(-4);
}

function readEnvFile() {
  try { return fs.readFileSync(ENV_FILE, 'utf-8'); } catch { return ''; }
}

function parseEnv(content) {
  const vars = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    vars[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return vars;
}

function setEnvVars(updates) {
  // updates = { KEY: value, ... }
  let content = readEnvFile();
  const lines = content.split('\n');

  for (const [key, value] of Object.entries(updates)) {
    let found = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith(key + '=')) {
        lines[i] = `${key}=${value}`;
        found = true;
        break;
      }
    }
    if (!found) lines.push(`${key}=${value}`);
  }

  fs.writeFileSync(ENV_FILE, lines.join('\n'), 'utf-8');
  // Also set in current process env so health checks pick them up immediately
  for (const [key, value] of Object.entries(updates)) {
    process.env[key] = value;
  }
}

// ========== API Health Check Logic ==========

function loadApiHealth() {
  try { return JSON.parse(fs.readFileSync(API_HEALTH_FILE, 'utf-8')); }
  catch { return { lastCheck: null, services: {} }; }
}

function saveApiHealth(data) {
  data.lastCheck = new Date().toISOString();
  fs.writeFileSync(API_HEALTH_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function checkService(serviceId) {
  return new Promise((resolve) => {
    const now = new Date().toISOString();
    const timeout = 15000;
    // Read env vars from .env file (MC server may not have them in process.env)
    const _envVars = parseEnv(readEnvFile());
    const getKey = (k) => _envVars[k] || process.env[k];

    switch (serviceId) {
      case 'anthropic': {
        const key = getKey('ANTHROPIC_API_KEY');
        if (!key) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'ANTHROPIC_API_KEY not set' } });
        try {
          const res = execSync(`curl -s -o /dev/null -w "%{http_code}" -H "x-api-key: ${key}" -H "anthropic-version: 2023-06-01" https://api.anthropic.com/v1/models -m 10`, { timeout, encoding: 'utf-8' }).trim();
          resolve({ status: res === '200' ? 'ok' : 'error', lastCheck: now, details: { httpCode: res } });
        } catch (e) { resolve({ status: 'error', lastCheck: now, details: { error: e.message.slice(0, 200) } }); }
        break;
      }
      case 'openrouter': {
        const key = getKey('OPENROUTER_API_KEY');
        if (!key) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'OPENROUTER_API_KEY not set' } });
        try {
          const res = execSync(`curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ${key}" https://openrouter.ai/api/v1/models -m 10`, { timeout, encoding: 'utf-8' }).trim();
          resolve({ status: res === '200' ? 'ok' : 'error', lastCheck: now, details: { httpCode: res } });
        } catch (e) { resolve({ status: 'error', lastCheck: now, details: { error: e.message.slice(0, 200) } }); }
        break;
      }
      case 'brave': {
        const key = getKey('BRAVE_API_KEY') || getKey('BRAVE_SEARCH_API_KEY');
        if (!key) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'BRAVE_API_KEY not set' } });
        try {
          const res = execSync(`curl -s -o /dev/null -w "%{http_code}" -H "X-Subscription-Token: ${key}" "https://api.search.brave.com/res/v1/web/search?q=test&count=1" -m 10`, { timeout, encoding: 'utf-8' }).trim();
          resolve({ status: res === '200' ? 'ok' : 'error', lastCheck: now, details: { httpCode: res } });
        } catch (e) { resolve({ status: 'error', lastCheck: now, details: { error: e.message.slice(0, 200) } }); }
        break;
      }
      case 'apify': {
        const key = getKey('APIFY_TOKEN') || getKey('APIFY_API_KEY');
        if (!key) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'APIFY_TOKEN not set' } });
        try {
          const raw = execSync(`curl -s -H "Authorization: Bearer ${key}" https://api.apify.com/v2/users/me -m 10`, { timeout, encoding: 'utf-8' });
          const data = JSON.parse(raw);
          if (data && data.data) {
            resolve({ status: 'ok', lastCheck: now, details: { username: data.data.username || '', plan: data.data.plan?.name || '' } });
          } else {
            resolve({ status: 'error', lastCheck: now, details: { error: 'Unexpected response' } });
          }
        } catch (e) { resolve({ status: 'error', lastCheck: now, details: { error: e.message.slice(0, 200) } }); }
        break;
      }
      case 'gog': {
        try {
          // Use 'gog gmail inbox --max 1' as a lightweight auth test (People API may be disabled)
          const raw = execSync('/opt/homebrew/bin/gog gmail list "is:unread" 2>&1', { timeout: 20000, encoding: 'utf-8' });
          // If it returns any output without error, auth works
          const hasError = /error|unauthorized|invalid/i.test(raw) && !/subject/i.test(raw);
          if (hasError) {
            resolve({ status: 'error', lastCheck: now, details: { error: raw.slice(0, 150) } });
          } else {
            resolve({ status: 'ok', lastCheck: now, details: { account: 'alfonso@growth4u.io', test: 'gmail inbox' } });
          }
        } catch (e) { resolve({ status: 'error', lastCheck: now, details: { error: e.message.slice(0, 200) } }); }
        break;
      }
      case 'openai': {
        const key = getKey('OPENAI_API_KEY');
        if (!key) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'OPENAI_API_KEY not set' } });
        try {
          const res = execSync(`curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ${key}" https://api.openai.com/v1/models -m 10`, { timeout, encoding: 'utf-8' }).trim();
          resolve({ status: res === '200' ? 'ok' : 'error', lastCheck: now, details: { httpCode: res } });
        } catch (e) { resolve({ status: 'error', lastCheck: now, details: { error: e.message.slice(0, 200) } }); }
        break;
      }
      case 'gemini': {
        const key = getKey('GEMINI_API_KEY');
        if (!key) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'GEMINI_API_KEY not set' } });
        try {
          const res = execSync(`curl -s -o /dev/null -w "%{http_code}" "https://generativelanguage.googleapis.com/v1beta/models?key=${key}" -m 10`, { timeout, encoding: 'utf-8' }).trim();
          resolve({ status: res === '200' ? 'ok' : 'error', lastCheck: now, details: { httpCode: res } });
        } catch (e) { resolve({ status: 'error', lastCheck: now, details: { error: e.message.slice(0, 200) } }); }
        break;
      }
      case 'xai': {
        const key = getKey('XAI_API_KEY');
        if (!key) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'XAI_API_KEY not set' } });
        try {
          const res = execSync(`curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ${key}" https://api.x.ai/v1/models -m 10`, { timeout, encoding: 'utf-8' }).trim();
          resolve({ status: res === '200' ? 'ok' : 'error', lastCheck: now, details: { httpCode: res } });
        } catch (e) { resolve({ status: 'error', lastCheck: now, details: { error: e.message.slice(0, 200) } }); }
        break;
      }
      case 'minimax': {
        const key = getKey('MINIMAX_API_KEY');
        if (!key) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'MINIMAX_API_KEY not set' } });
        // MiniMax doesn't have a simple /models endpoint; verify key format
        resolve({ status: key.length > 10 ? 'ok' : 'error', lastCheck: now, details: { note: 'Key present, no lightweight verify endpoint' } });
        break;
      }
      case 'firecrawl': {
        const key = getKey('FIRECRAWL_API_KEY');
        if (!key) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'FIRECRAWL_API_KEY not set' } });
        try {
          // POST to scrape with a minimal test URL (costs 1 credit but verifies auth)
          const raw = execSync(`curl -s -w "\\n%{http_code}" -X POST -H "Authorization: Bearer ${key}" -H "Content-Type: application/json" -d '{"url":"https://example.com"}' https://api.firecrawl.dev/v1/scrape -m 15`, { timeout: 20000, encoding: 'utf-8' });
          const lines = raw.trim().split('\n');
          const httpCode = lines[lines.length - 1];
          resolve({ status: httpCode === '200' ? 'ok' : 'error', lastCheck: now, details: { httpCode } });
        } catch (e) { resolve({ status: 'error', lastCheck: now, details: { error: e.message.slice(0, 200) } }); }
        break;
      }
      case 'serper': {
        const key = getKey('SERPER_API_KEY');
        if (!key) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'SERPER_API_KEY not set' } });
        try {
          const res = execSync(`curl -s -o /dev/null -w "%{http_code}" -X POST -H "X-API-KEY: ${key}" -H "Content-Type: application/json" -d '{"q":"test","num":1}' https://google.serper.dev/search -m 10`, { timeout, encoding: 'utf-8' }).trim();
          resolve({ status: res === '200' ? 'ok' : 'error', lastCheck: now, details: { httpCode: res } });
        } catch (e) { resolve({ status: 'error', lastCheck: now, details: { error: e.message.slice(0, 200) } }); }
        break;
      }
      case 'dataforseo': {
        const login = getKey('DATAFORSEO_LOGIN');
        const password = getKey('DATAFORSEO_PASSWORD');
        if (!login || !password) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'DATAFORSEO_LOGIN or DATAFORSEO_PASSWORD not set' } });
        try {
          const res = execSync(`curl -s -o /dev/null -w "%{http_code}" -u "${login}:${password}" https://api.dataforseo.com/v3/appendix/user_data -m 10`, { timeout, encoding: 'utf-8' }).trim();
          resolve({ status: res === '200' ? 'ok' : 'error', lastCheck: now, details: { httpCode: res, login } });
        } catch (e) { resolve({ status: 'error', lastCheck: now, details: { error: e.message.slice(0, 200) } }); }
        break;
      }
      case 'notion': {
        const key = getKey('NOTION_API_KEY');
        if (!key) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'NOTION_API_KEY not set' } });
        try {
          const raw = execSync(`curl -s -H "Authorization: Bearer ${key}" -H "Notion-Version: 2022-06-28" https://api.notion.com/v1/users/me -m 10`, { timeout, encoding: 'utf-8' });
          const data = JSON.parse(raw);
          if (data && data.id) {
            resolve({ status: 'ok', lastCheck: now, details: { botName: data.name || data.bot?.owner?.user?.name || 'connected' } });
          } else if (data.code) {
            resolve({ status: 'error', lastCheck: now, details: { error: data.message || data.code } });
          } else {
            resolve({ status: 'ok', lastCheck: now, details: {} });
          }
        } catch (e) { resolve({ status: 'error', lastCheck: now, details: { error: e.message.slice(0, 200) } }); }
        break;
      }
      case 'supabase': {
        const url = getKey('SUPABASE_URL');
        const key = getKey('SUPABASE_ANON_KEY');
        if (!url || !key) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'SUPABASE_URL or SUPABASE_ANON_KEY not set' } });
        try {
          const res = execSync(`curl -s -o /dev/null -w "%{http_code}" -H "apikey: ${key}" -H "Authorization: Bearer ${key}" "${url}/rest/v1/" -m 10`, { timeout, encoding: 'utf-8' }).trim();
          const projectId = url.match(/https:\/\/(\w+)\./)?.[1] || '';
          resolve({ status: (res === '200' || res === '204') ? 'ok' : 'error', lastCheck: now, details: { httpCode: res, project: projectId } });
        } catch (e) { resolve({ status: 'error', lastCheck: now, details: { error: e.message.slice(0, 200) } }); }
        break;
      }
      case 'fal': {
        const key = getKey('FAL_API_KEY');
        if (!key) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'FAL_API_KEY not set' } });
        resolve({ status: key.length > 10 ? 'ok' : 'error', lastCheck: now, details: { note: 'Key present' } });
        break;
      }
      case 'wavespeed': {
        const key = getKey('WAVESPEED_API_KEY');
        if (!key) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'WAVESPEED_API_KEY not set' } });
        resolve({ status: key.length > 10 ? 'ok' : 'error', lastCheck: now, details: { note: 'Key present' } });
        break;
      }
      case 'dumpling': {
        const key = getKey('DUMPLING_API_KEY');
        if (!key) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'DUMPLING_API_KEY not set' } });
        resolve({ status: key.length > 10 ? 'ok' : 'error', lastCheck: now, details: { note: 'Key present' } });
        break;
      }
      case 'brave': {
        const key = getKey('BRAVE_API_KEY') || getKey('BRAVE_SEARCH_API_KEY');
        if (!key) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'BRAVE_API_KEY not set — OpenClaw uses Gemini web_search instead' } });
        try {
          const res = execSync(`curl -s -o /dev/null -w "%{http_code}" -H "X-Subscription-Token: ${key}" "https://api.search.brave.com/res/v1/web/search?q=test&count=1" -m 10`, { timeout, encoding: 'utf-8' }).trim();
          resolve({ status: res === '200' ? 'ok' : 'error', lastCheck: now, details: { httpCode: res } });
        } catch (e) { resolve({ status: 'error', lastCheck: now, details: { error: e.message.slice(0, 200) } }); }
        break;
      }
      case 'instantly': {
        // Instantly.ai — cold email platform, web login (no env var API key typically)
        const key = getKey('INSTANTLY_API_KEY');
        if (!key) return resolve({ status: 'not-configured', lastCheck: now, details: { note: 'Web login — no API key in .env' } });
        try {
          const res = execSync(`curl -s -o /dev/null -w "%{http_code}" "https://api.instantly.ai/api/v1/account/list?api_key=${key}" -m 10`, { timeout, encoding: 'utf-8' }).trim();
          resolve({ status: res === '200' ? 'ok' : 'error', lastCheck: now, details: { httpCode: res } });
        } catch (e) { resolve({ status: 'error', lastCheck: now, details: { error: e.message.slice(0, 200) } }); }
        break;
      }
      case 'metricool': {
        // Metricool — social scheduling, web login
        const key = getKey('METRICOOL_API_KEY');
        if (!key) return resolve({ status: 'not-configured', lastCheck: now, details: { note: 'Web login — no API key in .env' } });
        resolve({ status: key.length > 10 ? 'ok' : 'error', lastCheck: now, details: { note: 'Key present' } });
        break;
      }
      case 'nanobanana': {
        // Nano Banana Pro = Gemini image generation — uses GEMINI_API_KEY
        const key = getKey('GEMINI_API_KEY');
        if (!key) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'Uses GEMINI_API_KEY (shared)' } });
        resolve({ status: 'ok', lastCheck: now, details: { note: 'Uses Gemini API key (shared)', engine: 'gemini-2.0-flash-exp' } });
        break;
      }
      case 'remotion': {
        // Remotion — programmatic video rendering (local install, no API key)
        try {
          const raw = execSync('npx remotion --version 2>&1 || echo "not-found"', { timeout: 15000, encoding: 'utf-8' }).trim();
          const notFound = /not.found|command not found|ERR/i.test(raw);
          resolve({ status: notFound ? 'not-configured' : 'ok', lastCheck: now, details: { version: notFound ? null : raw.split('\n')[0], note: 'Local install' } });
        } catch { resolve({ status: 'not-configured', lastCheck: now, details: { note: 'Not installed locally' } }); }
        break;
      }
      case 'discord': {
        const token = getKey('DISCORD_BOT_TOKEN');
        if (!token) return resolve({ status: 'not-configured', lastCheck: now, details: { error: 'DISCORD_BOT_TOKEN not set' } });
        try {
          const res = execSync(`curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bot ${token}" https://discord.com/api/v10/users/@me -m 10`, { timeout, encoding: 'utf-8' }).trim();
          resolve({ status: res === '200' ? 'ok' : 'error', lastCheck: now, details: { httpCode: res } });
        } catch (e) { resolve({ status: 'error', lastCheck: now, details: { error: e.message.slice(0, 200) } }); }
        break;
      }
      case 'openclaw': {
        try {
          const raw = execSync('/opt/homebrew/bin/openclaw status 2>&1', { timeout, encoding: 'utf-8' });
          const running = /running/i.test(raw);
          const appVersionMatch = raw.match(/app\s+([\d.]+)/);
          const npmVersionMatch = raw.match(/npm latest\s+([\d.]+)/);
          const version = appVersionMatch ? appVersionMatch[1] : '';
          const latest = npmVersionMatch ? npmVersionMatch[1] : '';
          resolve({ status: running ? 'ok' : 'error', lastCheck: now, details: { gateway: running ? 'running' : 'stopped', version, latest } });
        } catch (e) { resolve({ status: 'error', lastCheck: now, details: { error: e.message.slice(0, 200) } }); }
        break;
      }
      default:
        resolve({ status: 'unknown', lastCheck: now, details: { error: `Unknown service: ${serviceId}` } });
    }
  });
}

async function runHealthChecks(serviceFilter) {
  const health = loadApiHealth();
  const allServices = ['anthropic', 'openrouter', 'openai', 'gemini', 'xai', 'minimax', 'brave', 'apify', 'firecrawl', 'serper', 'dataforseo', 'notion', 'supabase', 'fal', 'wavespeed', 'dumpling', 'instantly', 'metricool', 'nanobanana', 'remotion', 'gog', 'openclaw', 'discord'];
  const toCheck = serviceFilter === 'all' ? allServices : allServices.includes(serviceFilter) ? [serviceFilter] : [];

  if (toCheck.length === 0) return { error: `Unknown service: ${serviceFilter}` };

  const results = {};
  for (const svc of toCheck) {
    results[svc] = await checkService(svc);
    health.services[svc] = results[svc];
  }
  saveApiHealth(health);
  return { checked: toCheck, results, lastCheck: health.lastCheck };
}

// ========== Portal: Client-scoped access ==========

function loadClientsData() {
  try { return JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf-8')); }
  catch { return { clients: [], adminToken: null }; }
}

function loadClients() {
  return loadClientsData().clients || [];
}

function getAdminToken() {
  return loadClientsData().adminToken || null;
}

function isValidAdmin(token) {
  const adminToken = getAdminToken();
  return adminToken && token === adminToken;
}

// Rewrite /mc/ links to admin-scoped when in admin mode
function adminRewrite(html, req) {
  if (!req || !req._adminBase) return html;
  return html.replace(/\/mc\/(?!admin\/|portal\/)/g, req._adminBase + '/');
}

function landingPage() {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>SanchoCMO</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=Nunito:wght@400;600;700&display=swap" rel="stylesheet">
<style>
body{font-family:'Nunito',sans-serif;background:#F5F0E6;color:#1A1A2E;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
@media(prefers-color-scheme:dark){body{background:#1A1A2E;color:#FDF8EF;}.box{background:#2D2D44;border-color:#FDF8EF;box-shadow:3px 3px 0 #FDF8EF;}}
.box{text-align:center;padding:48px 56px;background:#FDF8EF;border:2px solid #1A1A2E;border-radius:8px;box-shadow:3px 3px 0 #1A1A2E;max-width:440px;}
h1{font-family:'Space Grotesk',sans-serif;color:#C45D35;font-size:2.2em;margin:0 0 8px;}
.sub{color:#5D5348;font-size:15px;margin:0 0 24px;}
.info{color:#5D5348;font-size:14px;line-height:1.6;margin:0;}
.logo{font-size:48px;margin-bottom:12px;}
</style></head><body>
<div class="box">
  <div class="logo">🏇</div>
  <h1>SanchoCMO</h1>
  <p class="sub">Mission Control</p>
  <p class="info">Usa el enlace de acceso que te proporcionó tu equipo de Growth.<br/><br/>Si no tienes enlace, contacta con tu gestor.</p>
</div>
</body></html>`;
}

function findClientByToken(token) {
  if (!token || token.length < 16) return null;
  return loadClients().find(c => c.mcToken === token) || null;
}

// ========== PROJECTS PAGE ==========

function loadProjectsData(slug) {
  const projectsDir = path.join(BASE, 'brand', slug, 'projects');
  let registry = { projects: [] };
  try { registry = JSON.parse(fs.readFileSync(path.join(projectsDir, 'registry.json'), 'utf-8')); } catch {}

  return (registry.projects || []).map(p => {
    const projDir = path.join(projectsDir, `${p.id}-${p.slug}`);
    let project = { ...p };
    let tasks = [];
    try { project = { ...project, ...JSON.parse(fs.readFileSync(path.join(projDir, 'project.json'), 'utf-8')) }; } catch {}
    try {
      const td = JSON.parse(fs.readFileSync(path.join(projDir, 'tasks.json'), 'utf-8'));
      tasks = Array.isArray(td) ? td : (td.tasks || []);
    } catch {}
    return { ...project, tasks };
  });
}

function buildProjectsPage(slug, baseUrl, clientName, guildId) {
  const projects = loadProjectsData(slug);

  const total = projects.length;
  const totalTasks = projects.reduce((s, p) => s + p.tasks.length, 0);
  const doneTasks = projects.reduce((s, p) => s + p.tasks.filter(t => ['completed','done'].includes(t.status)).length, 0);
  const activePrj = projects.filter(p => p.status === 'active').length;
  const blockedPrj = projects.filter(p => p.status === 'blocked').length;

  const statusLabel = s => ({ active:'Activo', blocked:'Bloqueado', completed:'Completado', reviewed:'Revisado', paused:'Pausado', proposed:'Propuesto', todo:'Por hacer', pending:'Por hacer', 'in-progress':'En progreso', done:'Hecho', cancelled:'Cancelado' }[s] || s);
  const statusColor = s => ({ active:'#3B82F6', blocked:'#C0392B', completed:'#4A5D23', reviewed:'#4A5D23', paused:'#F2C94C', proposed:'#9333ea', todo:'#888', pending:'#888', 'in-progress':'#3B82F6', done:'#4A5D23', cancelled:'#666' }[s] || '#888');
  const phaseLabel = p => ({ 0:'Fase 0 — Prerequisitos', 1:'Fase 1 — Ejecución', 2:'Fase 2 — Escalado' }[p] || `Fase ${p}`);
  const channelIcon = c => ({ web:'🌐', content:'📝', 'paid-ads':'📢', prospecting:'📤', partners:'🤝', creatives:'🎨', research:'🔍', brand:'🏷️', intelligence:'📡', learning:'📚', onboarding:'👋', projects:'📋' }[c] || '#');
  const channelLabel = c => ({ web:'web', content:'content', 'paid-ads':'paid-ads', prospecting:'prospecting', partners:'partners', creatives:'creatives', research:'research', brand:'brand', intelligence:'intelligence', learning:'learning', onboarding:'onboarding', projects:'projects' }[c] || c || '—');
  const CHANNEL_OPTIONS = ['web','content','paid-ads','prospecting','partners','creatives','research','brand','intelligence','learning'];

  function escHtml(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  // ============ VIEW 1: BY PROJECT ============
  const projectRows = projects.map(p => {
    const obj = typeof p.objective === 'string' ? p.objective : (p.objective ? p.objective.description || '' : '');
    const metrics = p.objective && typeof p.objective === 'object' && p.objective.metric
      ? `${p.objective.baseline}${p.objective.unit||''} → ${p.objective.target}${p.objective.unit||''}` : '';
    const tasksDone = p.tasks.filter(t => ['completed','done'].includes(t.status)).length;
    const pct = p.tasks.length > 0 ? Math.round((tasksDone / p.tasks.length) * 100) : 0;
    const discordLink = (p.discord && p.discord.project_thread_id && guildId)
      ? `<a href="https://discord.com/channels/${guildId}/${p.discord.project_thread_id}" target="_blank" class="discord-link" title="Abrir en Discord">💬</a>` : '';

    const taskItems = p.tasks.map(t => {
      const tDiscord = (t.discord_thread_id && guildId)
        ? `<a href="https://discord.com/channels/${guildId}/${t.discord_thread_id}" target="_blank" class="discord-link">💬</a>` : '';
      const ownerBadge = t.owner && t.owner !== 'Sancho' ? `<span class="owner-badge">👤 ${escHtml(t.owner)}</span>` : '';
      const ch = t.channel || t.skill || '';
      const chBadge = ch ? `<span class="channel-badge">${channelIcon(ch)} ${channelLabel(ch)}</span>` : '';
      const isDone = ['completed','done'].includes(t.status);
      const prjSelOpts = ['todo','in-progress','blocked','completed'].map(s => {
        const lab = {todo:'📋 Por hacer','in-progress':'🔧 En progreso',blocked:'⛔ Bloqueado',completed:'✅ Completado'}[s];
        const sel = (s === t.status || (s === 'todo' && t.status === 'pending')) ? ' selected' : '';
        return '<option value="' + s + '"' + sel + '>' + lab + '</option>';
      }).join('');
      return `<div class="prj-task ${isDone ? 'done' : ''}" data-task-id="${escHtml(t.id)}">
        <div class="prj-task-main">
          <span class="pill-sm"  style="background:${statusColor(t.status)}20;color:${statusColor(t.status)}">${statusLabel(t.status)}</span>
          <span class="prj-task-name">${escHtml(t.name)}</span>
          <span class="prj-task-meta">${chBadge}${ownerBadge}${tDiscord}
            <select class="mobile-status" onchange="mobileStatusChange(this)" onclick="event.stopPropagation();" data-task-id="${escHtml(t.id)}">${prjSelOpts}</select>
            <button class="edit-btn" onclick="editTask('${escHtml(t.id)}','${escHtml(t.name)}','${escHtml((t.description||'').replace(/'/g,"&#39;"))}','${escHtml(t.owner||'Sancho')}','${escHtml(t.channel||'')}','${escHtml(t.status)}')">✏️</button>
          </span>
        </div>
        ${t.description ? `<div class="prj-task-desc">${escHtml(t.description)}</div>` : ''}
      </div>`;
    }).join('');

    return `<div class="prj-card" id="prj-${p.id}">
      <div class="prj-header" onclick="togglePrj('${p.id}')">
        <div class="prj-left">
          <span class="prj-id">${escHtml(p.id)}</span>
          <span class="prj-name">${escHtml(p.name)}</span>
          <span class="pill-sm" style="background:${statusColor(p.status)}20;color:${statusColor(p.status)}">${statusLabel(p.status)}</span>
          ${p.blocked_by ? `<span class="prj-blocked">⛔ por ${escHtml(p.blocked_by)}</span>` : ''}
        </div>
        <div class="prj-right">
          <span class="prj-phase">${phaseLabel(p.phase !== undefined ? p.phase : 1)}</span>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;"></div></div>
          <span class="prj-count">${tasksDone}/${p.tasks.length}</span>
          ${discordLink}
          <button class="edit-btn" onclick="event.stopPropagation();editProject('${escHtml(p.id)}','${escHtml(p.name)}','${escHtml(obj.replace(/'/g,"&#39;"))}','${escHtml(p.status)}','${escHtml(p.strategy||'')}','${escHtml(p.review_date||'')}')" title="Editar proyecto">✏️</button>
          <span class="chevron">▸</span>
        </div>
      </div>
      <div class="prj-body" style="display:none;">
        <div class="prj-info">
          ${obj ? `<div class="prj-obj"><strong>🎯 Objetivo:</strong> ${escHtml(obj)}</div>` : ''}
          ${metrics ? `<div class="prj-metrics"><strong>📊 Métrica:</strong> ${escHtml(metrics)}</div>` : ''}
          ${p.strategy ? `<div><strong>📋 Estrategia:</strong> ${escHtml(p.strategy)}</div>` : ''}
          ${p.review_date ? `<div><strong>📅 Review:</strong> ${p.review_date}</div>` : ''}
        </div>
        <div class="prj-tasks">${taskItems || '<p class="empty-msg">Sin tareas.</p>'}</div>
      </div>
    </div>`;
  }).join('');

  // ============ VIEW 2: KANBAN BY TASK ============
  const columns = [
    { key: 'todo', label: 'Por hacer', statuses: ['todo','pending'], icon: '📋' },
    { key: 'in-progress', label: 'En progreso', statuses: ['in-progress'], icon: '🔧' },
    { key: 'blocked', label: 'Bloqueado', statuses: ['blocked'], icon: '⛔' },
    { key: 'done', label: 'Completado', statuses: ['completed','done','reviewed'], icon: '✅' },
  ];

  const allTasks = [];
  projects.forEach(p => {
    const projectBlocked = p.status === 'blocked';
    p.tasks.forEach(t => {
      let effectiveStatus = t.status;
      if (projectBlocked && ['todo','pending'].includes(t.status)) effectiveStatus = 'blocked';
      allTasks.push({ ...t, effectiveStatus, projectId: p.id, projectName: p.name,
        projectDiscord: (p.discord && p.discord.project_thread_id && guildId) ? `https://discord.com/channels/${guildId}/${p.discord.project_thread_id}` : null,
        taskDiscord: (t.discord_thread_id && guildId) ? `https://discord.com/channels/${guildId}/${t.discord_thread_id}` : null,
      });
    });
  });

  const buildKanbanCard = (t) => {
    const discordBtn = t.taskDiscord
      ? `<a href="${t.taskDiscord}" target="_blank" class="discord-link">💬</a>`
      : (t.projectDiscord ? `<a href="${t.projectDiscord}" target="_blank" class="discord-link">💬</a>` : '');
    const ownerBadge = t.owner && t.owner !== 'Sancho' ? `<span class="owner-badge">👤 ${escHtml(t.owner)}</span>` : '';
    const ch = t.channel || t.skill || '';
    const chBadge = ch ? `<span class="channel-badge">${channelIcon(ch)} ${channelLabel(ch)}</span>` : '';
    const desc = t.description ? `<div class="task-desc">${escHtml(t.description)}</div>` : '';
    const selOpts = ['todo','in-progress','blocked','completed'].map(s => {
      const lab = {todo:'📋 Por hacer','in-progress':'🔧 En progreso',blocked:'⛔ Bloqueado',completed:'✅ Completado'}[s];
      const sel = (s === t.effectiveStatus || (s === 'todo' && t.effectiveStatus === 'pending')) ? ' selected' : '';
      return '<option value="' + s + '"' + sel + '>' + lab + '</option>';
    }).join('');
    return `<div class="task-card" draggable="true" data-task-id="${escHtml(t.id)}" data-slug="${escHtml(slug)}" data-status="${escHtml(t.effectiveStatus)}">
      <div class="task-card-header drag-handle">
        <span class="task-id" onclick="showDetail('${escHtml(t.projectId)}')">${escHtml(t.projectId)}</span>
        <span class="task-actions"><span class="task-code">${escHtml(t.id)}</span>${chBadge}${ownerBadge}${discordBtn}${desc ? '<span class="expand-btn" onclick="toggleTaskDesc(this.closest(&quot;.task-card&quot;))">▾</span>' : ''}</span>
      </div>
      <div class="task-name">${escHtml(t.name)}</div>
      ${desc}
      <div class="task-footer">
        <span class="task-project">${escHtml(t.projectName)}</span>
        <span><select class="mobile-status" onchange="mobileStatusChange(this)" onclick="event.stopPropagation();" data-task-id="${escHtml(t.id)}">${selOpts}</select>
        <button class="edit-btn" onclick="editTask('${escHtml(t.id)}','${escHtml(t.name)}','${escHtml((t.description||'').replace(/'/g,"&#39;"))}','${escHtml(t.owner||'Sancho')}','${escHtml(t.channel||'')}','${escHtml(t.effectiveStatus)}')" title="Editar">✏️</button></span>
      </div>
    </div>`;
  };

  const columnHtml = columns.map(col => {
    const colTasks = allTasks.filter(t => col.statuses.includes(t.effectiveStatus));
    return `<div class="kanban-col" data-col="${col.key}">
      <div class="col-header"><span>${col.icon} ${col.label}</span><span class="col-count">${colTasks.length}</span></div>
      <div class="col-body" data-col="${col.key}">${colTasks.map(buildKanbanCard).join('')}</div>
    </div>`;
  }).join('');

  // Project detail sidebar (for kanban view)
  const projectPanels = projects.map(p => {
    const obj = typeof p.objective === 'string' ? p.objective : (p.objective ? p.objective.description || '' : '');
    const metrics = p.objective && typeof p.objective === 'object' && p.objective.metric
      ? `<div class="detail-metric"><strong>${p.objective.metric}</strong>: ${p.objective.baseline}${p.objective.unit||''} → ${p.objective.target}${p.objective.unit||''}</div>` : '';
    const tasksDone = p.tasks.filter(t => ['completed','done'].includes(t.status)).length;
    const pct = p.tasks.length > 0 ? Math.round((tasksDone / p.tasks.length) * 100) : 0;
    return `<div class="project-detail" id="detail-${p.id}" style="display:none;">
      <div class="detail-header"><h3>${escHtml(p.id)} — ${escHtml(p.name)}</h3><button class="close-detail" onclick="closeDetail('${p.id}')">&times;</button></div>
      <div class="detail-body">
        ${obj ? `<p class="detail-obj"><strong>Objetivo:</strong> ${escHtml(obj)}</p>` : ''}
        ${metrics}
        ${p.strategy ? `<p><strong>Estrategia:</strong> ${escHtml(p.strategy)}</p>` : ''}
        <p><strong>Fase:</strong> ${phaseLabel(p.phase)}</p>
        <p><strong>Estado:</strong> ${statusLabel(p.status)}${p.blocked_by ? ` — Bloqueado por ${p.blocked_by}` : ''}</p>
        ${p.review_date ? `<p><strong>Review:</strong> ${p.review_date}</p>` : ''}
        <div class="detail-progress"><div class="detail-progress-fill" style="width:${pct}%;"></div></div>
        <p class="detail-progress-text">${tasksDone}/${p.tasks.length} tareas (${pct}%)</p>
      </div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>📋 Proyectos — ${escHtml(clientName)}</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Nunito:wght@400;600;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#F5F0E6;--card:#FDF8EF;--border:#D4C9B8;--text:#1A1A2E;--muted:#5D5348;--ink:#1A1A2E;--rust:#C45D35;--navy:#1E3A5F;--green:#4A5D23;--blue:#3B82F6;--red:#C0392B;}
@media(prefers-color-scheme:dark){:root{--bg:#1A1A2E;--card:#2D2D44;--border:#3D3D5C;--text:#FDF8EF;--muted:#A09890;--ink:#FDF8EF;--rust:#D4734F;--navy:#60a5fa;--green:#6B8E23;--blue:#60a5fa;--red:#E74C3C;}}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Nunito',sans-serif;background:var(--bg);color:var(--text);padding:24px 32px;overflow-x:auto;}
h1{font-family:'Space Grotesk',sans-serif;color:var(--navy);font-size:28px;margin-bottom:4px;}
.top-bar{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:12px;}
.top-left{display:flex;align-items:baseline;gap:16px;}
.subtitle{color:var(--muted);font-size:14px;}
.back{color:var(--muted);text-decoration:none;font-size:14px;display:inline-block;margin-bottom:12px;}
.back:hover{color:var(--rust);}
.stats{display:flex;gap:10px;flex-wrap:wrap;}
.stat{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:10px 16px;text-align:center;min-width:90px;}
.stat-val{font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:600;color:var(--navy);}
.stat-label{font-size:11px;color:var(--muted);}

/* Tabs */
.view-tabs{display:flex;gap:0;margin-bottom:20px;border-bottom:2px solid var(--border);}
.view-tab{padding:10px 20px;font-size:14px;font-weight:600;color:var(--muted);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;transition:all .15s;}
.view-tab:hover{color:var(--text);}
.view-tab.active{color:var(--rust);border-bottom-color:var(--rust);}
.view-panel{display:none;}
.view-panel.active{display:block;}

/* === PROJECT VIEW === */
.prj-card{background:var(--card);border:1px solid var(--border);border-radius:10px;margin-bottom:8px;overflow:hidden;}
.prj-header{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;cursor:pointer;gap:12px;}
.prj-header:hover{background:color-mix(in srgb,var(--bg) 50%,transparent);}
.prj-left{display:flex;align-items:center;gap:10px;flex:1;min-width:0;}
.prj-right{display:flex;align-items:center;gap:12px;flex-shrink:0;}
.prj-id{font-family:'Space Grotesk',sans-serif;font-weight:700;color:var(--rust);font-size:14px;}
.prj-name{font-weight:600;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.prj-phase{font-size:11px;color:var(--muted);white-space:nowrap;}
.prj-count{font-size:13px;color:var(--muted);white-space:nowrap;font-weight:600;}
.prj-blocked{font-size:11px;color:var(--red);}
.pill-sm{display:inline-block;padding:1px 8px;border-radius:12px;font-size:11px;font-weight:600;white-space:nowrap;}
.progress-bar{width:70px;height:6px;background:var(--border);border-radius:3px;overflow:hidden;}
.progress-fill{height:100%;background:var(--green);border-radius:3px;transition:width .3s;}
.chevron{font-size:14px;color:var(--muted);transition:transform .2s;display:inline-block;}
.prj-card.open .chevron{transform:rotate(90deg);}
.prj-body{padding:0 18px 16px;}
.prj-info{display:flex;flex-direction:column;gap:6px;padding:10px 0 14px;font-size:13px;color:var(--muted);border-bottom:1px solid var(--border);margin-bottom:10px;}
.prj-obj{font-size:14px;color:var(--text);}
.prj-tasks{display:flex;flex-direction:column;gap:4px;}
.prj-task{padding:10px 12px;border-radius:6px;background:color-mix(in srgb,var(--bg) 60%,transparent);transition:background .15s;}
.prj-task:hover{background:color-mix(in srgb,var(--bg) 80%,var(--card));}
.prj-task.done{opacity:0.6;}
.prj-task.done .prj-task-name{text-decoration:line-through;}
.prj-task-main{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.prj-task-name{font-size:14px;font-weight:500;flex:1;min-width:0;}
.prj-task-meta{display:flex;align-items:center;gap:6px;flex-shrink:0;}
.prj-task-desc{font-size:12px;color:var(--muted);margin-top:6px;line-height:1.4;padding-left:4px;}
.channel-badge{font-size:10px;background:color-mix(in srgb,var(--navy) 10%,transparent);color:var(--navy);padding:1px 6px;border-radius:4px;white-space:nowrap;}
.owner-badge{font-size:10px;background:color-mix(in srgb,var(--blue) 12%,transparent);color:var(--blue);padding:1px 6px;border-radius:4px;white-space:nowrap;}
.discord-link{text-decoration:none;font-size:14px;opacity:0.7;transition:opacity .15s;}
.discord-link:hover{opacity:1;}
.empty-msg{color:var(--muted);font-size:13px;padding:8px 0;}

/* === KANBAN VIEW === */
.kanban{display:flex;gap:14px;align-items:flex-start;min-height:calc(100vh - 240px);overflow-x:auto;padding-bottom:20px;}
.kanban-col{flex:1;min-width:260px;max-width:340px;background:color-mix(in srgb,var(--bg) 80%,var(--card));border-radius:12px;display:flex;flex-direction:column;max-height:calc(100vh - 240px);}
.col-header{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;font-family:'Space Grotesk',sans-serif;font-size:14px;font-weight:600;color:var(--text);border-bottom:1px solid var(--border);}
.col-count{background:var(--border);color:var(--text);font-size:11px;padding:2px 8px;border-radius:10px;font-weight:700;}
.col-body{flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:8px;min-height:60px;}
.col-body.drag-over{background:color-mix(in srgb,var(--blue) 10%,transparent);border-radius:0 0 12px 12px;}
.task-card{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:12px;transition:box-shadow .15s,transform .15s;}
.task-card:hover{box-shadow:0 2px 8px rgba(0,0,0,.08);transform:translateY(-1px);}
.task-card.dragging{opacity:0.5;transform:rotate(2deg);}
.task-card-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;cursor:grab;user-select:none;-webkit-user-select:none;}
.task-name,.task-desc,.task-project,.task-footer{user-select:text;-webkit-user-select:text;cursor:text;}
.expand-btn{cursor:pointer;font-size:14px;color:var(--muted);padding:0 4px;transition:transform .2s;display:inline-block;user-select:none;}
.expand-btn:hover{color:var(--rust);}
.task-card.show-desc .expand-btn{transform:rotate(180deg);}
.task-id{font-family:'Space Grotesk',sans-serif;font-size:11px;font-weight:600;color:var(--rust);background:color-mix(in srgb,var(--rust) 10%,transparent);padding:1px 8px;border-radius:4px;cursor:pointer;}
.task-id:hover{background:color-mix(in srgb,var(--rust) 20%,transparent);}
.task-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
.task-name{font-size:14px;font-weight:600;line-height:1.35;margin-bottom:4px;}
.task-project{font-size:12px;color:var(--muted);}
.task-code{font-family:'Space Grotesk',sans-serif;font-size:10px;color:var(--muted);opacity:0.6;}
.task-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;}
.task-desc{font-size:12px;color:var(--muted);line-height:1.4;margin:6px 0 4px;padding:6px 8px;background:color-mix(in srgb,var(--bg) 60%,transparent);border-radius:4px;display:none;}
.task-card.show-desc .task-desc{display:block;}
.mobile-status{display:none;font-size:12px;padding:3px 6px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);cursor:pointer;max-width:140px;}
@media(max-width:768px){
  .mobile-status{display:block;}
  .task-card{cursor:pointer;}
  .kanban{flex-direction:column;}
  .kanban-col{max-width:100%;min-width:0;max-height:none;}
}

/* Project detail sidebar */
.project-detail{position:fixed;top:0;right:0;width:380px;height:100vh;background:var(--card);border-left:2px solid var(--border);box-shadow:-4px 0 20px rgba(0,0,0,.1);z-index:100;overflow-y:auto;padding:24px;}
.detail-header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;}
.detail-header h3{font-family:'Space Grotesk',sans-serif;color:var(--navy);font-size:18px;line-height:1.3;}
.close-detail{background:none;border:none;font-size:24px;cursor:pointer;color:var(--muted);padding:0 4px;}
.close-detail:hover{color:var(--text);}
.detail-body p{font-size:14px;margin-bottom:8px;line-height:1.5;}
.detail-obj{font-size:15px!important;}
.detail-metric{background:color-mix(in srgb,var(--green) 10%,transparent);padding:8px 12px;border-radius:6px;font-size:14px;margin-bottom:10px;}
.detail-progress{width:100%;height:8px;background:var(--border);border-radius:4px;overflow:hidden;margin-top:12px;}
.detail-progress-fill{height:100%;background:var(--green);border-radius:4px;}
.detail-progress-text{font-size:12px;color:var(--muted);margin-top:4px;}

.toast{position:fixed;bottom:20px;right:20px;background:var(--green);color:#fff;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600;display:none;z-index:999;box-shadow:0 4px 12px rgba(0,0,0,.2);}
.toast.error{background:var(--red);}
.toast.show{display:block;animation:fadeIn .2s ease;}
@keyframes fadeIn{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
/* Edit modal */
.edit-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.4);z-index:200;display:none;align-items:center;justify-content:center;}
.edit-overlay.open{display:flex;}
.edit-modal{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:24px;width:90%;max-width:520px;max-height:90vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.2);}
.edit-modal h3{font-family:'Space Grotesk',sans-serif;color:var(--navy);margin-bottom:16px;font-size:18px;}
.edit-field{margin-bottom:12px;}
.edit-field label{display:block;font-size:12px;font-weight:600;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;}
.edit-field input,.edit-field textarea,.edit-field select{width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-family:'Nunito',sans-serif;font-size:14px;}
.edit-field textarea{min-height:80px;resize:vertical;}
.edit-field select{appearance:auto;}
.edit-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:16px;}
.edit-actions button{padding:8px 16px;border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;}
.btn-save{background:var(--green);color:#fff;border-color:var(--green)!important;}
.btn-save:hover{opacity:0.9;}
.btn-cancel{background:var(--card);color:var(--muted);}
.btn-cancel:hover{background:var(--bg);}
.edit-btn{background:none;border:none;cursor:pointer;font-size:13px;color:var(--muted);padding:2px 4px;opacity:0.5;transition:opacity .15s;}
.edit-btn:hover{opacity:1;color:var(--rust);}

.empty{text-align:center;padding:60px 20px;color:var(--muted);}
.empty h2{font-family:'Space Grotesk',sans-serif;color:var(--navy);margin-bottom:8px;}
</style></head><body>
<a class="back" href="${baseUrl}/">← Mission Control</a>
<div class="top-bar">
  <div class="top-left">
    <h1>📋 Proyectos</h1>
    <span class="subtitle">${escHtml(clientName)}</span>
  </div>
  <div class="stats">
    <div class="stat"><div class="stat-val">${activePrj}</div><div class="stat-label">Activos</div></div>
    <div class="stat"><div class="stat-val">${blockedPrj}</div><div class="stat-label">Bloqueados</div></div>
    <div class="stat"><div class="stat-val">${doneTasks}/${totalTasks}</div><div class="stat-label">Tareas</div></div>
    <div class="stat"><div class="stat-val">${totalTasks > 0 ? Math.round((doneTasks/totalTasks)*100) : 0}%</div><div class="stat-label">Progreso</div></div>
  </div>
</div>

<div class="view-tabs">
  <div class="view-tab active" onclick="switchView('projects',this)">📂 Por Proyecto</div>
  <div class="view-tab" onclick="switchView('kanban',this)">📋 Por Tarea (Kanban)</div>
</div>

${total === 0 ? '<div class="empty"><h2>Sin proyectos</h2><p>Ejecuta el strategic plan para generar proyectos.</p></div>' : `
<div class="view-panel active" id="view-projects">${projectRows}</div>
<div class="view-panel" id="view-kanban"><div class="kanban">${columnHtml}</div></div>
`}

${projectPanels}

<div class="edit-overlay" id="editOverlay" onclick="if(event.target===this)closeEdit()">
  <div class="edit-modal" id="editModal"></div>
</div>

<div class="toast" id="toast"></div>

<script>
const SLUG = '${slug}';
const CHANNELS = ${JSON.stringify(['web','content','paid-ads','prospecting','partners','creatives','research','brand','intelligence','learning'])};
const API_BASE = window.location.pathname.replace(/\\/projects\\/?$/, '');

function switchView(view, tab) {
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  tab.classList.add('active');
}

// === Edit functions ===
function closeEdit() { document.getElementById('editOverlay').classList.remove('open'); }

function editTask(taskId, name, desc, owner, channel, status) {
  const chOpts = CHANNELS.map(c => '<option value="' + c + '"' + (c===channel?' selected':'') + '>#' + c + '</option>').join('');
  const stOpts = ['todo','in-progress','blocked','completed'].map(s => {
    const lab = {todo:'Por hacer','in-progress':'En progreso',blocked:'Bloqueado',completed:'Completado'}[s];
    return '<option value="' + s + '"' + (s===status?' selected':'') + '>' + lab + '</option>';
  }).join('');
  document.getElementById('editModal').innerHTML = 
    '<h3>✏️ Editar tarea ' + taskId + '</h3>' +
    '<div class="edit-field"><label>Nombre</label><input id="ef-name" value="' + name.replace(/"/g,'&quot;') + '"/></div>' +
    '<div class="edit-field"><label>Descripción</label><textarea id="ef-desc">' + desc.replace(/</g,'&lt;') + '</textarea></div>' +
    '<div class="edit-field"><label>Canal</label><select id="ef-channel"><option value="">— Sin canal —</option>' + chOpts + '</select></div>' +
    '<div class="edit-field"><label>Owner</label><input id="ef-owner" value="' + owner.replace(/"/g,'&quot;') + '"/></div>' +
    '<div class="edit-field"><label>Estado</label><select id="ef-status">' + stOpts + '</select></div>' +
    '<div class="edit-actions"><button class="btn-cancel" onclick="closeEdit()">Cancelar</button><button class="btn-save" onclick="saveTask(\\'' + taskId + '\\')">Guardar</button></div>';
  document.getElementById('editOverlay').classList.add('open');
}

function saveTask(taskId) {
  const fields = {
    name: document.getElementById('ef-name').value,
    description: document.getElementById('ef-desc').value,
    channel: document.getElementById('ef-channel').value,
    owner: document.getElementById('ef-owner').value,
    status: document.getElementById('ef-status').value,
  };
  fetch(API_BASE + '/api/projects/task-update', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ slug: SLUG, taskId, fields })
  }).then(r => r.json()).then(d => {
    if (d.ok) { showToast('✅ ' + taskId + ' actualizado'); closeEdit(); setTimeout(() => location.reload(), 600); }
    else showToast('Error: ' + (d.error||''), true);
  }).catch(() => showToast('Error de conexión', true));
}

function editProject(projId, name, objective, status, strategy, reviewDate) {
  const stOpts = ['active','blocked','paused','completed'].map(s => {
    const lab = {active:'Activo',blocked:'Bloqueado',paused:'Pausado',completed:'Completado'}[s];
    return '<option value="' + s + '"' + (s===status?' selected':'') + '>' + lab + '</option>';
  }).join('');
  document.getElementById('editModal').innerHTML = 
    '<h3>✏️ Editar proyecto ' + projId + '</h3>' +
    '<div class="edit-field"><label>Nombre</label><input id="ef-pname" value="' + name.replace(/"/g,'&quot;') + '"/></div>' +
    '<div class="edit-field"><label>Objetivo</label><textarea id="ef-pobj">' + objective.replace(/</g,'&lt;') + '</textarea></div>' +
    '<div class="edit-field"><label>Estrategia</label><input id="ef-pstrat" value="' + strategy.replace(/"/g,'&quot;') + '"/></div>' +
    '<div class="edit-field"><label>Estado</label><select id="ef-pstatus">' + stOpts + '</select></div>' +
    '<div class="edit-field"><label>Review date</label><input id="ef-preview" type="date" value="' + reviewDate + '"/></div>' +
    '<div class="edit-actions"><button class="btn-cancel" onclick="closeEdit()">Cancelar</button><button class="btn-save" onclick="saveProject(\\'' + projId + '\\')">Guardar</button></div>';
  document.getElementById('editOverlay').classList.add('open');
}

function saveProject(projId) {
  const fields = {
    name: document.getElementById('ef-pname').value,
    objective: document.getElementById('ef-pobj').value,
    status: document.getElementById('ef-pstatus').value,
    strategy: document.getElementById('ef-pstrat').value,
    review_date: document.getElementById('ef-preview').value,
  };
  fetch(API_BASE + '/api/projects/project-update', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ slug: SLUG, projectId: projId, fields })
  }).then(r => r.json()).then(d => {
    if (d.ok) { showToast('✅ ' + projId + ' actualizado'); closeEdit(); setTimeout(() => location.reload(), 600); }
    else showToast('Error: ' + (d.error||''), true);
  }).catch(() => showToast('Error de conexión', true));
}

function togglePrj(id) {
  const card = document.getElementById('prj-' + id);
  if (!card) return;
  const body = card.querySelector('.prj-body');
  const isOpen = card.classList.contains('open');
  card.classList.toggle('open');
  body.style.display = isOpen ? 'none' : 'block';
}

function toggleTaskDesc(card) {
  if (event && (event.target.closest('a') || event.target.closest('.task-id'))) return;
  card.classList.toggle('show-desc');
}

function showToast(msg, isError) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  setTimeout(() => { t.className = 'toast'; }, 2500);
}

function updateTaskStatus(taskId, newStatus) {
  return fetch(API_BASE + '/api/projects/task-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: SLUG, taskId, status: newStatus })
  }).then(r => r.json());
}

function showDetail(projectId) {
  document.querySelectorAll('.project-detail').forEach(d => d.style.display = 'none');
  const panel = document.getElementById('detail-' + projectId);
  if (panel) panel.style.display = 'block';
}
function closeDetail(projectId) {
  const panel = document.getElementById('detail-' + projectId);
  if (panel) panel.style.display = 'none';
}

// Mobile status change
function mobileStatusChange(sel) {
  const card = sel.closest('.task-card');
  const taskId = sel.dataset.taskId;
  const newStatus = sel.value;
  const labels = {todo:'Por hacer','in-progress':'En progreso',blocked:'Bloqueado',completed:'Completado'};
  updateTaskStatus(taskId, newStatus).then(d => {
    if (d.ok) {
      showToast(taskId + ' → ' + (labels[newStatus] || newStatus));
      setTimeout(() => location.reload(), 600);
    } else {
      showToast('Error: ' + (d.error || ''), true);
    }
  }).catch(() => showToast('Error de conexión', true));
}

// Drag and drop (kanban) — only drag from header (drag-handle)
const statusMap = { 'todo': 'todo', 'in-progress': 'in-progress', 'blocked': 'blocked', 'done': 'completed' };
let draggedCard = null;
let dragAllowed = false;

// Track mousedown: only allow drag if started on the header
document.addEventListener('mousedown', function(e) {
  dragAllowed = !!e.target.closest('.drag-handle');
});

document.querySelectorAll('.task-card[draggable]').forEach(card => {
  card.addEventListener('dragstart', function(e) {
    if (!dragAllowed) { e.preventDefault(); return; }
    draggedCard = card;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card.dataset.taskId);
  });
  card.addEventListener('dragend', function() {
    if (draggedCard) draggedCard.classList.remove('dragging');
    draggedCard = null;
    dragAllowed = false;
    document.querySelectorAll('.col-body').forEach(c => c.classList.remove('drag-over'));
  });
});
document.querySelectorAll('.col-body').forEach(col => {
  col.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; col.classList.add('drag-over'); });
  col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
  col.addEventListener('drop', e => {
    e.preventDefault(); col.classList.remove('drag-over');
    if (!draggedCard) return;
    const taskId = draggedCard.dataset.taskId;
    const newCol = col.dataset.col;
    const newStatus = statusMap[newCol] || newCol;
    col.appendChild(draggedCard);
    draggedCard.dataset.status = newStatus;
    document.querySelectorAll('.kanban-col').forEach(c => {
      c.querySelector('.col-count').textContent = c.querySelector('.col-body').children.length;
    });
    updateTaskStatus(taskId, newStatus).then(d => {
      if (d.ok) showToast(taskId + ' → ' + ({"todo":"Por hacer","in-progress":"En progreso","blocked":"Bloqueado","completed":"Completado"}[newStatus] || newStatus));
      else { showToast('Error: ' + (d.error || ''), true); setTimeout(() => location.reload(), 1000); }
    }).catch(() => { showToast('Error de conexión', true); setTimeout(() => location.reload(), 1000); });
  });
});
</script>
</body></html>`;
}

function portalPage(title, clientName, content) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${title} — ${clientName}</title>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Nunito:ital,wght@0,400;0,600;0,700;1,400;1,600&display=swap" rel="stylesheet">
<style>
:root{--bg:#F5F0E6;--card:#FDF8EF;--border:#D4C9B8;--text:#1A1A2E;--muted:#5D5348;--ink:#1A1A2E;--rust:#C45D35;--green:#4A5D23;}
@media(prefers-color-scheme:dark){:root{--bg:#1A1A2E;--card:#2D2D44;--border:#3D3D5C;--text:#FDF8EF;--muted:#A09890;--ink:#FDF8EF;--rust:#D4734F;--green:#6B8E23;}}
*{box-sizing:border-box;}
body{font-family:'Nunito',sans-serif;background:var(--bg);color:var(--text);max-width:1200px;margin:0 auto;padding:24px 40px;line-height:1.85;font-size:17px;}
h1{font-family:'Space Grotesk',sans-serif;color:var(--rust);font-size:2em;margin-bottom:4px;}
h2{font-family:'Space Grotesk',sans-serif;color:var(--rust);margin:24px 0 12px;font-size:1.4em;}
h3{color:var(--rust);}
a{color:var(--rust);text-decoration:none;font-weight:700;}a:hover{text-decoration:underline;}
.card{margin:8px 0;padding:10px 14px;background:var(--card);border:2px solid var(--ink);border-radius:6px;box-shadow:3px 3px 0 var(--ink);}
.card a{font-size:16px;}.card .meta{color:var(--muted);font-size:13px;margin-top:2px;}
.back{font-size:14px;color:var(--muted);font-weight:400;}
.header-bar{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid var(--border);}
.client-badge{font-family:'Space Grotesk',sans-serif;font-size:13px;padding:4px 12px;background:var(--ink);color:var(--card);border-radius:20px;}
table{border-collapse:collapse;width:100%;margin:12px 0;}
th,td{border:2px solid var(--ink);padding:10px 14px;text-align:left;font-size:16px;}
th{background:var(--ink);color:var(--card);font-family:'Space Grotesk',sans-serif;}
tr:nth-child(even){background:var(--card);}
code{background:var(--card);padding:2px 6px;border-radius:4px;font-size:13px;border:1px solid var(--border);}
pre{background:var(--card);padding:12px;border:2px solid var(--ink);border-radius:6px;overflow-x:auto;font-size:13px;}
blockquote{border-left:4px solid var(--rust);margin:12px 0;padding:8px 16px;background:var(--card);font-style:italic;}
</style>
</head><body>
<div class="header-bar">
  <h1>${clientName}</h1>
  <span class="client-badge">Portal del Cliente</span>
</div>
${content}
</body></html>`;
}

function portalForbiddenPage() {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Acceso denegado</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600&family=Nunito:wght@400;600&display=swap" rel="stylesheet">
<style>
body{font-family:'Nunito',sans-serif;background:#F5F0E6;color:#1A1A2E;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
.box{text-align:center;padding:48px;background:#FDF8EF;border:2px solid #1A1A2E;border-radius:8px;box-shadow:3px 3px 0 #1A1A2E;max-width:400px;}
h1{font-family:'Space Grotesk',sans-serif;color:#C45D35;font-size:2em;margin:0 0 12px;}
p{color:#5D5348;font-size:16px;margin:0;}
</style></head><body>
<div class="box"><h1>🔒 Acceso denegado</h1><p>El enlace no es válido o ha expirado.<br/>Contacta a tu equipo de Growth para obtener acceso.</p></div>
</body></html>`;
}

// ========== End Portal Helpers ==========

http.createServer((req, res) => {
  let url = req.url.split('?')[0];
  if (url.startsWith('/mc/')) url = url.slice(3);

  // ========== ACCESS CONTROL ==========
  // Root / landing page (no token)
  if (url === '/' || url === '/mc') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(landingPage());
    return;
  }

  // Admin routes: /admin/{token}/... → rewrite to original MC routes
  if (url.startsWith('/admin/')) {
    const adminParts = url.replace('/admin/', '').split('/');
    const token = adminParts[0];
    if (!isValidAdmin(token)) {
      res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(portalForbiddenPage());
      return;
    }
    // Rewrite URL: strip /admin/{token} prefix, pass through to existing handlers
    const rest = '/' + adminParts.slice(1).join('/');
    url = rest === '/' ? '/mission-control.html' : rest;
    // Tag the request as admin so static files and APIs work
    req._adminToken = token;
    req._adminBase = `/mc/admin/${token}`;
    // Wrap res.writeHead + res.end to auto-rewrite /mc/ links in HTML responses
    let _isHtml = false;
    const origWriteHead = res.writeHead.bind(res);
    res.writeHead = function(code, headers) {
      if (headers) {
        const ct = headers['Content-Type'] || headers['content-type'] || '';
        if (ct.includes('text/html')) _isHtml = true;
      }
      return origWriteHead(code, headers);
    };
    const origEnd = res.end.bind(res);
    res.end = function(data, encoding) {
      if (data && _isHtml && req._adminBase) {
        const text = (typeof data === 'string' ? data : data.toString('utf-8'))
          .replace(/\/mc\/(?!admin\/|portal\/)/g, req._adminBase + '/')
          .replace(/href="\/mc#/g, `href="${req._adminBase}/#`)
          .replace(/href="\/mc"/g, `href="${req._adminBase}/"`);
        return origEnd(text, 'utf-8');
      }
      return origEnd(data, encoding);
    };
  }

  // Block unauthenticated access to admin assets and APIs
  // Allow: /portal/*, /admin/* (handled above), / (landing)
  // Block everything else (mission-control.html, /docs/*, /api/*, /connect/*, /brand/*)
  if (!req._adminToken && !url.startsWith('/portal/') && !url.startsWith('/connect/') && !url.startsWith('/api/') && !req._portalClient) {
    res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(portalForbiddenPage());
    return;
  }

  // ========== PORTAL ROUTES ==========
  if (url.startsWith('/portal/')) {
    const portalParts = url.replace('/portal/', '').split('/');
    const token = portalParts[0];
    const client = findClientByToken(token);

    if (!client) {
      res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(portalForbiddenPage());
      return;
    }

    const slug = client.slug;
    const clientName = client.name || slug;
    const portalBase = `/mc/portal/${token}`;
    const portalPath = '/' + portalParts.slice(1).join('/'); // path after token

    // Portal: Root dashboard — serve real MC HTML with portal injection
    if (portalPath === '/' || portalPath === '') {
      try {
        let html = fs.readFileSync(path.join(BASE, 'mission-control.html'), 'utf-8');
        // Rewrite /mc/ links to portal base
        html = html.replace(/\/mc\/(?!admin\/|portal\/)/g, portalBase + '/');
        // Inject portal config before </head>
        const portalScript = `<script>
window.PORTAL_MODE = true;
window.PORTAL_SLUG = '${slug}';
window.PORTAL_CLIENT = '${clientName.replace(/'/g, "\\'")}';
window.PORTAL_BASE = '${portalBase}';
</script>
<style>
/* Portal mode: hide admin-only sections via CSS */
nav .nav-footer { display:none !important; }
</style>`;
        // Also inject a script at the end of body to auto-select client after all JS is loaded
        const portalPostScript = `<script>
(function() {
  // Hide admin-only nav links
  document.querySelectorAll('nav a').forEach(function(a) {
    var text = a.textContent.trim().toLowerCase();
    if (['agentes','skills','activity','changelog','¿cómo empezar?'].some(function(h){return text.includes(h);})) {
      a.style.display = 'none';
    }
  });
  // Hide system section headers
  document.querySelectorAll('.ns').forEach(function(el) {
    var text = el.textContent.trim().toLowerCase();
    if (text.includes('sistema') || text.includes('system') || text.includes('tools') || text.includes('herramientas')) {
      el.style.display = 'none';
    }
  });
  // Hide regenerate/wizard
  document.querySelectorAll('[onclick*="regenerate"]').forEach(function(el) { el.style.display = 'none'; });
  // Force client selection
  var sel = document.getElementById('clientSelector');
  if (sel) {
    sel.value = '${slug}';
    sel.style.display = 'none';
    if (typeof switchClient === 'function') switchClient('${slug}');
  }
})();
</script>`;
        html = html.replace('</head>', portalScript + '\n</head>');
        html = html.replace('</body>', portalPostScript + '\n</body>');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } catch (e) {
        res.writeHead(500); res.end('Error loading dashboard: ' + e.message);
      }
      return;
    }

    // Portal: Serve filtered clients.js (only this client)
    if (portalPath === '/clients.js') {
      try {
        const allClients = fs.readFileSync(path.join(BASE, 'clients.js'), 'utf-8');
        // Parse the CLIENTS object, extract only this client
        const clientsData = loadClients();
        const thisClient = clientsData.find(c => c.slug === slug);
        const clientObj = {};
        if (thisClient) {
          clientObj[slug] = {
            name: thisClient.name || slug,
            emoji: thisClient.emoji || '🏢',
            url: thisClient.url || '',
            discord_guild: thisClient.guild || '',
            supabase: thisClient.supabase || {},
            workspace: thisClient.workspace || '',
            phase: thisClient.phase || 0,
          };
        }
        const js = `const CLIENTS = ${JSON.stringify(clientObj, null, 2)};`;
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
        res.end(js);
      } catch (e) {
        res.writeHead(500); res.end('// error: ' + e.message);
      }
      return;
    }

    // Portal: Serve mc-data.js filtered for this client only
    if (portalPath === '/mc-data.js') {
      try {
        let js = fs.readFileSync(path.join(BASE, 'mc-data.js'), 'utf-8');
        // Parse MC_DATA, filter to only this client's data
        // mc-data.js is: const MC_DATA = { ... };
        const match = js.match(/const MC_DATA\s*=\s*(\{[\s\S]*\})\s*;/);
        if (match) {
          const data = JSON.parse(match[1]);
          // Filter foundation.clients to only this slug
          if (data.foundation && data.foundation.clients) {
            const fc = data.foundation.clients[slug];
            data.foundation.clients = fc ? { [slug]: fc } : {};
          }
          // Filter clients array if it exists
          if (Array.isArray(data.clients)) {
            data.clients = data.clients.filter(c => c.slug === slug);
          }
          // Remove cost data (admin only)
          delete data.costs;
          delete data.costsByClient;
          // Remove apiHealth details for other clients
          js = 'const MC_DATA = ' + JSON.stringify(data) + ';';
        }
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
        res.end(js);
      } catch (e) {
        res.writeHead(500); res.end('// error: ' + e.message);
      }
      return;
    }

    // Portal: Serve other allowed static JS files
    if (portalPath === '/skills-data.js' || portalPath === '/agents-data.js') {
      const filePath = path.join(BASE, portalPath.slice(1));
      try {
        const data = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
        res.end(data);
      } catch {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
        res.end('// not found');
      }
      return;
    }

    // Portal: Projects dashboard
    if (portalPath === '/projects' || portalPath === '/projects/') {
      const guildId = client.guild || client.discord_guild_id || '';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(buildProjectsPage(slug, portalBase, clientName, guildId));
      return;
    }

    // Portal: Docs — route through main handler with scoping
    if (portalPath.startsWith('/docs/')) {
      req._portalClient = client;
      req._portalSlug = slug;
      req._portalBase = portalBase;
      url = portalPath;
      // Fall through to main docs handler (which has portal scoping)
    }

    // Portal: Connect pages (scoped to client slug)
    else if (portalPath.startsWith('/connect/')) {
      const apiId = portalPath.replace('/connect/', '').replace(/\/$/, '');
      req._portalClient = client;
      req._portalSlug = slug;
      req._portalBase = portalBase;
      url = `/connect/${slug}/${apiId}`;
      // Wrap res to rewrite /mc/ links in connect page HTML to portal base
      const _isHtmlC = { v: false };
      const origWHC = res.writeHead.bind(res);
      res.writeHead = function(code, headers) {
        if (headers) {
          const ct = headers['Content-Type'] || headers['content-type'] || '';
          if (ct.includes('text/html')) _isHtmlC.v = true;
        }
        return origWHC(code, headers);
      };
      const origEndC = res.end.bind(res);
      res.end = function(data, encoding) {
        if (data && _isHtmlC.v && portalBase) {
          const text = (typeof data === 'string' ? data : data.toString('utf-8'))
            .replace(/\/mc\/(?!admin\/|portal\/)/g, portalBase + '/')
            .replace(/href="\/mc"/g, `href="${portalBase}/"`);
          return origEndC(text, 'utf-8');
        }
        return origEndC(data, encoding);
      };
      // Fall through to existing connect handler
    }

    // Portal: API passthrough (scoped to client)
    else if (portalPath.startsWith('/api/')) {
      req._portalClient = client;
      req._portalSlug = slug;

      // Allowed APIs for portal clients
      const allowedApis = [
        '/api/client-integrations/catalog',
        '/api/client-integrations/test',
        '/api/client-integrations',
        '/api/api-health',
        '/api/health-check',
        '/api/system-sa',
        '/api/projects/task-status',
        '/api/projects/task-update',
        '/api/projects/project-update',
        '/api/projects/',
        '/api/metrics',
      ];
      const apiPath = portalPath.split('?')[0];
      const isAllowed = allowedApis.some(a => apiPath === a || apiPath.startsWith(a + '/') || apiPath.startsWith(a + '?'));

      // Block dangerous APIs
      const blockedApis = ['/api/env', '/api/restart-gateway', '/api/integration'];
      const isBlocked = blockedApis.some(a => apiPath === a || apiPath.startsWith(a));

      if (isBlocked) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not available in portal mode' }));
        return;
      }

      if (isAllowed) {
        // Force slug parameter for client-integrations calls
        if (apiPath.startsWith('/api/client-integrations') && !apiPath.includes('catalog')) {
          const qs = req.url.includes('?') ? '&' : '?';
          req.url = req.url.replace(/slug=[^&]*/, '').replace(/[?&]$/, '') + qs + 'slug=' + slug;
        }
        url = portalPath;
        // Fall through to existing handlers
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'API not found' }));
        return;
      }
    }
    else {
      // Any other portal path: 404
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(portalPage('No encontrado', clientName, '<p>Página no encontrada.</p><a href="' + portalBase + '/">← Volver al dashboard</a>'));
      return;
    }
  }
  // ========== END PORTAL ROUTES ==========

  // === API: Projects — task status update ===
  if (req.method === 'POST' && url === '/api/projects/task-status') {
    // Requires admin or portal auth
    if (!req._adminToken && !req._portalClient) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const { slug, taskId, status } = JSON.parse(body);
        if (!slug || !taskId || !status) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing slug, taskId, or status' }));
          return;
        }
        // Portal clients can only update their own slug
        if (req._portalClient && req._portalSlug !== slug) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Forbidden' }));
          return;
        }
        // Find the project folder
        const projectsDir = path.join(BASE, 'brand', slug, 'projects');
        const projectId = taskId.split('-').slice(0, 1).join('-'); // P01 from P01-T01
        // Find the folder matching the project ID
        let projFolder = null;
        try {
          const dirs = fs.readdirSync(projectsDir, { withFileTypes: true });
          projFolder = dirs.find(d => d.isDirectory() && d.name.startsWith(projectId + '-'));
        } catch {}
        if (!projFolder) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Project not found: ' + projectId }));
          return;
        }
        const tasksFile = path.join(projectsDir, projFolder.name, 'tasks.json');
        let tasksData;
        try { tasksData = JSON.parse(fs.readFileSync(tasksFile, 'utf-8')); } catch {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'tasks.json not found' }));
          return;
        }
        const tasks = Array.isArray(tasksData) ? tasksData : (tasksData.tasks || []);
        const task = tasks.find(t => t.id === taskId);
        if (!task) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Task not found: ' + taskId }));
          return;
        }
        const oldStatus = task.status;
        task.status = status;
        if (status === 'completed' || status === 'done') task.completed = new Date().toISOString().slice(0, 10);
        // Write back
        const writeData = Array.isArray(tasksData) ? tasks : { ...tasksData, tasks };
        fs.writeFileSync(tasksFile, JSON.stringify(writeData, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, taskId, oldStatus, newStatus: status }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // === API: Projects — update task fields ===
  if (req.method === 'POST' && url === '/api/projects/task-update') {
    if (!req._adminToken && !req._portalClient) {
      res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unauthorized' })); return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const { slug, taskId, fields } = JSON.parse(body);
        if (!slug || !taskId || !fields) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Missing slug, taskId, or fields' })); return; }
        if (req._portalClient && req._portalSlug !== slug) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Forbidden' })); return; }
        const projectsDir = path.join(BASE, 'brand', slug, 'projects');
        const projectId = taskId.split('-').slice(0, 1).join('-');
        let projFolder = null;
        try { const dirs = fs.readdirSync(projectsDir, { withFileTypes: true }); projFolder = dirs.find(d => d.isDirectory() && d.name.startsWith(projectId + '-')); } catch {}
        if (!projFolder) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Project not found' })); return; }
        const tasksFile = path.join(projectsDir, projFolder.name, 'tasks.json');
        let tasksData;
        try { tasksData = JSON.parse(fs.readFileSync(tasksFile, 'utf-8')); } catch { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'tasks.json not found' })); return; }
        const tasks = Array.isArray(tasksData) ? tasksData : (tasksData.tasks || []);
        const task = tasks.find(t => t.id === taskId);
        if (!task) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Task not found' })); return; }
        const allowed = ['name','description','owner','channel','status'];
        for (const [k, v] of Object.entries(fields)) { if (allowed.includes(k)) task[k] = v; }
        if (fields.status === 'completed' || fields.status === 'done') task.completed = new Date().toISOString().slice(0, 10);
        const writeData = Array.isArray(tasksData) ? tasks : { ...tasksData, tasks };
        fs.writeFileSync(tasksFile, JSON.stringify(writeData, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, task }));
      } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  // === API: Projects — update project fields ===
  if (req.method === 'POST' && url === '/api/projects/project-update') {
    if (!req._adminToken && !req._portalClient) {
      res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unauthorized' })); return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const { slug, projectId, fields } = JSON.parse(body);
        if (!slug || !projectId || !fields) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Missing params' })); return; }
        if (req._portalClient && req._portalSlug !== slug) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Forbidden' })); return; }
        const projectsDir = path.join(BASE, 'brand', slug, 'projects');
        let projFolder = null;
        try { const dirs = fs.readdirSync(projectsDir, { withFileTypes: true }); projFolder = dirs.find(d => d.isDirectory() && d.name.startsWith(projectId + '-')); } catch {}
        if (!projFolder) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Project not found' })); return; }
        const projFile = path.join(projectsDir, projFolder.name, 'project.json');
        let project;
        try { project = JSON.parse(fs.readFileSync(projFile, 'utf-8')); } catch { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'project.json not found' })); return; }
        const allowed = ['name','objective','status','review_date','strategy'];
        for (const [k, v] of Object.entries(fields)) { if (allowed.includes(k)) project[k] = v; }
        fs.writeFileSync(projFile, JSON.stringify(project, null, 2));
        // Also update registry
        const regFile = path.join(projectsDir, 'registry.json');
        try {
          const reg = JSON.parse(fs.readFileSync(regFile, 'utf-8'));
          const rp = (reg.projects || []).find(p => p.id === projectId);
          if (rp) { if (fields.name) rp.name = fields.name; if (fields.status) rp.status = fields.status; if (fields.review_date) rp.review_date = fields.review_date; }
          fs.writeFileSync(regFile, JSON.stringify(reg, null, 2));
        } catch {}
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, project }));
      } catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  // === API: Projects — get all projects data ===
  if (req.method === 'GET' && url.startsWith('/api/projects/') && !url.includes('task-status')) {
    if (!req._adminToken && !req._portalClient) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    const slug = url.replace('/api/projects/', '').replace(/\/$/, '');
    if (req._portalClient && req._portalSlug !== slug) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden' }));
      return;
    }
    const projects = loadProjectsData(slug);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, slug, projects }));
    return;
  }

  // === Projects page (admin mode) ===
  if (url.startsWith('/projects/') || url === '/projects') {
    if (!req._adminToken) {
      res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(portalForbiddenPage());
      return;
    }
    const slug = url.replace('/projects/', '').replace(/\/$/, '') || null;
    if (!slug) {
      // List all clients with projects link
      const clients = loadClients();
      const links = clients.map(c => `<div class="card"><a href="${req._adminBase}/projects/${c.slug}/">${c.emoji || '🏢'} ${c.name || c.slug}</a></div>`).join('');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(page('Proyectos', `<a class="back" href="${req._adminBase}/">← Mission Control</a>`, `<h1>📋 Proyectos por cliente</h1>${links}`));
      return;
    }
    const client = loadClients().find(c => c.slug === slug);
    const clientName = client ? (client.name || slug) : slug;
    const guildId = client ? (client.guild || client.discord_guild_id || '') : '';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(buildProjectsPage(slug, req._adminBase, clientName, guildId));
    return;
  }

  // === API: Google Workspace OAuth (gog auth) — Step 1: Generate auth URL ===
  if (req.method === 'POST' && url === '/api/gog-auth-start') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const { email, services } = JSON.parse(body);
        if (!email || !email.includes('@')) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Email inválido' }));
          return;
        }
        const svcList = services || 'gmail,calendar,drive,contacts,sheets';
        const { execSync } = require('child_process');
        const gogPath = '/opt/homebrew/bin/gog';
        const output = execSync(
          `${gogPath} auth add "${email}" --remote --step 1 --services "${svcList}" --force-consent --plain 2>&1`,
          { timeout: 15000, encoding: 'utf-8', env: { ...process.env, PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin' } }
        );
        // Parse auth_url from output
        const urlMatch = output.match(/auth_url\t(https:\/\/[^\s]+)/);
        if (urlMatch) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, authUrl: urlMatch[1], email }));
        } else {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No se pudo generar la URL de autorización', output: output.slice(0, 500) }));
        }
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // === API: Google Workspace OAuth (gog auth) — Step 2: Exchange code ===
  if (req.method === 'POST' && url === '/api/gog-auth-complete') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const { email, authUrl } = JSON.parse(body);
        if (!email || !authUrl) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Falta email o authUrl (redirect URL)' }));
          return;
        }
        const { execSync } = require('child_process');
        const gogPath = '/opt/homebrew/bin/gog';
        const output = execSync(
          `${gogPath} auth add "${email}" --remote --step 2 --auth-url "${authUrl}" --plain 2>&1`,
          { timeout: 30000, encoding: 'utf-8', env: { ...process.env, PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin' } }
        );
        if (output.includes('stored') || output.includes('success') || output.includes('token')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, detail: output.trim() }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, detail: output.trim() }));
        }
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // === API: Google Workspace — List connected accounts ===
  if (req.method === 'GET' && url === '/api/gog-accounts') {
    try {
      const { execSync } = require('child_process');
      const output = execSync('/opt/homebrew/bin/gog auth list --json 2>&1', { timeout: 10000, encoding: 'utf-8', env: { ...process.env, PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin' } });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(output);
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([]));
    }
    return;
  }

  // === API: Get system service account email ===
  if (req.method === 'GET' && url === '/api/system-sa') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const saPath = path.join(BASE, '.secrets', 'google-service-account.json');
    try {
      const sa = JSON.parse(fs.readFileSync(saPath, 'utf-8'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ configured: true, email: sa.client_email, projectId: sa.project_id }));
    } catch {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ configured: false }));
    }
    return;
  }

  // === API: Save system service account ===
  if (req.method === 'POST' && url === '/api/system-sa') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try {
        const sa = JSON.parse(body);
        if (!sa.client_email || !sa.private_key) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid service account JSON: missing client_email or private_key' }));
          return;
        }
        const secretsDir = path.join(BASE, '.secrets');
        if (!fs.existsSync(secretsDir)) fs.mkdirSync(secretsDir, { recursive: true });
        fs.writeFileSync(path.join(secretsDir, 'google-service-account.json'), JSON.stringify(sa, null, 2), 'utf-8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, email: sa.client_email, projectId: sa.project_id }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON: ' + e.message }));
      }
    });
    return;
  }

  // === System Service Account Config Page ===
  if (url === '/connect/system/google-sa') {
    const saPath = path.join(BASE, '.secrets', 'google-service-account.json');
    let currentEmail = null;
    let currentProject = null;
    try {
      const sa = JSON.parse(fs.readFileSync(saPath, 'utf-8'));
      currentEmail = sa.client_email;
      currentProject = sa.project_id;
    } catch {}

    const statusHtml = currentEmail
      ? `<div style="background:#E8F8E8;border:2px solid #4A5D23;border-radius:6px;padding:12px 16px;margin:16px 0;">
           <strong>✅ Service Account configurado</strong><br/>
           Email: <code style="user-select:all;">${currentEmail}</code><br/>
           Proyecto: <code>${currentProject || 'N/A'}</code>
         </div>`
      : `<div style="background:#FFF8E1;border:2px solid #E5A100;border-radius:6px;padding:12px 16px;margin:16px 0;">
           <strong>⚠️ No configurado</strong> — Pega el JSON de tu Service Account abajo.
         </div>`;

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Service Account de Google — Sistema</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Nunito:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  :root { --bg:#F5F0E6;--card:#FDF8EF;--border:#D4C9B8;--text:#1A1A2E;--muted:#5D5348;--ink:#1A1A2E;--rust:#C45D35;--green:#4A5D23; }
  @media(prefers-color-scheme:dark){:root{--bg:#1A1A2E;--card:#2D2D44;--border:#3D3D5C;--text:#FDF8EF;--muted:#A09890;--ink:#FDF8EF;--rust:#D4734F;--green:#6B8E23;}}
  *{box-sizing:border-box;}body{font-family:'Nunito',sans-serif;background:var(--bg);color:var(--text);max-width:600px;margin:40px auto;padding:0 24px;line-height:1.7;}
  h1{font-family:'Space Grotesk',sans-serif;color:var(--rust);font-size:1.8em;}
  .card{background:var(--card);border:2px solid var(--ink);border-radius:8px;padding:24px;box-shadow:3px 3px 0 var(--ink);}
  .btn{padding:12px 28px;border:2px solid var(--ink);border-radius:6px;font-family:'Nunito',sans-serif;font-weight:700;font-size:16px;cursor:pointer;box-shadow:2px 2px 0 var(--ink);background:var(--rust);color:#fff;}
  .btn:disabled{opacity:0.5;cursor:not-allowed;}
  .back{color:var(--muted);text-decoration:none;font-size:14px;}.back:hover{color:var(--rust);}
  textarea{width:100%;min-height:200px;font-family:monospace;font-size:13px;padding:12px;border:2px solid var(--ink);border-radius:6px;background:var(--card);color:var(--text);resize:vertical;box-sizing:border-box;}
  #result{margin-top:16px;padding:12px 16px;border-radius:6px;display:none;font-size:14px;}
</style></head><body>
  <a class="back" href="/mc">← Mission Control</a>
  <h1>🔑 Service Account de Google</h1>
  <p style="color:var(--muted);">Configuración global del sistema. Este Service Account se usa para <strong>todos los clientes</strong> en Google Analytics, Search Console, y otros servicios de Google.</p>
  ${statusHtml}
  <div class="card">
    <p style="font-weight:700;">Pega aquí el contenido completo del archivo JSON del Service Account:</p>
    <p style="font-size:13px;color:var(--muted);">Es el archivo <code>.json</code> que descargaste de Google Cloud Console → IAM → Cuentas de servicio → Claves.</p>
    <textarea id="saJson" placeholder='{"type": "service_account", "project_id": "...", "client_email": "...", ...}'></textarea>
    <div style="margin-top:16px;">
      <button class="btn" onclick="saveSA()">💾 Guardar Service Account</button>
    </div>
    <div id="result"></div>
  </div>
  <div style="margin-top:32px;padding-top:16px;border-top:1px solid var(--border);font-size:13px;color:var(--muted);">
    <strong>🔒 Seguridad:</strong> El JSON se guarda en <code>.secrets/google-service-account.json</code> en el servidor local. Nunca pasa por Discord ni servicios externos. Solo accesible vía Tailscale HTTPS.
  </div>
<script>
async function saveSA() {
  const btn = document.querySelector('.btn');
  const result = document.getElementById('result');
  const text = document.getElementById('saJson').value.trim();
  if (!text) { result.style.display='block'; result.style.background='#FDE8E8'; result.style.border='2px solid #C0392B'; result.style.color='#C0392B'; result.innerHTML='❌ Pega el JSON primero.'; return; }
  btn.disabled = true; btn.textContent = '⏳ Guardando...';
  result.style.display='block'; result.style.background='#FFF8E1'; result.style.border='2px solid #E5A100'; result.style.color='#8B6914'; result.innerHTML='⏳ Validando y guardando...';
  try {
    const parsed = JSON.parse(text);
    if (!parsed.client_email || !parsed.private_key) throw new Error('Falta client_email o private_key');
    const res = await fetch('/mc/api/system-sa', { method:'POST', headers:{'Content-Type':'application/json'}, body: text });
    const data = await res.json();
    if (data.ok) {
      result.style.background='#E8F8E8'; result.style.border='2px solid #4A5D23'; result.style.color='#2D5A1E';
      result.innerHTML='✅ <strong>¡Guardado!</strong> Email: <code>'+data.email+'</code><br/>Ya puedes usar las páginas de conexión de GA4 y GSC. <a href="/mc/connect/hospital-capilar/ga4">Probar GA4 →</a>';
    } else {
      result.style.background='#FDE8E8'; result.style.border='2px solid #C0392B'; result.style.color='#C0392B';
      result.innerHTML='❌ '+data.error;
    }
  } catch(e) {
    result.style.display='block'; result.style.background='#FDE8E8'; result.style.border='2px solid #C0392B'; result.style.color='#C0392B';
    result.innerHTML='❌ JSON inválido: '+e.message;
  }
  btn.disabled=false; btn.textContent='💾 Guardar Service Account';
}
</script></body></html>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // === Connect Page: /connect/{slug}/{apiId} ===
  if (url.startsWith('/connect/')) {
    const parts = url.replace('/connect/', '').split('/').filter(Boolean);
    const slug = parts[0];
    const apiId = parts[1];

    if (!slug || !apiId) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>Falta slug o apiId</h1><p>Usa: /connect/{slug}/{apiId}</p>');
      return;
    }

    // Load catalog + setup guides
    let catalog = {};
    let setupGuides = {};
    try {
      const catalogPath = path.join(BASE, 'skills', 'acquisition-metrics-plan', 'schemas', 'api-catalog.json');
      catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
    } catch (e) {
      res.writeHead(500); res.end('Failed to load API catalog'); return;
    }
    try {
      const guidesPath = path.join(BASE, 'skills', 'acquisition-metrics-plan', 'schemas', 'setup-guides.json');
      setupGuides = JSON.parse(fs.readFileSync(guidesPath, 'utf-8'));
    } catch {}

    // Find the API in any category
    let apiMeta = null;
    let categoryLabel = '';
    for (const [catKey, catData] of Object.entries(catalog.categories || {})) {
      if (catData.apis && catData.apis[apiId]) {
        apiMeta = catData.apis[apiId];
        categoryLabel = catData.label || catKey;
        break;
      }
    }

    if (!apiMeta) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h1>API "${apiId}" no encontrada en el catálogo</h1>`);
      return;
    }

    // Load current integration status for this client
    let currentStatus = 'not_configured';
    let currentConfig = {};
    let lastTestedAt = null;
    let lastError = null;
    try {
      const intPath = path.join(BASE, 'brand', slug, 'integrations.json');
      const intData = JSON.parse(fs.readFileSync(intPath, 'utf-8'));
      const entry = (intData.dataSources || {})[apiId] || (intData.systemOverrides || {})[apiId];
      if (entry) {
        currentStatus = entry.status || 'not_configured';
        currentConfig = entry.config || {};
        lastTestedAt = entry.lastTestedAt || null;
        lastError = entry.lastError || null;
      }
    } catch {}

    // Load client name
    let clientName = slug;
    try {
      const clientsData = JSON.parse(fs.readFileSync(path.join(BASE, 'clients.json'), 'utf-8'));
      const client = clientsData.clients.find(c => c.slug === slug);
      if (client) clientName = client.name;
    } catch {}

    const credentials = apiMeta.credentials || [];
    const configFields = apiMeta.config || [];
    const allFields = [...credentials, ...configFields];
    const ownership = apiMeta.ownership || 'system';
    const guide = setupGuides[apiId] || null;

    const statusBadge = currentStatus === 'connected'
      ? '<span style="background:#4A5D23;color:#fff;padding:4px 12px;border-radius:20px;font-size:14px;font-weight:700;">✅ Conectado</span>'
      : currentStatus === 'error'
        ? '<span style="background:#C0392B;color:#fff;padding:4px 12px;border-radius:20px;font-size:14px;font-weight:700;">❌ Error</span>'
        : currentStatus === 'pending'
          ? '<span style="background:#E5A100;color:#fff;padding:4px 12px;border-radius:20px;font-size:14px;font-weight:700;">⏳ Pendiente</span>'
          : '<span style="background:#5D5348;color:#fff;padding:4px 12px;border-radius:20px;font-size:14px;font-weight:700;">⬜ No configurado</span>';

    const lastTestedHtml = lastTestedAt
      ? `<p style="font-size:13px;color:var(--muted);">Último test: ${new Date(lastTestedAt).toLocaleString('es-ES')}</p>`
      : '';
    const lastErrorHtml = lastError
      ? `<div style="background:#FDE8E8;border:2px solid #C0392B;border-radius:6px;padding:10px 14px;margin:10px 0;font-size:14px;color:#C0392B;"><strong>Último error:</strong> ${lastError.replace(/</g,'&lt;')}</div>`
      : '';

    // Build form fields
    let fieldsHtml = '';
    for (const field of allFields) {
      const isSensitive = field.sensitive !== false;
      const inputType = isSensitive ? 'password' : 'text';
      const currentVal = (!isSensitive && currentConfig[field.key]) ? ` value="${String(currentConfig[field.key]).replace(/"/g,'&quot;')}"` : '';
      const helpText = field.help ? `<div style="font-size:12px;color:var(--muted);margin-top:2px;">${field.help}</div>` : '';
      const eyeBtn = isSensitive ? `<button type="button" onclick="toggleVis(this)" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:18px;padding:4px;" title="Mostrar/ocultar">👁️</button>` : '';

      fieldsHtml += `
        <div style="margin-bottom:16px;">
          <label style="font-weight:700;font-size:15px;display:block;margin-bottom:4px;">${field.label}</label>
          ${helpText}
          <div style="position:relative;margin-top:6px;">
            <input name="${field.key}" type="${inputType}" placeholder="${field.placeholder || ''}"${currentVal}
              style="width:100%;padding:10px 14px;${isSensitive ? 'padding-right:44px;' : ''}border:2px solid var(--ink);border-radius:6px;font-size:15px;font-family:'Nunito',sans-serif;background:var(--card);color:var(--text);box-sizing:border-box;"
              data-sensitive="${isSensitive}" />
            ${eyeBtn}
          </div>
        </div>`;
    }

    // Custom OAuth page for Google Workspace (gog CLI)
    const isGogOAuth = apiMeta.customOAuth === 'gog';

    // OAuth instruction for special APIs
    let oauthNote = '';
    if (['ga4', 'gsc', 'google_ads'].includes(apiId)) {
      oauthNote = `
        <div style="background:#E8F4FD;border:2px solid #3B82F6;border-radius:6px;padding:12px 16px;margin:16px 0;">
          <strong>💡 OAuth API</strong> — Esta API usa OAuth. Necesitarás autorizar acceso desde Google Cloud Console.
          <br/>Si ya tienes un Service Account o refresh token, pégalo abajo. Si no, sigue las instrucciones del enlace de documentación.
        </div>`;
    }

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Conectar ${apiMeta.provider} — ${clientName}</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Nunito:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #F5F0E6; --card: #FDF8EF; --border: #D4C9B8; --text: #1A1A2E; --muted: #5D5348;
    --ink: #1A1A2E; --rust: #C45D35; --green: #4A5D23; --blue: #3B82F6;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #1A1A2E; --card: #2D2D44; --border: #3D3D5C; --text: #FDF8EF; --muted: #A09890;
      --ink: #FDF8EF; --rust: #D4734F; --green: #6B8E23; --blue: #60a5fa;
    }
  }
  * { box-sizing: border-box; }
  body { font-family: 'Nunito', sans-serif; background: var(--bg); color: var(--text); max-width: 600px; margin: 40px auto; padding: 0 24px; line-height: 1.7; }
  h1 { font-family: 'Space Grotesk', sans-serif; color: var(--rust); font-size: 1.8em; margin-bottom: 4px; }
  .subtitle { color: var(--muted); font-size: 15px; margin-bottom: 24px; }
  .card { background: var(--card); border: 2px solid var(--ink); border-radius: 8px; padding: 24px; box-shadow: 3px 3px 0 var(--ink); }
  .btn { padding: 12px 28px; border: 2px solid var(--ink); border-radius: 6px; font-family: 'Nunito', sans-serif; font-weight: 700; font-size: 16px; cursor: pointer; box-shadow: 2px 2px 0 var(--ink); transition: all 0.15s; }
  .btn:hover { transform: translate(1px, 1px); box-shadow: 1px 1px 0 var(--ink); }
  .btn-primary { background: var(--rust); color: #fff; }
  .btn-secondary { background: var(--card); color: var(--text); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .back { color: var(--muted); text-decoration: none; font-size: 14px; }
  .back:hover { color: var(--rust); }
  .meta-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: 12px 0; }
  #result { margin-top: 16px; padding: 12px 16px; border-radius: 6px; display: none; font-size: 14px; }
  .tag { font-size: 12px; padding: 2px 10px; border-radius: 20px; border: 1px solid var(--border); color: var(--muted); }
</style>
</head>
<body>
  <a class="back" href="/mc">← Mission Control</a>

  <h1>${apiMeta.icon || '🔌'} Conectar ${apiMeta.provider}</h1>
  <p class="subtitle">${apiMeta.desc} · Para <strong>${clientName}</strong></p>

  <div class="meta-row">
    ${statusBadge}
    <span class="tag">${ownership === 'system' ? '🔧 Sistema' : '👤 Cliente'}</span>
    ${apiMeta.docs ? `<a href="${apiMeta.docs}" target="_blank" style="color:var(--blue);font-size:14px;font-weight:700;">📖 Documentación →</a>` : ''}
  </div>
  ${lastTestedHtml}
  ${lastErrorHtml}
  ${oauthNote}

  ${guide && guide.systemServiceAccountNote ? `<div id="sa-info" style="display:none;background:var(--card);border:2px solid var(--ink);border-radius:8px;padding:14px 18px;margin-top:16px;font-size:14px;box-shadow:3px 3px 0 var(--ink);"></div>` : ''}

  ${guide ? `
  <div class="card" style="margin-top:20px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h2 style="font-family:'Space Grotesk',sans-serif;color:var(--rust);margin:0;font-size:1.3em;">📋 Instrucciones paso a paso</h2>
      <div style="display:flex;gap:8px;">
        ${guide.difficulty ? `<span class="tag" style="background:${guide.difficulty === 'baja' ? 'var(--green)' : guide.difficulty === 'media' ? '#E5A100' : '#C0392B'};color:#fff;border:none;">Dificultad: ${guide.difficulty}</span>` : ''}
        ${guide.time ? `<span class="tag">⏱️ ${guide.time}</span>` : ''}
      </div>
    </div>
    ${guide.warning ? `<div style="background:#FFF8E1;border:2px solid #E5A100;border-radius:6px;padding:10px 14px;margin-bottom:16px;font-size:14px;color:#8B6914;">${guide.warning}</div>` : ''}
    <div class="steps-container">
      ${guide.steps.map((step, i) => `
        <div class="step" id="step-${i}">
          <div class="step-header" onclick="toggleStep(${i})" style="cursor:pointer;display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);">
            <div class="step-number" style="min-width:32px;height:32px;background:var(--rust);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-family:'Space Grotesk',sans-serif;font-size:14px;">${i + 1}</div>
            <div style="flex:1;">
              <div style="font-weight:700;font-size:15px;">${step.title}</div>
            </div>
            <span class="step-toggle" id="toggle-${i}" style="font-size:18px;color:var(--muted);transition:transform 0.2s;">▶</span>
          </div>
          <div class="step-body" id="body-${i}" style="display:none;padding:12px 0 12px 44px;font-size:14px;line-height:1.8;color:var(--text);">
            ${step.instructions}
          </div>
        </div>
      `).join('')}
    </div>
    <button type="button" class="btn btn-secondary" onclick="expandAll()" style="margin-top:12px;font-size:13px;padding:6px 16px;">
      📖 Expandir todo
    </button>
  </div>
  ` : ''}

  ${isGogOAuth ? `
  <div class="card" style="margin-top:20px;">
    <h2 style="font-family:'Space Grotesk',sans-serif;color:var(--rust);margin:0 0 16px 0;font-size:1.3em;">🔌 Conectar cuenta de Google</h2>

    <div id="gog-step1">
      <div style="margin-bottom:16px;">
        <label style="font-weight:700;font-size:15px;display:block;margin-bottom:4px;">Email de la cuenta de Google</label>
        <div style="font-size:12px;color:var(--muted);margin-bottom:6px;">La cuenta de Gmail o Google Workspace que quieres conectar</div>
        <input id="gog-email" type="email" placeholder="info@suempresa.com"
          style="width:100%;padding:10px 14px;border:2px solid var(--ink);border-radius:6px;font-size:15px;font-family:'Nunito',sans-serif;background:var(--card);color:var(--text);box-sizing:border-box;" />
      </div>
      <div style="margin-bottom:12px;">
        <label style="font-weight:700;font-size:14px;display:block;margin-bottom:4px;">Servicios a autorizar</label>
        <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:14px;">
          <label><input type="checkbox" class="gog-svc" value="gmail" checked> 📧 Gmail</label>
          <label><input type="checkbox" class="gog-svc" value="calendar" checked> 📅 Calendar</label>
          <label><input type="checkbox" class="gog-svc" value="drive" checked> 📁 Drive</label>
          <label><input type="checkbox" class="gog-svc" value="contacts" checked> 👤 Contacts</label>
          <label><input type="checkbox" class="gog-svc" value="sheets"> 📊 Sheets</label>
          <label><input type="checkbox" class="gog-svc" value="docs"> 📝 Docs</label>
        </div>
      </div>
      <button class="btn btn-primary" onclick="gogStep1()">🔗 Generar link de autorización</button>
      <div id="gog-result1" style="margin-top:12px;display:none;"></div>
    </div>

    <div id="gog-step2" style="display:none;margin-top:20px;padding-top:16px;border-top:2px solid var(--border);">
      <div style="background:#E8F4FD;border:2px solid #3B82F6;border-radius:6px;padding:12px 16px;margin-bottom:16px;">
        <strong>📋 Paso 2:</strong> El propietario de la cuenta debe abrir el link de arriba, autorizar en Google, y <strong>copiar la URL completa a la que fue redirigido</strong> (será algo como <code>http://127.0.0.1:xxxxx/oauth2/callback?code=...</code>).
      </div>
      <label style="font-weight:700;font-size:15px;display:block;margin-bottom:4px;">URL de redirección de Google</label>
      <div style="font-size:12px;color:var(--muted);margin-bottom:6px;">La URL completa que aparece en el navegador después de autorizar</div>
      <input id="gog-redirect-url" type="text" placeholder="http://127.0.0.1:xxxxx/oauth2/callback?code=..."
        style="width:100%;padding:10px 14px;border:2px solid var(--ink);border-radius:6px;font-size:14px;font-family:monospace;background:var(--card);color:var(--text);box-sizing:border-box;" />
      <div style="margin-top:12px;">
        <button class="btn btn-primary" onclick="gogStep2()">✅ Completar conexión</button>
      </div>
      <div id="gog-result2" style="margin-top:12px;display:none;"></div>
    </div>

    <div id="gog-accounts" style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border);"></div>
  </div>
  ` : `
  <div class="card" style="margin-top:20px;">
    <h2 style="font-family:'Space Grotesk',sans-serif;color:var(--rust);margin:0 0 16px 0;font-size:1.3em;">🔌 Credenciales</h2>
    <form id="connectForm" onsubmit="return false;">`}

      ${fieldsHtml || '<p style="color:var(--muted);">Esta API no requiere credenciales manuales.</p>'}

      <div style="display:flex;gap:12px;margin-top:20px;">
        <button type="submit" class="btn btn-primary" id="connectBtn" onclick="doConnect()">
          🔌 Conectar y testear
        </button>
        <button type="button" class="btn btn-secondary" id="testBtn" onclick="doTest()">
          🧪 Solo testear
        </button>
      </div>
    </form>

    <div id="result"></div>
  </div>

  <div style="margin-top:32px;padding-top:16px;border-top:1px solid var(--border);font-size:13px;color:var(--muted);">
    <strong>🔒 Seguridad:</strong> Las credenciales se guardan en <code>brand/${slug}/.env</code> en el servidor local.
    Nunca pasan por Discord ni por ningún servicio externo. La conexión está protegida por HTTPS + Tailscale.
  </div>

<script>
// Copy URL helper
function copyGogUrl() {
  const url = window._gogAuthUrl || document.getElementById('gog-auth-url').textContent;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(function() {
      event.target.textContent = '✅ Copiado';
    });
  } else {
    // Fallback for mobile/insecure contexts
    var ta = document.createElement('textarea');
    ta.value = url;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    event.target.textContent = '✅ Copiado';
  }
}

// Google Workspace OAuth (gog CLI) functions
async function gogStep1() {
  const email = document.getElementById('gog-email').value.trim();
  if (!email || !email.includes('@')) {
    showGogResult('gog-result1', 'error', '❌ Introduce un email válido');
    return;
  }
  const services = [...document.querySelectorAll('.gog-svc:checked')].map(c => c.value).join(',');
  if (!services) {
    showGogResult('gog-result1', 'error', '❌ Selecciona al menos un servicio');
    return;
  }
  showGogResult('gog-result1', 'info', '⏳ Generando link de autorización...');
  try {
    const res = await fetch('/mc/api/gog-auth-start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, services })
    });
    const data = await res.json();
    if (data.ok && data.authUrl) {
      window._gogAuthUrl = data.authUrl;
      showGogResult('gog-result1', 'ok',
        '✅ <strong>Link generado.</strong> Envía este link al propietario de la cuenta para que autorice:<br/><br/>' +
        '<div id="gog-auth-url" style="background:var(--bg);padding:8px 12px;border-radius:4px;word-break:break-all;font-size:12px;font-family:monospace;margin:8px 0;user-select:all;cursor:text;">' + data.authUrl + '</div>' +
        '<button class="btn btn-secondary" style="font-size:13px;padding:6px 14px;" onclick="copyGogUrl()">📋 Copiar link</button>'
      );
      document.getElementById('gog-step2').style.display = 'block';
      document.getElementById('gog-step2').dataset.email = email;
    } else {
      showGogResult('gog-result1', 'error', '❌ ' + (data.error || 'Error desconocido'));
    }
  } catch (e) {
    showGogResult('gog-result1', 'error', '❌ Error de red: ' + e.message);
  }
}

async function gogStep2() {
  const email = document.getElementById('gog-step2').dataset.email;
  const authUrl = document.getElementById('gog-redirect-url').value.trim();
  if (!authUrl) {
    showGogResult('gog-result2', 'error', '❌ Pega la URL de redirección');
    return;
  }
  showGogResult('gog-result2', 'info', '⏳ Completando conexión...');
  try {
    const res = await fetch('/mc/api/gog-auth-complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, authUrl })
    });
    const data = await res.json();
    if (data.ok) {
      showGogResult('gog-result2', 'ok', '✅ <strong>¡Conectado!</strong> La cuenta ' + email + ' está lista. ' + (data.detail || ''));
      loadGogAccounts();
    } else {
      showGogResult('gog-result2', 'error', '❌ ' + (data.error || 'Error desconocido'));
    }
  } catch (e) {
    showGogResult('gog-result2', 'error', '❌ Error de red: ' + e.message);
  }
}

function showGogResult(id, type, msg) {
  const el = document.getElementById(id);
  el.style.display = 'block';
  if (type === 'ok') { el.style.background = '#E8F8E8'; el.style.border = '2px solid #4A5D23'; el.style.color = '#2D5A1E'; }
  else if (type === 'error') { el.style.background = '#FDE8E8'; el.style.border = '2px solid #C0392B'; el.style.color = '#C0392B'; }
  else { el.style.background = '#FFF8E1'; el.style.border = '2px solid #E5A100'; el.style.color = '#8B6914'; }
  el.style.padding = '12px 16px'; el.style.borderRadius = '6px'; el.style.fontSize = '14px';
  el.innerHTML = msg;
}

async function loadGogAccounts() {
  try {
    const res = await fetch('/mc/api/gog-accounts');
    const data = await res.json();
    const accounts = Array.isArray(data) ? data : (data.accounts || []);
    if (accounts.length > 0) {
      const el = document.getElementById('gog-accounts');
      el.innerHTML = '<div style="font-weight:700;margin-bottom:8px;">📧 Cuentas conectadas:</div>' +
        accounts.map(a => {
          const email = a.email || a.account || a;
          const services = a.services || a.scopes || '';
          return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;"><span class="dot g"></span><code>' + email + '</code>' +
            (services ? '<span style="font-size:11px;color:var(--muted);">' + services + '</span>' : '') + '</div>';
        }).join('');
    }
  } catch {}
}
// Load accounts on page load
if (document.getElementById('gog-accounts')) loadGogAccounts();

// Load system service account email for Google APIs
(async function() {
  try {
    const res = await fetch('/mc/api/system-sa');
    const data = await res.json();
    if (data.configured && data.email) {
      document.querySelectorAll('.sa-email').forEach(el => {
        el.textContent = data.email;
        el.style.background = '#E8F8E8';
        el.style.padding = '4px 8px';
        el.style.borderRadius = '4px';
        el.style.fontWeight = '700';
        el.style.userSelect = 'all';
      });
      const saInfo = document.getElementById('sa-info');
      if (saInfo) {
        saInfo.innerHTML = '<span style="color:var(--green);font-weight:700;">✅ Service Account configurado:</span> <code style="user-select:all;">' + data.email + '</code>';
        saInfo.style.display = 'block';
      }
    } else {
      const saInfo = document.getElementById('sa-info');
      if (saInfo) {
        saInfo.innerHTML = '⚠️ Service Account no configurado. <a href="/mc/connect/system/google-sa" style="color:var(--rust);font-weight:700;">Configurar →</a>';
        saInfo.style.display = 'block';
      }
    }
  } catch {}
})();

let allExpanded = false;
function toggleStep(i) {
  const body = document.getElementById('body-' + i);
  const toggle = document.getElementById('toggle-' + i);
  if (body.style.display === 'none') {
    body.style.display = 'block';
    toggle.textContent = '▼';
  } else {
    body.style.display = 'none';
    toggle.textContent = '▶';
  }
}
function expandAll() {
  allExpanded = !allExpanded;
  document.querySelectorAll('.step-body').forEach((el, i) => {
    el.style.display = allExpanded ? 'block' : 'none';
    const t = document.getElementById('toggle-' + i);
    if (t) t.textContent = allExpanded ? '▼' : '▶';
  });
}

function toggleVis(btn) {
  const input = btn.parentElement.querySelector('input');
  input.type = input.type === 'password' ? 'text' : 'password';
  btn.textContent = input.type === 'password' ? '👁️' : '🙈';
}

function showResult(type, msg) {
  const el = document.getElementById('result');
  el.style.display = 'block';
  if (type === 'ok') {
    el.style.background = '#E8F8E8'; el.style.border = '2px solid #4A5D23'; el.style.color = '#2D5A1E';
  } else if (type === 'error') {
    el.style.background = '#FDE8E8'; el.style.border = '2px solid #C0392B'; el.style.color = '#C0392B';
  } else {
    el.style.background = '#FFF8E1'; el.style.border = '2px solid #E5A100'; el.style.color = '#8B6914';
  }
  el.innerHTML = msg;
}

async function doConnect() {
  const btn = document.getElementById('connectBtn');
  btn.disabled = true; btn.textContent = '⏳ Conectando...';
  showResult('info', '⏳ Guardando credenciales y testeando conexión...');

  const form = document.getElementById('connectForm');
  const inputs = form.querySelectorAll('input');
  const secrets = {};
  const config = {};

  inputs.forEach(inp => {
    const val = inp.value.trim();
    if (!val) return;
    if (inp.dataset.sensitive === 'true') {
      secrets[inp.name] = val;
    } else {
      config[inp.name] = val;
    }
  });

  try {
    const res = await fetch('/mc/api/client-integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: '${slug}',
        source: '${apiId}',
        type: '${ownership === 'system' ? 'override' : 'datasource'}',
        config,
        secrets
      })
    });
    const data = await res.json();

    if (data.ok && data.testResult) {
      if (data.testResult.status === 'connected' || data.testResult.status === 'ok') {
        showResult('ok', '✅ <strong>¡Conectado!</strong> La API responde correctamente. Ya puedes cerrar esta página.');
      } else if (data.testResult.status === 'error') {
        showResult('error', '❌ <strong>Error de conexión:</strong> ' + (data.testResult.error || 'Verifica las credenciales'));
      } else {
        showResult('info', '⏳ <strong>Guardado.</strong> Estado: ' + data.testResult.status);
      }
    } else if (data.error) {
      showResult('error', '❌ ' + data.error);
    } else {
      showResult('ok', '✅ Guardado. Recarga para ver el estado actualizado.');
    }
  } catch (e) {
    showResult('error', '❌ Error de red: ' + e.message);
  }

  btn.disabled = false; btn.textContent = '🔌 Conectar y testear';
}

async function doTest() {
  const btn = document.getElementById('testBtn');
  btn.disabled = true; btn.textContent = '⏳ Testeando...';
  showResult('info', '⏳ Testeando conexión existente...');

  try {
    const res = await fetch('/mc/api/client-integrations/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: '${slug}', source: '${apiId}' })
    });
    const data = await res.json();

    if (data.ok && data.results && data.results['${apiId}']) {
      const r = data.results['${apiId}'];
      if (r.status === 'connected' || r.status === 'ok') {
        showResult('ok', '✅ <strong>Test exitoso.</strong> La API responde correctamente.');
      } else {
        showResult('error', '❌ <strong>Test fallido:</strong> ' + (r.error || r.status));
      }
    } else if (data.error) {
      showResult('error', '❌ ' + data.error);
    }
  } catch (e) {
    showResult('error', '❌ Error de red: ' + e.message);
  }

  btn.disabled = false; btn.textContent = '🧪 Solo testear';
}
</script>
</body>
</html>`;

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // === PUT handler: save presentations ===
  if (req.method === 'PUT' && url.match(/^\/brand\/[^/]+\/presentations\/[^/]+\.html$/)) {
    const fullPath = path.join(BASE, url.slice(1));
    if (!path.resolve(fullPath).startsWith(path.resolve(BASE)) || url.includes('..')) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 10e6) { req.destroy(); } });
    req.on('end', () => {
      try {
        fs.writeFileSync(fullPath, body, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, size: body.length }));
      } catch (e) {
        res.writeHead(500); res.end('Write failed: ' + e.message);
      }
    });
    return;
  }

  // === PUT handler: save edited docs ===
  if (req.method === 'PUT' && url.startsWith('/docs/')) {
    const rest = url.replace('/docs/', '');
    const parts = rest.split('/').filter(Boolean);
    const rootKey = parts[0];
    if (!rootKey || !DOC_ROOTS[rootKey]) { res.writeHead(404); res.end('Not found'); return; }
    const rootPath = DOC_ROOTS[rootKey];
    const subPath = parts.slice(1).join('/');
    const fullPath = path.join(rootPath, subPath);
    // Security
    if (!path.resolve(fullPath).startsWith(path.resolve(rootPath)) || (!fullPath.endsWith('.md') && !fullPath.endsWith('.html')) || subPath.includes('..')) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 5e6) { req.destroy(); } });
    req.on('end', () => {
      try {
        fs.writeFileSync(fullPath, body, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500); res.end('Write failed: ' + e.message);
      }
    });
    return;
  }

  // === API: health check ===
  if (url.startsWith('/api/health-check')) {
    const params = new URLSearchParams(req.url.split('?')[1] || '');
    const service = params.get('service') || 'all';
    res.setHeader('Access-Control-Allow-Origin', '*');
    runHealthChecks(service).then(result => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    }).catch(err => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  // === API: read api-health.json (cached) ===
  if (url === '/api/api-health') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
      const data = fs.readFileSync(API_HEALTH_FILE, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    } catch {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"lastCheck":null,"services":{}}');
    }
    return;
  }

  // === API: get masked env vars for a service ===
  if (req.method === 'GET' && url.startsWith('/api/env')) {
    const params = new URLSearchParams(req.url.split('?')[1] || '');
    const serviceId = params.get('service');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const envVars = parseEnv(readEnvFile());
    const result = {};

    if (serviceId && SERVICE_ENV_MAP[serviceId]) {
      for (const field of SERVICE_ENV_MAP[serviceId]) {
        result[field.key] = { label: field.label, placeholder: field.placeholder, masked: maskKey(envVars[field.key] || ''), hasValue: !!(envVars[field.key]) };
      }
    } else {
      // Return all services with masked values
      for (const [svc, fields] of Object.entries(SERVICE_ENV_MAP)) {
        result[svc] = fields.map(f => ({ key: f.key, label: f.label, masked: maskKey(envVars[f.key] || ''), hasValue: !!(envVars[f.key]) }));
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  // === API: save env var ===
  if (req.method === 'POST' && url === '/api/env') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const { service, vars } = JSON.parse(body);
        if (!service || !vars || typeof vars !== 'object') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing service or vars' }));
          return;
        }

        // Validate that vars match expected keys for this service
        const allowed = SERVICE_ENV_MAP[service];
        if (!allowed) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Unknown service: ${service}` }));
          return;
        }
        const allowedKeys = new Set(allowed.map(f => f.key));
        const updates = {};
        for (const [k, v] of Object.entries(vars)) {
          if (!allowedKeys.has(k)) continue;
          if (typeof v === 'string' && v.trim()) updates[k] = v.trim();
        }

        if (Object.keys(updates).length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No valid vars to save' }));
          return;
        }

        setEnvVars(updates);

        // Auto health-check the service
        runHealthChecks(service).then(hcResult => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, saved: Object.keys(updates), healthCheck: hcResult }));
        }).catch(err => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, saved: Object.keys(updates), healthCheckError: err.message }));
        });
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // === API: restart gateway ===
  if (url === '/api/restart-gateway') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
      execSync('/opt/homebrew/bin/openclaw gateway restart 2>&1', { timeout: 30000, encoding: 'utf-8' });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message.slice(0, 200) }));
    }
    return;
  }

  // === API: Client Integrations — catalog ===
  if (req.method === 'GET' && url === '/api/client-integrations/catalog') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
      const catalogPath = path.join(BASE, 'skills', 'acquisition-metrics-plan', 'schemas', 'api-catalog.json');
      const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(catalog));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to load catalog: ' + e.message }));
    }
    return;
  }

  // === API: Client Integrations — get merged data ===
  if (req.method === 'GET' && url.startsWith('/api/client-integrations')) {
    const params = new URLSearchParams(req.url.split('?')[1] || '');
    const slug = params.get('slug');
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (!slug) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing slug parameter' }));
      return;
    }

    try {
      const catalogPath = path.join(BASE, 'skills', 'acquisition-metrics-plan', 'schemas', 'api-catalog.json');
      const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));

      // Read client integrations.json (may not exist)
      const intPath = path.join(BASE, 'brand', slug, 'integrations.json');
      let intData = { slug, dataSources: {}, systemOverrides: {} };
      try { intData = JSON.parse(fs.readFileSync(intPath, 'utf-8')); } catch {}

      // Merge catalog info with client status — ensure every catalog API has an entry
      // Use ownership field: "system" → systemOverrides, "client" → dataSources
      const merged = { slug, dataSources: {}, systemOverrides: {}, updatedAt: intData.updatedAt || null };

      for (const [catKey, catData] of Object.entries(catalog.categories || {})) {
        for (const [apiId, apiMeta] of Object.entries(catData.apis || {})) {
          const ownership = apiMeta.ownership || 'system';
          const isSystem = ownership === 'system';
          const section = isSystem ? 'systemOverrides' : 'dataSources';
          // Check both sections in client data (in case of migration)
          const clientEntry = (intData.systemOverrides || {})[apiId] || (intData.dataSources || {})[apiId] || {};
          merged[section][apiId] = {
            provider: apiMeta.provider,
            status: clientEntry.status || 'not_configured',
            config: clientEntry.config || {},
            envVars: clientEntry.envVars || [],
            lastTestedAt: clientEntry.lastTestedAt || null,
            lastError: clientEntry.lastError || null,
            notes: clientEntry.notes || null,
          };
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(merged));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // === API: Client Integrations — save config + secrets ===
  if (req.method === 'POST' && url === '/api/client-integrations') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const { slug, source, type, config, secrets } = JSON.parse(body);
        if (!slug || !source) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing slug or source' }));
          return;
        }

        const brandDir = path.join(BASE, 'brand', slug);
        if (!fs.existsSync(brandDir)) fs.mkdirSync(brandDir, { recursive: true });

        // Load or create integrations.json
        const intPath = path.join(brandDir, 'integrations.json');
        let intData;
        try { intData = JSON.parse(fs.readFileSync(intPath, 'utf-8')); } catch { intData = { slug, dataSources: {}, systemOverrides: {} }; }
        if (!intData.dataSources) intData.dataSources = {};
        if (!intData.systemOverrides) intData.systemOverrides = {};

        const section = type === 'override' ? 'systemOverrides' : 'dataSources';
        if (!intData[section][source]) intData[section][source] = { provider: source, status: 'not_configured', config: {}, envVars: [] };

        const entry = intData[section][source];

        // Save config (non-sensitive)
        if (config && typeof config === 'object') {
          entry.config = { ...(entry.config || {}), ...config };
        }

        // Save secrets to brand/.env
        if (secrets && typeof secrets === 'object' && Object.keys(secrets).length > 0) {
          const envPath = path.join(brandDir, '.env');
          let envContent = '';
          try { envContent = fs.readFileSync(envPath, 'utf-8'); } catch {}
          const envLines = envContent.split('\n');

          const envVarNames = [];
          for (const [key, value] of Object.entries(secrets)) {
            const envKey = `${slug.toUpperCase().replace(/-/g, '_')}_${source.toUpperCase().replace(/-/g, '_')}_${key}`;
            envVarNames.push(envKey);

            let found = false;
            for (let i = 0; i < envLines.length; i++) {
              if (envLines[i].startsWith(envKey + '=')) {
                envLines[i] = `${envKey}=${value}`;
                found = true;
                break;
              }
            }
            if (!found) envLines.push(`${envKey}=${value}`);
          }

          fs.writeFileSync(envPath, envLines.filter(l => l !== '').join('\n') + '\n', 'utf-8');
          entry.envVars = [...new Set([...(entry.envVars || []), ...envVarNames])];
        }

        entry.status = 'pending';
        intData.updatedAt = new Date().toISOString();
        fs.writeFileSync(intPath, JSON.stringify(intData, null, 2), 'utf-8');

        // Run test-connection.js for this source
        const testScript = path.join(BASE, 'skills', 'acquisition-metrics-plan', 'scripts', 'test-connection.js');
        let testResult = { status: 'pending' };
        try {
          const testOutput = execSync(`/opt/homebrew/bin/node "${testScript}" --slug ${slug} --source ${source}`, { cwd: BASE, timeout: 30000, encoding: 'utf-8' });
          // Script succeeded (exit 0) — re-read integrations.json (script updates it)
          try { intData = JSON.parse(fs.readFileSync(intPath, 'utf-8')); } catch {}
          const updatedEntry = (intData.dataSources || {})[source] || (intData.systemOverrides || {})[source] || {};
          testResult = { status: updatedEntry.status || 'connected', output: testOutput.slice(-300) };
        } catch (e) {
          // Script failed (exit 1) — extract real error from stdout
          const stdout = (e.stdout || '').toString();
          const stderr = (e.stderr || '').toString();
          const errorMatch = stdout.match(/❌ Error — (.+)/);
          const realError = errorMatch ? errorMatch[1].trim() : (stderr.slice(0, 200) || stdout.slice(-200) || e.message.slice(0, 200));
          // Re-read integrations.json (script updates it even on failure)
          try { intData = JSON.parse(fs.readFileSync(intPath, 'utf-8')); } catch {}
          const updatedEntry = (intData.dataSources || {})[source] || (intData.systemOverrides || {})[source] || {};
          entry.status = updatedEntry.status || 'error';
          entry.lastTestedAt = updatedEntry.lastTestedAt || new Date().toISOString();
          entry.lastError = updatedEntry.lastError || realError;
          testResult = { status: 'error', error: realError };
        }

        // Ensure intData is written with latest state
        try { fs.writeFileSync(intPath, JSON.stringify(intData, null, 2), 'utf-8'); } catch {}

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, testResult }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // === API: Client Integrations — test ===
  if (req.method === 'POST' && url === '/api/client-integrations/test') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const { slug, source, all } = JSON.parse(body);
        if (!slug) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing slug' }));
          return;
        }

        const testScript = path.join(BASE, 'skills', 'acquisition-metrics-plan', 'scripts', 'test-connection.js');
        const intPath = path.join(BASE, 'brand', slug, 'integrations.json');
        let intData;
        try { intData = JSON.parse(fs.readFileSync(intPath, 'utf-8')); } catch { intData = { slug, dataSources: {}, systemOverrides: {} }; }

        const results = {};

        // Helper to extract real error from test-connection.js output
        function extractTestError(e) {
          const stdout = (e.stdout || '').toString();
          const stderr = (e.stderr || '').toString();
          const errorMatch = stdout.match(/❌ Error — (.+)/);
          return errorMatch ? errorMatch[1].trim() : (stderr.slice(0, 200) || stdout.slice(-200) || e.message.slice(0, 200));
        }

        function runTest(srcId) {
          try {
            execSync(`/opt/homebrew/bin/node "${testScript}" --slug ${slug} --source ${srcId}`, { cwd: BASE, timeout: 30000, encoding: 'utf-8' });
            // Re-read integrations.json (script updates it)
            try { intData = JSON.parse(fs.readFileSync(intPath, 'utf-8')); } catch {}
            const entry = (intData.dataSources || {})[srcId] || (intData.systemOverrides || {})[srcId] || {};
            return { status: entry.status || 'connected' };
          } catch (e) {
            const realError = extractTestError(e);
            // Re-read integrations.json (script updates it even on failure)
            try { intData = JSON.parse(fs.readFileSync(intPath, 'utf-8')); } catch {}
            const section = (intData.systemOverrides || {})[srcId] ? 'systemOverrides' : 'dataSources';
            if (intData[section] && intData[section][srcId]) {
              intData[section][srcId].lastError = realError;
            }
            return { status: 'error', error: realError };
          }
        }

        if (all) {
          const allSources = { ...(intData.dataSources || {}), ...(intData.systemOverrides || {}) };
          for (const [srcId, srcData] of Object.entries(allSources)) {
            if (srcData.status === 'not_configured') continue;
            results[srcId] = runTest(srcId);
          }
        } else if (source) {
          results[source] = runTest(source);
        }

        intData.updatedAt = new Date().toISOString();
        try {
          const brandDir = path.join(BASE, 'brand', slug);
          if (!fs.existsSync(brandDir)) fs.mkdirSync(brandDir, { recursive: true });
          fs.writeFileSync(intPath, JSON.stringify(intData, null, 2), 'utf-8');
        } catch {}

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, results }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // === API: save integration (legacy) ===
  if (req.method === 'POST' && url === '/api/integration') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      try {
        const { slug, serviceId, accountId } = JSON.parse(body);
        if (!slug || !serviceId || !accountId) { res.writeHead(400); res.end('Missing fields'); return; }
        const intFile = path.join(BASE, 'brand', slug, 'integrations.json');
        const data = JSON.parse(fs.readFileSync(intFile, 'utf-8'));
        const svc = data.services.find(s => s.id === serviceId);
        if (!svc) { res.writeHead(404); res.end('Service not found'); return; }
        svc.status = 'connected';
        svc.accountId = accountId;
        svc.lastActivity = new Date().toISOString();
        data.updatedAt = new Date().toISOString();
        fs.writeFileSync(intFile, JSON.stringify(data, null, 2), 'utf-8');
        // Also regenerate MC data
        try { require('child_process').execSync('python3 scripts/regenerate.py', { cwd: BASE, timeout: 15000 }); } catch {}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, service: serviceId, status: 'connected' }));
      } catch (e) { res.writeHead(500); res.end('Error: ' + e.message); }
    });
    return;
  }

  // === API: metrics data for a client ===
  if (req.method === 'GET' && url.startsWith('/api/metrics')) {
    const params = new URLSearchParams(req.url.split('?')[1] || '');
    const slug = params.get('slug');
    if (!slug) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing slug parameter' }));
      return;
    }

    const metricsFile = path.join(BASE, 'brand', slug, 'metrics', 'metrics-data.json');
    const integrationsFile = path.join(BASE, 'brand', slug, 'integrations.json');

    try {
      let metrics = [];
      if (fs.existsSync(metricsFile)) {
        metrics = JSON.parse(fs.readFileSync(metricsFile, 'utf-8'));
      }

      let integrations = {};
      if (fs.existsSync(integrationsFile)) {
        integrations = JSON.parse(fs.readFileSync(integrationsFile, 'utf-8'));
      }

      // Load daily snapshots for trend data (last 30 days)
      const metricsDir = path.join(BASE, 'brand', slug, 'metrics');
      const dailyFiles = [];
      if (fs.existsSync(metricsDir)) {
        const files = fs.readdirSync(metricsDir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().slice(-30);
        for (const f of files) {
          try {
            const data = JSON.parse(fs.readFileSync(path.join(metricsDir, f), 'utf-8'));
            dailyFiles.push({ date: f.replace('.json', ''), ...data });
          } catch {}
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        slug,
        metricsSheet: integrations.metricsSheet || null,
        dataSources: integrations.dataSources || {},
        rolling: metrics,
        daily: dailyFiles,
      }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // === Doc Viewer: /docs/ ===
  if (url === '/docs' || url === '/docs/') {
    // In portal mode, only show brand
    const roots = req._portalSlug ? { brand: '🏷️' } : { brand: '🏷️', prds: '📋', skills: '⚡', memory: '🧠' };
    const nav = Object.keys(roots).map(k => {
      return `<a href="/mc/docs/${k}/">${roots[k]} ${k}</a>`;
    }).join('');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(page('Documentos', '<a class="back" href="/mc#">← Mission Control</a>', `<h1>📚 Documentos</h1><div class="nav">${nav}</div>`));
    return;
  }

  if (url.startsWith('/docs/')) {
    const rest = url.replace('/docs/', '');
    const parts = rest.split('/').filter(Boolean);
    const rootKey = parts[0];

    // Portal mode: block non-brand docs and other clients' brand dirs
    if (req._portalSlug) {
      if (rootKey !== 'brand') {
        res.writeHead(403); res.end('Forbidden'); return;
      }
      // If accessing brand/{otherSlug}, block it
      if (parts.length >= 2 && parts[1] !== req._portalSlug) {
        res.writeHead(403); res.end('Forbidden'); return;
      }
      // If listing /docs/brand/ root, redirect to their slug directly
      if (parts.length === 1) {
        const portalPrefix = req._portalBase ? req._portalBase : '/mc';
        res.writeHead(302, { 'Location': `${portalPrefix}/docs/brand/${req._portalSlug}/` });
        res.end();
        return;
      }
    }
    
    if (!rootKey || !DOC_ROOTS[rootKey]) {
      res.writeHead(404); res.end('Section not found'); return;
    }
    
    const rootPath = DOC_ROOTS[rootKey];
    const subParts = parts.slice(1);
    const subPath = subParts.join('/');
    const fullPath = subPath ? path.join(rootPath, subPath) : rootPath;
    
    // Security: no path traversal
    if (!path.resolve(fullPath).startsWith(path.resolve(rootPath))) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    
    try {
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        const prettyRoot = rootKey.charAt(0).toUpperCase() + rootKey.slice(1);
        const prettyPath = subPath ? subPath.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : prettyRoot;
        const backUrl = subParts.length > 0 ? `/mc/docs/${rootKey}/${subParts.slice(0, -1).join('/')}/` : '/mc/docs/';
        const backLabel = subParts.length > 0 ? `← ${subParts.slice(0, -1).pop() || prettyRoot}` : '← Documentos';
        // Pass brandPillars:true when listing brand/{slug} (pillar level)
        const isBrandSlug = rootKey === 'brand' && subParts.length === 1;
        // Detect brand/{slug}/{section} — Foundation section level
        const isBrandSection = rootKey === 'brand' && subParts.length === 2 && PILLAR_FLAT.includes(subParts[1]);
        const content = listDir(fullPath, `/mc/docs/${rootKey}/${subPath ? subPath + '/' : ''}`, {
          brandPillars: isBrandSlug,
          brandSection: isBrandSection ? { slug: subParts[0], section: subParts[1] } : null,
        });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(page(prettyPath, `<a class="back" href="${backUrl}">${backLabel}</a>`, `<h1>📂 ${prettyPath}</h1>${content}`));
        return;
      }
      
      if (stat.isFile() && fullPath.endsWith('.md')) {
        const md = fs.readFileSync(fullPath, 'utf-8');
        const html = renderMarkdown(md);
        const fileName = path.basename(fullPath, '.md');
        const backUrl = `/mc/docs/${rootKey}/${subParts.slice(0, -1).join('/')}/`;
        const backLabel = subParts.length > 1 ? subParts.slice(-2, -1)[0] : rootKey;
        const rawEscaped = md.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(page(fileName, `<a class="back" href="${backUrl}">← ${backLabel}</a>`, `<div>${html}</div>`, { editable: true, rawMd: rawEscaped }));
        return;
      }

      // Serve .html files directly (visual identity guides, reports, etc.)
      if (stat.isFile() && fullPath.endsWith('.html')) {
        const htmlContent = fs.readFileSync(fullPath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(htmlContent);
        return;
      }

      // Serve static assets referenced by HTML files (images, CSS, JS, fonts)
      if (stat.isFile()) {
        const ext = path.extname(fullPath).toLowerCase();
        const assetMime = MIME[ext] || {
          '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
          '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff',
          '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.pdf': 'application/pdf',
          '.txt': 'text/plain; charset=utf-8',
        }[ext];
        if (assetMime) {
          const data = fs.readFileSync(fullPath);
          res.writeHead(200, { 'Content-Type': assetMime });
          res.end(data);
          return;
        }
      }
      
      res.writeHead(403); res.end('Not a viewable file');
    } catch {
      res.writeHead(404); res.end('Not found');
    }
    return;
  }

  // === Serve /brand/ files directly (presentations, etc.) ===
  if (url.startsWith('/brand/') && req.method === 'GET') {
    const fullPath = path.join(BASE, url.slice(1));
    if (!path.resolve(fullPath).startsWith(path.resolve(BASE)) || url.includes('..')) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isFile()) {
        const ext = path.extname(fullPath).toLowerCase();
        const mime = MIME[ext] || 'application/octet-stream';
        const data = fs.readFileSync(fullPath);
        res.writeHead(200, { 'Content-Type': mime });
        res.end(data);
        return;
      }
      // Directory: redirect to docs viewer
      const rest = url.replace('/brand', '/docs/brand');
      res.writeHead(301, { 'Location': '/mc' + rest });
      res.end();
    } catch {
      res.writeHead(404); res.end('Not found');
    }
    return;
  }
  if (url === '/brand') {
    res.writeHead(301, { 'Location': '/mc/docs/brand/' });
    res.end();
    return;
  }

  // === Static files (MC dashboard) ===
  const filename = path.basename(url);
  if (!ALLOWED_FILES.includes(filename)) {
    res.writeHead(404); res.end('Not found'); return;
  }

  const filePath = path.join(BASE, filename);
  try {
    let data = fs.readFileSync(filePath);
    const ext = path.extname(filename);
    const ct = MIME[ext] || 'application/octet-stream';
    // For JS files in admin mode, also rewrite /mc/ paths
    if (req._adminBase && ext === '.js') {
      let text = data.toString('utf-8');
      text = text.replace(/\/mc\/(?!admin\/|portal\/)/g, req._adminBase + '/');
      data = Buffer.from(text, 'utf-8');
    }
    const headers = { 'Content-Type': ct };
    if (filename === 'mc-data.js') {
      headers['Cache-Control'] = 'no-store, no-cache, must-revalidate';
      headers['Pragma'] = 'no-cache';
    }
    res.writeHead(200, headers);
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Mission Control server on http://127.0.0.1:${PORT}`);
});
