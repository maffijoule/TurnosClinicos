// ── CEM — Módulo Hospitalizado v6 ─────────────────────────────────────────────

const HOSP = {
  resultado: null,
  semanaIdx: 0,
  hospPlan: {},
  demanda: [
    { inicio: '07:00', fin: '10:00', pabellones: 1 },
    { inicio: '10:00', fin: '15:00', pabellones: 2 },
    { inicio: '15:00', fin: '18:00', pabellones: 3 },
    { inicio: '18:00', fin: '21:00', pabellones: 4 },
    { inicio: '21:00', fin: '24:00', pabellones: 2 },
  ],
  personal: [
    { nombre: 'M. DAZA', rol: 'aux_aseo', horas_semana: 42 },
    { nombre: 'F. MONTOYA', rol: 'aux_aseo', horas_semana: 42 },
    { nombre: 'H. VALLEJOS', rol: 'aux_aseo', horas_semana: 42 },
    { nombre: 'G. SANHUEZA', rol: 'aux_aseo', horas_semana: 42 },
    { nombre: 'D. CHAVARRIA', rol: 'enfermera_eu', horas_semana: 42 },
    { nombre: 'D. MONSALVE', rol: 'enfermera_eu', horas_semana: 42 },
    { nombre: 'C. VACANTE', rol: 'enfermera_eu', horas_semana: 42 },
  ],
  cfg: {
    mes: 3, anio: 2025, horas_max_semana: 42,
    hora_apertura: '07:00', hora_cierre: '24:00'
  },
  turnoOverrides: {},
};

