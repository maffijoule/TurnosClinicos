// ── CEM — Módulo Modo Libre v2 ────────────────────────────────────────────────

const LIBRE = {
  personas: [
    { nombre: 'Persona 1', horas_contrato: 44 },
    { nombre: 'Persona 2', horas_contrato: 44 },
    { nombre: 'Persona 3', horas_contrato: 44 },
  ],
  turnosTipo: [
    { id: 1, nombre: 'M',  label: 'Mañana', ent: '07:30', sal: '16:30', col: 30, ci: 0 },
    { id: 2, nombre: 'T',  label: 'Tarde',  ent: '13:30', sal: '22:00', col: 30, ci: 1 },
    { id: 3, nombre: 'N',  label: 'Noche',  ent: '22:00', sal: '07:30', col: 30, ci: 2 },
    { id: 4, nombre: 'L',  label: 'Libre',  ent: '',      sal: '',      col: 0,  ci: 7 },
  ],
  turnosSem: {},   // { [nombre]: { [dia]: { ent, sal, col, tid? } } }
  turnosMes: {},   // { [nombre]: { [YYYY-MM-DD]: { ent, sal, col, tid? } } }
  demanda:   {},   // { [dia]: { [hora]: number } }  — mínimo requerido editable
  cfg: {
    mes:  new Date().getMonth() + 1,
    anio: new Date().getFullYear(),
  },
  _ttNextId: 5,
};

// ── CONSTANTES ────────────────────────────────────────────────────────────────
const LIBRE_DIAS_SEM  = ['lunes','martes','miércoles','jueves','viernes','sábado'];
const LIBRE_LABEL_SEM = { lunes:'Lun', martes:'Mar', 'miércoles':'Mié', jueves:'Jue', viernes:'Vie', sábado:'Sáb' };
const LIBRE_DIAS_LV   = ['lunes','martes','miércoles','jueves','viernes'];
const LIBRE_MESES     = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio',
                          'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const LIBRE_DOW_NAMES = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const LIBRE_DOW_SHORT = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

const LIBRE_PALETTE = [
  { bg:'#dbeafe', border:'#3b82f6', text:'#1e3a5f' },  // 0 azul
  { bg:'#dcfce7', border:'#22c55e', text:'#14532d' },  // 1 verde
  { bg:'#fef3c7', border:'#f59e0b', text:'#78350f' },  // 2 ámbar
  { bg:'#fce7f3', border:'#ec4899', text:'#831843' },  // 3 rosa
  { bg:'#ede9fe', border:'#8b5cf6', text:'#4c1d95' },  // 4 violeta
  { bg:'#ffedd5', border:'#f97316', text:'#7c2d12' },  // 5 naranja
  { bg:'#cffafe', border:'#06b6d4', text:'#164e63' },  // 6 cyan
  { bg:'#f1f5f9', border:'#94a3b8', text:'#475569' },  // 7 gris (libre/descanso)
];

// ── HELPERS ───────────────────────────────────────────────────────────────────
function libreTimeToMin(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}
function libreHorasTurno(ent, sal, col) {
  if (!ent || !sal) return 0;
  let e = libreTimeToMin(ent), s = libreTimeToMin(sal);
  if (s <= e) s += 24 * 60;   // turno nocturno cruza medianoche
  return Math.max(0, (s - e - (col || 0)) / 60);
}
function libreGetSem(nombre, dia)      { return LIBRE.turnosSem[nombre]?.[dia]  || null; }
function libreGetMes(nombre, key)      { return LIBRE.turnosMes[nombre]?.[key]  || null; }
function libreSetSem(nombre, dia, d)   { (LIBRE.turnosSem[nombre] = LIBRE.turnosSem[nombre] || {})[dia] = {...d}; }
function libreSetMes(nombre, key, d)   { (LIBRE.turnosMes[nombre] = LIBRE.turnosMes[nombre] || {})[key] = {...d}; }
function libreDelSem(nombre, dia)      { if (LIBRE.turnosSem[nombre]) delete LIBRE.turnosSem[nombre][dia]; }
function libreDelMes(nombre, key)      { if (LIBRE.turnosMes[nombre]) delete LIBRE.turnosMes[nombre][key]; }

function libreTipoById(id)  { return LIBRE.turnosTipo.find(t => t.id === id) || null; }
function libreTipoColor(tt) { return LIBRE_PALETTE[tt?.ci ?? 0] || LIBRE_PALETTE[0]; }

function libreCellColor(turno) {
  if (!turno) return LIBRE_PALETTE[0];
  if (turno.tid) { const tt = libreTipoById(turno.tid); if (tt) return libreTipoColor(tt); }
  const h = parseInt(turno.ent || '0');
  if (h < 12) return LIBRE_PALETTE[0];
  if (h < 18) return LIBRE_PALETTE[1];
  return LIBRE_PALETTE[2];
}

function libreHColor(hSem, contrato) {
  const d = hSem - contrato;
  if (Math.abs(d) < 0.5) return 'var(--success)';
  if (d < 0)             return 'var(--warn)';
  return '#c0392b';
}

// ── COBERTURA ─────────────────────────────────────────────────────────────────
function libreGetHoraRange() {
  let min = 7, max = 22;
  Object.values(LIBRE.turnosSem).forEach(dias =>
    Object.values(dias).forEach(t => {
      if (!t?.ent || !t?.sal) return;
      const e = parseInt(t.ent), s = parseInt(t.sal);
      if (e < min) min = e;
      if (s > e && s > max) max = s;   // no extender si cruza medianoche
    })
  );
  return { min: Math.max(0, min), max: Math.min(24, max) };
}

function libreCovers(t, hora) {
  if (!t?.ent || !t?.sal) return false;
  const e = libreTimeToMin(t.ent);
  const s = libreTimeToMin(t.sal);
  const h = hora * 60;
  if (s > e) return h >= e && h < s;   // turno normal
  return h >= e || h < s;               // turno nocturno cruzando medianoche
}

function libreComputeCoverage(dia, hora) {
  return LIBRE.personas.reduce((n, p) => n + (libreCovers(libreGetSem(p.nombre, dia), hora) ? 1 : 0), 0);
}

function libreGetDemanda(dia, hora) { return LIBRE.demanda?.[dia]?.[hora] ?? null; }
function libreSetDemanda(dia, hora, val) {
  if (!LIBRE.demanda[dia]) LIBRE.demanda[dia] = {};
  if (val === null || val === '' || isNaN(+val) || +val < 0) delete LIBRE.demanda[dia][hora];
  else LIBRE.demanda[dia][hora] = +val;
}

function _libreHeatBg(val, total) {
  if (val === 0) return '#f9fafb';
  const r = Math.min(1, val / Math.max(total, 1));
  const lo = [219,234,254], hi = [30,58,138];
  const mix = (a,b,t) => Math.round(a + (b-a)*t);
  return `rgb(${mix(lo[0],hi[0],r)},${mix(lo[1],hi[1],r)},${mix(lo[2],hi[2],r)})`;
}
function _libreHeatText(val, total) {
  return Math.min(1, val / Math.max(total, 1)) > 0.5 ? '#fff' : 'var(--text)';
}

