// mc-work.js — Projects + Tasks + Ideas system (extracted from legacy-mission-control.html)
// Dependencies (globals from legacy-mission-control.html): getApiBase, showPage, showToast, esc, escHtml, MC_BASE, CLIENTS, mcChatOpenTask, mcChatOpenProject, mcChatOpenIdea, mcChatSidebar

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
    const ideaCount = (t.idea_ids || []).length;
    const ideaBadge = ideaCount > 0 ? `<span style="font-size:10px;color:var(--muted);">💡${ideaCount}</span>` : '';
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
    <div id="project-pool-section" style="margin-top:24px;"></div>
  `;

  document.getElementById('projects-list-view').style.display = 'none';
  document.getElementById('projects-kanban-view').style.display = 'none';
  document.querySelector('#page-projects .tabs').style.display = 'none';
  document.getElementById('projects-detail-view').style.display = 'block';
  document.getElementById('projects-detail-view').innerHTML = html;

  // Load unassigned ideas (exceptions only — ideas without a task)
  _loadUnassignedIdeas(projId);
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




// ==================== IDEA BANK ====================
const IDEA_TYPE_LABELS = { content:'📝 Contenido', contact:'👥 Contacto' };
const IDEA_SOURCE_LABELS = { seo_geo:'🔍 SEO/GEO', signal:'📡 Signal', competitor:'🏆 Competencia', meeting:'🗣️ Reunión', manual:'💡 Manual', trust_engine:'🔄 Trust Engine', paa:'❓ PAA', trending:'Trending', serp_gaps:'SERP Gaps' };
const IDEA_LIST_CONFIG = {
  keywords:    { icon: '🔍', label: 'Keywords para rankear', description: 'Oportunidades SEO detectadas', type: 'content' },
  trending:    { icon: '🔥', label: 'Contenido trending para crear', description: 'Temas en tendencia en el nicho', type: 'content' },
  gaps:        { icon: '🏆', label: 'Gaps vs competencia', description: 'Contenido que competidores no cubren bien', type: 'content' },
  repurpose:   { icon: '♻️', label: 'Contenido para reutilizar', description: 'Ideas de atomización cross-canal', type: 'content' },
  medios:      { icon: '📢', label: 'Medios donde aparecer', description: 'Blogs, revistas, podcasts para PR/guest posts', type: 'contact' },
  partners:    { icon: '🤝', label: 'Partners para colaborar', description: 'Empresas/personas para co-marketing', type: 'contact' },
  influencers: { icon: '🎯', label: 'Influencers para contactar', description: 'Creadores relevantes en el nicho', type: 'contact' },
  outreach:    { icon: '📨', label: 'Prospects para contactar', description: 'Leads para outreach directo', type: 'contact' },
};
const CONTENT_LISTS = ['keywords','trending','gaps','repurpose'];
const CONTACT_LISTS = ['medios','partners','influencers','outreach'];
const IDEA_CHANNEL_LABELS = { blog:'📰 Blog', instagram:'📸 Instagram', linkedin:'💼 LinkedIn', twitter:'🐦 Twitter', partners:'🤝 Partners', medios:'📢 Medios / Blogs', influencers:'🎯 Influencers', outreach:'📨 Outreach directo' };
const IDEA_CHANNEL_COLORS = { blog:{bg:'#E3F2FD',fg:'#1565C0'}, instagram:{bg:'#F3E5F5',fg:'#7B1FA2'}, linkedin:{bg:'#E8F5E9',fg:'#2E7D32'}, twitter:{bg:'#E1F5FE',fg:'#0277BD'} };
const IDEA_STATUS_COLORS = { new:'var(--blue)', approved:'var(--green)', rejected:'var(--red)', executed:'var(--muted)' };
const IDEA_CHANNEL_CONFIG = {
  blog: { icon:'📰', label:'Blog' }, instagram: { icon:'📸', label:'Instagram' },
  linkedin: { icon:'💼', label:'LinkedIn' }, twitter: { icon:'🐦', label:'Twitter' },
  partners: { icon:'🤝', label:'Partners' }, medios: { icon:'📢', label:'Medios / Blogs' },
  influencers: { icon:'🎯', label:'Influencers' }, outreach: { icon:'📨', label:'Outreach directo' }
};
const CONTENT_CHANNELS = ['blog','instagram','linkedin','twitter'];
const CONTACT_CHANNELS = ['partners','medios','influencers','outreach'];

let _ideasCache = {}; // { slug: [...ideas] }
let _ideasStatusFilter = 'all';
let _ideasSourceFilter = 'all';
let _ideasChannelFilter = 'all';
let currentIdeaTab = 'content';

function switchIdeaTab(tab, el) {
  currentIdeaTab = tab;
  _ideasChannelFilter = 'all'; // reset channel filter on tab switch
  document.querySelectorAll('#idea-bank-tabs .tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderIdeasPage();
}

function populateIdeaBankClientFilter() {
  // No-op: uses nav sidebar #clientSelector instead of a duplicate selector
}

function _getSelectedClientSlug() {
  // Portal mode
  if (window.PORTAL_MODE) return window.PORTAL_SLUG || '';
  // Use nav sidebar selector
  const sel = document.getElementById('clientSelector');
  const val = sel ? sel.value : '';
  return (val && val !== 'global') ? val : '';
}

async function loadIdeasData() {
  const slug = _getSelectedClientSlug();
  const base = (typeof MC_BASE !== 'undefined') ? MC_BASE : '/mc';
  const url = slug ? `${base}/api/ideas?slug=${slug}` : `${base}/api/ideas`;
  try {
    const res = await fetch(url);
    _ideasCache = await res.json();
  } catch (e) { _ideasCache = {}; }
  renderIdeasPage();
}

function _normalizeIdea(idea) {
  // Normalize type: "action" → "content" (old schema had 3 types)
  if (idea.type === 'action') idea.type = 'content';

  // Backward compat: channels_suggested → channels
  if (!idea.channels && idea.channels_suggested) {
    idea.channels = Array.isArray(idea.channels_suggested) ? idea.channels_suggested : [];
  }

  // Backward compat: convert target_channel (string) to channels (array) for content ideas
  if (idea.type === 'content' && !idea.channels) {
    idea.channels = idea.target_channel ? [idea.target_channel] : [];
  }

  // Backward compat: normalize old schema to list
  if (!idea.list) {
    if (idea.type === 'contact') {
      // Map contact categories/target_channel to known lists
      var tc = idea.target_channel || idea.category || 'outreach';
      if (tc === 'podcasts' || tc === 'medios') idea.list = 'medios';
      else if (tc === 'influencers') idea.list = 'influencers';
      else if (tc === 'partners') idea.list = 'partners';
      else idea.list = 'outreach';
    } else {
      // Map content categories/sources to known lists
      var cat = idea.category || '';
      if (cat === 'geo_optimization' || idea.source === 'seo_geo' || idea.source === 'paa') idea.list = 'keywords';
      else if (cat === 'comparison' || cat === 'ranking' || idea.source === 'competitor') idea.list = 'gaps';
      else if (idea.source === 'signal' || idea.source === 'trending') idea.list = 'trending';
      else if (cat === 'guide' || cat === 'solution' || cat === 'authority' || cat === 'discovery') idea.list = 'keywords';
      else idea.list = 'keywords'; // default
    }
  }

  // Backward compat: ensure list is a known value
  var knownLists = ['keywords','trending','gaps','repurpose','medios','partners','influencers','outreach'];
  if (knownLists.indexOf(idea.list) === -1) {
    idea.list = idea.type === 'contact' ? 'outreach' : 'keywords';
  }

  if (!idea.action) {
    idea.action = idea.description || idea.notes || '';
  }
  return idea;
}

function renderIdeasPage() {
  // Flatten all ideas with slug attached
  let allIdeas = [];
  for (const [slug, ideas] of Object.entries(_ideasCache)) {
    for (const idea of ideas) allIdeas.push({ ..._normalizeIdea(idea), _slug: slug });
  }
  // Sort by created_at desc
  allIdeas.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

  const showSlugCol = Object.keys(_ideasCache).length > 1;
  const isContent = currentIdeaTab === 'content';
  const tabChannels = isContent ? CONTENT_CHANNELS : CONTACT_CHANNELS;
  const tabIdeas = allIdeas.filter(i => i.type === currentIdeaTab);

  // Stats
  const total = tabIdeas.length;
  const pending = tabIdeas.filter(i => i.status === 'new').length;
  const approved = tabIdeas.filter(i => i.status === 'approved').length;
  const approvedRate = total > 0 ? Math.round((approved / total) * 100) : 0;
  const tabLabel = isContent ? 'Contenido' : 'Contactos';
  document.getElementById('idea-bank-stats').innerHTML = `
    <div class="stat"><div class="num">${total}</div><div class="label">Total ${tabLabel}</div></div>
    <div class="stat"><div class="num" style="color:var(--blue)">${pending}</div><div class="label">Pendientes</div></div>
    <div class="stat"><div class="num" style="color:var(--green)">${approved}</div><div class="label">Aprobadas</div></div>
    <div class="stat"><div class="num">${approvedRate}%</div><div class="label">Tasa Aprobación</div></div>`;

  let filtersHtml = '';

  // Status filter pills
  const statusTabs = [['all','Todas'],['new','🆕 Nuevas'],['approved','✅ Aprobadas'],['rejected','❌ Rechazadas'],['executed','✔️ Ejecutadas']];
  filtersHtml += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">';
  for (const [val, label] of statusTabs) {
    const active = _ideasStatusFilter === val;
    filtersHtml += `<button onclick="_ideasStatusFilter='${val}';renderIdeasPage()" style="padding:6px 14px;border-radius:20px;border:2px solid ${active ? 'var(--rust)' : 'var(--border)'};background:${active ? 'var(--rust)' : 'var(--card)'};color:${active ? '#fff' : 'var(--text)'};font-size:13px;font-weight:${active ? '700' : '400'};cursor:pointer;">${label}</button>`;
  }
  filtersHtml += '</div>';

  // Dropdown filters
  const sources = [...new Set(tabIdeas.map(i => i.source).filter(Boolean))];
  filtersHtml += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
  filtersHtml += `<select onchange="_ideasSourceFilter=this.value;renderIdeasPage()" style="padding:6px 10px;border:1px solid var(--border);border-radius:8px;font-size:12px;background:var(--card);color:var(--text);"><option value="all">Fuente: Todas</option>${sources.map(s => `<option value="${s}" ${_ideasSourceFilter===s?'selected':''}>${IDEA_SOURCE_LABELS[s]||s}</option>`).join('')}</select>`;
  if (isContent) {
    // Channel filter for content: check against channels array
    const allCh = new Set();
    tabIdeas.forEach(i => (i.channels||[]).forEach(c => allCh.add(c)));
    const channels = CONTENT_CHANNELS.filter(c => allCh.has(c));
    filtersHtml += `<select onchange="_ideasChannelFilter=this.value;renderIdeasPage()" style="padding:6px 10px;border:1px solid var(--border);border-radius:8px;font-size:12px;background:var(--card);color:var(--text);"><option value="all">Canal: Todos</option>${channels.map(c => `<option value="${c}" ${_ideasChannelFilter===c?'selected':''}>${IDEA_CHANNEL_LABELS[c]||c}</option>`).join('')}</select>`;
  }
  filtersHtml += `<label style="font-size:13px;color:var(--muted);cursor:pointer;display:flex;align-items:center;gap:4px;margin-left:auto;"><input type="checkbox" id="idea-select-all" onchange="toggleSelectAll(this.checked)"> Seleccionar todas</label>`;
  filtersHtml += '</div>';
  document.getElementById('idea-bank-filters').innerHTML = filtersHtml;

  // Apply filters
  let filtered = tabIdeas;
  if (_ideasStatusFilter !== 'all') filtered = filtered.filter(i => i.status === _ideasStatusFilter);
  if (_ideasSourceFilter !== 'all') filtered = filtered.filter(i => i.source === _ideasSourceFilter);
  if (_ideasChannelFilter !== 'all') {
    if (isContent) {
      filtered = filtered.filter(i => (i.channels||[]).includes(_ideasChannelFilter));
    }
  }

  if (filtered.length === 0) {
    const emptyMsg = isContent
      ? 'No hay ideas de contenido. Haz clic en "+ Nueva Idea" o ejecuta una tarea recurrente.'
      : 'No hay ideas de contactos. Haz clic en "+ Nueva Idea" para añadir partners, medios o influencers.';
    document.getElementById('idea-bank-content').innerHTML = `<div class="card"><div class="empty" style="text-align:center;padding:40px;color:var(--muted);">${emptyMsg}</div></div>`;
    return;
  }

  // Build table-based layout with collapsible groups
  let html = '';
  let _ideaGroupIdx = 0;

  function _buildIdeaTableRow(idea) {
    const scoreColor = (idea.priority_score || 0) >= 70 ? '#4A5D23' : (idea.priority_score || 0) >= 40 ? '#E6A817' : '#888';
    const date = idea.created_at ? new Date(idea.created_at).toLocaleDateString('es-ES', { day:'numeric', month:'short' }) : '';
    const rowStyle = idea.status === 'approved' ? 'opacity:0.6;' : idea.status === 'rejected' ? 'opacity:0.4;' : '';
    const titleDeco = idea.status === 'rejected' ? 'text-decoration:line-through;' : '';

    let r = `<tr style="border-bottom:1px solid var(--border);${rowStyle}">`;
    r += `<td style="padding:8px 4px;text-align:center;"><input type="checkbox" class="idea-checkbox" data-idea-id="${idea.id}" data-slug="${idea._slug}" onclick="updateBulkBar()"></td>`;
    r += `<td style="padding:8px;"><div style="font-weight:600;cursor:pointer;color:var(--rust);${titleDeco}" onclick="showIdeaDetail('${idea._slug}','${idea.id}')">${escHtml(idea.title || 'Sin título')}</div>`;
    if (idea.action) r += `<div style="font-size:12px;color:var(--muted);margin-top:2px;">${escHtml(idea.action)}</div>`;
    r += `</td>`;
    r += `<td style="padding:8px;text-align:center;"><span style="font-weight:700;font-size:14px;color:${scoreColor};">${idea.priority_score != null ? Math.round(idea.priority_score) : '-'}</span></td>`;

    if (isContent) {
      // Canales (multi pills)
      r += `<td style="padding:8px;"><div style="display:flex;gap:3px;flex-wrap:wrap;">`;
      for (const ch of (idea.channels || [])) {
        const cc = IDEA_CHANNEL_COLORS[ch] || {bg:'#ECEFF1',fg:'#37474F'};
        const cfg = IDEA_CHANNEL_CONFIG[ch] || {icon:'📌',label:ch};
        r += `<span style="padding:1px 6px;border-radius:8px;font-size:10px;font-weight:600;background:${cc.bg};color:${cc.fg};white-space:nowrap;">${cfg.icon} ${cfg.label}</span>`;
      }
      r += `</div></td>`;
    }

    // Fuente
    r += `<td style="padding:8px;"><span style="padding:1px 6px;border-radius:8px;font-size:10px;font-weight:600;background:#FFF3E0;color:#E65100;white-space:nowrap;">${idea.source ? (IDEA_SOURCE_LABELS[idea.source]||idea.source) : ''}</span></td>`;
    // Fecha
    r += `<td style="padding:8px;text-align:center;font-size:12px;color:var(--muted);">${date}</td>`;
    // Acciones
    r += `<td style="padding:8px;text-align:center;"><div style="display:flex;gap:2px;justify-content:center;">`;
    if (idea.status === 'new') {
      r += `<button onclick="updateIdeaStatus('${idea._slug}','${idea.id}','approved')" title="Aprobar" style="background:none;border:none;cursor:pointer;font-size:14px;padding:2px;">✅</button>`;
      r += `<button onclick="updateIdeaStatus('${idea._slug}','${idea.id}','rejected')" title="Rechazar" style="background:none;border:none;cursor:pointer;font-size:14px;padding:2px;">❌</button>`;
    }
    r += `<button onclick="mcChatOpenIdea('${idea._slug}','${idea.id}','${escHtml((idea.title||'').replace(/'/g,"\\'"))}','${idea.list||''}',${JSON.stringify(idea.channels||[])})" title="Chat" style="background:none;border:none;cursor:pointer;font-size:14px;padding:2px;">💬</button>`;
    r += `<button onclick="editIdea('${idea._slug}','${idea.id}')" title="Editar" style="background:none;border:none;cursor:pointer;font-size:14px;padding:2px;">✏️</button>`;
    r += `<button onclick="if(confirm('¿Eliminar esta idea?'))deleteIdea('${idea._slug}','${idea.id}')" title="Eliminar" style="background:none;border:none;cursor:pointer;font-size:14px;padding:2px;">🗑️</button>`;
    r += `</div></td>`;
    r += `</tr>`;
    return r;
  }

  function _buildIdeaTableHeaders() {
    let th = `<tr style="background:var(--bg);">`;
    th += `<th style="width:30px;padding:8px 4px;text-align:center;"><input type="checkbox" class="idea-group-select-all" data-group="__current__" onchange="toggleGroupSelectAll(this)"></th>`;
    th += `<th style="padding:8px;text-align:left;">Título + Acción</th>`;
    th += `<th style="width:50px;padding:8px;text-align:center;">Score</th>`;
    if (isContent) {
      th += `<th style="padding:8px;text-align:left;">Canales</th>`;
    }
    th += `<th style="padding:8px;text-align:left;">Fuente</th>`;
    th += `<th style="width:80px;padding:8px;text-align:center;">Fecha</th>`;
    th += `<th style="width:120px;padding:8px;text-align:center;">Acciones</th>`;
    th += `</tr>`;
    return th;
  }

  function _buildGroupTable(groupId, ideas) {
    let t = `<table class="idea-table" style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:4px;">`;
    t += `<thead>${_buildIdeaTableHeaders().replace('data-group="__current__"', 'data-group="'+groupId+'"')}</thead><tbody>`;
    for (const idea of ideas) t += _buildIdeaTableRow(idea);
    t += `</tbody></table>`;
    return t;
  }

  function _renderGroup(groupId, icon, label, ideas, expanded) {
    return _renderGroupWithDesc(groupId, icon, label, '', ideas, expanded);
  }

  function _renderGroupWithDesc(groupId, icon, label, description, ideas, expanded) {
    const chevron = expanded ? '▾' : '▸';
    const maxH = expanded ? '' : 'max-height:0px;';
    let g = `<div class="idea-group-header" onclick="toggleIdeaGroup('${groupId}')" style="display:flex;align-items:center;gap:8px;padding:10px 0;cursor:pointer;border-bottom:2px solid var(--border);margin-top:16px;">`;
    g += `<span class="idea-group-chevron" id="chevron-${groupId}" style="font-size:12px;transition:transform 0.2s;">${chevron}</span>`;
    g += `<span style="font-family:'Space Grotesk',sans-serif;font-size:16px;font-weight:600;color:var(--navy);">${icon} ${label} <span style="font-weight:400;font-size:13px;color:var(--muted);">(${ideas.length})</span></span>`;
    if (description) g += `<span style="font-size:12px;color:var(--muted);margin-left:8px;">${description}</span>`;
    g += `</div>`;
    g += `<div id="group-${groupId}" style="overflow:hidden;transition:max-height 0.3s ease;${maxH}">`;
    g += _buildGroupTable(groupId, ideas);
    g += `</div>`;
    return g;
  }

  // Always group by list
  const listKeys = isContent ? CONTENT_LISTS : CONTACT_LISTS;
  const groups = {};
  for (const idea of filtered) {
    const key = idea.list || '_none';
    if (!groups[key]) groups[key] = [];
    groups[key].push(idea);
  }
  // Render known lists first, then any unknown
  const allKeys = [...listKeys.filter(k => groups[k]), ...Object.keys(groups).filter(k => !listKeys.includes(k) && k !== '_none')];
  if (groups['_none']) allKeys.push('_none');
  for (const key of allKeys) {
    const grpIdeas = groups[key];
    if (!grpIdeas || grpIdeas.length === 0) continue;
    const cfg = IDEA_LIST_CONFIG[key] || { icon: '📌', label: key, description: '' };
    const gid = 'ig_' + (key.replace(/[^a-z0-9]/gi, '_'));
    const expanded = _ideaGroupIdx === 0;
    html += _renderGroupWithDesc(gid, cfg.icon, cfg.label, cfg.description, grpIdeas, expanded);
    _ideaGroupIdx++;
  }

  document.getElementById('idea-bank-content').innerHTML = html;

  // After render, set maxHeight for expanded groups so transitions work
  document.querySelectorAll('.idea-group-header').forEach(header => {
    const gid = header.getAttribute('onclick')?.match(/toggleIdeaGroup\('([^']+)'\)/)?.[1];
    if (gid) {
      const content = document.getElementById('group-' + gid);
      if (content && content.style.maxHeight !== '0px') {
        content.style.maxHeight = content.scrollHeight + 'px';
      }
    }
  });
}

