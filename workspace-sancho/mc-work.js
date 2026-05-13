// mc-work.js — Projects + Tasks + Ideas system (extracted from mission-control.html)
// Dependencies (globals from mission-control.html): getApiBase, showPage, showToast, esc, escHtml, MC_BASE, CLIENTS, mcChatOpenTask, mcChatOpenProject, mcChatSidebar

function goToProjects() { showPage('projects'); loadProjects(); }

// ========== PROJECTS PAGE ==========
const PRJ_CHANNELS = ['web','content','paid-ads','prospecting','partners','creatives','research','brand','intelligence','learning'];
const PRJ_CH_ICON = {web:'🌐',content:'📝','paid-ads':'📢',prospecting:'📤',partners:'🤝',creatives:'🎨',research:'🔍',brand:'🏷️',intelligence:'📡',learning:'📚'};
const PRJ_STATUS_COLOR = {active:'var(--blue)',blocked:'var(--red)',completed:'var(--green)',reviewed:'var(--green)',paused:'var(--yellow)',todo:'var(--muted)',pending:'var(--muted)','in-progress':'var(--blue)',done:'var(--green)',ready:'var(--muted)',cancelled:'#666',discarded:'#666',archived:'#888'};
const PRJ_STATUS_LABEL = {active:'Activo',blocked:'Bloqueado',completed:'Completado',reviewed:'Revisado',paused:'Pausado',todo:'Por hacer',pending:'Por hacer','in-progress':'En progreso',done:'Hecho',ready:'Listo',cancelled:'Cancelado',discarded:'Descartado',archived:'Archivado'};

// Task type definitions: color, icon, label
const TASK_TYPE_META = {
  content:    { color:'var(--rust)',   icon:'📝', label:'Content' },
  outreach:   { color:'var(--blue)',   icon:'📤', label:'Outreach' },
  foundation: { color:'var(--green)',  icon:'🏗️', label:'Foundation' },
  research:   { color:'#6554C0',      icon:'🔬', label:'Research' },
  analysis:   { color:'#00B8D9',      icon:'📊', label:'Analysis' },
  execution:  { color:'var(--muted)',  icon:'⚙️', label:'Execution' },
};

function taskTypeBadge(type) {
  const meta = TASK_TYPE_META[type] || TASK_TYPE_META.execution;
  if (type === 'execution') return '';
  return `<span style="font-size:9px;padding:1px 6px;border-radius:4px;background:color-mix(in srgb,${meta.color} 12%,transparent);color:${meta.color};font-weight:600;text-transform:uppercase;">${meta.icon} ${meta.label}</span>`;
}
let _prjData = null;
let _prjSlug = null;

// Work Editor state
let _weMode = null;        // 'task' | 'project'
let _weEditId = null;       // taskId or projectId
let _weProjectId = null;    // parent project (for tasks)


function loadProjects() {
  const sel = document.getElementById('clientSelector');
  const slug = sel ? sel.value : (window.PORTAL_SLUG || '');
  if (!slug || slug === 'global') { document.getElementById('projects-list-view').innerHTML = '<div class="empty">Selecciona un cliente.</div>'; return; }
  _prjSlug = slug;
  return fetch(getApiBase() + '/api/projects/' + slug).then(r => r.json()).then(d => {
    if (!d.ok) { document.getElementById('projects-list-view').innerHTML = '<div class="empty">Sin proyectos. Ejecuta el strategic plan primero.</div>'; return; }
    _prjData = d.projects;
    renderProjectsStats();
    renderProjectsList();
    renderProjectsKanban();
  }).catch(e => { document.getElementById('projects-list-view').innerHTML = '<div class="empty">Error cargando proyectos: '+(e.message||'').replace(/</g,'&lt;')+'</div>'; });
}

function renderProjectsStats() {
  const p = _prjData.filter(pr => pr.status !== 'archived' && pr.status !== 'cancelled');
  const totalT = p.reduce((s,pr) => s + pr.tasks.length, 0);
  const doneT = p.reduce((s,pr) => s + pr.tasks.filter(t => ['completed','done','discarded','cancelled'].includes(t.status)).length, 0);
  const active = p.filter(pr => pr.status === 'active').length;
  const blocked = p.filter(pr => pr.status === 'blocked').length;
  const archived = _prjData.filter(pr => pr.status === 'archived' || pr.status === 'cancelled').length;
  document.getElementById('projects-stats').innerHTML = `
    <div class="stat"><div class="num" style="color:var(--blue)">${active}</div><div class="label">Activos</div></div>
    <div class="stat"><div class="num" style="color:var(--red)">${blocked}</div><div class="label">Bloqueados</div></div>
    <div class="stat"><div class="num">${doneT}/${totalT}</div><div class="label">Tareas</div></div>
    <div class="stat"><div class="num" style="color:var(--green)">${totalT>0?Math.round(doneT/totalT*100):0}%</div><div class="label">Progreso</div></div>`+(archived>0?`<div class="stat"><div class="num" style="color:var(--muted)">${archived}</div><div class="label">Archivados</div></div>`:'');
}

function pill(status) { return '<span style="display:inline-block;padding:1px 8px;border-radius:12px;font-size:11px;font-weight:600;background:color-mix(in srgb,'+(PRJ_STATUS_COLOR[status]||'var(--muted)')+' 15%,transparent);color:'+(PRJ_STATUS_COLOR[status]||'var(--muted)')+';">'+(PRJ_STATUS_LABEL[status]||status)+'</span>'; }

function chBadge(ch) { return ch ? '<span style="font-size:10px;background:color-mix(in srgb,var(--navy) 10%,transparent);color:var(--navy);padding:1px 6px;border-radius:4px;">'+(PRJ_CH_ICON[ch]||'#')+' '+ch+'</span>' : ''; }