function libreHorasSemPersona(nombre) {
  return LIBRE_DIAS_SEM.reduce((s, d) => {
    const t = libreGetSem(nombre, d);
    return s + (t ? libreHorasTurno(t.ent, t.sal, t.col) : 0);
  }, 0);
}
function libreHorasMesPersona(nombre) {
  const { mes, anio } = LIBRE.cfg;
  const n = new Date(anio, mes, 0).getDate();
  let tot = 0;
  for (let d = 1; d <= n; d++) {
    const key = libreKey(anio, mes, d);
    const t   = libreGetMes(nombre, key);
    if (t) tot += libreHorasTurno(t.ent, t.sal, t.col);
  }
  return tot / (n / 7);
}
function libreKey(anio, mes, d) {
  return `${anio}-${String(mes).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

// ── SUBTAB ────────────────────────────────────────────────────────────────────
function switchLibreSubtab(tab) {
  window._libreSubtab = tab;
  ['personas','modelos'].forEach(t => {
    const btn   = document.getElementById('st-libre-' + t);
    const panel = document.getElementById('panel-libre-' + t);
    if (btn)   btn.classList.toggle('active', t === tab);
    if (panel) panel.style.display = t === tab ? '' : 'none';
  });
  if (tab === 'personas') { libreRenderSidebar(); libreRenderContent(); }
  if (tab === 'modelos')  libreRenderModelosPanel();
}

// ── SIDEBAR ───────────────────────────────────────────────────────────────────
function libreRenderSidebar() {
  const panel = document.getElementById('panel-libre-personas');
  if (!panel) return;

  // Personas
  const personasRows = LIBRE.personas.map((p, i) => {
    const hS = libreHorasSemPersona(p.nombre);
    const hM = libreHorasMesPersona(p.nombre);
    const cs = libreHColor(hS, p.horas_contrato);
    const cm = libreHColor(hM, p.horas_contrato);
    return `<div style="padding:6px 0;border-bottom:1px solid #f0f2f5">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:11px;font-weight:600;color:var(--text)">${p.nombre}</div>
        <button onclick="libreEliminarPersona(${i})"
          style="border:none;background:none;color:#c0392b;cursor:pointer;font-size:13px;padding:0 2px">×</button>
      </div>
      <div style="display:flex;gap:10px;margin-top:2px">
        <span style="font-size:10px;color:var(--muted)">Sem: <span style="font-weight:700;font-family:var(--mono);color:${cs}">${hS.toFixed(1)}h</span></span>
        <span style="font-size:10px;color:var(--muted)">Mes̃: <span style="font-weight:700;font-family:var(--mono);color:${cm}">${hM.toFixed(1)}h</span></span>
        <span style="font-size:10px;color:var(--muted)">/ ${p.horas_contrato}h</span>
      </div>
    </div>`;
  }).join('');

  // Turnos tipo
  const tiposRows = LIBRE.turnosTipo.map((tt, i) => {
    const c = libreTipoColor(tt);
    const dur = tt.ent && tt.sal ? libreHorasTurno(tt.ent, tt.sal, tt.col).toFixed(1)+'h' : '—';
    return `<div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid #f0f2f5">
      <span style="min-width:28px;text-align:center;padding:2px 6px;border-radius:5px;font-size:11px;font-weight:700;
        background:${c.bg};border:1.5px solid ${c.border};color:${c.text}">${tt.nombre}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:11px;font-weight:600;color:var(--text)">${tt.label}</div>
        <div style="font-size:10px;color:var(--muted)">${tt.ent||'—'}–${tt.sal||'—'} · ${dur}${tt.col?' · 🍽'+tt.col+'min':''}</div>
      </div>
      <button onclick="libreEditarTipoModal(${i})"
        style="border:1px solid var(--border);background:transparent;color:var(--muted);
        border-radius:4px;padding:2px 6px;font-size:10px;cursor:pointer">✏</button>
      <button onclick="libreEliminarTipo(${i})"
        style="border:none;background:none;color:#c0392b;cursor:pointer;font-size:13px;padding:0 2px">×</button>
    </div>`;
  }).join('');

  const { mes, anio } = LIBRE.cfg;

  panel.innerHTML = `
    <div class="sidebar-section">
      <div class="section-label">Período (Calendario)</div>
      <div class="param-row">
        <div class="param-label">Mes <span class="param-val" id="libre-mes-val">${LIBRE_MESES[mes]}</span></div>
        <input type="number" id="libre-mes" min="1" max="12" value="${mes}" class="cfg-input"
          oninput="LIBRE.cfg.mes=Math.min(12,Math.max(1,+this.value||1));
                   document.getElementById('libre-mes-val').textContent=LIBRE_MESES[LIBRE.cfg.mes];
                   libreRenderSidebar();libreRenderContent()">
      </div>
      <div class="param-row">
        <div class="param-label">Año <span class="param-val" id="libre-anio-val">${anio}</span></div>
        <input type="number" id="libre-anio" min="2024" max="2099" value="${anio}" class="cfg-input"
          oninput="LIBRE.cfg.anio=+this.value||${anio};
                   document.getElementById('libre-anio-val').textContent=this.value;
                   libreRenderContent()">
      </div>
    </div>

    <div class="sidebar-section">
      <div class="section-label" style="display:flex;justify-content:space-between;align-items:center">
        Personas (${LIBRE.personas.length})
        <button onclick="libreToggleAgregarPersona()"
          style="border:none;background:transparent;color:var(--accent);font-size:11px;font-weight:700;cursor:pointer;padding:0">
          + Agregar</button>
      </div>
      <div id="libre-agregar-persona" style="display:none;margin-bottom:10px;padding:10px;
        background:var(--accent-lt);border-radius:7px;border:1px solid var(--border)">
        <input type="text" id="libre-np-nombre" placeholder="Nombre" class="cfg-input" style="margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
          <span style="font-size:11px;color:var(--text2)">Horas/sem:</span>
          <input type="number" id="libre-np-horas" min="1" max="60" value="44"
            class="cfg-input" style="width:60px">
        </div>
        <div style="display:flex;gap:6px">
          <button onclick="libreAgregarPersona()"
            style="flex:1;padding:6px;border-radius:5px;border:none;background:var(--accent);
            color:#fff;font-size:11px;font-weight:700;cursor:pointer">✓ Agregar</button>
          <button onclick="libreToggleAgregarPersona()"
            style="padding:6px 10px;border-radius:5px;border:1px solid var(--border);
            background:transparent;color:var(--muted);font-size:11px;cursor:pointer">✕</button>
        </div>
      </div>
      ${personasRows || '<div style="font-size:11px;color:var(--muted);padding:6px 0">Sin personas</div>'}
    </div>

    <div class="sidebar-section">
      <div class="section-label" style="display:flex;justify-content:space-between;align-items:center">
        Turnos tipo (${LIBRE.turnosTipo.length})
        <button onclick="libreAgregarTipoModal()"
          style="border:none;background:transparent;color:var(--accent);font-size:11px;font-weight:700;cursor:pointer;padding:0">
          + Nuevo</button>
      </div>
      ${tiposRows || '<div style="font-size:11px;color:var(--muted);padding:6px 0">Sin turnos tipo</div>'}
    </div>

    <div class="sidebar-section">
      <div class="section-label">Acciones</div>
      <button class="btn-export" onclick="libreExportarExcel()">↓ Exportar Excel</button>
    </div>`;
}

function libreToggleAgregarPersona() {
  const el = document.getElementById('libre-agregar-persona');
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}
function libreAgregarPersona() {
  const nombre = document.getElementById('libre-np-nombre')?.value?.trim();
  const horas  = parseInt(document.getElementById('libre-np-horas')?.value) || 44;
  if (!nombre) { showToast('Ingresa un nombre', 'err'); return; }
  if (LIBRE.personas.find(p => p.nombre === nombre)) { showToast('Ya existe esa persona', 'err'); return; }
  LIBRE.personas.push({ nombre, horas_contrato: horas });
  showToast(`${nombre} agregado`, 'ok');
  libreRenderSidebar(); libreRenderContent();
}
function libreEliminarPersona(i) {
  const p = LIBRE.personas[i];
  if (!confirm(`¿Eliminar a ${p.nombre}?`)) return;
  delete LIBRE.turnosSem[p.nombre];
  delete LIBRE.turnosMes[p.nombre];
  LIBRE.personas.splice(i, 1);
  libreRenderSidebar(); libreRenderContent();
}

// ── TURNOS TIPO CRUD ──────────────────────────────────────────────────────────
function libreAgregarTipoModal()     { _libreTipoModal(null); }
function libreEditarTipoModal(i)     { _libreTipoModal(i); }

function _libreTipoModal(idx) {
  const existing = document.getElementById('libre-tipo-modal');
  if (existing) existing.remove();
  const tt  = idx !== null ? LIBRE.turnosTipo[idx] : null;
  const ci  = tt?.ci ?? (LIBRE.turnosTipo.length % LIBRE_PALETTE.length);
  const title = tt ? 'Editar turno tipo' : 'Nuevo turno tipo';

  const palette = LIBRE_PALETTE.map((c, i) =>
    `<div onclick="this.parentNode.querySelectorAll('.pc').forEach(x=>x.style.outline='none');this.style.outline='2.5px solid var(--accent)';document.getElementById('libre-tt-ci').value=${i}"
      class="pc" style="width:22px;height:22px;border-radius:5px;background:${c.bg};border:2px solid ${c.border};
      cursor:pointer;outline:${i===ci?'2.5px solid var(--accent)':'none'};transition:outline .1s"></div>`
  ).join('');

  const ov = document.createElement('div');
  ov.id = 'libre-tipo-modal';
  ov.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;
    display:flex;align-items:center;justify-content:center`;
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  ov.innerHTML = `
    <div style="background:var(--surface);border-radius:12px;padding:24px;width:320px;
      box-shadow:0 20px 60px rgba(0,0,0,.3);border:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
        <div style="font-size:13px;font-weight:700;color:var(--text)">${title}</div>
        <button onclick="document.getElementById('libre-tipo-modal').remove()"
          style="border:none;background:none;color:var(--muted);font-size:20px;cursor:pointer;line-height:1">×</button>
      </div>
      <input type="hidden" id="libre-tt-ci" value="${ci}">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
        <div>
          <div style="font-size:10px;font-weight:600;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">Código</div>
          <input type="text" id="libre-tt-nombre" value="${tt?.nombre||''}" placeholder="M, T, N..." maxlength="4" class="cfg-input" style="width:100%">
        </div>
        <div>
          <div style="font-size:10px;font-weight:600;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">Etiqueta</div>
          <input type="text" id="libre-tt-label" value="${tt?.label||''}" placeholder="Mañana, Tarde..." class="cfg-input" style="width:100%">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
        <div>
          <div style="font-size:10px;font-weight:600;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">Entrada</div>
          <input type="time" id="libre-tt-ent" value="${tt?.ent||''}" class="cfg-input" style="width:100%">
        </div>
        <div>
          <div style="font-size:10px;font-weight:600;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">Salida</div>
          <input type="time" id="libre-tt-sal" value="${tt?.sal||''}" class="cfg-input" style="width:100%">
        </div>
      </div>
      <div style="margin-bottom:14px">
        <div style="font-size:10px;font-weight:600;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">Colación</div>
        <select id="libre-tt-col" class="cfg-input" style="width:100%">
          ${[0,20,30,45,60].map(v=>`<option value="${v}" ${(tt?.col||0)===v?'selected':''}>${v?v+' min':'Sin colación'}</option>`).join('')}
        </select>
      </div>
      <div style="margin-bottom:16px">
        <div style="font-size:10px;font-weight:600;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Color</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${palette}</div>
      </div>
      <div style="display:flex;gap:8px">
        <button onclick="_libreTipoGuardar(${idx !== null ? idx : 'null'})"
          style="flex:1;padding:9px;border-radius:7px;border:none;background:var(--accent);
          color:#fff;font-size:12px;font-weight:700;cursor:pointer">${tt ? '✓ Actualizar' : '+ Crear'}</button>
        <button onclick="document.getElementById('libre-tipo-modal').remove()"
          style="padding:9px 14px;border-radius:7px;border:1px solid var(--border);
          background:transparent;color:var(--muted);font-size:12px;cursor:pointer">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
}