function toggleIdeaGroup(groupId) {
  const content = document.getElementById('group-' + groupId);
  const chevron = document.getElementById('chevron-' + groupId);
  if (!content || !chevron) return;
  if (content.style.maxHeight && content.style.maxHeight !== '0px') {
    content.style.maxHeight = '0px';
    content.style.overflow = 'hidden';
    chevron.textContent = '▸';
  } else {
    content.style.maxHeight = content.scrollHeight + 'px';
    content.style.overflow = 'visible';
    chevron.textContent = '▾';
  }
}

function toggleGroupSelectAll(el) {
  const group = el.dataset.group;
  const container = document.getElementById('group-' + group);
  if (!container) return;
  container.querySelectorAll('.idea-checkbox').forEach(cb => { cb.checked = el.checked; });
  updateBulkBar();
}

function renderIdeaCard(idea, showSlugCol) {
  const isContent = idea.type === 'content';
  const statusColor = IDEA_STATUS_COLORS[idea.status] || 'var(--muted)';
  const priorityColor = (idea.priority_score || 0) >= 70 ? '#4A5D23' : (idea.priority_score || 0) >= 40 ? '#B8860B' : 'var(--muted)';
  const date = idea.created_at ? new Date(idea.created_at).toLocaleDateString('es-ES', { day:'numeric', month:'short' }) : '';

  let h = `<div class="card" style="padding:12px 16px;opacity:${idea.status === 'executed' ? '0.6' : '1'};border-left:4px solid ${statusColor};">`;
  h += `<div style="display:flex;justify-content:space-between;align-items:flex-start;">`;
  h += `<input type="checkbox" class="idea-checkbox" data-idea-id="${idea.id}" data-slug="${idea._slug}" onclick="updateBulkBar()" style="margin-right:8px;margin-top:3px;cursor:pointer;flex-shrink:0;">`;
  h += `<div style="flex:1;min-width:0;">`;
  h += `<div style="font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:15px;line-height:1.3;cursor:pointer;color:var(--rust);" onclick="showIdeaDetail('${idea._slug}','${idea.id}')">${escHtml(idea.title || 'Sin título')}</div>`;
  if (idea.action) h += `<div style="font-size:13px;color:var(--muted);margin-top:4px;line-height:1.4;">${escHtml(idea.action)}</div>`;

  // Badges row
  h += `<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">`;
  if (isContent) {
    // Channel tags (multi-select pills)
    for (const ch of (idea.channels || [])) {
      const cc = IDEA_CHANNEL_COLORS[ch] || {bg:'#ECEFF1',fg:'#37474F'};
      const cfg = IDEA_CHANNEL_CONFIG[ch] || {icon:'📌',label:ch};
      h += `<span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:${cc.bg};color:${cc.fg};">${cfg.icon} ${cfg.label}</span>`;
    }
    // Source badge (always show)
    if (idea.source) {
      h += `<span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:#FFF3E0;color:#E65100;">${IDEA_SOURCE_LABELS[idea.source]||idea.source}</span>`;
    }
  } else {
    // Contact: single channel badge
    const channelBadge = IDEA_CHANNEL_LABELS[idea.target_channel] || idea.target_channel || '';
    if (channelBadge) h += `<span style="padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;background:var(--cyan);color:#fff;">${channelBadge}</span>`;
    if (idea.source) h += `<span style="padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;background:var(--navy);color:#fff;">${IDEA_SOURCE_LABELS[idea.source]||idea.source}</span>`;
  }
  if (showSlugCol) h += `<span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:var(--border);color:var(--text);">${idea._slug}</span>`;
  h += `</div>`; // end badges
  h += `</div>`; // end left

  // Right side: priority + actions
  h += `<div style="display:flex;gap:4px;align-items:center;margin-left:12px;flex-shrink:0;">`;
  if (idea.priority_score != null) h += `<span style="font-weight:700;font-size:14px;color:${priorityColor};margin-right:4px;">${Math.round(idea.priority_score)}</span>`;
  if (idea.status === 'new') {
    h += `<button onclick="updateIdeaStatus('${idea._slug}','${idea.id}','approved')" title="Aprobar" style="background:none;border:none;font-size:16px;cursor:pointer;">✅</button>`;
    h += `<button onclick="updateIdeaStatus('${idea._slug}','${idea.id}','rejected')" title="Rechazar" style="background:none;border:none;font-size:16px;cursor:pointer;">❌</button>`;
  } else {
    const statusLabels = { approved:'✅', rejected:'❌', executed:'✔️', new:'🆕' };
    h += `<span style="font-size:14px;" title="${idea.status}">${statusLabels[idea.status] || ''}</span>`;
  }
  h += `<button onclick="editIdea('${idea._slug}','${idea.id}')" title="Editar" style="background:none;border:none;font-size:14px;cursor:pointer;color:var(--muted);">✏️</button>`;
  h += `<button onclick="if(confirm('¿Eliminar esta idea?'))deleteIdea('${idea._slug}','${idea.id}')" title="Eliminar" style="background:none;border:none;font-size:14px;cursor:pointer;color:var(--muted);">🗑️</button>`;
  h += `</div>`; // end right

  h += `</div>`; // end flex row
  // Date footer
  if (date) h += `<div style="font-size:11px;color:var(--muted);margin-top:6px;">${date}</div>`;
  h += `</div>`; // end card
  return h;
}