function renderProjectsList() {
  const guildId = ''; // Will be populated from project discord data
  let html = '';
  for (const p of _prjData.filter(pr => pr.status !== 'archived' && pr.status !== 'cancelled')) {
    const tasksDone = p.tasks.filter(t => ['completed','done','discarded','cancelled'].includes(t.status)).length;
    const pct = p.tasks.length > 0 ? Math.round(tasksDone/p.tasks.length*100) : 0;
    const obj = typeof p.objective === 'string' ? p.objective : (p.objective?.description || '');

    let taskRows = '';
    for (const t of p.tasks) {
      const ownerBadge = t.owner && t.owner !== 'Sancho' ? '<span style="font-size:10px;background:color-mix(in srgb,var(--blue) 12%,transparent);color:var(--blue);padding:1px 6px;border-radius:4px;">👤 '+esc(t.owner)+'</span>' : '';
      const isDone = ['completed','done','discarded','cancelled'].includes(t.status);
      const tType = t.type || t.batch_type || 'execution';
      const isFnd = tType === 'foundation' && t.pillar;
      const chatBtn = '<button style="background:none;border:none;cursor:pointer;font-size:13px;opacity:0.5;" onclick="event.stopPropagation();mcChatOpenTask(\''+esc(t.id)+'\',\''+esc(t.name).replace(/'/g,"\\'")+'\',\''+esc(p.id)+'\',\''+esc(p.name).replace(/'/g,"\\'")+'\',\''+(t.skill||'')+'\',\''+(t.channel||'')+'\',\''+(t.status||'')+'\',\''+tType+'\')">💬</button>';
      const editBtn = isFnd ? '' : '<button style="background:none;border:none;cursor:pointer;font-size:13px;opacity:0.5;" onclick="openWorkEditor(\'task\',\''+esc(t.id)+'\')">✏️</button>';
      const quickChk = isFnd && !isDone ? '<button style="background:none;border:1px solid var(--green);border-radius:4px;cursor:pointer;font-size:11px;padding:0 5px;color:var(--green);" onclick="event.stopPropagation();quickCompleteFoundation(\''+esc(t.id)+'\',\''+esc(t.pillar||'')+'\',\''+esc(t.section||'')+'\')" title="Completar">✓</button>' : '';
      taskRows += '<div style="padding:8px 10px;border-radius:6px;background:color-mix(in srgb,var(--bg) 60%,transparent);margin-bottom:4px;'+(isDone?'opacity:0.6;':'')+'"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'+pill(t.status)+'<span style="font-size:14px;font-weight:500;flex:1;'+(isDone?'text-decoration:line-through;':'')+'">'+esc(t.name)+'</span><span style="display:flex;gap:6px;align-items:center;">'+chBadge(t.channel)+ownerBadge+quickChk+chatBtn+editBtn+'</span></div>'+(t.description?'<div style="font-size:12px;color:var(--muted);margin-top:4px;line-height:1.4;">'+esc(t.description)+'</div>':'')+'</div>';
    }

    html += '<div class="card" style="margin-bottom:8px;cursor:pointer;" onclick="showProjectDetail(\''+esc(p.id)+'\')"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px;"><div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;"><span style="font-family:\'Space Grotesk\';font-weight:700;color:var(--rust);font-size:14px;">'+esc(p.id)+'</span><span style="font-weight:600;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(p.name)+'</span>'+pill(p.status)+(p.blocked_by?'<span style="font-size:11px;color:var(--red);">⛔ '+esc(p.blocked_by)+'</span>':'')+'</div><div style="display:flex;align-items:center;gap:12px;"><span style="font-size:11px;color:var(--muted);">'+(p.phase!==undefined?'Fase '+p.phase:'')+'</span><div style="width:70px;height:6px;background:var(--border);border-radius:3px;overflow:hidden;"><div style="height:100%;background:var(--green);width:'+pct+'%;border-radius:3px;"></div></div><span style="font-size:13px;color:var(--muted);font-weight:600;">'+tasksDone+'/'+p.tasks.length+'</span><span style="font-size:14px;color:var(--muted);">→</span></div></div></div>';
  }
  // Separate active from archived
  const activeHtml = _prjData.filter(p => p.status !== 'archived' && p.status !== 'cancelled').length > 0 ? html.split('<!--ARCHIVED-->')[0] : '';
  const archivedProjects = _prjData.filter(p => p.status === 'archived' || p.status === 'cancelled');
  let archivedSection = '';
  if (archivedProjects.length > 0) {
    archivedSection = '<div style="margin-top:24px;border-top:1px solid var(--border);padding-top:16px;"><div style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:12px;" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display===\'none\'?\'block\':\'none\';this.querySelector(\'span\').textContent=this.nextElementSibling.style.display===\'none\'?\'▸\':\'▾\'"><span style="font-family:\'Space Grotesk\';font-size:16px;font-weight:600;color:var(--muted);">📦 Archivados ('+archivedProjects.length+')</span> <span style="font-size:12px;">▸</span></div><div style="display:none;opacity:0.6;">';
    for (const ap of archivedProjects) {
      archivedSection += '<div class="card" style="margin-bottom:6px;"><div style="display:flex;align-items:center;gap:10px;padding:4px 0;"><span style="font-family:\'Space Grotesk\';font-weight:700;color:var(--muted);font-size:14px;">'+esc(ap.id)+'</span><span style="font-weight:500;color:var(--muted);">'+esc(ap.name)+'</span>'+pill(ap.status)+(ap.archive_reason?'<span style="font-size:12px;color:var(--muted);"> — '+esc(ap.archive_reason)+'</span>':'')+'</div></div>';
    }
    archivedSection += '</div></div>';
  }
  document.getElementById('projects-list-view').innerHTML = (html || '<div class="empty"><h2>Sin proyectos</h2><p>Ejecuta el strategic plan para generar proyectos.</p></div>') + archivedSection;
}

function renderProjectsKanban() {
  const cols = [{key:'todo',label:'Por hacer',statuses:['todo','pending','ready'],icon:'📋'},{key:'in-progress',label:'En progreso',statuses:['in-progress'],icon:'🔧'},{key:'blocked',label:'Bloqueado',statuses:['blocked'],icon:'⛔'},{key:'done',label:'Completado',statuses:['completed','done'],icon:'✅'},{key:'discarded',label:'Descartado',statuses:['discarded','cancelled'],icon:'🗑️'}];
  const allTasks = [];
  for (const p of _prjData.filter(pr => pr.status !== 'archived' && pr.status !== 'cancelled')) {
    const pBlocked = p.status === 'blocked';
    for (const t of p.tasks) {
      let es = t.status;
      if (pBlocked && ['todo','pending','ready'].includes(t.status)) es = 'blocked';
      allTasks.push({...t, effectiveStatus:es, projectId:p.id, projectName:p.name});
    }
  }
  let html = '<div style="display:flex;gap:14px;overflow-x:auto;padding-bottom:16px;min-height:400px;">';
  for (const col of cols) {
    const ct = allTasks.filter(t => col.statuses.includes(t.effectiveStatus));
    let cards = '';
    for (const t of ct) {
      const ownerBadge = t.owner && t.owner !== 'Sancho' ? '<span style="font-size:10px;background:color-mix(in srgb,var(--blue) 12%,transparent);color:var(--blue);padding:1px 6px;border-radius:4px;">👤 '+esc(t.owner)+'</span>' : '';
      const kType = t.type || t.batch_type || 'execution';
      const kFnd = kType === 'foundation' && t.pillar;
      const kTypeBadge = taskTypeBadge(kType);
      const kChat = '<button style="background:none;border:none;cursor:pointer;font-size:12px;opacity:0.5;" onclick="mcChatOpenTask(\''+esc(t.id)+'\',\''+esc(t.name).replace(/'/g,"\\'")+'\',\''+esc(t.projectId)+'\',\''+esc(t.projectName).replace(/'/g,"\\'")+'\',\''+(t.skill||'')+'\',\''+(t.channel||'')+'\',\''+(t.status||'')+'\',\''+kType+'\')">💬</button>';
      const kEdit = kFnd ? '' : '<button style="background:none;border:none;cursor:pointer;font-size:12px;opacity:0.5;" onclick="openWorkEditor(\'task\',\''+esc(t.id)+'\')">✏️</button>';
      const kClick = kFnd ? 'openFoundationTask('+esc(JSON.stringify({pillar:t.pillar,skill:t.skill||'',status:t.status||'todo'}))+')' : 'showProjectDetail(\''+esc(t.projectId)+'\')';
      cards += '<div style="background:var(--card);border:1px solid var(--border);border-radius:8px;padding:12px;cursor:pointer;" onclick="'+kClick+'"><div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="font-family:\'Space Grotesk\';font-size:11px;font-weight:600;color:var(--rust);background:color-mix(in srgb,var(--rust) 10%,transparent);padding:1px 8px;border-radius:4px;">'+esc(t.projectId)+'</span><span style="display:flex;gap:4px;align-items:center;"><span style="font-size:10px;color:var(--muted);">'+esc(t.id)+'</span>'+kTypeBadge+chBadge(t.channel)+ownerBadge+kChat+kEdit+'</span></div><div style="font-size:14px;font-weight:600;margin-bottom:4px;">'+esc(t.name)+'</div><div style="font-size:12px;color:var(--muted);">'+esc(t.projectName)+'</div></div>';
    }
    html += '<div style="flex:1;min-width:240px;max-width:320px;background:color-mix(in srgb,var(--bg) 80%,var(--card));border-radius:12px;display:flex;flex-direction:column;"><div style="display:flex;justify-content:space-between;padding:12px 14px;font-family:\'Space Grotesk\';font-size:14px;font-weight:600;border-bottom:1px solid var(--border);">'+col.icon+' '+col.label+'<span style="background:var(--border);font-size:11px;padding:2px 8px;border-radius:10px;font-weight:700;">'+ct.length+'</span></div><div style="padding:8px;display:flex;flex-direction:column;gap:8px;overflow-y:auto;">'+cards+'</div></div>';
  }
  html += '</div>';
  document.getElementById('projects-kanban-view').innerHTML = html;
}

function showProjectDetail(projId) {
  if (event && event.target.closest('button')) return;
  const p = _prjData.find(pr => pr.id === projId);
  if (!p) return;
  const obj = typeof p.objective === 'string' ? p.objective : (p.objective?.description || '');
  const strat = typeof p.strategy === 'string' ? p.strategy : (p.strategy?.description || '');
  const metrics = p.objective && typeof p.objective === 'object' && p.objective.metric
    ? `<div style="background:color-mix(in srgb,var(--green) 10%,transparent);padding:10px 14px;border-radius:8px;font-size:14px;margin-bottom:12px;"><strong>${esc(p.objective.metric)}</strong>: ${p.objective.baseline}${p.objective.unit||''} → ${p.objective.target}${p.objective.unit||''}</div>` : '';
  const tasksDone = p.tasks.filter(t => ['completed','done','discarded','cancelled'].includes(t.status)).length;
  const pct = p.tasks.length > 0 ? Math.round(tasksDone/p.tasks.length*100) : 0;
  const projectSkills = [...new Set(p.tasks.map(t => t.skill).filter(Boolean))];
  const skillsLine = projectSkills.length > 0
    ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:12px;">${projectSkills.map(s => `<span style="font-size:11px;padding:2px 8px;border-radius:4px;background:color-mix(in srgb,var(--blue) 10%,transparent);color:var(--blue);">${esc(s)}</span>`).join('')}</div>`
    : '';

  // Build task list with inline editing capability
  let taskCards = '';
  for (const t of p.tasks) {
    const isDone = ['completed','done','discarded','cancelled'].includes(t.status);
    const taskType = t.type || t.batch_type || 'execution';
    const isFoundation = taskType === 'foundation' && t.pillar;
    const typeBadge = taskTypeBadge(taskType);
    const skillBadge = t.skill ? `<span style="font-size:9px;padding:1px 6px;border-radius:4px;background:color-mix(in srgb,var(--blue) 12%,transparent);color:var(--blue);font-weight:500;">${esc(t.skill)}</span>` : '';
    const docCount = (t.documents || []).length;
    const docBadge = docCount > 0 ? `<span style="font-size:10px;color:var(--muted);">📄${docCount}</span>` : '';
    const ideaBadge = '';
    const ownerBadge = t.owner && t.owner !== 'Sancho' ? '<span style="font-size:10px;background:color-mix(in srgb,var(--blue) 12%,transparent);color:var(--blue);padding:2px 8px;border-radius:4px;">👤 '+esc(t.owner)+'</span>' : '';
    const cardClick = isFoundation
      ? `openFoundationTask(${esc(JSON.stringify({pillar:t.pillar,skill:t.skill||'',status:t.status||'todo'}))})`
      : `showTaskDetail('${esc(t.id)}','${esc(p.id)}')`;
    const quickCheck = isFoundation && !isDone
      ? `<button style="background:none;border:1px solid var(--green);border-radius:4px;cursor:pointer;font-size:12px;padding:1px 6px;color:var(--green);" onclick="event.stopPropagation();quickCompleteFoundation('${esc(t.id)}','${esc(t.pillar||'')}','${esc(t.section||'')}')" title="Completar">✓</button>`
      : '';
    taskCards += `<div class="card" style="margin-bottom:6px;cursor:pointer;${isDone?'opacity:0.6;':''}" onclick="${cardClick}">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
        <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;flex-wrap:wrap;">
          ${pill(t.status)}
          <span style="font-weight:600;font-size:14px;${isDone?'text-decoration:line-through;':''}overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(t.name)}</span>
          ${typeBadge}
          ${skillBadge}
          ${docBadge}
          ${ideaBadge}
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
          ${quickCheck}
          ${chBadge(t.channel)}
          ${ownerBadge}
          <span style="font-family:'Space Grotesk';font-size:11px;color:var(--muted);">${esc(t.id)}</span>
          <span style="color:var(--muted);font-size:14px;">→</span>
        </div>
      </div>
    </div>`;
  }

  const html = `
    <div style="margin-bottom:16px;">
      <a href="#" onclick="backToProjectsList();return false;" style="font-size:14px;color:var(--muted);text-decoration:none;">← Todos los proyectos</a>
    </div>
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:20px;flex-wrap:wrap;">
      <div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;">
          <span style="font-family:'Space Grotesk';font-weight:700;color:var(--rust);font-size:18px;">${esc(p.id)}</span>
          <span class="page-title" style="margin:0;">${esc(p.name)}</span>
          ${pill(p.status)}
          ${p.blocked_by?'<span style="font-size:12px;color:var(--red);">⛔ Bloqueado por '+esc(p.blocked_by)+'</span>':''}
        </div>
        <div class="page-sub" style="margin-bottom:0;">${p.phase!==undefined?'Fase '+p.phase+' · ':''} ${strat?esc(strat)+' · ':''}Review: ${p.review_date||'—'}</div>
      </div>
      <div style="display:flex;gap:8px;">
        <button onclick="mcChatOpenProject('${esc(p.id)}','${esc(p.name).replace(/'/g,"\\'")}','${esc(strat).replace(/'/g,"\\'")}','${esc(p.status||'')}')" style="padding:6px 14px;background:var(--card);border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:13px;">💬 Chat</button>
        <button onclick="openWorkEditor('project','${esc(p.id)}')" style="padding:6px 14px;background:var(--card);border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:13px;">✏️ Editar</button>
        ${p.status!=='archived'&&p.status!=='cancelled'?'<button onclick="archiveProject(\''+esc(p.id)+'\',\''+esc(p.name).replace(/'/g,"\\'")+'\');backToProjectsList();" style="padding:6px 14px;background:var(--card);border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:13px;">📦 Archivar</button>':''}
      </div>
    </div>
    ${p.description?'<div style="font-size:15px;line-height:1.6;margin-bottom:16px;color:var(--text);">'+esc(p.description)+'</div>':''}
    ${obj?'<div style="font-size:14px;margin-bottom:8px;padding:10px 14px;background:color-mix(in srgb,var(--rust) 8%,transparent);border-radius:8px;"><strong>🎯 Objetivo:</strong> '+esc(obj)+'</div>':''}
    ${p.approach?'<div style="font-size:14px;margin-bottom:8px;padding:10px 14px;background:color-mix(in srgb,var(--navy) 8%,transparent);border-radius:8px;"><strong>📋 Enfoque:</strong> '+esc(p.approach)+'</div>':''}
    ${metrics}
    ${skillsLine}
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
      <div style="flex:1;height:8px;background:var(--border);border-radius:4px;overflow:hidden;"><div style="height:100%;background:var(--green);width:${pct}%;border-radius:4px;"></div></div>
      <span style="font-size:14px;font-weight:600;color:var(--muted);">${tasksDone}/${p.tasks.length} tareas (${pct}%)</span>
    </div>
    <div style="font-family:'Space Grotesk';font-size:16px;font-weight:600;color:var(--navy);margin-bottom:12px;">Tareas</div>
    ${taskCards || '<div class="empty">Sin tareas.</div>'}
    ${_renderProjectDocs(p)}
  `;

  document.getElementById('projects-list-view').style.display = 'none';
  document.getElementById('projects-kanban-view').style.display = 'none';
  document.querySelector('#page-projects .tabs').style.display = 'none';
  document.getElementById('projects-detail-view').style.display = 'block';
  document.getElementById('projects-detail-view').innerHTML = html;
}

function _renderProjectDocs(p) {
  const allDocs = p.tasks.flatMap(t => (t.documents || []).map(d => ({...d, taskId: t.id, taskName: t.name})));
  if (allDocs.length === 0) return '';
  const base = (typeof MC_BASE !== 'undefined' ? MC_BASE : getApiBase()) + '/docs/';
  let html = `<div style="border-top:2px solid var(--border);padding-top:20px;margin-top:24px;">
    <div style="font-family:'Space Grotesk';font-size:16px;font-weight:600;color:var(--navy);margin-bottom:12px;">📄 Documentos del proyecto (${allDocs.length})</div>`;
  // Group by task
  const byTask = {};
  for (const d of allDocs) { (byTask[d.taskId] = byTask[d.taskId] || {name: d.taskName, docs: []}).docs.push(d); }
  for (const [tid, group] of Object.entries(byTask)) {
    html += `<div style="margin-bottom:12px;"><div style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:6px;">${esc(tid)} — ${esc(group.name)}</div><div style="display:flex;flex-wrap:wrap;gap:8px;">`;
    for (const doc of group.docs) {
      const docName = doc.title || doc.name || doc.path.split('/').pop().replace('.md', '');
      const url = base + doc.path;
      const isImage = /\.(png|jpe?g|webp|gif|svg)$/i.test(doc.path);
      if (isImage) {
        html += `<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;cursor:pointer;" onclick="window.open('${esc(url)}','_blank')">
          <img src="${esc(url)}" alt="${esc(docName)}" style="max-height:100px;max-width:160px;display:block;">
          <div style="padding:3px 6px;font-size:10px;color:var(--muted);background:var(--bg);">${esc(docName)}</div>
        </div>`;
      } else {
        const icon = doc.path.endsWith('.pdf') ? '📑' : '📄';
        html += `<a href="${esc(url)}" onclick="event.preventDefault();if(typeof v2OpenDoc==='function')v2OpenDoc('${esc(url)}','${esc(docName)}');else window.open('${esc(url)}','_blank');" style="display:flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid var(--border);border-radius:6px;text-decoration:none;color:var(--text);font-size:12px;" onmouseover="this.style.borderColor='var(--rust)'" onmouseout="this.style.borderColor='var(--border)'">
          <span>${icon}</span><span>${esc(docName)}</span>
        </a>`;
      }
    }
    html += '</div></div>';
  }
  html += '</div>';
  return html;
}

function backToProjectsList() {
  document.getElementById('projects-detail-view').style.display = 'none';
  document.getElementById('projects-list-view').style.display = '';
  document.querySelector('#page-projects .tabs').style.display = '';
}

function switchProjectsTab(view, tab) {
  tab.closest('.tabs').querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  document.getElementById('projects-list-view').style.display = view === 'list' ? '' : 'none';
  document.getElementById('projects-kanban-view').style.display = view === 'kanban' ? '' : 'none';
}

function editProjectTask(taskId) {
  const task = _prjData.flatMap(p => p.tasks).find(t => t.id === taskId);
  if (!task) return;
  const chOpts = PRJ_CHANNELS.map(c => '<option value="'+c+'"'+(c===task.channel?' selected':'')+'>'+c+'</option>').join('');
  const normSt = task.status === 'done' ? 'completed' : (task.status === 'cancelled' ? 'discarded' : task.status);
  const stOpts = ['todo','in-progress','blocked','completed','discarded'].map(s => '<option value="'+s+'"'+(s===normSt?' selected':'')+'>'+(PRJ_STATUS_LABEL[s]||s)+'</option>').join('');
  const taskType = task.type || task.batch_type || 'execution';
  const typeOpts = Object.entries(TASK_TYPE_META).map(([k,v]) => '<option value="'+k+'"'+(k===taskType?' selected':'')+'>'+v.icon+' '+v.label+'</option>').join('');
  const m = document.getElementById('projectsEditModal');
  if (!m) return;
  m.innerHTML = '<h3 style="font-family:\'Space Grotesk\';color:var(--navy);margin-bottom:16px;">✏️ '+taskId+'</h3>'+
    '<div style="margin-bottom:10px;"><label style="font-size:11px;color:var(--muted);text-transform:uppercase;display:block;margin-bottom:3px;">Nombre</label><input id="pef-name" value="'+esc(task.name).replace(/"/g,'&quot;')+'" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:14px;"/></div>'+
    '<div style="margin-bottom:10px;"><label style="font-size:11px;color:var(--muted);text-transform:uppercase;display:block;margin-bottom:3px;">Descripción</label><textarea id="pef-desc" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:14px;min-height:60px;resize:vertical;">'+esc(task.description||'')+'</textarea></div>'+
    '<div style="margin-bottom:10px;"><label style="font-size:11px;color:var(--muted);text-transform:uppercase;display:block;margin-bottom:3px;">Tipo</label><select id="pef-type" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);">'+typeOpts+'</select></div>'+
    '<div style="margin-bottom:10px;"><label style="font-size:11px;color:var(--muted);text-transform:uppercase;display:block;margin-bottom:3px;">📦 Entregable</label><textarea id="pef-deliv" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:14px;min-height:40px;resize:vertical;">'+esc(task.deliverable||'')+'</textarea></div>'+
    '<div style="margin-bottom:10px;"><label style="font-size:11px;color:var(--muted);text-transform:uppercase;display:block;margin-bottom:3px;">✓ Criterio de completado</label><textarea id="pef-done" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:14px;min-height:40px;resize:vertical;">'+esc(task.done_criteria||'')+'</textarea></div>'+
    '<div style="display:flex;gap:10px;margin-bottom:10px;"><div style="flex:1;"><label style="font-size:11px;color:var(--muted);text-transform:uppercase;display:block;margin-bottom:3px;">Canal</label><select id="pef-ch" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);"><option value="">—</option>'+chOpts+'</select></div><div style="flex:1;"><label style="font-size:11px;color:var(--muted);text-transform:uppercase;display:block;margin-bottom:3px;">Estado</label><select id="pef-st" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);">'+stOpts+'</select></div></div>'+
    '<div style="margin-bottom:14px;"><label style="font-size:11px;color:var(--muted);text-transform:uppercase;display:block;margin-bottom:3px;">Owner</label><input id="pef-ow" value="'+esc(task.owner||'Sancho')+'" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:14px;"/></div>'+
    '<div style="display:flex;gap:8px;justify-content:flex-end;"><button onclick="document.getElementById(\'projectsEditOverlay\').style.display=\'none\'" style="padding:8px 16px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--muted);cursor:pointer;">Cancelar</button><button onclick="saveProjectTask(\''+taskId+'\')" style="padding:8px 16px;border:1px solid var(--green);border-radius:6px;background:var(--green);color:#fff;cursor:pointer;font-weight:600;">Guardar</button></div>';
  document.getElementById('projectsEditOverlay').style.display = 'flex';
}

function _mcThread() { try { return mcChatSidebar._lockedThreadId || null; } catch { return null; } }

function saveProjectTask(taskId) {
  const pefName = document.getElementById('pef-name');
  if (!pefName) return;
  const fields = {name:pefName.value,description:document.getElementById('pef-desc').value,type:document.getElementById('pef-type').value,deliverable:document.getElementById('pef-deliv').value,done_criteria:document.getElementById('pef-done').value,channel:document.getElementById('pef-ch').value,status:document.getElementById('pef-st').value,owner:document.getElementById('pef-ow').value};
  fetch(getApiBase()+'/api/projects/task-update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug:_prjSlug,taskId,fields,sourceThread:_mcThread()})}).then(r=>r.json()).then(d=>{
    document.getElementById('projectsEditOverlay').style.display='none';
    if(d.ok){loadProjects();}
  });
}

function editProjectMeta(projId) {
  const p = _prjData.find(pr => pr.id === projId);
  if (!p) return;
  const obj = typeof p.objective === 'string' ? p.objective : (p.objective?.description || '');
  const stOpts = ['todo','in-progress','blocked','completed','discarded','archived'].map(s => '<option value="'+s+'"'+(s===p.status?' selected':'')+'>'+(PRJ_STATUS_LABEL[s]||s)+'</option>').join('');
  const m = document.getElementById('projectsEditModal');
  if (!m) return;
  m.innerHTML = '<h3 style="font-family:\'Space Grotesk\';color:var(--navy);margin-bottom:16px;">✏️ '+projId+'</h3>'+
    '<div style="margin-bottom:10px;"><label style="font-size:11px;color:var(--muted);text-transform:uppercase;display:block;margin-bottom:3px;">Nombre</label><input id="pef-pn" value="'+esc(p.name).replace(/"/g,'&quot;')+'" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:14px;"/></div>'+
    '<div style="margin-bottom:10px;"><label style="font-size:11px;color:var(--muted);text-transform:uppercase;display:block;margin-bottom:3px;">Descripción</label><textarea id="pef-pd" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:14px;min-height:60px;">'+esc(p.description||'')+'</textarea></div>'+
    '<div style="margin-bottom:10px;"><label style="font-size:11px;color:var(--muted);text-transform:uppercase;display:block;margin-bottom:3px;">Objetivo</label><textarea id="pef-po" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:14px;min-height:40px;">'+esc(obj)+'</textarea></div>'+
    '<div style="margin-bottom:10px;"><label style="font-size:11px;color:var(--muted);text-transform:uppercase;display:block;margin-bottom:3px;">Enfoque</label><textarea id="pef-pa" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:14px;min-height:60px;">'+esc(p.approach||'')+'</textarea></div>'+
    '<div style="display:flex;gap:10px;margin-bottom:10px;"><div style="flex:1;"><label style="font-size:11px;color:var(--muted);text-transform:uppercase;display:block;margin-bottom:3px;">Estado</label><select id="pef-ps" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);">'+stOpts+'</select></div><div style="flex:1;"><label style="font-size:11px;color:var(--muted);text-transform:uppercase;display:block;margin-bottom:3px;">Review date</label><input type="date" id="pef-pr" value="'+(p.review_date||'')+'" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);"/></div></div>'+
    '<div style="display:flex;gap:8px;justify-content:flex-end;"><button onclick="document.getElementById(\'projectsEditOverlay\').style.display=\'none\'" style="padding:8px 16px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--muted);cursor:pointer;">Cancelar</button><button onclick="saveProjectMeta(\''+projId+'\')" style="padding:8px 16px;border:1px solid var(--green);border-radius:6px;background:var(--green);color:#fff;cursor:pointer;font-weight:600;">Guardar</button></div>';
  document.getElementById('projectsEditOverlay').style.display = 'flex';
}

function saveProjectMeta(projId) {
  const fields = {name:document.getElementById('pef-pn').value,description:document.getElementById('pef-pd').value,objective:document.getElementById('pef-po').value,approach:document.getElementById('pef-pa').value,status:document.getElementById('pef-ps').value,review_date:document.getElementById('pef-pr').value};
  fetch(getApiBase()+'/api/projects/project-update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug:_prjSlug,projectId:projId,fields,sourceThread:_mcThread()})}).then(r=>r.json()).then(d=>{
    document.getElementById('projectsEditOverlay').style.display='none';
    if(d.ok){loadProjects();}
  });
}

function archiveProject(projId, projName) {
  const reason = prompt('📦 Archivar proyecto ' + projId + ' — ' + projName + '\n\n¿Motivo? (opcional)');
  if (reason === null) return; // cancelled
  fetch(getApiBase()+'/api/projects/project-update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug:_prjSlug,projectId:projId,fields:{status:'archived'},sourceThread:_mcThread()})}).then(r=>r.json()).then(d=>{
    if(d.ok){
      // Also log the archive action with reason
      fetch(getApiBase()+'/api/projects/project-archive',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug:_prjSlug,projectId:projId,reason:reason||'Archivado por el cliente',sourceThread:_mcThread()})}).catch(()=>{});
      loadProjects();
    }
  });
}