function _libreTipoGuardar(idx) {
  const nombre = document.getElementById('libre-tt-nombre')?.value?.trim();
  const label  = document.getElementById('libre-tt-label')?.value?.trim();
  const ent    = document.getElementById('libre-tt-ent')?.value || '';
  const sal    = document.getElementById('libre-tt-sal')?.value || '';
  const col    = parseInt(document.getElementById('libre-tt-col')?.value) || 0;
  const ci     = parseInt(document.getElementById('libre-tt-ci')?.value) || 0;
  if (!nombre) { showToast('Ingresa un código', 'err'); return; }
  if (idx !== null) {
    LIBRE.turnosTipo[idx] = { ...LIBRE.turnosTipo[idx], nombre, label: label||nombre, ent, sal, col, ci };
    showToast(`Turno tipo "${nombre}" actualizado`, 'ok');
  } else {
    LIBRE.turnosTipo.push({ id: LIBRE._ttNextId++, nombre, label: label||nombre, ent, sal, col, ci });
    showToast(`Turno tipo "${nombre}" creado`, 'ok');
  }
  document.getElementById('libre-tipo-modal')?.remove();
  libreRenderSidebar(); libreRenderContent();
}

function libreEliminarTipo(i) {
  if (!confirm(`¿Eliminar turno tipo "${LIBRE.turnosTipo[i].nombre}"?`)) return;
  const id = LIBRE.turnosTipo[i].id;
  LIBRE.turnosTipo.splice(i, 1);
  // limpiar referencias en turnos
  ['turnosSem','turnosMes'].forEach(k => {
    Object.values(LIBRE[k]).forEach(dias => {
      Object.values(dias).forEach(t => { if (t.tid === id) delete t.tid; });
    });
  });
  libreRenderSidebar(); libreRenderContent();
  showToast('Turno tipo eliminado', 'ok');
}

// ── CONTENT (AMBAS GRILLAS) ───────────────────────────────────────────────────
function libreRenderContent() {
  const content = document.getElementById('content');
  if (!content) return;
  if (!LIBRE.personas.length) {
    content.innerHTML = `<div class="empty">
      <div class="empty-icon">👤</div>
      <div class="empty-title">Sin personas</div>
      <div class="empty-sub">Agrega personas desde el panel lateral para comenzar a crear turnos.</div>
    </div>`;
    return;
  }
  content.innerHTML = `<div style="padding:16px;display:flex;flex-direction:column;gap:24px">
    ${_libreGridSemanaHTML()}
    ${_libreGridMesHTML()}
  </div>`;
}

// ── QUICK-ASSIGN BADGE ROW (reutilizado en ambas grillas) ─────────────────────
function _libreTipoBadges(nombre, diaKey, source) {
  const ne = encodeURIComponent(nombre);
  const de = encodeURIComponent(diaKey);
  return LIBRE.turnosTipo.map(tt => {
    const c = libreTipoColor(tt);
    return `<span onclick="libreQuickAssign('${ne}','${de}','${source}',${tt.id})"
      title="${tt.label}${tt.ent?' ('+tt.ent+'–'+tt.sal+')':''}"
      style="padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700;cursor:pointer;
        background:${c.bg};border:1.5px solid ${c.border};color:${c.text};
        transition:opacity .15s;user-select:none"
      onmouseover="this.style.opacity='.7'" onmouseout="this.style.opacity='1'">${tt.nombre}</span>`;
  }).join('');
}