// Helper function to check idea similarity using Levenshtein distance
function checkIdeaSimilarity(newIdea, existingIdeas) {
  // Simple similarity: Levenshtein ratio on title + description
  function similarity(a, b) {
    if (!a || !b) return 0;
    a = a.toLowerCase().trim();
    b = b.toLowerCase().trim();
    if (a === b) return 1;
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    if (longer.length === 0) return 1;
    const editDist = levenshtein(longer, shorter);
    return (longer.length - editDist) / longer.length;
  }
  
  function levenshtein(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i-1) === a.charAt(j-1)) matrix[i][j] = matrix[i-1][j-1];
        else matrix[i][j] = Math.min(matrix[i-1][j-1] + 1, matrix[i][j-1] + 1, matrix[i-1][j] + 1);
      }
    }
    return matrix[b.length][a.length];
  }
  
  const newText = (newIdea.title || '') + ' ' + (newIdea.description || '');
  const similar = [];
  
  for (const idea of existingIdeas) {
    if (idea.id === newIdea.id) continue; // skip self
    if (idea.status !== 'new' && idea.status !== 'approved') continue; // only check active ideas
    const existingText = (idea.title || '') + ' ' + (idea.description || '');
    const score = similarity(newText, existingText);
    if (score > 0.7) { // 70% similarity threshold
      similar.push({ idea, score });
    }
  }
  
  return similar.sort((a, b) => b.score - a.score);
}

async function updateIdeaStatus(slug, ideaId, status) {
  // Check for duplicates before approving
  if (status === 'approved') {
    const ideas = _ideasCache[slug] || [];
    const idea = ideas.find(i => i.id === ideaId);
    if (idea) {
      const allIdeas = ideas;
      const similar = checkIdeaSimilarity(idea, allIdeas);
      if (similar.length > 0) {
        const msg = `⚠️ Idea similar detectada:\n\n"${similar[0].idea.title}"\n(${Math.round(similar[0].score * 100)}% similar, status: ${similar[0].idea.status})\n\n¿Aprobar de todos modos?`;
        if (!confirm(msg)) return;
      }
    }
  }

  try {
    await fetch(MC_BASE + '/api/ideas/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, ideaId, status }) });
    if (status === 'approved') {
      showToast('✅ Idea aprobada — abriendo ejecución...');
      // Find the idea to get its details
      const ideas = _ideasCache[slug] || [];
      const idea = ideas.find(i => i.id === ideaId);
      if (idea) {
        // Open chat with execution context
        const normalized = typeof _normalizeIdea !== 'undefined' ? _normalizeIdea(Object.assign({}, idea)) : idea;
        _openIdeaExecution(slug, normalized);
      }
    } else if (status === 'rejected') {
      showToast('❌ Idea rechazada');
    }
    await loadIdeasData();
  } catch (e) { console.error('Error updating idea:', e); }
}

// Open chat to execute an approved idea with the right skill
function _openIdeaExecution(slug, idea) {
  // Map idea list/type to the skill that should execute it
  const IDEA_SKILL_MAP = {
    // Content lists → skills
    keywords: { skill: 'seo-content', action: 'Escribir artículo SEO' },
    trending: { skill: 'social-content', action: 'Crear contenido trending' },
    gaps: { skill: 'seo-content', action: 'Crear contenido para cubrir gap' },
    repurpose: { skill: 'content-atomizer', action: 'Atomizar contenido' },
    // Contact lists → skills
    medios: { skill: 'trust-engine', action: 'Outreach a medio' },
    partners: { skill: 'trust-engine', action: 'Contactar partner' },
    influencers: { skill: 'trust-engine', action: 'Contactar influencer' },
    outreach: { skill: 'outreach-sequence-builder', action: 'Crear secuencia outreach' },
  };

  const listConfig = IDEA_SKILL_MAP[idea.list] || { skill: null, action: 'Ejecutar idea' };
  const channels = (idea.channels || []).map(ch => {
    const cfg = (typeof IDEA_CHANNEL_CONFIG !== 'undefined' && IDEA_CHANNEL_CONFIG[ch]) || {};
    return (cfg.icon || '') + ' ' + (cfg.label || ch);
  }).join(', ');

  // Build the execution message
  let msg = '✅ Idea aprobada — ejecutar:\n\n';
  msg += '**' + (idea.title || 'Sin título') + '**\n';
  if (idea.action) msg += idea.action + '\n';
  if (channels) msg += 'Canales: ' + channels + '\n';
  if (listConfig.skill) msg += '\nSkill sugerido: `' + listConfig.skill + '`';
  msg += '\n\nCliente: ' + slug;

  // Open the chat sidebar with this idea as context
  mcChatOpenIdea(slug, idea.id, idea.title || 'Idea', idea.list || '', idea.channels || []);

  // Pre-fill the chat input with the execution message
  setTimeout(() => {
    const input = document.querySelector('#mc-sidebar-chat-panel .v2-chat-in input') ||
                  document.getElementById('v2-chat-input');
    if (input) {
      input.value = msg;
      input.focus();
    }
  }, 300);
}

async function deleteIdea(slug, ideaId) {
  try {
    await fetch(MC_BASE + '/api/ideas', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, ideaId }) });
    await loadIdeasData();
  } catch (e) { console.error('Error deleting idea:', e); }
}