// ── Foundation Tasks ──

function openFoundationTask(task) {
  const slug = _prjSlug;
  const docPath = (typeof PILLAR_DOC_PATHS !== 'undefined' && PILLAR_DOC_PATHS[task.pillar])
    ? PILLAR_DOC_PATHS[task.pillar][0] : null;
  const fStatus = ['completed','done'].includes(task.status) ? 'approved'
    : task.status === 'in-progress' ? 'in-progress' : 'not-started';

  if (docPath) v2GoToDoc(slug, docPath, true);
  else showPage('foundation');
}

async function quickCompleteFoundation(taskId, pillar, section) {
  await fetch(getApiBase() + '/api/projects/task-update', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({slug: _prjSlug, taskId, fields: {status: 'completed'}, sourceThread: _mcThread()})
  });
  if (pillar && section) {
    fetch(getApiBase() + '/api/foundation/pillar-status', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({slug: _prjSlug, section, pillar, status: 'approved'})
    }).catch(() => {});
  }
  showToast('✅ Completada');
  await loadProjects();
  const detailView = document.getElementById('projects-detail-view');
  if (detailView && detailView.style.display === 'block') {
    const projId = _prjData.flatMap(p => p.tasks.map(t => ({tid: t.id, pid: p.id}))).find(x => x.tid === taskId)?.pid;
    if (projId) showProjectDetail(projId);
  }
}