function libreQuickAssign(ne, de, source, tid) {
  const nombre  = decodeURIComponent(ne);
  const diaKey  = decodeURIComponent(de);
  const tt      = LIBRE.turnosTipo.find(t => t.id === tid);
  if (!tt) return;
  const datos = { ent: tt.ent, sal: tt.sal, col: tt.col, tid: tt.id };
  if (source === 'sem') libreSetSem(nombre, diaKey, datos);
  else                  libreSetMes(nombre, diaKey, datos);
  libreRenderSidebar(); libreRenderContent();
  showToast(`${tt.label} → ${nombre}`, 'ok');
}

// ── GRID SEMANA TIPO ──────────────────────────────────────────────────────────
function _libreGridSemanaHTML() {
  const thead = LIBRE_DIAS_SEM.map(d =>
    `<th style="padding:8px 6px;font-size:11px;font-weight:700;color:var(--muted);
      text-align:center;min-width:110px;border-right:1px solid var(--border)">${LIBRE_LABEL_SEM[d]}</th>`
  ).join('');

  const rows = LIBRE.personas.map(p => {
    const hS = libreHorasSemPersona(p.nombre);
    const cs = libreHColor(hS, p.horas_contrato);
    const cells = LIBRE_DIAS_SEM.map(d => _libreSemCell(p.nombre, d)).join('');
    return `<tr>
      <td style="padding:6px 10px;font-size:11px;font-weight:600;color:var(--text);
        white-space:nowrap;border-right:2px solid var(--border2);
        position:sticky;left:0;background:var(--surface);min-width:140px;z-index:1">
        <div>${p.nombre}</div>
        <div style="font-size:10px;font-weight:700;color:${cs};font-family:var(--mono)">${hS.toFixed(1)}h / ${p.horas_contrato}h</div>
      </td>${cells}</tr>`;
  }).join('');

  return `<div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-size:15px;font-weight:700;color:var(--text)">Semana tipo</div>
        <div style="font-size:11px;color:var(--muted)">Turno base semanal — se replica en el calendario</div>
      </div>
      ${_libreColorLegend()}
    </div>
    <div style="overflow-x:auto;border-radius:8px;border:1px solid var(--border)">
      <table style="border-collapse:collapse;width:100%">
        <thead><tr style="background:var(--surface2)">
          <th style="padding:10px;font-size:11px;font-weight:700;color:var(--muted);text-align:left;
            border-right:2px solid var(--border2);position:sticky;left:0;background:var(--surface2);min-width:140px">Persona</th>
          ${thead}
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${_libreTablaCobertura()}
  </div>`;
}

function _libreSemCell(nombre, dia) {
  const turno = libreGetSem(nombre, dia);
  const ne    = encodeURIComponent(nombre);
  const de    = encodeURIComponent(dia);
  if (!turno) {
    const badges = _libreTipoBadges(nombre, dia, 'sem');
    return `<td style="padding:3px;border-right:1px solid var(--border);background:var(--surface)">
      <div onclick="libreOpenModal('${ne}','${de}','sem')"
        style="height:20px;display:flex;align-items:center;justify-content:center;
          border-radius:5px;cursor:pointer;color:var(--border2);font-size:16px;
          border:1.5px dashed var(--border2)"
        onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">+</div>
      <div style="display:flex;flex-wrap:wrap;gap:2px;margin-top:3px;justify-content:center">${badges}</div>
    </td>`;
  }
  const c   = libreCellColor(turno);
  const tid = turno.tid ? libreTipoById(turno.tid) : null;
  const lbl = tid ? tid.nombre : (turno.ent ? turno.ent.slice(0,5) : '');
  const ht  = libreHorasTurno(turno.ent, turno.sal, turno.col);
  return `<td style="padding:3px;border-right:1px solid var(--border);background:var(--surface)">
    <div onclick="libreOpenModal('${ne}','${de}','sem')"
      style="min-height:20px;padding:3px 4px;display:flex;flex-direction:column;align-items:center;justify-content:center;
        border-radius:5px;cursor:pointer;background:${c.bg};border:1.5px solid ${c.border}"
      onmouseover="this.style.opacity='.75'" onmouseout="this.style.opacity='1'"
      title="${turno.ent||''}–${turno.sal||''}${turno.col?' col '+turno.col+'min':''}">
      <div style="font-size:10px;font-weight:700;color:${c.text}">${lbl}</div>
      <div style="font-size:9px;color:${c.text};opacity:.8">${ht.toFixed(1)}h</div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:2px;margin-top:3px;justify-content:center">
      ${_libreTipoBadges(nombre, dia, 'sem')}
    </div>
  </td>`;
}