function showCreateIdeaForm() {
  let slugVal = _getSelectedClientSlug();
  // If "all", pick from available clients
  let slugOptions = '';
  if (!slugVal && typeof CLIENTS !== 'undefined') {
    for (const [id, client] of Object.entries(CLIENTS)) {
      slugOptions += `<option value="${id}">${client.name}</option>`;
    }
  }
  const slugField = slugVal
    ? `<input type="hidden" id="idea-form-slug" value="${slugVal}">`
    : `<div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Cliente</label><select id="idea-form-slug" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);">${slugOptions}</select></div>`;

  const overlay = document.createElement('div');
  overlay.id = 'idea-form-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:500;display:flex;align-items:center;justify-content:center;';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `<div style="background:var(--card);border:3px solid var(--ink);border-radius:12px;padding:28px;width:500px;max-width:90vw;max-height:90vh;overflow-y:auto;box-shadow:6px 6px 0 var(--ink);">
    <h3 style="font-family:'Space Grotesk',sans-serif;margin-bottom:16px;color:var(--navy);">💡 Nueva Idea</h3>
    ${slugField}
    <div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Título</label><input id="idea-form-title" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" placeholder="Título de la idea"></div>
    <div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Descripción</label><textarea id="idea-form-desc" rows="3" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);resize:vertical;" placeholder="Descripción detallada"></textarea></div>
    <div style="margin-bottom:12px;">
      <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Lista / Grupo</label>
      <select id="idea-form-list" onchange="updateIdeaFormByList()" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);">
        <optgroup label="📝 Contenido">
          <option value="keywords">🔍 Keywords para rankear</option>
          <option value="trending">🔥 Contenido trending</option>
          <option value="gaps">🏆 Gaps vs competencia</option>
          <option value="repurpose">♻️ Contenido para reutilizar</option>
        </optgroup>
        <optgroup label="👥 Contactos">
          <option value="medios">📢 Medios donde aparecer</option>
          <option value="partners">🤝 Partners</option>
          <option value="influencers">🎯 Influencers</option>
          <option value="outreach">📨 Prospects</option>
        </optgroup>
      </select>
    </div>
    <input type="hidden" id="idea-form-type" value="content">
    <div style="margin-bottom:12px;">
      <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Acción concreta (¿qué hacer con esta idea?)</label>
      <textarea id="idea-form-action" rows="3" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);resize:vertical;" placeholder="Ej: Escribir artículo SEO para rankear en 'keyword X' (vol: 2K, KD: 30). Gap: ningún competidor cubre..."></textarea>
    </div>
    <div id="idea-form-channels-wrap" style="margin-bottom:12px;">
      <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Canales</label>
      <div id="idea-form-channels-container"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
      <div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Fuente</label><select id="idea-form-source" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);"><option value="manual">💡 Manual</option><option value="seo_geo">🔍 SEO/GEO</option><option value="signal">📡 Signal</option><option value="competitor">🏆 Competencia</option><option value="meeting">🗣️ Reunión</option><option value="trust_engine">🔄 Trust Engine</option><option value="paa">❓ PAA</option></select></div>
      <div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Prioridad (0-100)</label><input id="idea-form-priority" type="number" min="0" max="100" value="50" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);"></div>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button onclick="this.closest('#idea-form-overlay').remove()" style="padding:8px 18px;border:2px solid var(--border);border-radius:8px;background:var(--card);color:var(--text);font-weight:600;cursor:pointer;">Cancelar</button>
      <button onclick="submitCreateIdea()" style="padding:8px 18px;border:2px solid var(--ink);border-radius:8px;background:var(--rust);color:#fff;font-weight:700;cursor:pointer;box-shadow:3px 3px 0 var(--ink);">Crear Idea</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  // Default list to match current tab
  const listSelect = document.getElementById('idea-form-list');
  if (listSelect) {
    listSelect.value = currentIdeaTab === 'content' ? 'keywords' : 'medios';
  }
  updateIdeaFormByList();
}

function updateIdeaFormByList() {
  const listVal = document.getElementById('idea-form-list')?.value || 'keywords';
  const cfg = IDEA_LIST_CONFIG[listVal] || {};
  const isContentList = CONTENT_LISTS.includes(listVal);
  const typeInput = document.getElementById('idea-form-type');
  if (typeInput) typeInput.value = isContentList ? 'content' : 'contact';
  const container = document.getElementById('idea-form-channels-container');
  const channelsWrap = document.getElementById('idea-form-channels-wrap');
  if (isContentList) {
    if (channelsWrap) channelsWrap.style.display = '';
    if (container) container.innerHTML = `<div style="display:flex;gap:12px;flex-wrap:wrap;">
      <label style="font-size:13px;cursor:pointer;"><input type="checkbox" name="idea-channel-cb" value="blog" checked> 📰 Blog</label>
      <label style="font-size:13px;cursor:pointer;"><input type="checkbox" name="idea-channel-cb" value="instagram"> 📸 Instagram</label>
      <label style="font-size:13px;cursor:pointer;"><input type="checkbox" name="idea-channel-cb" value="linkedin"> 💼 LinkedIn</label>
      <label style="font-size:13px;cursor:pointer;"><input type="checkbox" name="idea-channel-cb" value="twitter"> 🐦 Twitter</label>
    </div>`;
  } else {
    if (channelsWrap) channelsWrap.style.display = 'none';
  }
}

function updateIdeaFormChannels() {
  // Legacy compat — just delegate to list-based logic
  updateIdeaFormByList();
}

async function submitCreateIdea() {
  const slug = document.getElementById('idea-form-slug')?.value;
  const title = document.getElementById('idea-form-title')?.value;
  if (!slug || !title) { alert('Slug y título son obligatorios'); return; }
  const listVal = document.getElementById('idea-form-list')?.value || 'keywords';
  const isContentList = CONTENT_LISTS.includes(listVal);
  const ideaType = isContentList ? 'content' : 'contact';
  const idea = {
    title,
    description: document.getElementById('idea-form-desc')?.value || '',
    action: document.getElementById('idea-form-action')?.value || '',
    list: listVal,
    type: ideaType,
    source: document.getElementById('idea-form-source')?.value || 'manual',
    priority_score: parseFloat(document.getElementById('idea-form-priority')?.value) || 50,
    status: 'new',
    approved_at: null, approved_by: null, task_id: null
  };
  if (ideaType === 'content') {
    const checked = [...document.querySelectorAll('input[name="idea-channel-cb"]:checked')].map(cb => cb.value);
    idea.channels = checked.length > 0 ? checked : ['blog'];
  } else {
    idea.target_channel = listVal;
  }
  try {
    await fetch(MC_BASE + '/api/ideas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, idea }) });
    document.getElementById('idea-form-overlay')?.remove();
    await loadIdeasData();
  } catch (e) { alert('Error al crear idea: ' + e.message); }
}

// ==================== IDEA BANK: BULK ACTIONS & EDIT ====================
function updateBulkBar() {
  const checked = document.querySelectorAll('.idea-checkbox:checked');
  const bar = document.getElementById('idea-bulk-bar');
  if (checked.length > 0) {
    bar.style.display = 'flex';
    document.getElementById('bulk-count').textContent = checked.length + ' seleccionada' + (checked.length > 1 ? 's' : '');
  } else {
    bar.style.display = 'none';
  }
}

async function bulkAction(status) {
  const checked = document.querySelectorAll('.idea-checkbox:checked');
  
  // Check for duplicates before bulk approving
  if (status === 'approved') {
    const ideaIds = [];
    const slugs = new Set();
    checked.forEach(cb => {
      ideaIds.push(cb.dataset.ideaId);
      slugs.add(cb.dataset.slug);
    });
    
    // Get all ideas from all selected slugs
    const allIdeas = [];
    slugs.forEach(slug => {
      const ideas = _ideasCache[slug] || [];
      ideas.forEach(i => { i._slug = slug; allIdeas.push(i); });
    });
    
    const toApprove = allIdeas.filter(i => ideaIds.includes(i.id));
    
    // Check for duplicates within the batch
    const duplicates = [];
    for (let i = 0; i < toApprove.length; i++) {
      for (let j = i + 1; j < toApprove.length; j++) {
        const sim = checkIdeaSimilarity(toApprove[i], [toApprove[j]]);
        if (sim.length > 0 && sim[0].score > 0.7) {
          duplicates.push({ a: toApprove[i].title, b: toApprove[j].title, score: sim[0].score });
        }
      }
    }
    
    if (duplicates.length > 0) {
      const msg = `⚠️ ${duplicates.length} duplicado(s) detectado(s) en el batch:\n\n` + 
        duplicates.map(d => `• "${d.a}" vs "${d.b}" (${Math.round(d.score*100)}%)`).join('\n') +
        '\n\n¿Aprobar de todos modos?';
      if (!confirm(msg)) return;
    }
  }
  
  const promises = [];
  checked.forEach(cb => {
    const slug = cb.dataset.slug;
    const ideaId = cb.dataset.ideaId;
    promises.push(
      fetch(MC_BASE + '/api/ideas/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, ideaId, status })
      })
    );
  });
  await Promise.all(promises);
  document.getElementById('idea-bulk-bar').style.display = 'none';
  if (status === 'approved') showToast('✅ ' + checked.length + ' idea(s) aprobada(s) — notificaciones pendientes en Discord');
  else if (status === 'rejected') showToast('❌ ' + checked.length + ' idea(s) rechazada(s)');
  await loadIdeasData();
}

function clearBulkSelection() {
  document.querySelectorAll('.idea-checkbox:checked').forEach(cb => cb.checked = false);
  document.getElementById('idea-bulk-bar').style.display = 'none';
}

function toggleSelectAll(checked) {
  document.querySelectorAll('.idea-checkbox').forEach(cb => { cb.checked = checked; });
  updateBulkBar();
}

function editIdea(slug, ideaId) {
  const allIdeas = _ideasCache[slug] || [];
  const idea = allIdeas.find(i => i.id === ideaId);
  if (!idea) return;

  // Reuse the create form but in edit mode
  const overlay = document.createElement('div');
  overlay.id = 'idea-form-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:500;display:flex;align-items:center;justify-content:center;';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  const ideaType = idea.type || 'content';
  const isContent = ideaType === 'content';
  const ideaList = idea.list || (isContent ? 'keywords' : 'outreach');

  // Build channel checkboxes for content
  const contentChannels = ['blog','instagram','linkedin','twitter'];
  const contentChannelLabels = {blog:'📰 Blog',instagram:'📸 Instagram',linkedin:'💼 LinkedIn',twitter:'🐦 Twitter'};
  const checkedChannels = idea.channels || [];
  let channelsHtml = '';
  if (isContent) {
    channelsHtml = `<div style="display:flex;gap:12px;flex-wrap:wrap;">`;
    for (const ch of contentChannels) {
      channelsHtml += `<label style="font-size:13px;cursor:pointer;"><input type="checkbox" name="idea-channel-cb" value="${ch}" ${checkedChannels.includes(ch)?'checked':''}> ${contentChannelLabels[ch]||ch}</label>`;
    }
    channelsHtml += `</div>`;
  }

  // Build list select options with selected state
  let listOptionsHtml = '';
  listOptionsHtml += '<optgroup label="📝 Contenido">';
  for (const k of CONTENT_LISTS) { const c = IDEA_LIST_CONFIG[k]; listOptionsHtml += `<option value="${k}" ${ideaList===k?'selected':''}>${c.icon} ${c.label}</option>`; }
  listOptionsHtml += '</optgroup><optgroup label="👥 Contactos">';
  for (const k of CONTACT_LISTS) { const c = IDEA_LIST_CONFIG[k]; listOptionsHtml += `<option value="${k}" ${ideaList===k?'selected':''}>${c.icon} ${c.label}</option>`; }
  listOptionsHtml += '</optgroup>';

  overlay.innerHTML = `<div style="background:var(--card);border:3px solid var(--ink);border-radius:12px;padding:28px;width:500px;max-width:90vw;max-height:90vh;overflow-y:auto;box-shadow:6px 6px 0 var(--ink);">
    <h3 style="font-family:'Space Grotesk',sans-serif;margin-bottom:16px;color:var(--navy);">✏️ Editar Idea</h3>
    <input type="hidden" id="idea-form-slug" value="${slug}">
    <input type="hidden" id="idea-edit-id" value="${idea.id}">
    <input type="hidden" id="idea-form-type" value="${ideaType}">
    <div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Título</label><input id="idea-form-title" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" value="${(idea.title||'').replace(/"/g,'&quot;')}"></div>
    <div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Descripción</label><textarea id="idea-form-desc" rows="3" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);resize:vertical;">${idea.description||''}</textarea></div>
    <div style="margin-bottom:12px;">
      <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Lista / Grupo</label>
      <select id="idea-form-list" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);">
        ${listOptionsHtml}
      </select>
    </div>
    <div style="margin-bottom:12px;">
      <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Acción concreta (¿qué hacer con esta idea?)</label>
      <textarea id="idea-form-action" rows="3" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);resize:vertical;" placeholder="Ej: Escribir artículo SEO para rankear en 'keyword X'...">${escHtml(idea.action||'')}</textarea>
    </div>
    ${isContent ? `<div id="idea-form-channels-wrap" style="margin-bottom:12px;">
      <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Canales</label>
      <div id="idea-form-channels-container">${channelsHtml}</div>
    </div>` : ''}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
      <div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Fuente</label><select id="idea-form-source" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);"><option value="manual" ${idea.source==='manual'?'selected':''}>💡 Manual</option><option value="seo_geo" ${idea.source==='seo_geo'?'selected':''}>🔍 SEO/GEO</option><option value="signal" ${idea.source==='signal'?'selected':''}>📡 Signal</option><option value="competitor" ${idea.source==='competitor'?'selected':''}>🏆 Competencia</option><option value="meeting" ${idea.source==='meeting'?'selected':''}>🗣️ Reunión</option><option value="trust_engine" ${idea.source==='trust_engine'?'selected':''}>🔄 Trust Engine</option><option value="paa" ${idea.source==='paa'?'selected':''}>❓ PAA</option></select></div>
      <div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Prioridad (0-100)</label><input id="idea-form-priority" type="number" min="0" max="100" value="${idea.priority_score ?? 50}" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);"></div>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button onclick="this.closest('#idea-form-overlay').remove()" style="padding:8px 18px;border:2px solid var(--border);border-radius:8px;background:var(--card);color:var(--text);font-weight:600;cursor:pointer;">Cancelar</button>
      <button onclick="submitEditIdea()" style="padding:8px 18px;border:2px solid var(--ink);border-radius:8px;background:var(--rust);color:#fff;font-weight:700;cursor:pointer;box-shadow:3px 3px 0 var(--ink);">Guardar cambios</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
}