const ROL_LABEL = {
  aux_aseo: 'Aux. Aseo', enfermera_eu: 'Enfermera EU',
  arsenalera: 'Arsenalera', pabellonera: 'Pabellonera', aux_anestesia: 'Aux. Anestesia',
};
const ROL_OPTS = ['aux_aseo', 'enfermera_eu', 'arsenalera', 'pabellonera', 'aux_anestesia'];
const TURNO_COLOR = {
  M: { bg: '#bfdbfe', border: '#3b82f6', text: '#1e3a5f', track: '#3b82f6' },
  T: { bg: '#bbf7d0', border: '#22c55e', text: '#14532d', track: '#22c55e' },
  I: { bg: '#fef08a', border: '#eab308', text: '#713f12', track: '#d97706' },
  DOM: { bg: '#f3f4f6', border: '#d1d5db', text: '#9ca3af', track: '#d1d5db' },
  '': { bg: '#f9fafb', border: '#e5e7eb', text: '#9ca3af', track: '#e5e7eb' },
};
const MESES_HOSP = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DOW_SHORT = {
  lunes: 'Lun', martes: 'Mar', 'miércoles': 'Mié',
  jueves: 'Jue', viernes: 'Vie', sábado: 'Sáb', domingo: 'Dom'
};
const DIAS_LAB = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function slotFromTime(t) {
  if (t === '24:00') return 48;
  const [h, m] = t.split(':').map(Number);
  return h * 2 + Math.floor(m / 30);
}
function timeFromSlot(s) {
  if (s >= 48) return '24:00';
  const h = Math.floor(s / 2), m = (s % 2) * 30;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ── TURNOS EFECTIVOS ──────────────────────────────────────────────────────────
function getTurnosEfectivos() {
  const base = HOSP.resultado?.turnos_opt || {};
  const out = {};
  ['M', 'I', 'T'].forEach(t => {
    if (!base[t]) return;
    const ov = HOSP.turnoOverrides[t];
    const ini = ov?.ini_slot ?? base[t].ini_slot;
    const fin = ov?.fin_slot ?? base[t].fin_slot;
    out[t] = {
      ...base[t], ini_slot: ini, fin_slot: fin,
      ini_str: timeFromSlot(ini), fin_str: timeFromSlot(fin),
      dur_h: Math.max(0, ((fin - ini) - 1) * 0.5)
    };
  });
  return out;
}

// ── MODELOS (localStorage) ────────────────────────────────────────────────────
const MODELS_KEY = 'cem_hosp_models';
function loadModels() { try { return JSON.parse(localStorage.getItem(MODELS_KEY) || '[]'); } catch { return []; } }
function saveModels(list) { localStorage.setItem(MODELS_KEY, JSON.stringify(list)); }

function guardarModelo() {
  const nombre = document.getElementById('modelo-nombre')?.value?.trim();
  const desc = document.getElementById('modelo-desc')?.value?.trim();
  if (!nombre) { showToast('Ingresa un nombre para el modelo', 'err'); return; }
  const models = loadModels();
  const snap = {
    id: Date.now(), nombre, descripcion: desc || '',
    fecha: new Date().toLocaleDateString('es-CL'),
    personal: JSON.parse(JSON.stringify(HOSP.personal)),
    demanda: JSON.parse(JSON.stringify(HOSP.demanda)),
    cfg: JSON.parse(JSON.stringify(HOSP.cfg)),
    turnoOverrides: JSON.parse(JSON.stringify(HOSP.turnoOverrides)),
    resultado: HOSP.resultado ? {
      turnos_opt: HOSP.resultado.turnos_opt,
      semana_tipo: HOSP.resultado.semana_tipo,
    } : null,
  };
  const idx = models.findIndex(m => m.nombre === nombre);
  if (idx >= 0) models[idx] = snap; else models.unshift(snap);
  saveModels(models);
  document.getElementById('modelo-nombre').value = '';
  document.getElementById('modelo-desc').value = '';
  showToast(`Modelo "${nombre}" guardado`, 'ok');
  renderModelosPanel();
}
function cargarModelo(id) {
  const m = loadModels().find(x => x.id === id); if (!m) return;
  HOSP.personal = JSON.parse(JSON.stringify(m.personal));
  HOSP.demanda = JSON.parse(JSON.stringify(m.demanda));
  HOSP.cfg = JSON.parse(JSON.stringify(m.cfg));
  HOSP.turnoOverrides = JSON.parse(JSON.stringify(m.turnoOverrides || {}));
  HOSP.resultado = null; HOSP.hospPlan = {};
  showToast(`Modelo "${m.nombre}" cargado`, 'ok');
  renderHospSidebar(); renderHospContent();
}
function eliminarModelo(id) {
  saveModels(loadModels().filter(x => x.id !== id));
  renderModelosPanel(); showToast('Modelo eliminado', 'ok');
}
function renderModelosPanel() {
  const el = document.getElementById('hosp-modelos-lista'); if (!el) return;
  const models = loadModels();
  if (!models.length) {
    el.innerHTML = `<div style="font-size:11px;color:var(--muted);padding:8px 0;text-align:center">No hay modelos guardados</div>`; return;
  }
  el.innerHTML = models.map(m => `
    <div style="border:1px solid var(--border);border-radius:6px;padding:9px 10px;margin-bottom:8px;background:var(--surface2)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div style="font-size:12px;font-weight:700;color:var(--text)">${m.nombre}</div>
        <span style="font-size:9px;color:var(--muted)">${m.fecha}</span>
      </div>
      ${m.descripcion ? `<div style="font-size:10px;color:var(--muted);margin-top:2px">${m.descripcion}</div>` : ''}
      <div style="font-size:10px;color:var(--muted);margin-top:3px">${m.personal.length} personas · ${MESES_HOSP[m.cfg.mes]} ${m.cfg.anio}</div>
      <div style="display:flex;gap:6px;margin-top:8px">
        <button onclick="cargarModelo(${m.id})" style="flex:1;padding:5px;border-radius:5px;border:1.5px solid var(--accent);background:transparent;color:var(--accent);font-size:11px;font-weight:600;cursor:pointer">↩ Cargar</button>
        <button onclick="if(confirm('¿Eliminar?'))eliminarModelo(${m.id})" style="padding:5px 8px;border-radius:5px;border:1.5px solid #e0c8c8;background:transparent;color:#c0392b;font-size:11px;cursor:pointer">✕</button>
      </div>
    </div>`).join('');
}

// ── SIDEBAR ───────────────────────────────────────────────────────────────────
function renderHospSidebar() {
  const panel = document.getElementById('panel-hospitalizado'); if (!panel) return;
  const porRol = HOSP.personal.reduce((a, p) => { (a[p.rol] = a[p.rol] || []).push(p); return a; }, {});

  panel.innerHTML = `
    <div class="sidebar-section">
      <div class="section-label">Período</div>
      <div class="param-row">
        <div class="param-label">Mes <span class="param-val" id="hosp-mes-val">${MESES_HOSP[HOSP.cfg.mes] || ''}</span></div>
        <input type="number" id="hosp-mes" min="1" max="12" value="${HOSP.cfg.mes}" class="cfg-input"
          oninput="HOSP.cfg.mes=+this.value;document.getElementById('hosp-mes-val').textContent=MESES_HOSP[+this.value]||''">
      </div>
      <div class="param-row">
        <div class="param-label">Año <span class="param-val" id="hosp-anio-val">${HOSP.cfg.anio}</span></div>
        <input type="number" id="hosp-anio" min="2024" max="2099" value="${HOSP.cfg.anio}" class="cfg-input"
          oninput="HOSP.cfg.anio=+this.value;document.getElementById('hosp-anio-val').textContent=this.value">
      </div>
      <div class="param-row">
        <div class="param-label">Horas máx/sem <span class="param-val" id="hosp-hmax-val">${HOSP.cfg.horas_max_semana}h</span></div>
        <input type="range" min="30" max="48" value="${HOSP.cfg.horas_max_semana}"
          oninput="HOSP.cfg.horas_max_semana=+this.value;document.getElementById('hosp-hmax-val').textContent=this.value+'h'">
      </div>
    </div>

    <div class="sidebar-section">
      <div class="section-label">Horario Pabellón</div>
      <div class="param-row">
        <div class="param-label">Apertura <span class="param-val" id="hosp-ap-val">${HOSP.cfg.hora_apertura}</span></div>
        <input type="range" id="hosp-ap" min="0" max="23" step="0.5"
          value="${slotFromTime(HOSP.cfg.hora_apertura) / 2}" oninput="hospSetApertura(+this.value)">
      </div>
      <div class="param-row">
        <div class="param-label">Cierre <span class="param-val" id="hosp-ci-val">${HOSP.cfg.hora_cierre}</span></div>
        <input type="range" id="hosp-ci" min="12" max="24" step="0.5"
          value="${slotFromTime(HOSP.cfg.hora_cierre) / 2}" oninput="hospSetCierre(+this.value)">
      </div>
    </div>

    <div class="sidebar-section">
      <div class="section-label">Demanda de Pabellones</div>
      <div id="hosp-franjas"></div>
      <button onclick="hospAddFranja()" style="margin-top:8px;width:100%;padding:7px;
        border:1.5px dashed var(--border2);border-radius:6px;background:transparent;
        color:var(--muted);font-size:12px;cursor:pointer;font-family:var(--sans)">+ Agregar franja</button>
    </div>

    <div class="sidebar-section">
      <div class="section-label" style="display:flex;justify-content:space-between;align-items:center">
        Personal (${HOSP.personal.length})
        <button onclick="hospToggleAgregar()" style="border:none;background:transparent;color:var(--accent);font-size:11px;font-weight:700;cursor:pointer;padding:0">+ Agregar</button>
      </div>
      <div id="hosp-agregar-personal" style="display:none;margin-bottom:10px;padding:10px;
        background:var(--accent-lt);border-radius:7px;border:1px solid var(--border)">
        <div style="font-size:10px;font-weight:700;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">Nuevo Personal</div>
        <input type="text" id="np-nombre" placeholder="Nombre (ej: J. PÉREZ)" class="cfg-input" style="margin-bottom:6px">
        <select id="np-rol" class="cfg-input" style="margin-bottom:6px">
          ${ROL_OPTS.map(r => `<option value="${r}">${ROL_LABEL[r] || r}</option>`).join('')}
        </select>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
          <span style="font-size:11px;color:var(--text2)">Horas/sem:</span>
          <input type="number" id="np-horas" min="4" max="48" value="42" class="cfg-input" style="width:60px">
        </div>
        <div style="display:flex;gap:6px">
          <button onclick="hospAgregarPersonal()" style="flex:1;padding:6px;border-radius:5px;border:none;background:var(--accent);color:#fff;font-size:11px;font-weight:700;cursor:pointer">✓ Agregar</button>
          <button onclick="hospToggleAgregar()" style="padding:6px 10px;border-radius:5px;border:1px solid var(--border);background:transparent;color:var(--muted);font-size:11px;cursor:pointer">✕</button>
        </div>
      </div>
      <div id="hosp-personal-lista">
        ${Object.entries(porRol).map(([rol, personas]) => `
          <div style="margin-bottom:10px">
            <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">${ROL_LABEL[rol] || rol}</div>
            ${personas.map(p => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #f0f2f5;font-size:11px">
                <span style="font-weight:600">${p.nombre}</span>
                <div style="display:flex;align-items:center;gap:6px">
                  <span style="font-family:var(--mono);color:var(--accent);font-size:10px">${p.horas_semana}h</span>
                  <button onclick="hospEliminarPersonal('${p.nombre}')" style="border:none;background:none;color:#c0392b;cursor:pointer;font-size:12px;padding:0 2px">×</button>
                </div>
              </div>`).join('')}
          </div>`).join('')}
      </div>
    </div>

    <div class="sidebar-section">
      <div class="section-label">Acciones</div>
      <button class="btn-primary" id="btnHospSolver" onclick="ejecutarHospSolver()">▶ Calcular Plantilla</button>
      <div id="hosp-solver-status" style="margin-top:10px;font-size:11px;color:var(--muted);line-height:1.5"></div>
    </div>

    <div class="sidebar-section">
      <div class="section-label">Guardar Modelo</div>
      <input type="text" id="modelo-nombre" placeholder="Nombre del modelo" class="cfg-input" style="margin-bottom:6px">
      <textarea id="modelo-desc" placeholder="Descripción opcional..." class="cfg-input"
        style="resize:vertical;min-height:44px;font-family:var(--sans);margin-bottom:6px"></textarea>
      <button onclick="guardarModelo()" class="btn-primary">💾 Guardar Modelo</button>
      <div style="margin-top:14px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:8px">Modelos Guardados</div>
        <div id="hosp-modelos-lista"></div>
      </div>
    </div>`;

  renderHospFranjas();
  renderModelosPanel();
}

function hospToggleAgregar() {
  const el = document.getElementById('hosp-agregar-personal');
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}
function hospAgregarPersonal() {
  const nombre = document.getElementById('np-nombre')?.value?.trim();
  const rol = document.getElementById('np-rol')?.value;
  const horas = parseInt(document.getElementById('np-horas')?.value) || 42;
  if (!nombre) { showToast('Ingresa un nombre', 'err'); return; }
  if (HOSP.personal.find(p => p.nombre === nombre)) { showToast('Ya existe ese nombre', 'err'); return; }
  HOSP.personal.push({ nombre, rol, horas_semana: horas });
  showToast(`${nombre} agregado`, 'ok');
  renderHospSidebar();
}
function hospEliminarPersonal(nombre) {
  if (!confirm(`¿Eliminar a ${nombre}?`)) return;
  HOSP.personal = HOSP.personal.filter(p => p.nombre !== nombre);
  if (HOSP.resultado) {
    HOSP.resultado.personal = HOSP.resultado.personal.filter(p => p.nombre !== nombre);
    delete HOSP.hospPlan[nombre];
    renderHospContent();
  }
  renderHospSidebar(); showToast(`${nombre} eliminado`, 'ok');
}
function hospSetApertura(h) {
  HOSP.cfg.hora_apertura = timeFromSlot(Math.round(h * 2));
  document.getElementById('hosp-ap-val').textContent = HOSP.cfg.hora_apertura;
}
function hospSetCierre(h) {
  const s = Math.round(h * 2);
  HOSP.cfg.hora_cierre = s >= 48 ? '24:00' : timeFromSlot(s);
  document.getElementById('hosp-ci-val').textContent = HOSP.cfg.hora_cierre;
}
function renderHospFranjas() {
  const el = document.getElementById('hosp-franjas'); if (!el) return;
  el.innerHTML = HOSP.demanda.map((f, i) => `
    <div style="display:flex;align-items:center;gap:5px;margin-bottom:7px;font-size:11px">
      <input type="time" value="${f.inicio}" style="width:70px;padding:3px 4px;border:1px solid var(--border);border-radius:5px;font-size:10px;font-family:var(--mono)"
        onchange="HOSP.demanda[${i}].inicio=this.value">
      <span style="color:var(--muted);font-size:10px">→</span>
      <input type="time" value="${f.fin === '24:00' ? '23:59' : f.fin}" style="width:70px;padding:3px 4px;border:1px solid var(--border);border-radius:5px;font-size:10px;font-family:var(--mono)"
        onchange="HOSP.demanda[${i}].fin=this.value==='23:59'?'24:00':this.value">
      <input type="number" min="0" max="10" value="${f.pabellones}" style="width:36px;padding:3px 4px;border:1px solid var(--border);border-radius:5px;font-size:10px;font-family:var(--mono);text-align:center"
        onchange="HOSP.demanda[${i}].pabellones=+this.value">
      <span style="color:var(--muted);font-size:9px">pab</span>
      <button onclick="hospRemoveFranja(${i})" style="border:none;background:none;color:#c0392b;cursor:pointer;font-size:13px;padding:0 2px">×</button>
    </div>`).join('');
}
function hospAddFranja() {
  const last = HOSP.demanda[HOSP.demanda.length - 1];
  HOSP.demanda.push({ inicio: last ? last.fin : '07:00', fin: '24:00', pabellones: 1 });
  renderHospFranjas();
}
function hospRemoveFranja(i) { HOSP.demanda.splice(i, 1); renderHospFranjas(); }

// ── SOLVER ────────────────────────────────────────────────────────────────────
async function ejecutarHospSolver() {
  const btn = document.getElementById('btnHospSolver');
  const st = document.getElementById('hosp-solver-status');
  btn.disabled = true; st.innerHTML = '⏳ Conectando...';
  try {
    const ping = await fetch('http://127.0.0.1:5050/hosp/ping', { signal: AbortSignal.timeout(3000) });
    if (!ping.ok) throw new Error('no responde');
  } catch {
    st.innerHTML = '❌ Solver no disponible. Ejecuta <b>run.bat</b>.';
    btn.disabled = false; return;
  }
  st.innerHTML = '⏳ Optimizando turnos...';
  const t0 = Date.now();
  try {
    const res = await fetch('http://127.0.0.1:5050/hosp/solve', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personal: HOSP.personal, demanda: HOSP.demanda, configuracion: HOSP.cfg }),
      signal: AbortSignal.timeout(180000),
    });
    const data = await res.json();
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    if (data.status === 'error') { st.innerHTML = `❌ ${data.mensaje}`; btn.disabled = false; return; }
    if (data.status === 'infeasible') { st.innerHTML = `⚠️ Sin solución.<br><span style="font-size:10px">${data.mensaje}</span>`; btn.disabled = false; return; }
    HOSP.resultado = data; HOSP.semanaIdx = 0; HOSP.turnoOverrides = {};
    HOSP.hospPlan = JSON.parse(JSON.stringify(data.semana_tipo));
    st.innerHTML = `✅ Listo en ${elapsed}s`;
    showToast('Plantilla generada', 'ok');
    renderHospContent();
  } catch (e) { st.innerHTML = `❌ ${e.message}`; }
  btn.disabled = false;
}

// ── COBERTURA ─────────────────────────────────────────────────────────────────
function calcCobertura() {
  const d = HOSP.resultado; if (!d) return {};
  const turnos = getTurnosEfectivos();
  const reqSlot = {};
  HOSP.demanda.forEach(f => {
    const ini = slotFromTime(f.inicio);
    const fin = Math.min(f.fin === '24:00' ? 48 : slotFromTime(f.fin), 48);
    for (let s = ini; s < fin; s++) reqSlot[s] = Math.max(reqSlot[s] || 0, f.pabellones);
  });
  const eu_n = d.personal.filter(p => p.rol === 'enfermera_eu').map(p => p.nombre);
  const aseo_n = d.personal.filter(p => p.rol === 'aux_aseo').map(p => p.nombre);
  const DXT = { 'M': DIAS_LAB, 'I': ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'], 'T': ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'] };
  const cob = {};
  Object.entries(reqSlot).sort(([a], [b]) => +a - +b).forEach(([sStr, pab]) => {
    const s = +sStr;
    const req_eu = Math.max(1, Math.ceil(pab / 2));
    const euD = [], aseoD = [];
    const diasOp = DIAS_LAB.filter(dow => Object.entries(turnos).some(([t, to]) => to.ini_slot <= s && s < to.fin_slot && DXT[t]?.includes(dow)));
    diasOp.forEach(dow => {
      let eu_c = 0, aseo_c = 0;
      d.personal.forEach(p => {
        const t = HOSP.hospPlan[p.nombre]?.[dow] || '';
        if (!t || t === 'DOM') return;
        const to = turnos[t]; if (!to || !DXT[t]?.includes(dow)) return;
        if (!(to.ini_slot <= s && s < to.fin_slot)) return;
        if (eu_n.includes(p.nombre)) eu_c++;
        if (aseo_n.includes(p.nombre)) aseo_c++;
      });
      euD.push(eu_c); aseoD.push(aseo_c);
    });
    if (!euD.length) return;
    cob[timeFromSlot(s)] = {
      pabellones: pab, req_eu,
      cob_eu: Math.min(...euD), deficit_eu: Math.max(0, req_eu - Math.min(...euD)),
      req_aseo: 1, cob_aseo: Math.min(...aseoD), deficit_aseo: Math.max(0, 1 - Math.min(...aseoD)),
    };
  });
  return cob;
}
function calcHorasTipo() {
  const d = HOSP.resultado; if (!d) return {};
  const turnos = getTurnosEfectivos();
  const DXT = { 'M': DIAS_LAB, 'I': ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'], 'T': ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'] };
  const out = {};
  d.personal.forEach(p => {
    const n = p.nombre; let h = 0;
    DIAS_LAB.forEach(dow => {
      const t = HOSP.hospPlan[n]?.[dow] || '';
      if (!t || t === 'DOM' || !DXT[t]?.includes(dow)) return;
      const to = turnos[t]; if (!to) return;
      h += Math.max(0, ((to.fin_slot - to.ini_slot) - 1) * 0.5);
    });
    out[n] = Math.round(h * 10) / 10;
  });
  return out;
}

// ── TIME-PICKER HELPERS ──────────────────────────────────────────────────────
function _turnoSliderCSS() {
  if (document.getElementById('ts-css')) return;
  const s = document.createElement('style'); s.id = 'ts-css';
  s.textContent = `
.ts-card{border-radius:8px;padding:11px 13px;min-width:180px;flex:1}
.ts-title{font-weight:700;font-size:13px;margin-bottom:2px}
.ts-lbl{font-family:var(--mono);font-size:10px;font-weight:600;
  background:rgba(255,255,255,.55);padding:2px 7px;border-radius:4px}
.ts-timeline{position:relative;height:28px;background:rgba(0,0,0,.06);border-radius:4px;overflow:hidden}
.ts-tl-seg{position:absolute;top:0;height:100%;display:flex;align-items:center;
  justify-content:center;font-size:10px;font-weight:700;opacity:.85;transition:left .05s,width .05s}
/* Time picker spinners */
.ts-time-group{display:flex;align-items:center;gap:2px}
.ts-spin{
  width:36px;padding:4px 2px;text-align:center;
  border:1px solid rgba(0,0,0,.15);border-radius:5px;
  font-family:var(--mono);font-size:13px;font-weight:700;
  background:rgba(255,255,255,.6);color:inherit;
  -moz-appearance:textfield;outline:none;
}
.ts-spin:focus{border-color:rgba(0,0,0,.35);background:rgba(255,255,255,.85)}
.ts-spin::-webkit-inner-spin-button,
.ts-spin::-webkit-outer-spin-button{opacity:1;cursor:pointer}
.ts-sep{font-weight:700;font-size:14px;opacity:.5;margin:0 1px}
`;
  document.head.appendChild(s);
}
function _buildTimeline(turnos, AP, CI) {
  const range = CI - AP; if (range <= 0) return '';
  const segs = ['M', 'I', 'T'].map(t => {
    const to = turnos[t]; if (!to) return '';
    const c = TURNO_COLOR[t];
    const left = ((to.ini_slot - AP) / range * 100).toFixed(2);
    const w = ((to.fin_slot - to.ini_slot) / range * 100).toFixed(2);
    return `<div class="ts-tl-seg" id="ts-tl-${t}" style="left:${left}%;width:${w}%;background:${c.bg};
      border:1px solid ${c.border};color:${c.text}">${t}</div>`;
  }).join('');
  const ticks = [];
  for (let s = AP; s <= CI; s += 4) {
    const pct = ((s - AP) / range * 100).toFixed(2);
    ticks.push(`<div style="position:absolute;left:${pct}%;top:0;height:100%;
      border-left:1px solid rgba(0,0,0,.1);pointer-events:none"></div>
      <div style="position:absolute;left:${pct}%;bottom:-14px;transform:translateX(-50%);
      font-size:8px;color:var(--muted);font-family:var(--mono)">${timeFromSlot(s)}</div>`);
  }
  return `<div style="margin-bottom:18px">
    <div class="ts-timeline" id="hosp-timeline">${segs}</div>
    <div style="position:relative;height:14px">${ticks.join('')}</div>
  </div>`;
}
function _timePickerHTML(id, slot, color) {
  const h = Math.floor(slot / 2), m = (slot % 2) * 30;
  return `<div class="ts-time-group">
    <input type="number" id="${id}-h" class="ts-spin" style="color:${color}"
      min="0" max="24" step="1" value="${h}"
      onchange="hospTimePick('${id}')">
    <span class="ts-sep" style="color:${color}">:</span>
    <input type="number" id="${id}-m" class="ts-spin" style="color:${color}"
      min="0" max="30" step="30" value="${String(m).padStart(2, '0')}"
      onchange="hospTimePick('${id}')">
  </div>`;
}
function _turnoCardHTML(t, to, AP, CI, c) {
  const durH = Math.max(0, ((to.fin_slot - to.ini_slot) - 1) * 0.5).toFixed(1);
  return `<div class="ts-card" style="background:${c.bg};border:1px solid ${c.border}">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <span class="ts-title" style="color:${c.text}">Turno ${t}</span>
      <span class="ts-lbl" id="ts-lbl-${t}" style="color:${c.text}">${to.ini_str}–${to.fin_str} · ${durH}h</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-top:8px">
      <span style="font-size:10px;font-weight:600;width:32px;color:${c.text}">Inicio</span>
      ${_timePickerHTML('ts-ini-' + t, to.ini_slot, c.text)}
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
      <span style="font-size:10px;font-weight:600;width:32px;color:${c.text}">Fin</span>
      ${_timePickerHTML('ts-fin-' + t, to.fin_slot, c.text)}
    </div>
  </div>`;
}
function _initTurnoSliders() { /* no-op, pickers set values inline */ }