// ── TABLA COBERTURA POR HORA (semana tipo) ────────────────────────────────────
function _libreTablaCobertura() {
  const { min, max } = libreGetHoraRange();
  const total = LIBRE.personas.length;
  if (total === 0) return '';

  const thead = LIBRE_DIAS_SEM.map(d =>
    `<th style="padding:6px 4px;font-size:11px;font-weight:700;color:var(--muted);
      text-align:center;min-width:64px;border-right:1px solid var(--border)">${LIBRE_LABEL_SEM[d]}</th>`
  ).join('');

  const rows = [];
  for (let h = min; h < max; h++) {
    let anyActive = LIBRE_DIAS_SEM.some(d => libreComputeCoverage(d, h) > 0 || libreGetDemanda(d, h) !== null);
    const cells = LIBRE_DIAS_SEM.map(d => {
      const actual  = libreComputeCoverage(d, h);
      const target  = libreGetDemanda(d, h);
      const hasT    = target !== null;
      let bg, tc;
      if (actual === 0 && !hasT) {
        bg = '#f9fafb'; tc = '#d1d5db';
      } else if (hasT) {
        bg = actual >= target ? '#dcfce7' : '#fee2e2';
        tc = actual >= target ? '#166534' : '#991b1b';
      } else {
        bg = _libreHeatBg(actual, total);
        tc = _libreHeatText(actual, total);
      }
      const ne = encodeURIComponent(d);
      return `<td style="padding:2px;border-right:1px solid var(--border);background:${bg};cursor:pointer"
        onclick="libreEditDemandaCell('${ne}',${h},this)" title="Clic para fijar mínimo — ${LIBRE_LABEL_SEM[d]} ${String(h).padStart(2,'0')}:00">
        <div style="text-align:center;padding:3px 0">
          <div style="font-size:12px;font-weight:700;color:${tc}">${actual}</div>
          ${hasT ? `<div style="font-size:9px;color:${tc};opacity:.7">mín ${target}</div>` : '<div style="font-size:9px;color:#d1d5db">—</div>'}
        </div>
      </td>`;
    }).join('');
    rows.push(`<tr>
      <td style="padding:3px 8px;font-family:var(--mono);font-size:10px;color:var(--muted);
        white-space:nowrap;border-right:2px solid var(--border2);background:var(--surface2)">
        ${String(h).padStart(2,'0')}:00</td>
      ${cells}
    </tr>`);
  }

  // Fila totales por día
  const totRow = LIBRE_DIAS_SEM.map(d => {
    const horasCubiertas = (() => { let n=0; for(let h=min;h<max;h++) if(libreComputeCoverage(d,h)>0) n++; return n; })();
    return `<td style="padding:4px 2px;text-align:center;border-right:1px solid var(--border);
      background:var(--surface2);font-size:10px;font-weight:600;color:var(--muted)">${horasCubiertas}h</td>`;
  }).join('');

  // Leyenda
  const leyenda = `<div style="display:flex;align-items:center;gap:10px;font-size:10px;color:var(--muted)">
    <div style="display:flex;align-items:center;gap:4px">
      <div style="display:flex;gap:2px">
        ${[0,.25,.5,.75,1].map(r=>`<span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:${r===0?'#f9fafb':_libreHeatBg(r*total,total)}"></span>`).join('')}
      </div>
      0 → ${total} personas
    </div>
    <div style="display:flex;align-items:center;gap:4px">
      <span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:#dcfce7;border:1px solid #22c55e"></span>
      cubre mínimo
    </div>
    <div style="display:flex;align-items:center;gap:4px">
      <span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:#fee2e2;border:1px solid #ef4444"></span>
      bajo mínimo
    </div>
    <span style="color:var(--accent);cursor:pointer" onclick="libreLimpiarDemanda()" title="Eliminar todos los mínimos">✕ Limpiar mínimos</span>
  </div>`;

  return `<div style="margin-top:20px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-size:14px;font-weight:700;color:var(--text)">Cobertura por hora</div>
        <div style="font-size:11px;color:var(--muted)">Personas en turno · Clic en celda para editar mínimo requerido</div>
      </div>
      ${leyenda}
    </div>
    <div style="overflow-x:auto;border-radius:8px;border:1px solid var(--border)">
      <table style="border-collapse:collapse;width:100%">
        <thead>
          <tr style="background:var(--surface2)">
            <th style="padding:8px;font-size:11px;font-weight:700;color:var(--muted);text-align:left;
              border-right:2px solid var(--border2);min-width:60px;position:sticky;left:0;background:var(--surface2)">Hora</th>
            ${thead}
          </tr>
        </thead>
        <tbody>
          ${rows.join('')}
          <tr style="border-top:2px solid var(--border2)">
            <td style="padding:4px 8px;font-size:10px;font-weight:700;color:var(--muted);
              border-right:2px solid var(--border2);background:var(--surface2)">Horas</td>
            ${totRow}
          </tr>
        </tbody>
      </table>
    </div>
  </div>`;
}

function libreEditDemandaCell(ne, hora, td) {
  const dia     = decodeURIComponent(ne);
  const current = libreGetDemanda(dia, hora);

  const input = document.createElement('input');
  input.type  = 'number'; input.min = '0'; input.max = '99'; input.step = '1';
  input.value = current ?? '';
  input.placeholder = '—';
  input.style.cssText = `width:44px;text-align:center;font-size:12px;font-weight:700;
    border:2px solid var(--accent);border-radius:4px;padding:2px 0;outline:none;
    background:var(--accent-lt);color:var(--accent)`;

  td.innerHTML = '';
  td.style.padding = '4px 2px';
  td.appendChild(input);
  input.focus(); input.select();

  let committed = false;
  const commit = () => {
    if (committed) return; committed = true;
    libreSetDemanda(dia, hora, input.value);
    libreRenderContent();
  };
  input.onblur    = commit;
  input.onkeydown = e => {
    if (e.key === 'Enter')  { input.blur(); }
    if (e.key === 'Escape') { committed = true; libreRenderContent(); }
    e.stopPropagation();
  };
}

function libreLimpiarDemanda() {
  if (!confirm('¿Eliminar todos los mínimos requeridos?')) return;
  LIBRE.demanda = {};
  libreRenderContent();
}

// ── GRID MES CALENDARIO ───────────────────────────────────────────────────────
function _libreGridMesHTML() {
  const { mes, anio } = LIBRE.cfg;
  const nDays = new Date(anio, mes, 0).getDate();
  const days  = [];
  for (let d = 1; d <= nDays; d++) {
    const dow = new Date(anio, mes - 1, d).getDay();
    days.push({ d, dow, key: libreKey(anio, mes, d), isWeekend: dow === 0 || dow === 6 });
  }

  const thead = days.map(({ d, dow, isWeekend }) =>
    `<th style="padding:4px 2px;font-size:10px;font-weight:600;text-align:center;
      min-width:58px;border-right:1px solid var(--border);
      color:${isWeekend ? '#9ca3af' : 'var(--text2)'};
      background:${isWeekend ? '#f9fafb' : 'var(--surface2)'}">
      <div style="font-size:10px">${d}</div>
      <div style="font-size:9px;font-weight:400;color:var(--muted)">${LIBRE_DOW_SHORT[dow]}</div>
    </th>`
  ).join('');

  const rows = LIBRE.personas.map(p => {
    const hM = libreHorasMesPersona(p.nombre);
    const cm = libreHColor(hM, p.horas_contrato);
    const cells = days.map(({ key, isWeekend }) => _libreMonthCell(p.nombre, key, isWeekend)).join('');
    return `<tr>
      <td style="padding:4px 8px;font-size:11px;font-weight:600;color:var(--text);
        white-space:nowrap;border-right:2px solid var(--border2);
        position:sticky;left:0;background:var(--surface);min-width:140px;z-index:1">
        <div>${p.nombre}</div>
        <div style="font-size:10px;font-weight:700;color:${cm};font-family:var(--mono)">${hM.toFixed(1)}h̃/sem</div>
      </td>${cells}</tr>`;
  }).join('');

  return `<div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-size:15px;font-weight:700;color:var(--text)">${LIBRE_MESES[mes]} ${anio}</div>
        <div style="font-size:11px;color:var(--muted)">Edición individual por día</div>
      </div>
      ${_libreColorLegend()}
    </div>
    <div style="overflow-x:auto;border-radius:8px;border:1px solid var(--border)">
      <table style="border-collapse:collapse;width:100%">
        <thead><tr style="background:var(--surface2)">
          <th style="padding:8px 10px;font-size:11px;font-weight:700;color:var(--muted);text-align:left;
            border-right:2px solid var(--border2);position:sticky;left:0;background:var(--surface2);min-width:140px">Persona</th>
          ${thead}
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

function _libreMonthCell(nombre, key, isWeekend) {
  const turno = libreGetMes(nombre, key);
  const ne    = encodeURIComponent(nombre);
  const de    = encodeURIComponent(key);
  const bgBase = isWeekend ? '#f9fafb' : 'var(--surface)';
  if (!turno) {
    return `<td style="padding:2px;border-right:1px solid var(--border);background:${bgBase}">
      <div onclick="libreOpenModal('${ne}','${de}','mes')"
        style="height:36px;display:flex;align-items:center;justify-content:center;
          border-radius:4px;cursor:pointer;color:#d1d5db;font-size:14px;
          border:1px dashed #e5e7eb"
        onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">+</div>
    </td>`;
  }
  const c   = libreCellColor(turno);
  const tid = turno.tid ? libreTipoById(turno.tid) : null;
  const lbl = tid ? tid.nombre : (turno.ent ? turno.ent.slice(0,5) : '?');
  const ht  = libreHorasTurno(turno.ent, turno.sal, turno.col);
  return `<td style="padding:2px;border-right:1px solid var(--border);background:${bgBase}">
    <div onclick="libreOpenModal('${ne}','${de}','mes')"
      style="height:36px;display:flex;flex-direction:column;align-items:center;justify-content:center;
        border-radius:4px;cursor:pointer;background:${c.bg};border:1.5px solid ${c.border}"
      onmouseover="this.style.opacity='.75'" onmouseout="this.style.opacity='1'"
      title="${turno.ent||''}–${turno.sal||''}">
      <div style="font-size:10px;font-weight:700;color:${c.text};line-height:1.1">${lbl}</div>
      <div style="font-size:9px;color:${c.text};opacity:.75">${ht.toFixed(1)}h</div>
    </div>
  </td>`;
}

function _libreColorLegend() {
  return `<div style="display:flex;gap:5px;flex-wrap:wrap;font-size:10px;align-items:center">
    ${LIBRE.turnosTipo.slice(0, 6).map(tt => {
      const c = libreTipoColor(tt);
      return `<span style="padding:2px 7px;border-radius:9px;background:${c.bg};border:1px solid ${c.border};color:${c.text};font-weight:600">${tt.nombre} ${tt.label}</span>`;
    }).join('')}
  </div>`;
}

// ── MODAL TURNO ───────────────────────────────────────────────────────────────
let _lN = null, _lD = null, _lSrc = null;

function libreOpenModal(ne, de, src) {
  _lN   = decodeURIComponent(ne);
  _lD   = decodeURIComponent(de);
  _lSrc = src; // 'sem' | 'mes'

  const getter = src === 'sem' ? libreGetSem : libreGetMes;
  const turno  = getter(_lN, _lD);
  const ent    = turno?.ent || '08:00';
  const sal    = turno?.sal || '17:00';
  const col    = turno?.col || 0;

  // Label del día
  let diaLabel;
  if (src === 'sem') {
    diaLabel = LIBRE_LABEL_SEM[_lD] || _lD;
  } else {
    const dt = new Date(_lD + 'T00:00:00');
    diaLabel = `${LIBRE_DOW_SHORT[dt.getDay()]} ${dt.getDate()} ${LIBRE_MESES[dt.getMonth()+1]}`;
  }

  // Quick-assign row
  const quickBtns = LIBRE.turnosTipo.map(tt => {
    const c   = libreTipoColor(tt);
    const sel = turno?.tid === tt.id;
    return `<button onclick="libreModalPreselTipo(${tt.id})"
      id="libre-modal-tt-${tt.id}"
      style="padding:5px 10px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;
        background:${c.bg};border:2px solid ${sel ? c.border : 'transparent'};color:${c.text};
        outline:${sel?'2px solid '+c.border:'none'};transition:all .1s"
      title="${tt.label}${tt.ent?' ('+tt.ent+'–'+tt.sal+')':''}">
      ${tt.nombre}<br><span style="font-weight:400;font-size:9px">${tt.label}</span></button>`;
  }).join('');

  // Opciones de aplicación
  let applyBlock = '';
  if (src === 'sem') {
    const isLV = LIBRE_DIAS_LV.includes(_lD);
    applyBlock = `<div style="padding:10px 12px;background:var(--accent-lt);border-radius:7px;
      border:1px solid var(--border);margin-top:12px">
      <div style="font-size:10px;font-weight:700;color:var(--muted);margin-bottom:8px;
        text-transform:uppercase;letter-spacing:.5px">Aplicar a</div>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:11px;color:var(--text2);margin-bottom:6px">
        <input type="checkbox" id="la-lv" ${!isLV?'disabled':''} onchange="if(!this.checked)document.getElementById('la-sab').checked=false"
          style="cursor:pointer;width:13px;height:13px">
        Toda la semana <strong>(Lun–Vie)</strong></label>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:11px;color:var(--text2);margin-bottom:6px">
        <input type="checkbox" id="la-sab" style="cursor:pointer;width:13px;height:13px">
        Incluir <strong>Sábado</strong></label>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:11px;color:var(--text2)">
        <input type="checkbox" id="la-copiar-mes" style="cursor:pointer;width:13px;height:13px">
        También aplicar al <strong>calendario del mes</strong></label>
    </div>`;
  } else {
    // mes: opciones por día de semana
    const dt  = new Date(_lD + 'T00:00:00');
    const dow = dt.getDay();
    const dowName = LIBRE_DOW_NAMES[dow];
    const { mes, anio } = LIBRE.cfg;
    applyBlock = `<div style="padding:10px 12px;background:var(--accent-lt);border-radius:7px;
      border:1px solid var(--border);margin-top:12px">
      <div style="font-size:10px;font-weight:700;color:var(--muted);margin-bottom:8px;
        text-transform:uppercase;letter-spacing:.5px">Aplicar a</div>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:11px;color:var(--text2);margin-bottom:6px">
        <input type="checkbox" id="la-dow" style="cursor:pointer;width:13px;height:13px">
        Todos los <strong>${dowName}</strong> del mes</label>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:11px;color:var(--text2);margin-bottom:6px">
        <input type="checkbox" id="la-lv-mes" style="cursor:pointer;width:13px;height:13px">
        Todos los <strong>Lun–Vie</strong> del mes</label>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:11px;color:var(--text2)">
        <input type="checkbox" id="la-todos-mes" style="cursor:pointer;width:13px;height:13px">
        Todos los días del mes</label>
    </div>`;
  }

  const existing = document.getElementById('libre-modal');
  if (existing) existing.remove();
  const ov = document.createElement('div');
  ov.id = 'libre-modal';
  ov.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;
    display:flex;align-items:center;justify-content:center;overflow-y:auto;padding:20px 0`;
  ov.onclick = e => { if (e.target === ov) libreCloseModal(); };

  ov.innerHTML = `
    <div style="background:var(--surface);border-radius:12px;padding:24px;width:360px;
      box-shadow:0 20px 60px rgba(0,0,0,.3);border:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--text)">${_lN}</div>
          <div style="font-size:11px;color:var(--muted)">${diaLabel}</div>
        </div>
        <button onclick="libreCloseModal()"
          style="border:none;background:none;color:var(--muted);font-size:20px;cursor:pointer;line-height:1">×</button>
      </div>

      ${LIBRE.turnosTipo.length ? `<div style="margin-bottom:14px">
        <div style="font-size:10px;font-weight:600;color:var(--muted);margin-bottom:6px;
          text-transform:uppercase;letter-spacing:.5px">Turno tipo</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${quickBtns}</div>
      </div>` : ''}

      <div style="font-size:10px;font-weight:600;color:var(--muted);margin-bottom:8px;
        text-transform:uppercase;letter-spacing:.5px">Horario manual</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
        <div>
          <div style="font-size:10px;color:var(--muted);margin-bottom:3px">Entrada</div>
          <input type="time" id="libre-modal-ent" value="${ent}" class="cfg-input" style="width:100%">
        </div>
        <div>
          <div style="font-size:10px;color:var(--muted);margin-bottom:3px">Salida</div>
          <input type="time" id="libre-modal-sal" value="${sal}" class="cfg-input" style="width:100%">
        </div>
      </div>
      <div style="margin-bottom:6px">
        <div style="font-size:10px;color:var(--muted);margin-bottom:3px">Colación</div>
        <select id="libre-modal-col" class="cfg-input" style="width:100%">
          ${[0,20,30,45,60].map(v=>`<option value="${v}" ${col===v?'selected':''}>${v?v+' min':'Sin colación'}</option>`).join('')}
        </select>
      </div>

      ${applyBlock}

      <div style="display:flex;gap:8px;margin-top:14px">
        <button onclick="libreGuardarTurnoModal()"
          style="flex:1;padding:9px;border-radius:7px;border:none;background:var(--accent);
          color:#fff;font-size:12px;font-weight:700;cursor:pointer">
          ${turno ? '✓ Actualizar' : '+ Guardar'}</button>
        ${turno ? `<button onclick="libreEliminarTurnoModal()"
          style="padding:9px 12px;border-radius:7px;border:1.5px solid #e0c8c8;
          background:transparent;color:#c0392b;font-size:13px;cursor:pointer">🗑</button>` : ''}
        <button onclick="libreCloseModal()"
          style="padding:9px 12px;border-radius:7px;border:1px solid var(--border);
          background:transparent;color:var(--muted);font-size:12px;cursor:pointer">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
}