async function submitEditIdea() {
  const slug = document.getElementById('idea-form-slug')?.value;
  const ideaId = document.getElementById('idea-edit-id')?.value;
  const title = document.getElementById('idea-form-title')?.value;
  if (!slug || !title || !ideaId) { alert('Slug, ID y título son obligatorios'); return; }
  const listVal = document.getElementById('idea-form-list')?.value || 'keywords';
  const isContentList = CONTENT_LISTS.includes(listVal);
  const ideaType = isContentList ? 'content' : 'contact';
  const idea = {
    id: ideaId,
    title,
    description: document.getElementById('idea-form-desc')?.value || '',
    action: document.getElementById('idea-form-action')?.value || '',
    list: listVal,
    type: ideaType,
    source: document.getElementById('idea-form-source')?.value || 'manual',
    priority_score: parseFloat(document.getElementById('idea-form-priority')?.value) || 50,
  };
  if (isContentList) {
    const checked = [...document.querySelectorAll('input[name="idea-channel-cb"]:checked')].map(cb => cb.value);
    idea.channels = checked.length > 0 ? checked : ['blog'];
  } else {
    idea.target_channel = listVal;
  }
  try {
    await fetch(MC_BASE + '/api/ideas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, idea }) });
    document.getElementById('idea-form-overlay')?.remove();
    await loadIdeasData();
  } catch (e) { alert('Error al guardar: ' + e.message); }
}

// ==================== TOAST & HELPERS ====================
function escHtml(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }



// ==================== IDEA DETAIL VIEW ====================
function showIdeaDetail(slug, ideaId) {
  const allIdeas = _ideasCache[slug] || [];
  const idea = allIdeas.find(i => i.id === ideaId);
  if (!idea) return;

  const statusColors = { new: '#3B82F6', approved: '#4A5D23', rejected: '#C0392B', executed: '#888' };
  const statusLabels = { new: 'Nueva', approved: 'Aprobada', rejected: 'Rechazada', executed: 'Ejecutada' };

  let html = '<div style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:400;display:flex;align-items:center;justify-content:center;" onclick="if(event.target===this)this.remove()">';
  html += '<div style="background:var(--card);border:2px solid var(--ink);border-radius:12px;max-width:600px;width:90%;max-height:80vh;overflow-y:auto;padding:24px;" onclick="event.stopPropagation()">';

  // Header
  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">';
  html += '<h2 style="font-family:\'Space Grotesk\';margin:0;font-size:20px;color:var(--navy);">' + escHtml(idea.title) + '</h2>';
  html += '<button onclick="this.closest(\'[style*=fixed]\').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--muted);">✕</button>';
  html += '</div>';

  // Status pill
  const sc = statusColors[idea.status] || '#888';
  html += '<div style="margin-bottom:16px;"><span class="pill-sm" style="background:' + sc + '20;color:' + sc + ';font-size:13px;">' + (statusLabels[idea.status] || idea.status) + '</span></div>';

  // Action (star of the show)
  if (idea.action) {
    html += '<div style="margin-bottom:16px;background:var(--bg);border-left:4px solid var(--rust);padding:12px 16px;border-radius:0 8px 8px 0;"><div style="font-size:12px;color:var(--muted);margin-bottom:4px;font-weight:600;">🎯 Acción</div><div style="font-size:15px;line-height:1.6;">' + escHtml(idea.action) + '</div></div>';
  }

  // Description
  if (idea.description) {
    html += '<div style="margin-bottom:16px;"><div style="font-size:13px;color:var(--muted);margin-bottom:4px;">Descripción</div><div style="font-size:15px;line-height:1.6;">' + escHtml(idea.description) + '</div></div>';
  }

  // Metadata grid
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">';
  // List
  var listCfg = (typeof IDEA_LIST_CONFIG !== 'undefined' && IDEA_LIST_CONFIG[idea.list]) || { icon: '📌', label: idea.list || '—' };
  html += '<div><div style="font-size:12px;color:var(--muted);">Lista</div><div style="font-size:14px;">' + listCfg.icon + ' ' + listCfg.label + '</div></div>';
  const srcLabel = (typeof IDEA_SOURCE_LABELS !== 'undefined' && IDEA_SOURCE_LABELS[idea.source]) || idea.source || '—';
  html += '<div><div style="font-size:12px;color:var(--muted);">Fuente</div><div style="font-size:14px;">' + srcLabel + '</div></div>';
  const scoreColor = (idea.priority_score||0) >= 70 ? '#4A5D23' : (idea.priority_score||0) >= 40 ? '#E6A817' : '#888';
  html += '<div><div style="font-size:12px;color:var(--muted);">Prioridad</div><div style="font-size:18px;font-weight:700;color:' + scoreColor + ';">' + (idea.priority_score || '—') + '</div></div>';
  html += '<div><div style="font-size:12px;color:var(--muted);">Creada</div><div style="font-size:14px;">' + (idea.created_at ? new Date(idea.created_at).toLocaleDateString('es-ES') : '—') + '</div></div>';
  html += '</div>'; // end grid

  // Channels (content)
  if (idea.type === 'content' && idea.channels && idea.channels.length > 0) {
    html += '<div style="margin-bottom:16px;"><div style="font-size:12px;color:var(--muted);margin-bottom:6px;">Canales</div><div style="display:flex;gap:6px;flex-wrap:wrap;">';
    idea.channels.forEach(function(ch) {
      var cfg = (typeof IDEA_CHANNEL_CONFIG !== 'undefined' && IDEA_CHANNEL_CONFIG[ch]) || { icon: '📄', label: ch };
      html += '<span class="pill-sm" style="background:var(--bg);border:1px solid var(--border);">' + cfg.icon + ' ' + cfg.label + '</span>';
    });
    html += '</div></div>';
  }

  // Contact target channel
  if (idea.type === 'contact' && idea.target_channel) {
    var cfg2 = (typeof IDEA_CHANNEL_CONFIG !== 'undefined' && IDEA_CHANNEL_CONFIG[idea.target_channel]) || { icon: '📄', label: idea.target_channel };
    html += '<div style="margin-bottom:16px;"><div style="font-size:12px;color:var(--muted);margin-bottom:6px;">Canal</div><span class="pill-sm" style="background:var(--bg);border:1px solid var(--border);">' + cfg2.icon + ' ' + cfg2.label + '</span></div>';
  }

  // Source data
  if (idea.source_data && Object.keys(idea.source_data).length > 0) {
    html += '<div style="margin-bottom:16px;"><div style="font-size:12px;color:var(--muted);margin-bottom:6px;">Datos de la fuente</div>';
    html += '<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:12px;font-size:13px;">';
    html += '<pre style="margin:0;white-space:pre-wrap;word-break:break-all;font-size:12px;">' + escHtml(JSON.stringify(idea.source_data, null, 2)) + '</pre>';
    html += '</div></div>';
  }

  // Approval info
  if (idea.approved_at) {
    html += '<div style="margin-bottom:16px;"><div style="font-size:12px;color:var(--muted);margin-bottom:4px;">Aprobación</div>';
    html += '<div style="font-size:14px;">✅ ' + new Date(idea.approved_at).toLocaleString('es-ES') + (idea.approved_by ? ' por ' + escHtml(idea.approved_by) : '') + '</div></div>';
  }

  // Action buttons
  html += '<div style="display:flex;gap:8px;margin-top:20px;padding-top:16px;border-top:1px solid var(--border);">';
  if (idea.status === 'new') {
    html += '<button onclick="updateIdeaStatus(\'' + slug + '\',\'' + idea.id + '\',\'approved\');this.closest(\'[style*=fixed]\').remove()" style="background:#4A5D23;color:#fff;border:none;padding:8px 20px;border-radius:6px;cursor:pointer;font-weight:600;">✅ Aprobar</button>';
    html += '<button onclick="updateIdeaStatus(\'' + slug + '\',\'' + idea.id + '\',\'rejected\');this.closest(\'[style*=fixed]\').remove()" style="background:#C0392B;color:#fff;border:none;padding:8px 20px;border-radius:6px;cursor:pointer;font-weight:600;">❌ Rechazar</button>';
  }
  html += '<button onclick="editIdea(\'' + slug + '\',\'' + idea.id + '\');this.closest(\'[style*=fixed]\').remove()" style="background:var(--bg);border:2px solid var(--border);padding:8px 20px;border-radius:6px;cursor:pointer;">✏️ Editar</button>';
  html += '<button onclick="this.closest(\'[style*=fixed]\').remove()" style="background:var(--bg);border:2px solid var(--border);padding:8px 20px;border-radius:6px;cursor:pointer;margin-left:auto;">Cerrar</button>';
  html += '</div>';

  html += '</div></div>'; // end modal

  var div = document.createElement('div');
  div.innerHTML = html;
  document.body.appendChild(div.firstChild);
}

// ==================== SOURCE ANALYTICS ====================
let _analyticsOpen = false;
function toggleAnalytics() {
  _analyticsOpen = !_analyticsOpen;
  document.getElementById('analytics-content').style.display = _analyticsOpen ? 'block' : 'none';
  document.getElementById('analytics-chevron').textContent = _analyticsOpen ? '▾' : '▸';
  if (_analyticsOpen) renderAnalytics();
}

function renderAnalytics() {
  // Collect all ideas from cache
  const allIdeas = [];
  for (const [slug, ideas] of Object.entries(_ideasCache)) {
    ideas.forEach(function(idea) { allIdeas.push(idea); });
  }
  if (allIdeas.length === 0) {
    document.getElementById('analytics-content').innerHTML = '<div style="color:var(--muted);font-size:13px;padding:12px;">No hay ideas para analizar.</div>';
    return;
  }

  // Group by source
  const sourceStats = {};
  allIdeas.forEach(function(idea) {
    const src = idea.source || 'unknown';
    if (!sourceStats[src]) sourceStats[src] = { total: 0, approved: 0, rejected: 0, pending: 0 };
    sourceStats[src].total++;
    if (idea.status === 'approved' || idea.status === 'executed') sourceStats[src].approved++;
    else if (idea.status === 'rejected') sourceStats[src].rejected++;
    else sourceStats[src].pending++;
  });

  // Render as table
  let html = '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
  html += '<tr><th style="text-align:left;padding:8px;border-bottom:2px solid var(--border);">Fuente</th>';
  html += '<th style="text-align:center;padding:8px;border-bottom:2px solid var(--border);">Total</th>';
  html += '<th style="text-align:center;padding:8px;border-bottom:2px solid var(--border);">Aprobadas</th>';
  html += '<th style="text-align:center;padding:8px;border-bottom:2px solid var(--border);">Rechazadas</th>';
  html += '<th style="text-align:center;padding:8px;border-bottom:2px solid var(--border);">Tasa aprobación</th>';
  html += '<th style="text-align:center;padding:8px;border-bottom:2px solid var(--border);">Visual</th></tr>';

  const sorted = Object.entries(sourceStats).sort(function(a,b) { return b[1].total - a[1].total; });
  const maxTotal = Math.max.apply(null, sorted.map(function(s) { return s[1].total; }));

  sorted.forEach(function(entry) {
    const src = entry[0], stats = entry[1];
    const rate = stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0;
    const rateColor = rate >= 60 ? '#4A5D23' : rate >= 30 ? '#E6A817' : '#C0392B';
    const barWidth = stats.total > 0 ? Math.round((stats.approved / maxTotal) * 100) : 0;
    const sourceLabel = (typeof IDEA_SOURCE_LABELS !== 'undefined' && IDEA_SOURCE_LABELS[src]) || src;
    html += '<tr>';
    html += '<td style="padding:8px;border-bottom:1px solid var(--border);">' + sourceLabel + '</td>';
    html += '<td style="text-align:center;padding:8px;border-bottom:1px solid var(--border);font-weight:600;">' + stats.total + '</td>';
    html += '<td style="text-align:center;padding:8px;border-bottom:1px solid var(--border);color:#4A5D23;">' + stats.approved + '</td>';
    html += '<td style="text-align:center;padding:8px;border-bottom:1px solid var(--border);color:#C0392B;">' + stats.rejected + '</td>';
    html += '<td style="text-align:center;padding:8px;border-bottom:1px solid var(--border);font-weight:600;color:' + rateColor + ';">' + rate + '%</td>';
    html += '<td style="padding:8px;border-bottom:1px solid var(--border);"><div style="background:var(--border);border-radius:4px;height:8px;width:100%;"><div style="background:#4A5D23;border-radius:4px;height:8px;width:' + barWidth + '%;"></div></div></td>';
    html += '</tr>';
  });
  html += '</table>';

  // Distribution by list
  const listStats = {};
  allIdeas.forEach(function(idea) {
    var normalized = typeof _normalizeIdea !== 'undefined' ? _normalizeIdea(Object.assign({}, idea)) : idea;
    var lst = normalized.list || '_none';
    if (!listStats[lst]) listStats[lst] = 0;
    listStats[lst]++;
  });

  if (Object.keys(listStats).length > 0) {
    html += '<div style="margin-top:16px;font-family:\'Space Grotesk\';font-size:14px;font-weight:600;color:var(--navy);">📋 Distribución por Lista</div>';
    html += '<div style="display:flex;gap:12px;margin-top:8px;flex-wrap:wrap;">';
    Object.entries(listStats).sort(function(a,b) { return b[1] - a[1]; }).forEach(function(entry) {
      var lst = entry[0], count = entry[1];
      var cfg = (typeof IDEA_LIST_CONFIG !== 'undefined' && IDEA_LIST_CONFIG[lst]) || { icon: '📌', label: lst };
      html += '<div class="card" style="padding:8px 14px;text-align:center;min-width:80px;"><div style="font-size:20px;">' + cfg.icon + '</div><div style="font-size:12px;color:var(--muted);">' + cfg.label + '</div><div style="font-size:18px;font-weight:700;">' + count + '</div></div>';
    });
    html += '</div>';
  }

  // Channel distribution (content ideas only)
  const channelStats = {};
  allIdeas.filter(function(i) { return i.type === 'content'; }).forEach(function(idea) {
    (idea.channels || []).forEach(function(ch) {
      if (!channelStats[ch]) channelStats[ch] = 0;
      channelStats[ch]++;
    });
  });

  if (Object.keys(channelStats).length > 0) {
    html += '<div style="margin-top:16px;font-family:\'Space Grotesk\';font-size:14px;font-weight:600;color:var(--navy);">📱 Distribución por Canal</div>';
    html += '<div style="display:flex;gap:12px;margin-top:8px;flex-wrap:wrap;">';
    Object.entries(channelStats).sort(function(a,b) { return b[1] - a[1]; }).forEach(function(entry) {
      var ch = entry[0], count = entry[1];
      var cfg = (typeof IDEA_CHANNEL_CONFIG !== 'undefined' && IDEA_CHANNEL_CONFIG[ch]) || { icon: '📄', label: ch };
      html += '<div class="card" style="padding:8px 14px;text-align:center;min-width:80px;"><div style="font-size:20px;">' + cfg.icon + '</div><div style="font-size:12px;color:var(--muted);">' + cfg.label + '</div><div style="font-size:18px;font-weight:700;">' + count + '</div></div>';
    });
    html += '</div>';
  }

  document.getElementById('analytics-content').innerHTML = html;
}

// ========== POOL DE IDEAS EN PROJECT DETAIL ==========

// Taxonomy constants for pieces
const PIECE_CHANNELS = {
  owned: { label:'Propio', items:['blog','email','youtube','newsletter','web'] },
  social: { label:'Social', items:['linkedin','instagram','tiktok','x','facebook'] },
  earned: { label:'Ganado', items:['guest-post','pr','podcast-guest','backlink'] },
  paid: { label:'Pagado', items:['paid-search','paid-social','sponsored'] }
};
const PIECE_INTENTS = {
  discover: { icon:'🔍', label:'Descubrir (SEO)', color:'#3B82F6' },
  engage: { icon:'🔥', label:'Engagement', color:'#F59E0B' },
  nurture: { icon:'💌', label:'Nutrir', color:'#8B5CF6' },
  convert: { icon:'🎯', label:'Convertir', color:'#EF4444' }
};
const PIECE_FORMATS = [
  'long-article','short-post','carousel','reel','thread',
  'infographic','email','ad-copy','newsletter','video','case-study','checklist'
];
const PIECE_CH_ICON = {
  blog:'📰', email:'📧', youtube:'▶️', newsletter:'📬', web:'🌐',
  linkedin:'💼', instagram:'📸', tiktok:'🎵', x:'𝕏', facebook:'👥',
  'guest-post':'✍️', pr:'📣', 'podcast-guest':'🎙️', backlink:'🔗',
  'paid-search':'🔎', 'paid-social':'📱', sponsored:'💰'
};

let _poolProjectId = null;
let _poolIdeas = [];
let _poolSelected = new Set();
let _unassignedOpen = false;

async function _loadUnassignedIdeas(projectId) {
  _poolProjectId = projectId;
  const slug = _prjSlug;
  if (!slug) return;
  try {
    // Get ideas assigned to this project but NOT in any task
    const res = await fetch(getApiBase() + '/api/ideas?slug=' + slug + '&project=' + projectId);
    const data = await res.json();
    const allIdeas = data[slug] || [];
    // Find which idea IDs are already in tasks
    const p = _prjData.find(pr => pr.id === projectId);
    const taskIdeaIds = new Set();
    if (p) for (const t of p.tasks) for (const iid of (t.idea_ids || [])) taskIdeaIds.add(iid);
    // Unassigned = in project but not in any task
    _poolIdeas = allIdeas.filter(i => !taskIdeaIds.has(i.id));
  } catch { _poolIdeas = []; }
  _renderUnassignedIdeas();
}

function _renderUnassignedIdeas() {
  const el = document.getElementById('project-pool-section');
  if (!el) return;
  if (_poolIdeas.length === 0) { el.innerHTML = ''; return; }

  const arrow = _unassignedOpen ? '▼' : '▶';
  let html = `<div style="border-top:1px solid var(--border);padding-top:12px;margin-top:16px;">
    <div style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 0;" onclick="_unassignedOpen=!_unassignedOpen;_renderUnassignedIdeas();">
      <span style="font-size:11px;color:var(--muted);">${arrow}</span>
      <span style="font-size:12px;color:var(--muted);font-weight:600;">⚠️ Ideas sin asignar a tarea (${_poolIdeas.length})</span>
    </div>`;

  if (_unassignedOpen) {
    html += '<div style="padding:8px 0;">';
    for (const idea of _poolIdeas) {
      const listCfg = IDEA_LIST_CONFIG && IDEA_LIST_CONFIG[idea.list];
      const listIcon = listCfg ? listCfg.icon + ' ' : '';
      html += `<div style="display:flex;align-items:center;gap:8px;padding:6px 12px;border:1px solid var(--border);border-radius:6px;margin-bottom:3px;font-size:13px;">
        <span style="flex:1;">${listIcon}${esc(idea.title)}</span>
        <button onclick="_removeFromPool('${idea.id}')" style="background:none;border:none;cursor:pointer;font-size:11px;opacity:0.4;color:var(--red);" title="Quitar del proyecto">✕</button>
      </div>`;
    }
    html += '</div>';
  }
  html += '</div>';
  el.innerHTML = html;
}

function _togglePoolSelect(ideaId, rowEl) {
  if (_poolSelected.has(ideaId)) _poolSelected.delete(ideaId);
  else _poolSelected.add(ideaId);
  // Update checkbox
  if (rowEl) {
    const cb = rowEl.querySelector('input[type=checkbox]');
    if (cb) cb.checked = _poolSelected.has(ideaId);
  }
  // Update batch button
  const btn = document.getElementById('pool-batch-btn');
  if (btn) {
    btn.style.display = _poolSelected.size > 0 ? '' : 'none';
    btn.textContent = 'Crear Batch (' + _poolSelected.size + ')';
  }
}

async function _showAddIdeaForm() {
  const title = prompt('Título de la idea:');
  if (!title) return;
  const type = prompt('Tipo: content / contact', 'content');
  if (!type) return;
  const list = prompt('Lista: keywords / trending / gaps / repurpose / medios / partners / influencers / outreach', 'keywords');
  try {
    await fetch(getApiBase() + '/api/ideas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: _prjSlug,
        idea: { title, type: type || 'content', list: list || 'keywords', source: 'manual', project_ids: [_poolProjectId] }
      })
    });
    _loadUnassignedIdeas(_poolProjectId);
    if (typeof showToast === 'function') showToast('💡 Idea añadida al pool');
  } catch (e) { alert('Error: ' + e.message); }
}