function _slotFromPicker(prefix) {
  const hEl = document.getElementById(prefix + '-h');
  const mEl = document.getElementById(prefix + '-m');
  if (!hEl || !mEl) return 0;
  let h = parseInt(hEl.value) || 0;
  let m = parseInt(mEl.value) || 0;
  // Clamp minutes to 0 or 30
  m = m >= 30 ? 30 : 0;
  mEl.value = String(m).padStart(2, '0');
  // Clamp hours
  if (h < 0) h = 0; if (h > 24) h = 24;
  if (h === 24) { m = 0; mEl.value = '00'; }
  hEl.value = h;
  return h * 2 + m / 30;
}

function hospTimePick(id) {
  // id is like "ts-ini-M" or "ts-fin-T"
  const parts = id.split('-');       // ['ts','ini','M'] or ['ts','fin','T']
  const t = parts[2];                // turno letter
  const iniSlot = _slotFromPicker('ts-ini-' + t);
  const finSlot = _slotFromPicker('ts-fin-' + t);
  let ini = iniSlot, fin = finSlot;
  // Ensure ini < fin
  if (ini >= fin) {
    fin = ini + 1;
    const fh = Math.floor(fin / 2), fm = (fin % 2) * 30;
    const fhEl = document.getElementById(`ts-fin-${t}-h`);
    const fmEl = document.getElementById(`ts-fin-${t}-m`);
    if (fhEl) fhEl.value = fh;
    if (fmEl) fmEl.value = String(fm).padStart(2, '0');
  }
  // Update label
  const iniStr = timeFromSlot(ini), finStr = timeFromSlot(fin);
  const durH = Math.max(0, ((fin - ini) - 1) * 0.5).toFixed(1);
  const lbl = document.getElementById(`ts-lbl-${t}`);
  if (lbl) lbl.textContent = `${iniStr}–${finStr} · ${durH}h`;
  // Save override
  if (!HOSP.turnoOverrides[t]) {
    const base = HOSP.resultado.turnos_opt[t];
    HOSP.turnoOverrides[t] = { ini_slot: base.ini_slot, fin_slot: base.fin_slot };
  }
  HOSP.turnoOverrides[t].ini_slot = ini;
  HOSP.turnoOverrides[t].fin_slot = fin;
  // Update timeline + coverage + hours
  _updateTimelineSeg(t);
  _actualizarCobertura();
}
function _updateTimelineSeg(t) {
  const turnos = getTurnosEfectivos();
  const to = turnos[t]; if (!to) return;
  const base = HOSP.resultado.turnos_opt;
  const AP = base.M.ini_slot, CI = base.T.fin_slot;
  const range = CI - AP; if (range <= 0) return;
  const seg = document.getElementById(`ts-tl-${t}`);
  if (seg) {
    seg.style.left = ((to.ini_slot - AP) / range * 100).toFixed(2) + '%';
    seg.style.width = ((to.fin_slot - to.ini_slot) / range * 100).toFixed(2) + '%';
  }
}