function libreModalPreselTipo(id) {
  const tt = libreTipoById(id);
  if (!tt) return;
  // Resaltar botón seleccionado
  LIBRE.turnosTipo.forEach(t => {
    const btn = document.getElementById(`libre-modal-tt-${t.id}`);
    if (!btn) return;
    const c = libreTipoColor(t);
    btn.style.outline = t.id === id ? `2px solid ${c.border}` : 'none';
    btn.style.borderColor = t.id === id ? c.border : 'transparent';
  });
  // Pre-rellenar campos
  if (tt.ent) document.getElementById('libre-modal-ent').value = tt.ent;
  if (tt.sal) document.getElementById('libre-modal-sal').value = tt.sal;
  document.getElementById('libre-modal-col').value = tt.col || 0;
  // Guardar id seleccionado en atributo temporal
  document.getElementById('libre-modal-ent').dataset.tid = id;
}

function libreCloseModal() {
  document.getElementById('libre-modal')?.remove();
}

function libreGuardarTurnoModal() {
  const ent  = document.getElementById('libre-modal-ent')?.value;
  const sal  = document.getElementById('libre-modal-sal')?.value;
  const col  = parseInt(document.getElementById('libre-modal-col')?.value) || 0;
  const tid  = parseInt(document.getElementById('libre-modal-ent')?.dataset.tid) || null;

  if (!ent || !sal) { showToast('Ingresa entrada y salida', 'err'); return; }

  // Verificar que no sea un turno tipo "Libre" (sin horas) — si ent/sal están vacíos en el tipo OK, pero el usuario ingresó horas
  const datos = { ent, sal, col, ...(tid ? { tid } : {}) };

  if (_lSrc === 'sem') {
    const applyLV  = document.getElementById('la-lv')?.checked;
    const applySab = document.getElementById('la-sab')?.checked;
    const copyMes  = document.getElementById('la-copiar-mes')?.checked;

    if (applyLV) {
      LIBRE_DIAS_LV.forEach(d => libreSetSem(_lN, d, datos));
      if (applySab) libreSetSem(_lN, 'sábado', datos);
    } else {
      libreSetSem(_lN, _lD, datos);
    }

    if (copyMes) {
      const { mes, anio } = LIBRE.cfg;
      const n = new Date(anio, mes, 0).getDate();
      const aplicarA = applyLV ? LIBRE_DIAS_LV.map(d => {
        const DOW_MAP = {lunes:1,martes:2,'miércoles':3,jueves:4,viernes:5};
        return DOW_MAP[d];
      }) : null;
      const incluirSab = applySab;
      for (let d = 1; d <= n; d++) {
        const dt  = new Date(anio, mes - 1, d);
        const dow = dt.getDay();
        const key = libreKey(anio, mes, d);
        if (applyLV) {
          if (dow >= 1 && dow <= 5) libreSetMes(_lN, key, datos);
          if (incluirSab && dow === 6) libreSetMes(_lN, key, datos);
        } else {
          // Solo el mismo día de la semana que _lD
          const DOW_SEM = { lunes:1, martes:2, 'miércoles':3, jueves:4, viernes:5, sábado:6 };
          if (dow === DOW_SEM[_lD]) libreSetMes(_lN, key, datos);
        }
      }
    }
  } else {
    // mes
    const applyDow    = document.getElementById('la-dow')?.checked;
    const applyLvMes  = document.getElementById('la-lv-mes')?.checked;
    const applyTodos  = document.getElementById('la-todos-mes')?.checked;
    const { mes, anio } = LIBRE.cfg;
    const n = new Date(anio, mes, 0).getDate();
    const dt0 = new Date(_lD + 'T00:00:00');
    const targetDow = dt0.getDay();

    if (applyTodos || applyLvMes || applyDow) {
      for (let d = 1; d <= n; d++) {
        const dt  = new Date(anio, mes - 1, d);
        const dow = dt.getDay();
        const key = libreKey(anio, mes, d);
        if (applyTodos || (applyLvMes && dow >= 1 && dow <= 5) || (applyDow && dow === targetDow)) {
          libreSetMes(_lN, key, datos);
        }
      }
    } else {
      libreSetMes(_lN, _lD, datos);
    }
  }

  libreCloseModal();
  libreRenderSidebar();
  libreRenderContent();
  showToast('Turno guardado', 'ok');
}