// ── Work Editor (fullscreen: tasks & projects) ──

function openWorkEditor(mode, id) {
  _weMode = mode;
  _weEditId = id;
  const slug = document.getElementById('clientSelector')?.value || window.PORTAL_SLUG || '';

  const taskFields = document.getElementById('we-task-fields');
  const projFields = document.getElementById('we-project-fields');

  if (mode === 'task') {
    const task = _prjData.flatMap(p => p.tasks.map(t => ({...t, _projectId: p.id, _projectName: p.name, _projectStrategy: p.strategy}))).find(t => t.id === id);
    if (!task) return;
    _weProjectId = task._projectId;

    document.getElementById('we-fs-title').textContent = '✏️ ' + id + ' — ' + (task.name || '');
    document.getElementById('we-name').value = task.name || '';
    document.getElementById('we-desc').value = task.description || '';
    document.getElementById('we-type').value = task.type || task.batch_type || 'execution';
    document.getElementById('we-deliv').value = task.deliverable || '';
    document.getElementById('we-done').value = task.done_criteria || '';
    document.getElementById('we-owner').value = task.owner || 'Sancho';
    document.getElementById('we-skill').value = task.skill || '';

    // Channel dropdown
    const chSel = document.getElementById('we-channel');
    chSel.innerHTML = '<option value="">—</option>' + PRJ_CHANNELS.map(c => '<option value="'+c+'"'+(c===task.channel?' selected':'')+'>'+c+'</option>').join('');

    // Status dropdown (normalize done→completed, cancelled→discarded)
    const normSt = task.status === 'done' ? 'completed' : (task.status === 'cancelled' ? 'discarded' : task.status);
    const stSel = document.getElementById('we-status-task');
    stSel.value = normSt || 'todo';

    taskFields.style.display = '';
    projFields.style.display = 'none';


  } else {
    // Project mode
    const proj = _prjData.find(p => p.id === id);
    if (!proj) return;
    _weProjectId = id;

    const obj = typeof proj.objective === 'string' ? proj.objective : (proj.objective?.description || '');
    document.getElementById('we-fs-title').textContent = '✏️ ' + id + ' — ' + (proj.name || '');
    document.getElementById('we-name').value = proj.name || '';
    document.getElementById('we-desc').value = proj.description || '';
    document.getElementById('we-objective').value = obj;
    document.getElementById('we-approach').value = proj.approach || '';
    document.getElementById('we-status-proj').value = proj.status || 'active';
    document.getElementById('we-review-date').value = proj.review_date || '';

    taskFields.style.display = 'none';
    projFields.style.display = '';

  }

  // Open sidebar chat for context
  if (slug && slug !== 'global') {
    if (mode === 'task') {
      const task = _prjData.flatMap(p => p.tasks.map(t => ({...t, _projectId: p.id, _projectName: p.name}))).find(t => t.id === id);
      if (task) mcChatOpenTask(id, task.name || '', task._projectId, task._projectName || '', task.skill || '', task.channel || '', task.status || '', task.type || task.batch_type || '');
    } else {
      const proj = _prjData.find(p => p.id === id);
      if (proj) mcChatOpenProject(id, proj.name || '', proj.strategy || '', proj.status || '');
    }
  }

  document.getElementById('work-editor-fs').style.display = 'flex';
}