async function _showAddPieceForm(ideaId) {
  const allChannels = Object.values(PIECE_CHANNELS).flatMap(g => g.items);
  const channel = prompt('Canal: ' + allChannels.join(', '), 'blog');
  if (!channel) return;
  const intent = prompt('Objetivo: discover / engage / nurture / convert', 'discover');
  if (!intent) return;
  const format = prompt('Formato: ' + PIECE_FORMATS.join(', '), 'long-article');
  if (!format) return;
  const channelType = Object.entries(PIECE_CHANNELS).find(([_, g]) => g.items.includes(channel))?.[0] || 'owned';
  try {
    await fetch(getApiBase() + '/api/ideas/add-piece', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: _prjSlug,
        ideaId,
        piece: { channel, channel_type: channelType, intent, format }
      })
    });
    _loadUnassignedIdeas(_poolProjectId);
    if (typeof showToast === 'function') showToast('➕ Pieza añadida');
  } catch (e) { alert('Error: ' + e.message); }
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

  // Ideas/Contacts section (for tasks with idea_ids)
  const ideaIds = task.idea_ids || [];
  if (taskType === 'content' || taskType === 'outreach' || ideaIds.length > 0) {
    const sectionLabel = taskType === 'outreach' ? '👥 Contactos' : '💡 Ideas';
    html += `<div style="border-top:2px solid var(--border);padding-top:20px;margin-top:20px;">
      <div style="font-family:'Space Grotesk';font-size:16px;font-weight:600;color:var(--navy);margin-bottom:12px;">
        ${sectionLabel} (${ideaIds.length})
      </div>`;

    if (ideaIds.length === 0) {
      html += '<div style="color:var(--muted);font-size:13px;font-style:italic;padding:16px;text-align:center;">Sin ' + (taskType === 'outreach' ? 'contactos' : 'ideas') + ' asignados.</div>';
    } else {
      html += '<div id="task-detail-ideas" style="color:var(--muted);">Cargando...</div>';
    }
    html += '</div>';
  }

  // Render in full-page detail view (same as project detail)
  document.getElementById('projects-list-view').style.display = 'none';
  document.getElementById('projects-kanban-view').style.display = 'none';
  document.querySelector('#page-projects .tabs').style.display = 'none';
  document.getElementById('projects-detail-view').style.display = 'block';
  document.getElementById('projects-detail-view').innerHTML = html;

  // Load ideas if needed
  if (ideaIds.length > 0) {
    _loadTaskIdeas(task);
  }
}