function libreEliminarTurnoModal() {
  if (!confirm('¿Eliminar este turno?')) return;
  if (_lSrc === 'sem') libreDelSem(_lN, _lD);
  else                 libreDelMes(_lN, _lD);
  libreCloseModal();
  libreRenderSidebar();
  libreRenderContent();
  showToast('Turno eliminado', 'ok');
}

// ── MODELOS (localStorage) ────────────────────────────────────────────────────
const LIBRE_MODELS_KEY = 'cem_libre_models';
function libreLoadModels()    { try { return JSON.parse(localStorage.getItem(LIBRE_MODELS_KEY) || '[]'); } catch { return []; } }
function libreSaveModels(lst) { localStorage.setItem(LIBRE_MODELS_KEY, JSON.stringify(lst)); }

function libreRenderModelosPanel() {
  const el = document.getElementById('panel-libre-modelos');
  if (!el) return;
  const models = libreLoadModels();
  const listaHTML = models.length === 0
    ? `<div style="font-size:11px;color:var(--muted);padding:8px 0;text-align:center">No hay modelos guardados</div>`
    : models.map(m => `
      <div style="border:1px solid var(--border);border-radius:6px;padding:9px 10px;margin-bottom:8px;background:var(--surface2)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div style="font-size:12px;font-weight:700;color:var(--text)">${m.nombre}</div>
          <span style="font-size:9px;color:var(--muted)">${m.fecha}</span>
        </div>
        ${m.descripcion ? `<div style="font-size:10px;color:var(--muted);margin-top:2px">${m.descripcion}</div>` : ''}
        <div style="font-size:10px;color:var(--muted);margin-top:3px">
          ${m.personas.length} personas · ${m.turnosTipo.length} turnos tipo · ${LIBRE_MESES[m.cfg?.mes]} ${m.cfg?.anio}</div>
        <div style="display:flex;gap:6px;margin-top:8px">
          <button onclick="libreCargarModelo(${m.id})"
            style="flex:1;padding:5px;border-radius:5px;border:1.5px solid var(--accent);
            background:transparent;color:var(--accent);font-size:11px;font-weight:600;cursor:pointer">↩ Cargar</button>
          <button onclick="if(confirm('¿Eliminar?'))libreEliminarModelo(${m.id})"
            style="padding:5px 8px;border-radius:5px;border:1.5px solid #e0c8c8;
            background:transparent;color:#c0392b;font-size:11px;cursor:pointer">✕</button>
        </div>
      </div>`).join('');

  el.innerHTML = `
    <div class="sidebar-section">
      <div class="section-label">Guardar Modelo Actual</div>
      <input type="text" id="libre-modelo-nombre" placeholder="Nombre del modelo"
        class="cfg-input" style="margin-bottom:6px">
      <textarea id="libre-modelo-desc" placeholder="Descripción opcional..."
        class="cfg-input" style="resize:vertical;min-height:44px;font-family:var(--sans);margin-bottom:6px"></textarea>
      <button onclick="libreGuardarModelo()" class="btn-primary">💾 Guardar Modelo</button>
    </div>
    <div class="sidebar-section">
      <div class="section-label">Modelos Guardados</div>
      ${listaHTML}
    </div>`;
}