function closeWorkEditor() {
  document.getElementById('work-editor-fs').style.display = 'none';
  _weMode = null;
  _weEditId = null;
}

async function saveWorkEditor() {
  let fields, endpoint, payload;

  if (_weMode === 'task') {
    fields = {
      name: document.getElementById('we-name').value,
      description: document.getElementById('we-desc').value,
      type: document.getElementById('we-type').value,
      deliverable: document.getElementById('we-deliv').value,
      done_criteria: document.getElementById('we-done').value,
      channel: document.getElementById('we-channel').value,
      status: document.getElementById('we-status-task').value,
      owner: document.getElementById('we-owner').value,
      skill: document.getElementById('we-skill').value,
    };
    endpoint = '/api/projects/task-update';
    payload = { slug: _prjSlug, taskId: _weEditId, fields, sourceThread: _mcThread() };
  } else {
    fields = {
      name: document.getElementById('we-name').value,
      description: document.getElementById('we-desc').value,
      objective: document.getElementById('we-objective').value,
      approach: document.getElementById('we-approach').value,
      status: document.getElementById('we-status-proj').value,
      review_date: document.getElementById('we-review-date').value,
    };
    endpoint = '/api/projects/project-update';
    payload = { slug: _prjSlug, projectId: _weEditId, fields, sourceThread: _mcThread() };
  }

  try {
    const res = await fetch(getApiBase() + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const d = await res.json();
    if (!d.ok) { showToast('Error guardando'); return; }
    showToast('💾 Guardado');
    const returnToProjectId = _weProjectId || _weEditId;
    closeWorkEditor();
    await loadProjects();
    // Re-render detail view if visible
    const detailView = document.getElementById('projects-detail-view');
    if (detailView && detailView.style.display === 'block') {
      showProjectDetail(returnToProjectId);
    }
  } catch (e) { showToast('Error: ' + e.message); }
}




// ========== TASK SLIDE-OVER ==========

let _detailTask = null;
let _detailProjectId = null;

// ── Content Pipeline Definitions ──
const CONTENT_PIPELINES = {
  'blog':       { label:'Blog / SEO', steps:['Research','Redactar','Imagen','Schema','QA','Revisar','Calendario','Publicar','Atomizar'] },
  'linkedin':   { label:'LinkedIn',   steps:['Redactar','Visual','QA','Revisar','Calendario','Publicar'] },
  'instagram':  { label:'Instagram',  steps:['Redactar','Visual/Reel','QA','Revisar','Calendario','Publicar'] },
  'twitter':    { label:'Twitter/X',  steps:['Redactar','Visual','QA','Revisar','Calendario','Publicar'] },
  'tiktok':     { label:'TikTok',     steps:['Guión','Vídeo','QA','Revisar','Calendario','Publicar'] },
  'email':      { label:'Email',      steps:['Redactar','Template','QA','Revisar','Calendario','Enviar'] },
  'newsletter': { label:'Newsletter', steps:['Redactar','Template','QA','Revisar','Calendario','Enviar'] },
  'youtube':    { label:'YouTube',    steps:['Research','Guión','Thumbnail','QA','Revisar','Calendario','Publicar'] },
  'guest-post': { label:'Guest Post', steps:['Redactar','QA','Revisar','Pitch + Envío'] },
  'paid-ads':   { label:'Paid Ads',   steps:['Copy Ad','Visual','QA','Revisar','Calendario','Publicar'] },
  'slides':     { label:'Slides',     steps:['Crear Slides','QA','Revisar'] },
};
// Map channel field values to pipeline keys
const CHANNEL_TO_PIPELINE = {
  'content':'blog', 'web':'blog', 'blog':'blog',
  'linkedin':'linkedin', 'instagram':'instagram', 'twitter':'twitter', 'tiktok':'tiktok',
  'email':'email', 'newsletter':'newsletter', 'youtube':'youtube',
  'guest-post':'guest-post', 'earned':'guest-post',
  'paid-ads':'paid-ads', 'ads':'paid-ads',
  'slides':'slides', 'creatives':'slides',
};

const CONTENT_PIECE_STATES = [
  { key:'draft',      icon:'📝', label:'Borrador' },
  { key:'assets',     icon:'🖼️', label:'Assets' },
  { key:'review',     icon:'👀', label:'Revisión' },
  { key:'approved',   icon:'✅', label:'Aprobado' },
  { key:'scheduled',  icon:'📅', label:'Calendario' },
  { key:'published',  icon:'📤', label:'Publicado' },
];

function _renderContentPipeline(task) {
  const ch = task.channel || 'content';
  const pipelineKey = CHANNEL_TO_PIPELINE[ch] || 'blog';
  const pipeline = CONTENT_PIPELINES[pipelineKey] || CONTENT_PIPELINES.blog;

  // Pipeline steps bar
  let stepsHtml = '<div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">';
  for (let i = 0; i < pipeline.steps.length; i++) {
    const step = pipeline.steps[i];
    const isLast = i === pipeline.steps.length - 1;
    stepsHtml += `<span style="font-size:11px;padding:3px 8px;border-radius:4px;background:color-mix(in srgb,var(--rust) 8%,transparent);color:var(--rust);font-weight:500;">${step}</span>`;
    if (!isLast) stepsHtml += '<span style="color:var(--muted);font-size:10px;">→</span>';
  }
  stepsHtml += '</div>';

  // Piece states legend
  let statesHtml = '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;">';
  for (const s of CONTENT_PIECE_STATES) {
    statesHtml += `<span style="font-size:10px;color:var(--muted);">${s.icon} ${s.label}</span>`;
  }
  statesHtml += '</div>';

  return `<div style="border-top:2px solid var(--border);padding-top:16px;margin-top:16px;margin-bottom:16px;">
    <div style="font-family:'Space Grotesk';font-size:14px;font-weight:600;color:var(--navy);margin-bottom:10px;">
      🔄 Pipeline: ${esc(pipeline.label)}
    </div>
    ${stepsHtml}
    ${statesHtml}
  </div>`;
}

function showTaskDetail(taskId, projectId) {
  const p = projectId
    ? _prjData.find(pr => pr.id === projectId)
    : _prjData.find(pr => pr.tasks.some(t => t.id === taskId));
  if (!p) return;
  const task = p.tasks.find(t => t.id === taskId);
  if (!task) return;
  _detailTask = task;
  _detailProjectId = p.id;

  const taskType = task.type || task.batch_type || 'execution';
  const meta = TASK_TYPE_META[taskType] || TASK_TYPE_META.execution;
  const typeBadge = `<span style="font-size:10px;padding:2px 8px;border-radius:4px;background:color-mix(in srgb,${meta.color} 12%,transparent);color:${meta.color};font-weight:600;text-transform:uppercase;">${meta.icon} ${meta.label}</span>`;

  let html = `
    <div style="margin-bottom:16px;">
      <a href="#" onclick="showProjectDetail('${esc(p.id)}');return false;" style="font-size:14px;color:var(--muted);text-decoration:none;">← ${esc(p.name)}</a>
    </div>
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:20px;flex-wrap:wrap;">
      <div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;">
          <span style="font-family:'Space Grotesk';font-weight:700;color:var(--rust);font-size:18px;">${esc(task.id)}</span>
          <span class="page-title" style="margin:0;">${esc(task.name)}</span>
          ${pill(task.status)}
          ${typeBadge}
        </div>
        <div class="page-sub" style="margin-bottom:0;">
          ${chBadge(task.channel)}
          ${task.owner ? '<span style="font-size:12px;color:var(--muted);margin-left:8px;">👤 ' + esc(task.owner) + '</span>' : ''}
          ${task.depends_on ? '<span style="font-size:12px;color:var(--muted);margin-left:8px;">⛓️ ' + esc(task.depends_on) + '</span>' : ''}
        </div>
      </div>
      <div style="display:flex;gap:8px;">
        <button onclick="if(typeof mcChatOpenTask==='function')mcChatOpenTask('${esc(task.id)}','${esc(task.name).replace(/'/g,"\\'")}','${esc(p.id)}','${esc(p.name).replace(/'/g,"\\'")}','${esc(task.skill||'')}','${esc(task.channel||'')}','${esc(task.status||'')}','${esc(task.type||task.batch_type||'')}')" style="padding:6px 14px;background:var(--rust);color:#fff;border:1px solid var(--rust);border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;">💬 Chat</button>
        <button onclick="editProjectTask('${esc(task.id)}')" style="padding:6px 14px;background:var(--card);border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:13px;">✏️ Editar</button>
      </div>
    </div>`;

  if (task.description) html += `<div style="font-size:15px;line-height:1.6;margin-bottom:16px;">${esc(task.description)}</div>`;
  if (task.deliverable) html += `<div style="font-size:14px;margin-bottom:8px;padding:10px 14px;background:color-mix(in srgb,var(--green) 8%,transparent);border-radius:8px;"><strong>📦 Entregable:</strong> ${esc(task.deliverable)}</div>`;
  if (task.done_criteria) html += `<div style="font-size:14px;margin-bottom:8px;padding:10px 14px;background:color-mix(in srgb,var(--blue) 8%,transparent);border-radius:8px;"><strong>✓ Criterio:</strong> ${esc(task.done_criteria)}</div>`;

  // Pipeline steps for content tasks
  if (taskType === 'content') {
    html += _renderContentPipeline(task);
  }

  // Documents section (always visible)
  const docs = task.documents || [];
  html += `<div style="border-top:2px solid var(--border);padding-top:20px;margin-top:20px;">
    <div style="font-family:'Space Grotesk';font-size:16px;font-weight:600;color:var(--navy);margin-bottom:12px;">
      📄 Documentos (${docs.length})
    </div>`;
  if (docs.length === 0) {
    html += '<div style="text-align:center;padding:16px;color:var(--muted);font-size:13px;border:1px dashed var(--border);border-radius:8px;">Sin documentos. El chat creará documentos aquí al ejecutar la tarea.</div>';
  } else {
    for (const doc of docs) {
      const docName = doc.title || doc.name || doc.path.split('/').pop().replace('.md', '');
      const docDate = doc.created_at ? new Date(doc.created_at).toLocaleDateString('es-ES', {day:'numeric',month:'short'}) : '';
      const statusIcon = doc.status === 'approved' ? '✅' : doc.status === 'draft' ? '📝' : '📄';
      const docsUrl = (typeof MC_BASE !== 'undefined' ? MC_BASE : getApiBase()) + '/docs/' + doc.path;
      const isImage = /\.(png|jpe?g|webp|gif|svg)$/i.test(doc.path);
      if (isImage) {
        html += `<div style="display:inline-block;margin:0 8px 8px 0;border:1px solid var(--border);border-radius:8px;overflow:hidden;cursor:pointer;" onclick="window.open('${esc(docsUrl)}','_blank')">
          <img src="${esc(docsUrl)}" alt="${esc(docName)}" style="max-height:120px;max-width:200px;display:block;">
          <div style="padding:4px 8px;font-size:11px;color:var(--muted);background:var(--bg);">${esc(docName)}</div>
        </div>`;
      } else {
        html += `<a href="${esc(docsUrl)}" onclick="event.preventDefault();if(typeof v2OpenDoc==='function')v2OpenDoc('${esc(docsUrl)}','${esc(docName)}');else window.open('${esc(docsUrl)}','_blank');" style="display:flex;align-items:center;gap:10px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:4px;text-decoration:none;color:var(--text);transition:border-color .12s;" onmouseover="this.style.borderColor='var(--rust)'" onmouseout="this.style.borderColor='var(--border)'">
          <span style="font-size:16px;">${statusIcon}</span>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:13px;">${esc(docName)}</div>
            <div style="font-size:11px;color:var(--muted);">${esc(doc.path)}</div>
          </div>
          ${docDate ? `<span style="font-size:11px;color:var(--muted);">${docDate}</span>` : ''}
        </a>`;
      }
    }
  }
  html += '</div>';
  // Render in full-page detail view (same as project detail)
  document.getElementById('projects-list-view').style.display = 'none';
  document.getElementById('projects-kanban-view').style.display = 'none';
  document.querySelector('#page-projects .tabs').style.display = 'none';
  document.getElementById('projects-detail-view').style.display = 'block';
  document.getElementById('projects-detail-view').innerHTML = html;
}

// Pipeline states definition (used by kanban + cards)