// Pipeline states definition (used by kanban + cards)
const PIPELINE_COLS = [
  { key:'pending',     icon:'⬜', label:'Pendiente',    color:'var(--muted)' },
  { key:'finding_dm',  icon:'🔍', label:'Buscando DM',  color:'var(--blue)' },
  { key:'enriching',   icon:'📧', label:'Enriqueciendo', color:'var(--yellow)' },
  { key:'ready',       icon:'✅', label:'Listo',         color:'var(--green)' },
  { key:'contacted',   icon:'📤', label:'Contactado',    color:'var(--rust)' },
  { key:'replied',     icon:'💬', label:'Respondió',     color:'#22A06B' },
  { key:'interested',  icon:'🤝', label:'Interesado',    color:'#6554C0' },
  { key:'call_booked', icon:'📅', label:'Call agendada', color:'#00B8D9' },
  { key:'closed',      icon:'✅', label:'Cerrado',       color:'var(--green)' },
  { key:'discarded',   icon:'❌', label:'Descartado',    color:'var(--red)' },
];
const PIPELINE_MAP = {};
PIPELINE_COLS.forEach(c => { PIPELINE_MAP[c.key] = c; });

async function _loadTaskIdeas(task) {
  const el = document.getElementById('task-detail-ideas');
  if (!el) return;
  const taskType = task.type || task.batch_type || 'execution';
  try {
    const res = await fetch(getApiBase() + '/api/ideas?slug=' + _prjSlug);
    const data = await res.json();
    const allIdeas = data[_prjSlug] || [];
    const taskIdeaIds = new Set(task.idea_ids || []);
    const taskIdeas = allIdeas.filter(i => taskIdeaIds.has(i.id));

    let html = '';

    if (taskType === 'outreach') {
      // === KANBAN VIEW ===
      // Group ideas by pipeline_status
      const groups = {};
      for (const col of PIPELINE_COLS) groups[col.key] = [];
      for (const idea of taskIdeas) {
        const ps = idea.pipeline_status || 'pending';
        if (!groups[ps]) groups[ps] = [];
        groups[ps].push(idea);
      }

      // Only show columns that have contacts OR are key stages
      const visibleCols = PIPELINE_COLS.filter(col =>
        groups[col.key].length > 0 || ['pending','ready','contacted','interested'].includes(col.key)
      );

      html += '<div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:8px;">';
      for (const col of visibleCols) {
        const ideas = groups[col.key] || [];
        html += `<div style="min-width:180px;max-width:220px;flex-shrink:0;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:${col.color};padding:4px 8px;margin-bottom:6px;display:flex;align-items:center;gap:4px;">
            ${col.icon} ${col.label} <span style="color:var(--muted);font-weight:400;">${ideas.length}</span>
          </div>`;
        for (const idea of ideas) {
          const d = idea.source_data || {};
          const name = [d.first_name, d.last_name].filter(Boolean).join(' ');
          const emailBadge = d.email_status === 'verified' ? '✅' : d.email_status === 'catch-all' ? '⚠️' : '';
          html += `<div style="padding:8px 10px;border:1px solid var(--border);border-radius:6px;margin-bottom:4px;background:var(--card);cursor:pointer;transition:border-color .12s;border-left:3px solid ${col.color};" onclick="_showContactDetail('${idea.id}')" onmouseover="this.style.borderColor='var(--rust)'" onmouseout="this.style.borderColor='var(--border)';this.style.borderLeftColor='${col.color}';">
            <div style="font-weight:700;font-size:12px;">${esc(d.company_name || idea.title)}</div>
            ${name ? `<div style="font-size:11px;color:var(--muted);margin-top:1px;">${esc(name)}</div>` : ''}
            ${d.job_title ? `<div style="font-size:10px;color:var(--muted);">${esc(d.job_title)}</div>` : ''}
            <div style="display:flex;gap:4px;margin-top:4px;align-items:center;">
              ${d.email ? `<span style="font-size:9px;">📧${emailBadge}</span>` : '<span style="font-size:9px;color:var(--red);">📧❌</span>'}
              ${d.linkedin_url ? '<span style="font-size:9px;">💼</span>' : ''}
              ${d.seniority ? `<span style="font-size:8px;padding:1px 4px;border-radius:3px;background:color-mix(in srgb,var(--rust) 10%,transparent);color:var(--rust);">${esc(d.seniority)}</span>` : ''}
            </div>
          </div>`;
        }
        if (ideas.length === 0) {
          html += '<div style="padding:12px;text-align:center;color:var(--muted);font-size:11px;font-style:italic;border:1px dashed var(--border);border-radius:6px;">—</div>';
        }
        html += '</div>';
      }
      html += '</div>';

      // Summary stats
      const total = taskIdeas.length;
      const contacted = taskIdeas.filter(i => ['contacted','replied','interested','call_booked','closed'].includes(i.pipeline_status)).length;
      const replied = taskIdeas.filter(i => ['replied','interested','call_booked','closed'].includes(i.pipeline_status)).length;
      html += `<div style="display:flex;gap:16px;margin-top:12px;padding:8px 12px;background:var(--bg);border-radius:6px;font-size:11px;">
        <span><strong>${total}</strong> contactos</span>
        <span><strong>${contacted}</strong> contactados (${total > 0 ? Math.round(contacted/total*100) : 0}%)</span>
        <span><strong>${replied}</strong> respondieron (${total > 0 ? Math.round(replied/total*100) : 0}%)</span>
      </div>`;
    } else {
      // === CONTENT IDEAS (iterate per idea) ===
      for (const idea of taskIdeas) {
        const d = idea.source_data || {};
        const listCfg = IDEA_LIST_CONFIG && IDEA_LIST_CONFIG[idea.list];
        const listIcon = listCfg ? listCfg.icon + ' ' : '';
        const meta = [];
        if (d.volume) meta.push('vol:' + d.volume);
        if (d.kd) meta.push('KD:' + d.kd);
        if (idea.priority_score) meta.push('⭐' + idea.priority_score);
        const metaStr = meta.length > 0 ? '<span style="font-size:11px;color:var(--muted);">' + meta.join(' · ') + '</span>' : '';

        const pieces = (idea.pieces || []).filter(p => !p.task_id || p.task_id === task.id);
        let piecesHtml = '';
        if (pieces.length > 0) {
          piecesHtml = '<div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;">';
          for (const p of pieces) {
            const icon = PIECE_CH_ICON[p.channel] || '📄';
            const intentInfo = PIECE_INTENTS[p.intent] || {};
            const statusIcon = p.status === 'published' ? '✅' : p.status === 'in-progress' ? '🔧' : '⬜';
            piecesHtml += `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:3px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg);">
              ${statusIcon} ${icon} ${esc(p.format || p.channel)}
            </span>`;
          }
          piecesHtml += '</div>';
        }

        html += `<div style="padding:10px 14px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <span style="font-weight:600;font-size:13px;">${listIcon}${esc(idea.title)}</span>
            ${metaStr}
          </div>
          ${piecesHtml}
        </div>`;
      }
    }
    el.innerHTML = html || '<div style="color:var(--muted);font-style:italic;">Sin ideas asignadas.</div>';
    el._taskIdeas = taskIdeas; // store for pipeline skill detection
  } catch (e) { el.innerHTML = '<div style="color:var(--red);">Error cargando ideas.</div>'; }
}