// ── RENDER PRINCIPAL ──────────────────────────────────────────────────────────
function renderHospContent() {
  const content = document.getElementById('content');
  if (!HOSP.resultado) {
    content.innerHTML = `<div class="empty">
      <div class="empty-icon">🏥</div>
      <div class="empty-title">Módulo Hospitalizado</div>
      <div class="empty-sub">Configura la demanda y ejecuta el solver para generar la plantilla mensual.</div>
    </div>`; return;
  }
  const d = HOSP.resultado;
  const turnos = getTurnosEfectivos();
  const cob = calcCobertura();
  const horasTipo = calcHorasTipo();
  const defTotal = Object.values(cob).reduce((s, c) => s + c.deficit_eu + c.deficit_aseo, 0);
  const AP = slotFromTime(d.hora_apertura);
  const CI = slotFromTime(d.hora_cierre);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpiHTML = `<div class="kpi-row">
    <div class="kpi-card ${defTotal === 0 ? 'green' : 'amber'}">
      <div class="kpi-label">Déficit cobertura</div>
      <div class="kpi-val" id="hosp-kpi-def">${defTotal.toFixed(1)}</div>
      <div class="kpi-sub">${defTotal === 0 ? 'Cobertura completa ✓' : 'franjas sin cubrir'}</div>
    </div>
    <div class="kpi-card blue">
      <div class="kpi-label">Rango operacional</div>
      <div class="kpi-val" style="font-size:16px">${d.hora_apertura} – ${d.hora_cierre}</div>
      <div class="kpi-sub">3 turnos · ${d.personal.length} personas</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Semanas</div>
      <div class="kpi-val">${d.semanas.length}</div>
      <div class="kpi-sub">${MESES_HOSP[HOSP.cfg.mes]} ${HOSP.cfg.anio}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Horas equipo/sem</div>
      <div class="kpi-val" id="hosp-kpi-horas">${Object.values(horasTipo).reduce((a, b) => a + b, 0)}h</div>
      <div class="kpi-sub">total</div>
    </div>
  </div>`;

  // ── Ajuste de turnos (sliders nativos + timeline) ──────────────────────────
  _turnoSliderCSS();
  const turnoCards = ['M', 'I', 'T'].map(t => {
    const to = turnos[t]; if (!to) return '';
    return _turnoCardHTML(t, to, AP, CI, TURNO_COLOR[t]);
  }).join('');

  const ajusteHTML = `<div class="table-card">
    <div class="table-card-header">
        <div>
            <div class="table-card-title">⚙️ Ajuste de Horarios por Turno</div>
            <div class="table-card-sub">Mueve inicio/fin de cada turno · pueden solaparse · cobertura actualiza en tiempo real</div>
        </div>
        <button onclick="hospResetTurnos()" style="padding:5px 12px;border-radius:5px;
            border:1.5px solid var(--border2);background:transparent;color:var(--muted);
            font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap">↺ Resetear</button>
    </div>
    <div style="padding:14px 16px">
      ${_buildTimeline(turnos, AP, CI)}
      <div style="display:flex;gap:12px;flex-wrap:wrap">${turnoCards}</div>
    </div>
  </div>`;

  // ── Selector de semana ────────────────────────────────────────────────────
  const semBtns = d.semanas.map((sem, i) => {
    const fechas = sem.fechas || [];
    const label = fechas.length ? `${fechas[0].slice(8)}–${fechas[fechas.length - 1].slice(8)}` : `Sem ${i + 1}`;
    const active = i === HOSP.semanaIdx;
    return `<button onclick="hospGoSem(${i})" style="padding:5px 12px;border-radius:5px;
      border:1px solid ${active ? 'var(--accent)' : 'var(--border)'};
      background:${active ? 'var(--accent)' : 'var(--surface2)'};
      color:${active ? '#fff' : 'var(--text2)'};
      font-family:var(--sans);font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap">
      Sem ${i + 1}<br><span style="font-size:9px;font-weight:400;opacity:.85">${label}</span>
    </button>`;
  }).join('');
  const semSelector = `<div style="display:flex;gap:6px;flex-wrap:wrap;padding:12px 20px;
    background:var(--surface);border:1px solid var(--border);border-radius:var(--radius)">
    <span style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;
      letter-spacing:.5px;align-self:center;margin-right:4px">Semana:</span>${semBtns}</div>`;

  // ── Tablas por rol ────────────────────────────────────────────────────────
  const semData = d.semanas[HOSP.semanaIdx] || d.semanas[0];
  const diasSem = (semData.dias || []).filter(([, dow]) => dow !== 'domingo');
  const porRol = d.personal.reduce((a, p) => { (a[p.rol] = a[p.rol] || []).push(p); return a; }, {});
  const tablaHTML = Object.entries(porRol).map(([rol, personas]) => {
    const thDias = diasSem.map(([fecha, dow]) => {
      const esSab = dow === 'sábado';
      return `<th style="min-width:56px;padding:5px 4px;font-size:10px;font-weight:600;
        text-align:center;background:${esSab ? '#fef9ec' : 'var(--surface2)'};
        color:${esSab ? '#92400e' : 'var(--text2)'};border-bottom:1px solid var(--border)">
        <div>${DOW_SHORT[dow]}</div>
        <div style="font-weight:400;color:var(--muted);font-size:9px">${fecha.slice(8)}</div></th>`;
    }).join('');
    const rows = personas.map(p => {
      const n = p.nombre;
      const celdas = diasSem.map(([fecha, dow]) => {
        const t = HOSP.hospPlan[n]?.[dow] ?? '';
        const c = TURNO_COLOR[t] || TURNO_COLOR[''];
        const opts = (dow === 'sábado' ? ['M', ''] : ['M', 'T', 'I', '']).map(o =>
          `<option value="${o}" ${o === t ? 'selected' : ''}>${o || '—'}</option>`).join('');
        return `<td style="padding:2px 3px;text-align:center;border-bottom:1px solid #f0f2f5">
          <select onchange="hospSetTurno('${n}','${dow}',this.value)"
            style="background:${c.bg};border:1px solid ${c.border};color:${c.text};
            border-radius:3px;font-size:11px;font-weight:700;padding:2px 3px;cursor:pointer;width:44px;text-align:center">${opts}</select></td>`;
      }).join('');
      const h = horasTipo[n] ?? 0;
      const hColor = h > HOSP.cfg.horas_max_semana ? '#c0392b' : 'var(--success)';
      return `<tr>
        <td style="padding:6px 12px;font-weight:600;font-size:11px;white-space:nowrap;
          position:sticky;left:0;background:var(--surface);z-index:2;
          border-right:1px solid var(--border);border-bottom:1px solid #f0f2f5">${n}</td>
        ${celdas}
        <td style="padding:4px 10px;font-family:var(--mono);font-size:11px;font-weight:700;
          text-align:center;color:${hColor};border-left:2px solid var(--border);
          border-bottom:1px solid #f0f2f5" id="h_${n.replace(/\W/g, '_')}">${h}h</td>
      </tr>`;
    }).join('');
    return `<div class="table-card">
      <div class="table-card-header">
        <div>
          <div class="table-card-title">${ROL_LABEL[rol] || rol}</div>
          <div class="table-card-sub">Semana ${HOSP.semanaIdx + 1} · ${personas.length} persona${personas.length > 1 ? 's' : ''}</div>
        </div>
        <button onclick="exportarHospExcel('${rol}')" class="btn-export" style="width:auto;padding:5px 12px">↓ Exportar</button>
      </div>
      <div class="table-scroll">
        <table style="border-collapse:collapse;width:100%">
          <thead><tr>
            <th style="padding:5px 12px;font-size:10px;font-weight:700;text-align:left;
              background:var(--surface2);border-bottom:1px solid var(--border);
              position:sticky;left:0;z-index:3;min-width:120px">Nombre</th>
            ${thDias}
            <th style="padding:5px 8px;font-size:9px;color:var(--muted);font-weight:600;
              text-align:center;border-left:2px solid var(--border);
              border-bottom:1px solid var(--border);background:var(--surface2)">Horas</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
  }).join('');

  // ── Grilla cobertura ──────────────────────────────────────────────────────
  const cobHTML = buildCobGrilla(cob);
  content.innerHTML = kpiHTML + ajusteHTML + semSelector + tablaHTML + cobHTML;

  // Forzar valores de sliders después de que el DOM existe
  _initTurnoSliders();
}

// ── GRILLA COBERTURA HEATMAP ──────────────────────────────────────────────────
function _cobCSS() {
  if (document.getElementById('cob-css')) return;
  const s = document.createElement('style'); s.id = 'cob-css';
  s.textContent = `
    .cob-ok  {background:#e6f5ee;color:#1a6f45;font-weight:600}
    .cob-w1  {background:#fff8cc;color:#7a5c00;font-weight:600}
    .cob-w2  {background:#ffe6a0;color:#7a4000;font-weight:700}
    .cob-w3  {background:#ffcca0;color:#8b2000;font-weight:700}
    .cob-w4  {background:#ffaaaa;color:#6b0000;font-weight:700}
    .cob-cell{padding:7px 8px;text-align:center;font-family:var(--mono);font-size:12px;
              border-bottom:1px solid #f0f2f5;border-right:1px solid #f0f2f5;vertical-align:middle}
    .cob-hora{padding:7px 14px;font-family:var(--mono);font-size:12px;font-weight:600;
              color:var(--text2);white-space:nowrap;background:var(--surface);
              position:sticky;left:0;border-right:1px solid var(--border);
              border-bottom:1px solid #f0f2f5;z-index:1}
    .cob-bar-wrap{height:3px;border-radius:2px;background:rgba(0,0,0,.08);margin-top:3px}
    .cob-bar{height:100%;border-radius:2px}`;
  document.head.appendChild(s);
}
function heatCobCls(deficit) {
  if (deficit === 0) return 'cob-ok';
  if (deficit < 1) return 'cob-w1';
  if (deficit < 2) return 'cob-w2';
  if (deficit < 3) return 'cob-w3';
  return 'cob-w4';
}
function cobRow(hora, c) {
  const okEu = c.deficit_eu === 0, okAs = c.deficit_aseo === 0;
  const eu_pct = c.req_eu > 0 ? Math.min(100, Math.round(c.cob_eu / c.req_eu * 100)) : 100;
  const as_pct = c.req_aseo > 0 ? Math.min(100, Math.round(c.cob_aseo / c.req_aseo * 100)) : 100;
  const barColor = ok => ok ? '#1a8a5a' : '#e07040';
  return `<tr>
    <td class="cob-hora">${hora}</td>
    <td class="cob-cell" style="color:var(--text2)">${c.pabellones}</td>
    <td class="cob-cell">${c.req_eu}</td>
    <td class="cob-cell ${heatCobCls(c.deficit_eu)}">
      ${c.cob_eu}
      <div class="cob-bar-wrap"><div class="cob-bar" style="width:${eu_pct}%;background:${barColor(okEu)}"></div></div>
    </td>
    <td class="cob-cell" style="font-size:10px;font-weight:700;color:${okEu ? 'var(--success)' : '#c0392b'}">${okEu ? '✓' : '−' + c.deficit_eu}</td>
    <td class="cob-cell" style="border-left:2px solid var(--border)">${c.req_aseo}</td>
    <td class="cob-cell ${heatCobCls(c.deficit_aseo)}">
      ${c.cob_aseo}
      <div class="cob-bar-wrap"><div class="cob-bar" style="width:${as_pct}%;background:${barColor(okAs)}"></div></div>
    </td>
    <td class="cob-cell" style="font-size:10px;font-weight:700;color:${okAs ? 'var(--success)' : '#c0392b'}">${okAs ? '✓' : '−' + c.deficit_aseo}</td>
  </tr>`;
}
function buildCobGrilla(cob) {
  _cobCSS();
  if (!Object.keys(cob).length) return '';
  const rows = Object.entries(cob).map(([h, c]) => cobRow(h, c)).join('');
  const thG = (label, cols, extra = '') =>
    `<th colspan="${cols}" style="padding:5px 8px;font-size:10px;font-weight:700;text-align:center;
        background:var(--surface2);border-bottom:1px solid var(--border);
        border-left:2px solid #e8eaed;color:var(--text2);${extra}">${label}</th>`;
  return `<div class="table-card">
    <div class="table-card-header">
        <div>
            <div class="table-card-title">Cobertura por Franja Horaria</div>
            <div class="table-card-sub">Peor caso entre días laborables · se actualiza al mover sliders o editar turnos</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;font-size:10px;color:var(--muted)">
            <span style="width:9px;height:9px;background:#e6f5ee;border:1px solid #1a8a5a;border-radius:2px;display:inline-block"></span>OK
            <span style="width:9px;height:9px;background:#fff8cc;border:1px solid #eab308;border-radius:2px;display:inline-block"></span>Parcial
            <span style="width:9px;height:9px;background:#ffaaaa;border:1px solid #c0392b;border-radius:2px;display:inline-block"></span>Déficit
        </div>
    </div>
    <div class="table-scroll">
        <table style="border-collapse:collapse;width:100%">
            <thead>
                <tr>
                    <th rowspan="2" style="padding:5px 14px;font-size:10px;font-weight:700;text-align:left;
                        background:var(--surface2);border-bottom:1px solid var(--border);
                        position:sticky;left:0;z-index:3;min-width:72px">Franja</th>
                    <th rowspan="2" style="padding:5px 8px;font-size:10px;font-weight:700;text-align:center;
                        background:var(--surface2);border-bottom:1px solid var(--border)">Pab.</th>
                    ${thG('Enfermera EU', 3)}${thG('Aux. Aseo', 3)}
                </tr>
                <tr>
                    ${['Req.', 'Asig.', 'Estado', 'Req.', 'Asig.', 'Estado'].map((h, i) =>
    `<th style="padding:4px 8px;font-size:9px;font-weight:600;text-align:center;
                        background:var(--surface2);border-bottom:1px solid var(--border);color:var(--muted);
                        ${i === 3 ? 'border-left:2px solid #e8eaed' : ''}">${h}</th>`
  ).join('')}
                </tr>
            </thead>
            <tbody id="hosp-cob-body">${rows}</tbody>
        </table>
    </div>
  </div>`;
}

// ── ACTUALIZACIÓN PARCIAL ─────────────────────────────────────────────────────
function _actualizarCobertura() {
  const cob = calcCobertura();
  const horasTipo = calcHorasTipo();
  const defTotal = Object.values(cob).reduce((s, c) => s + c.deficit_eu + c.deficit_aseo, 0);

  const body = document.getElementById('hosp-cob-body');
  if (body) body.innerHTML = Object.entries(cob).map(([h, c]) => cobRow(h, c)).join('');

  const kpiDef = document.getElementById('hosp-kpi-def');
  if (kpiDef) kpiDef.textContent = defTotal.toFixed(1);
  const kpiH = document.getElementById('hosp-kpi-horas');
  if (kpiH) kpiH.textContent = Object.values(horasTipo).reduce((a, b) => a + b, 0) + 'h';

  if (HOSP.resultado) HOSP.resultado.personal.forEach(p => {
    const n = p.nombre;
    const hEl = document.getElementById(`h_${n.replace(/\W/g, '_')}`);
    if (hEl) {
      const h = horasTipo[n] ?? 0;
      hEl.textContent = h + 'h';
      hEl.style.color = h > HOSP.cfg.horas_max_semana ? '#c0392b' : 'var(--success)';
    }
  });
}

// ── AJUSTE INTERACTIVO ────────────────────────────────────────────────────────
function hospResetTurnos() {
  HOSP.turnoOverrides = {};
  renderHospContent();
  showToast('Turnos reseteados', 'ok');
}

// ── EDICIÓN DE TURNO ──────────────────────────────────────────────────────────
function hospSetTurno(nombre, dow, nuevoTurno) {
  if (!HOSP.hospPlan[nombre]) HOSP.hospPlan[nombre] = {};
  HOSP.hospPlan[nombre][dow] = nuevoTurno;
  const d = HOSP.resultado;
  if (d?.semanas) d.semanas.forEach(sem => sem.dias.forEach(([fecha, fdow]) => {
    if (fdow === dow) d.plantilla[nombre][fecha] = nuevoTurno;
  }));
  _actualizarCobertura();
}
function hospGoSem(idx) { HOSP.semanaIdx = idx; renderHospContent(); }

// ── EXPORTAR ──────────────────────────────────────────────────────────────────
function exportarHospExcel(rol) {
  const d = HOSP.resultado; if (!d) return;
  const wb = XLSX.utils.book_new();
  const pers = d.personal.filter(p => !rol || p.rol === rol);
  const rows = [['Nombre', 'Rol', ...d.fechas],
  ...pers.map(p => [p.nombre, ROL_LABEL[p.rol] || p.rol, ...d.fechas.map(f => d.plantilla[p.nombre]?.[f] ?? '')])];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 20 }, { wch: 16 }, ...d.fechas.map(() => ({ wch: 5 }))];
  XLSX.utils.book_append_sheet(wb, ws, ROL_LABEL[rol] || 'Plantilla');
  XLSX.writeFile(wb, `Plantilla_Hosp_${MESES_HOSP[HOSP.cfg.mes]}_${HOSP.cfg.anio}.xlsx`);
  showToast('Exportado', 'ok');
}