function libreGuardarModelo() {
  const nombre = document.getElementById('libre-modelo-nombre')?.value?.trim();
  const desc   = document.getElementById('libre-modelo-desc')?.value?.trim();
  if (!nombre) { showToast('Ingresa un nombre para el modelo', 'err'); return; }
  const models = libreLoadModels();
  const snap = {
    id: Date.now(), nombre, descripcion: desc || '',
    fecha:       new Date().toLocaleDateString('es-CL'),
    personas:    JSON.parse(JSON.stringify(LIBRE.personas)),
    turnosTipo:  JSON.parse(JSON.stringify(LIBRE.turnosTipo)),
    turnosSem:   JSON.parse(JSON.stringify(LIBRE.turnosSem)),
    turnosMes:   JSON.parse(JSON.stringify(LIBRE.turnosMes)),
    demanda:     JSON.parse(JSON.stringify(LIBRE.demanda)),
    cfg:         JSON.parse(JSON.stringify(LIBRE.cfg)),
    _ttNextId:   LIBRE._ttNextId,
  };
  const idx = models.findIndex(m => m.nombre === nombre);
  if (idx >= 0) models[idx] = snap; else models.unshift(snap);
  libreSaveModels(models);
  document.getElementById('libre-modelo-nombre').value = '';
  document.getElementById('libre-modelo-desc').value   = '';
  showToast(`Modelo "${nombre}" guardado`, 'ok');
  libreRenderModelosPanel();
}

function libreCargarModelo(id) {
  const m = libreLoadModels().find(x => x.id === id);
  if (!m) return;
  LIBRE.personas   = JSON.parse(JSON.stringify(m.personas));
  LIBRE.turnosTipo = JSON.parse(JSON.stringify(m.turnosTipo || []));
  LIBRE.turnosSem  = JSON.parse(JSON.stringify(m.turnosSem  || {}));
  LIBRE.turnosMes  = JSON.parse(JSON.stringify(m.turnosMes  || {}));
  LIBRE.demanda    = JSON.parse(JSON.stringify(m.demanda    || {}));
  LIBRE.cfg        = JSON.parse(JSON.stringify(m.cfg));
  LIBRE._ttNextId  = m._ttNextId || 10;
  showToast(`Modelo "${m.nombre}" cargado`, 'ok');
  switchLibreSubtab('personas');
}

function libreEliminarModelo(id) {
  libreSaveModels(libreLoadModels().filter(x => x.id !== id));
  libreRenderModelosPanel();
  showToast('Modelo eliminado', 'ok');
}

// ── EXPORTAR EXCEL ────────────────────────────────────────────────────────────
function libreExportarExcel() {
  const wb = XLSX.utils.book_new();
  const { mes, anio } = LIBRE.cfg;
  const nDays = new Date(anio, mes, 0).getDate();

  // Hoja: Semana tipo
  const rowsSem = [['Persona','Horas_contrato','Día','Entrada','Salida','Colación_min','Horas_turno','Turno_tipo']];
  LIBRE.personas.forEach(p => {
    LIBRE_DIAS_SEM.forEach(d => {
      const t = libreGetSem(p.nombre, d);
      if (!t) return;
      const tt = t.tid ? libreTipoById(t.tid) : null;
      rowsSem.push([p.nombre, p.horas_contrato, LIBRE_LABEL_SEM[d],
        t.ent, t.sal, t.col||0, +libreHorasTurno(t.ent,t.sal,t.col).toFixed(2),
        tt ? tt.label : 'Manual']);
    });
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rowsSem), 'Semana_Tipo');

  // Hoja: Turnos mes
  const rowsMes = [['Persona','Horas_contrato','Fecha','Día_semana','Entrada','Salida','Colación_min','Horas_turno','Turno_tipo']];
  LIBRE.personas.forEach(p => {
    for (let d = 1; d <= nDays; d++) {
      const key = libreKey(anio, mes, d);
      const t   = libreGetMes(p.nombre, key);
      if (!t) continue;
      const dow = new Date(anio, mes - 1, d).getDay();
      const tt  = t.tid ? libreTipoById(t.tid) : null;
      rowsMes.push([p.nombre, p.horas_contrato, key, LIBRE_DOW_NAMES[dow],
        t.ent, t.sal, t.col||0, +libreHorasTurno(t.ent,t.sal,t.col).toFixed(2),
        tt ? tt.label : 'Manual']);
    }
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rowsMes), `${LIBRE_MESES[mes]}_${anio}`);

  // Hoja: Resumen personas (semana tipo)
  const resSem = [['Persona','Horas_contrato',
    ...LIBRE_DIAS_SEM.map(d=>LIBRE_LABEL_SEM[d]), 'Total_sem','Diferencia']];
  LIBRE.personas.forEach(p => {
    const porDia = LIBRE_DIAS_SEM.map(d => {
      const t = libreGetSem(p.nombre, d);
      return t ? +libreHorasTurno(t.ent,t.sal,t.col).toFixed(2) : 0;
    });
    const tot = porDia.reduce((a,b)=>a+b, 0);
    resSem.push([p.nombre, p.horas_contrato, ...porDia, +tot.toFixed(2), +(tot-p.horas_contrato).toFixed(2)]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resSem), 'Resumen_Semana');

  // Hoja: Resumen mes
  const resMes = [['Persona','Horas_contrato','Horas_mes','Prom_h_sem','Diferencia']];
  LIBRE.personas.forEach(p => {
    let tot = 0;
    for (let d = 1; d <= nDays; d++) {
      const key = libreKey(anio, mes, d);
      const t   = libreGetMes(p.nombre, key);
      if (t) tot += libreHorasTurno(t.ent, t.sal, t.col);
    }
    const prom = tot / (nDays / 7);
    resMes.push([p.nombre, p.horas_contrato, +tot.toFixed(2), +prom.toFixed(2), +(prom-p.horas_contrato).toFixed(2)]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resMes), `Resumen_${LIBRE_MESES[mes]}`);

  // Hoja: Cobertura por hora (semana tipo)
  const { min: hMin, max: hMax } = libreGetHoraRange();
  const hdrCob = ['Hora', ...LIBRE_DIAS_SEM.map(d => LIBRE_LABEL_SEM[d])];
  const rowsCob = [hdrCob];
  for (let h = hMin; h < hMax; h++) {
    rowsCob.push([
      `${String(h).padStart(2,'0')}:00`,
      ...LIBRE_DIAS_SEM.map(d => libreComputeCoverage(d, h))
    ]);
  }
  // Fila de mínimos
  const rowMin = ['Mínimo req.', ...LIBRE_DIAS_SEM.map(d => {
    const vals = [];
    for (let h = hMin; h < hMax; h++) { const v = libreGetDemanda(d, h); if (v !== null) vals.push(v); }
    return vals.length ? Math.max(...vals) : '';
  })];
  rowsCob.push([], rowMin);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rowsCob), 'Cobertura_Hora');

  XLSX.writeFile(wb, `ModoLibre_${LIBRE_MESES[mes]}${anio}.xlsx`);
  showToast('Excel exportado', 'ok');
}

// ── INIT ──────────────────────────────────────────────────────────────────────
function libreInit() {
  switchLibreSubtab(window._libreSubtab || 'personas');
}