function _showContactDetail(ideaId) {
  console.log('[MC] _showContactDetail called with:', ideaId, '_detailTask:', !!_detailTask, '_prjSlug:', _prjSlug);
  if (!_detailTask || !_prjSlug) { console.log('[MC] _showContactDetail: missing _detailTask or _prjSlug'); return; }
  fetch(getApiBase() + '/api/ideas?slug=' + _prjSlug).then(r => r.json()).then(data => {
    const ideas = data[_prjSlug] || [];
    const idea = ideas.find(i => i.id === ideaId);
    if (!idea) return;
    const d = idea.source_data || {};
    const name = [d.first_name, d.last_name].filter(Boolean).join(' ');
    const ps = idea.pipeline_status || 'pending';
    const pState = PIPELINE_MAP[ps] || PIPELINE_MAP.pending;

    // Status dropdown options
    const statusOpts = PIPELINE_COLS.map(c =>
      `<option value="${c.key}" ${c.key === ps ? 'selected' : ''}>${c.icon} ${c.label}</option>`
    ).join('');

    const detail = `
      <div style="position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:600;display:flex;align-items:center;justify-content:center;" onclick="if(event.target===this)this.remove()">
        <div style="background:var(--card);border-radius:12px;padding:24px;max-width:500px;width:90%;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.2);" onclick="event.stopPropagation()">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <div style="font-size:18px;font-weight:700;">${esc(d.company_name || idea.title)}</div>
            <button onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--muted);">✕</button>
          </div>
          ${name ? `<div style="font-size:15px;margin-bottom:4px;">${esc(name)}</div>` : ''}
          ${d.job_title ? `<div style="font-size:13px;color:var(--muted);margin-bottom:12px;">${esc(d.job_title)}${d.seniority ? ' · ' + esc(d.seniority) : ''}</div>` : ''}
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px;font-size:13px;">
            ${d.email ? `<div>📧 ${esc(d.email)} ${d.email_status === 'verified' ? '✅' : d.email_status === 'catch-all' ? '⚠️ catch-all' : '❓'}${d.email_confidence ? ' (' + d.email_confidence + '%)' : ''}</div>` : '<div style="color:var(--red);">📧 Sin email</div>'}
            ${d.linkedin_url ? `<div>💼 <a href="${esc(d.linkedin_url)}" target="_blank" style="color:var(--blue);">${esc(d.linkedin_url)}</a></div>` : ''}
            ${d.phone ? `<div>📞 ${esc(d.phone)}</div>` : ''}
            ${d.website ? `<div>🌐 ${esc(d.website)}</div>` : ''}
          </div>
          <div style="padding:12px;background:var(--bg);border-radius:8px;margin-bottom:16px;">
            ${d.industry ? `<div style="font-size:12px;">🏢 ${esc(d.industry)}</div>` : ''}
            ${d.employee_count ? `<div style="font-size:12px;">👥 ${d.employee_count} empleados</div>` : ''}
            ${d.total_funding ? `<div style="font-size:12px;">💰 ${esc(d.total_funding)} (${esc(d.latest_round || '?')})</div>` : ''}
            ${d.city ? `<div style="font-size:12px;">📍 ${esc(d.city)}${d.country ? ', ' + esc(d.country) : ''}</div>` : ''}
            ${d.company_description ? `<div style="font-size:12px;margin-top:6px;font-style:italic;color:var(--muted);">${esc(d.company_description)}</div>` : ''}
            ${d.tech_stack && d.tech_stack.length ? `<div style="display:flex;gap:3px;flex-wrap:wrap;margin-top:6px;">${d.tech_stack.map(t => '<span style="font-size:9px;padding:2px 5px;border-radius:3px;background:color-mix(in srgb,var(--navy) 10%,transparent);color:var(--navy);">' + esc(t) + '</span>').join('')}</div>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <span style="font-size:12px;font-weight:600;">Estado:</span>
            <select onchange="_updateContactStatus('${idea.id}',this.value)" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:12px;flex:1;">${statusOpts}</select>
          </div>
          <div style="display:flex;gap:8px;">
            <button onclick="var m=this.closest('[style*=fixed]');m.remove();setTimeout(function(){if(typeof mcChatOpenTask==='function')mcChatOpenTask('${esc(_detailTask.id)}','${esc(_detailTask.name).replace(/'/g,"\\'")}','${esc(_detailProjectId)}','','outreach-sequence-builder','prospecting','${esc(_detailTask.status||'')}','outreach');},150);" style="padding:6px 14px;background:var(--rust);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">💬 Chat</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', detail);
  });
}

async function _updateContactStatus(ideaId, newStatus) {
  try {
    await fetch(getApiBase() + '/api/ideas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: _prjSlug, idea: { id: ideaId, pipeline_status: newStatus } })
    });
    // Refresh the kanban
    if (_detailTask) _loadTaskIdeas(_detailTask);
  } catch (e) { console.error('Error updating status:', e); }
}

function _runOutreachPipeline() {
  if (!_detailTask || !_prjSlug) return;
  const task = _detailTask;
  const ideaIds = task.idea_ids || [];
  if (ideaIds.length === 0) { alert('No hay contactos en esta tarea.'); return; }

  // Determine which skill to use based on the earliest unfinished step
  // pending/finding_dm → decision-maker-finder
  // enriching → contact-enrichment
  // ready → outreach-sequence-builder
  // contacted+ → outreach-sequence-builder (follow-ups)
  const el = document.getElementById('task-detail-ideas');
  const statuses = (el && el._taskIdeas) ? el._taskIdeas.map(i => i.pipeline_status || 'pending') : [];

  let skill = 'contact-enrichment'; // default
  if (statuses.some(s => s === 'pending' || s === 'finding_dm')) {
    skill = 'decision-maker-finder';
  } else if (statuses.some(s => s === 'enriching')) {
    skill = 'contact-enrichment';
  } else if (statuses.some(s => s === 'ready')) {
    skill = 'outreach-sequence-builder';
  } else {
    skill = 'outreach-sequence-builder'; // follow-ups
  }

  if (typeof mcChatOpenTask === 'function') {
    mcChatOpenTask(
      task.id,
      task.name,
      _detailProjectId,
      '',
      skill,
      'prospecting',
      task.status || 'todo',
      'outreach'
    );
  }
}



async function _removeFromPool(ideaId) {
  try {
    await fetch(getApiBase() + '/api/ideas/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: _prjSlug,
        ideaId,
        removeProjects: [_poolProjectId]
      })
    });
    _poolSelected.delete(ideaId);
    _loadUnassignedIdeas(_poolProjectId);
    if (typeof showToast === 'function') showToast('✕ Idea quitada del proyecto');
  } catch (e) { alert('Error: ' + e.message); }
}

async function _createBatchFromSelected() {
  if (_poolSelected.size === 0) return;
  const name = prompt('Nombre del batch:', 'Batch — ' + _poolSelected.size + ' ideas');
  if (!name) return;
  const batchType = prompt('Tipo: content / outreach / mixed', 'content');
  try {
    const res = await fetch(getApiBase() + '/api/projects/create-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: _prjSlug,
        projectId: _poolProjectId,
        name,
        batchType: batchType || 'mixed',
        ideaIds: [..._poolSelected]
      })
    });
    const data = await res.json();
    if (data.ok) {
      _poolSelected = new Set();
      loadProjects(); // reload to show new task
      if (typeof showToast === 'function') showToast('📦 Batch creado: ' + data.task.id);
    } else {
      alert('Error: ' + (data.error || 'Unknown'));
    }
  } catch (e) { alert('Error: ' + e.message); }
}

