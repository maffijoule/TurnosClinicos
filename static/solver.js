// ── CEM Capacity Planner — solver.js ─────────────────────────────────────────
// Grilla semanal editable: arrastrar, redimensionar, eliminar, agregar turnos
// ─────────────────────────────────────────────────────────────────────────────

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
let SMIN = 14;            // set dynamically from solver result (inicio_op)
let SMAX = 42;            // set dynamically from solver result (fin_op)
const SH = 18;          // px por slot (altura de fila)
const LW = 54;          // px columna hora
// CW is dynamic — see getCW()
function getCW() {
  if (!E.ejecutivos.length) return 52;
  const maxLen = Math.max(...E.ejecutivos.map(ej => ej.nombre.split(' ')[0].length));
  return Math.max(52, maxLen * 7 + 12);
}
function tieneColacion(dur) { return dur >= 10; }
function horasTrabajadas(dur) { return (dur - (tieneColacion(dur) ? 1 : 0)) * 0.5; }
const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DIAS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const EJ_COLORS = ['#bfdbfe', '#bbf7d0', '#fef08a', '#fbcfe8',
  '#ddd6fe', '#fed7aa', '#a5f3fc', '#fde68a'];

function slot2str(s) {
  s = parseInt(s, 10);
  return `${String(Math.floor(s / 2)).padStart(2, '0')}:${s % 2 === 0 ? '00' : '30'}`;
}

// ── EDITOR STATE ──────────────────────────────────────────────────────────────
const ED = {
  semanas: [],   // [{semana, dias:[[fecha,dow],...]}]
  turnos: [],   // [{ejNombre:{dia:{activo,ent,dur}}}] — uno por semana
  dem: {},   // {dia:{slot:valor}}
  semIdx: 0,
  solverData: null,
};

// ── INIT ED DESDE RESULTADO SOLVER ───────────────────────────────────────────
function initED(data) {
  ED.solverData = data;
  ED.semanas = data.semanas;
  ED.semIdx = 0;
  // Dynamic operating hours from solver
  if (data.inicio_op != null) SMIN = data.inicio_op;
  if (data.fin_op != null) SMAX = data.fin_op;

  // Demanda por día/slot — bloques de hora: :00 y :30 comparten el mismo valor
  ED.dem = {};
  DIAS.forEach(dia => {
    ED.dem[dia] = {};
    const profile = dia === 'sábado' ? data.dem_sat_profile : data.dem_wd_profile;
    if (!profile) return;
    Object.entries(profile).forEach(([timeStr, val]) => {
      const s = timeToMinutes(timeStr) / 30;
      ED.dem[dia][s] = val;
      ED.dem[dia][s + 1] = val;
    });
  });

  // Convertir turnos del solver al formato ED
  ED.turnos = data.semanas.map(sem => {
    const map = {};
    E.ejecutivos.forEach(ej => {
      map[ej.nombre] = {};
      DIAS.forEach(dia => {
        const t = data.turnos.find(t2 =>
          t2.ejecutivo === ej.nombre && t2.semana === sem.semana && t2.dia === dia
        );
        if (t && !t.libre) {
          const dur = (timeToMinutes(t.salida) - timeToMinutes(t.entrada)) / 30;
          map[ej.nombre][dia] = {
            activo: true,
            ent: timeToMinutes(t.entrada) / 30,
            dur,
            // Use solver-optimized colación offset; fallback to mid-point
            col: (t.colacion_offset != null) ? t.colacion_offset : Math.floor(dur / 2)
          };
        } else {
          map[ej.nombre][dia] = { activo: false, ent: SMIN, dur: 8, col: 4 };
        }
      });
    });
    return map;
  });
}

// ── ENTRY POINT ───────────────────────────────────────────────────────────────
function renderSolverResult(data) {
  S.solverResult = data;
  initED(data);
  buildPage();
}

// ── SCAFFOLD DE PÁGINA ────────────────────────────────────────────────────────
function buildPage() {
  document.getElementById('content').innerHTML = `
    <div id="kpi-area"></div>
    <div id="grid-card" class="table-card">
      <div id="grid-header" class="table-card-header" style="flex-wrap:wrap;gap:8px"></div>
      <div style="display:flex;overflow:hidden">
        <div id="grid-scroll" style="overflow:auto;flex:1"></div>
        <div id="horas-panel" style="width:160px;flex-shrink:0;padding:16px;
          border-left:1px solid var(--border);overflow-y:auto;max-height:600px"></div>
      </div>
    </div>
    <div id="resumen-area"></div>`;
  renderKPI();
  renderGridHeader();
  renderGrid();
  renderHorasPanel();
  renderResumen();
}

// ── KPI ───────────────────────────────────────────────────────────────────────
function renderKPI() {
  const def = calcDeficit();
  document.getElementById('kpi-area').innerHTML = `
  <div class="kpi-row">
    <div class="kpi-card ${def === 0 ? 'green' : 'amber'}">
      <div class="kpi-label">Déficit semana</div>
      <div class="kpi-val" id="kpi-deficit">${def.toFixed(1)}</div>
      <div class="kpi-sub">${def === 0 ? 'Cobertura completa ✓' : 'franjas sin cubrir'}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Semanas</div>
      <div class="kpi-val">${ED.semanas.length}</div>
      <div class="kpi-sub">${MESES[C.mes] || ''} ${C.anio || ''}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Ejecutivos</div>
      <div class="kpi-val">${E.ejecutivos.length}</div>
      <div class="kpi-sub">${E.ejecutivos.filter(e => e.tipo === 'full').length}F · ${E.ejecutivos.filter(e => e.tipo === 'part').length}P</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Horas equipo / sem</div>
      <div class="kpi-val">${totalHorasSem()}h</div>
      <div class="kpi-sub">semana ${ED.semIdx + 1}</div>
    </div>
  </div>`;
}

// ── HEADER ────────────────────────────────────────────────────────────────────
function renderGridHeader() {
  const hdr = document.getElementById('grid-header');
  const btns = ED.semanas.map((sem, i) => `
    <button onclick="goSem(${i})" style="
      padding:5px 12px;border-radius:5px;border:1px solid var(--border);
      background:${i === ED.semIdx ? 'var(--accent)' : 'var(--surface2)'};
      color:${i === ED.semIdx ? '#fff' : 'var(--text2)'};
      font-family:var(--sans);font-size:12px;font-weight:600;cursor:pointer">
      Sem ${i + 1}
    </button>`).join('');

  hdr.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:1">
      <div style="display:flex;gap:4px;flex-wrap:wrap">${btns}</div>
      <span style="font-size:11px;color:var(--muted)">
        ${(ED.semanas[ED.semIdx] || { dias: [] }).dias.map(([f,]) => f).join(' · ')}
      </span>
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <button onclick="mostrarModalGuardarEditado()" class="btn-export"
        style="width:auto;padding:5px 14px">💾 Guardar</button>
      <button onclick="exportarExcelTurnos()" class="btn-export"
        style="width:auto;padding:5px 14px">↓ Exportar</button>
    </div>`;
}

// ── GRILLA PRINCIPAL ──────────────────────────────────────────────────────────
function renderGrid() {
  const scroll = document.getElementById('grid-scroll');
  const sem = ED.turnos[ED.semIdx] || {};
  const nSlots = SMAX - SMIN;

  const ejColorMap = {};
  E.ejecutivos.forEach((ej, i) => ejColorMap[ej.nombre] = EJ_COLORS[i % EJ_COLORS.length]);

  // Header fijo con nombres de ejecutivos por día
  let headerHTML = `<div style="display:flex;position:sticky;top:0;z-index:10;
    background:var(--surface);border-bottom:2px solid var(--border2)">`;
  DIAS.forEach((dia, di) => {
    headerHTML += `<div style="display:flex;border-left:${di ? '2px' : '0'} solid var(--border2)">
      <div style="width:${LW}px;font-size:9px;font-weight:700;color:var(--muted);
        text-align:center;padding:4px 2px;background:var(--surface2);
        text-transform:uppercase;letter-spacing:.5px">${DIAS_SHORT[di]}</div>`;
    E.ejecutivos.forEach(ej => {
      headerHTML += `<div style="width:${getCW()}px;font-size:10px;font-weight:600;
        text-align:center;padding:4px 2px;background:${ejColorMap[ej.nombre]}88;
        border-left:1px solid var(--border);white-space:nowrap;overflow:hidden">
        ${ej.nombre.split(' ')[0]}
      </div>`;
    });
    headerHTML += `</div>`;
  });
  headerHTML += `</div>`;

  // Filas de slots con columna de hora coloreada por cobertura
  let bodyHTML = `<div style="display:flex;position:relative">`;
  DIAS.forEach((dia, di) => {
    bodyHTML += `<div style="display:flex;flex-direction:column;
      border-left:${di ? '2px' : '0'} solid var(--border2);position:relative">`;

    for (let i = 0; i < nSlots; i++) {
      const s = SMIN + i;
      const req = ED.dem[dia]?.[s] || 0;
      const cob = calcCobSem(dia, s, sem);
      const even = s % 2 === 0;  // always label :00 slots regardless of SMIN
      const rowBg = even ? '#f8f9fb' : '#fff';
      const horaBg = req <= 0 ? (even ? '#f0f2f5' : '#f8f9fb')
        : cob >= req ? '#a7f3c0' : '#fca5a5';
      const bdr = even ? 'var(--border)' : '#f0f0f0';

      bodyHTML += `<div style="display:flex;height:${SH}px;background:${rowBg};
        border-bottom:1px solid ${bdr}"
        data-dia="${dia}" data-slot="${s}"
        onmouseenter="tipShow(this,'${dia}',${s})"
        onmouseleave="tipHide()">`;

      // Columna hora — solo ella se colorea según cobertura
      bodyHTML += `<div style="width:${LW}px;flex-shrink:0;font-size:9px;
        font-family:var(--mono);
        color:${req > 0 ? '#374151' : 'var(--muted)'};
        font-weight:${req > 0 ? '600' : '400'};
        padding:0 4px;display:flex;align-items:center;
        background:${horaBg};
        border-right:1px solid var(--border)">
        ${even ? slot2str(s) : ''}
      </div>`;

      // Celdas ejecutivos (bloques en absolute encima)
      E.ejecutivos.forEach(() => {
        bodyHTML += `<div style="width:${getCW()}px;flex-shrink:0;
          border-left:1px solid #ebebeb;position:relative"></div>`;
      });

      bodyHTML += `</div>`;
    }

    // Botón "+" para ejecutivos sin turno
    E.ejecutivos.forEach((ej, ejIdx) => {
      const d = sem[ej.nombre]?.[dia];
      if (!d || !d.activo) {
        const left = LW + ejIdx * getCW();
        bodyHTML += `<div onclick="addTurno('${ej.nombre}','${dia}')"
          style="position:absolute;top:4px;left:${left + 2}px;width:${getCW() - 4}px;
            z-index:4;cursor:pointer;text-align:center;
            border:1.5px dashed #93c5fd;border-radius:5px;
            background:rgba(219,234,254,.25);height:${nSlots * SH - 8}px;
            display:flex;align-items:center;justify-content:center;
            font-size:20px;color:#93c5fd;opacity:.45;transition:opacity .15s"
          onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=.45"
          title="Agregar turno a ${ej.nombre} el ${dia}">+</div>`;
      }
    });

    bodyHTML += `</div>`;
  });
  bodyHTML += `</div>`;

  scroll.innerHTML = headerHTML + bodyHTML;
  drawBlocks(sem);
}

// ── DIBUJAR BLOQUES ───────────────────────────────────────────────────────────
function drawBlocks(sem) {
  const scroll = document.getElementById('grid-scroll');
  scroll.querySelectorAll('.tb-block').forEach(el => el.remove());
  const body = scroll.querySelector('div[style*="position:relative"]');
  if (!body) return;

  const ejColorMap = {};
  E.ejecutivos.forEach((ej, i) => ejColorMap[ej.nombre] = EJ_COLORS[i % EJ_COLORS.length]);

  DIAS.forEach((dia, di) => {
    E.ejecutivos.forEach((ej, ejIdx) => {
      const d = sem[ej.nombre]?.[dia];
      if (!d || !d.activo) return;

      const CW_ = getCW(); const dayW = LW + E.ejecutivos.length * CW_;
      const left = di * dayW + di * 2 + LW + ejIdx * CW_;
      const top = (d.ent - SMIN) * SH;
      const h = d.dur * SH;
      const col = ejColorMap[ej.nombre];

      const block = document.createElement('div');
      block.className = 'tb-block';
      block.dataset.ej = ej.nombre;
      block.dataset.dia = dia;
      block.style.cssText = `
        position:absolute;left:${left + 2}px;top:${top}px;
        width:${getCW() - 4}px;height:${h}px;
        background:${col};border:1.5px solid rgba(0,0,0,.12);
        border-radius:5px;z-index:5;overflow:hidden;
        cursor:grab;box-shadow:0 1px 4px rgba(0,0,0,.08)`;

      block.innerHTML = `
        <div class="tb-top" style="font-size:9px;font-weight:700;padding:2px 4px;
          background:rgba(255,255,255,.65);border-bottom:1px solid rgba(0,0,0,.06);
          white-space:nowrap">${slot2str(d.ent)}</div>
        ${tieneColacion(d.dur) ? `<div class="tb-col" data-ej="${ej.nombre}" data-dia="${dia}"
          style="position:absolute;top:${d.col * SH}px;
          left:0;right:0;height:${SH}px;cursor:ns-resize;z-index:6;
          background:repeating-linear-gradient(45deg,rgba(0,0,0,.05) 0px,rgba(0,0,0,.05) 2px,rgba(255,255,255,.6) 2px,rgba(255,255,255,.6) 6px);
          border-top:1px dashed rgba(100,116,139,.45);border-bottom:1px dashed rgba(100,116,139,.45);
          font-size:7px;text-align:center;line-height:${SH}px;color:#475569;letter-spacing:.3px;font-weight:600">☕</div>` : ''}
        <div class="tb-bot" style="position:absolute;bottom:8px;left:0;right:0;
          font-size:9px;font-weight:700;padding:2px 4px;text-align:right;
          background:rgba(255,255,255,.65)">${slot2str(d.ent + d.dur)}</div>
        <div class="tb-rh" data-ej="${ej.nombre}" data-dia="${dia}"
          style="position:absolute;bottom:0;left:0;right:0;height:7px;
            cursor:ns-resize;background:rgba(100,116,139,.25);z-index:6"></div>`;

      body.appendChild(block);
    });
  });

  attachBlockHandlers();
}

// ── HANDLERS DE BLOQUES ───────────────────────────────────────────────────────
function attachBlockHandlers() {
  // Remove any existing context menu
  const old = document.getElementById('tb-ctx');
  if (old) old.remove();

  // Context menu element (singleton)
  const ctx = document.createElement('div');
  ctx.id = 'tb-ctx';
  ctx.style.cssText = `display:none;position:fixed;z-index:9999;
    background:var(--surface);border:1px solid var(--border);
    border-radius:7px;box-shadow:0 4px 16px rgba(0,0,0,.15);
    padding:4px;min-width:150px;font-family:var(--sans);font-size:12px`;
  document.body.appendChild(ctx);

  const hideCtx = () => { ctx.style.display = 'none'; };
  document.addEventListener('mousedown', e => {
    if (!ctx.contains(e.target)) hideCtx();
  });

  document.querySelectorAll('.tb-block').forEach(block => {

    // Right-click → context menu
    block.addEventListener('contextmenu', e => {
      e.preventDefault();
      const { ej, dia } = block.dataset;
      ctx.innerHTML = `
        <div style="padding:4px 8px;font-size:10px;font-weight:700;color:var(--muted);
          text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border);
          margin-bottom:4px">${ej.split(' ')[0]} — ${dia}</div>
        <div class="ctx-item" style="padding:7px 12px;border-radius:5px;cursor:pointer;
          color:#c0392b;font-weight:600;display:flex;align-items:center;gap:6px"
          onmouseenter="this.style.background='#fff5f5'"
          onmouseleave="this.style.background=''"
          onclick="ED.turnos[ED.semIdx]['${ej}']['${dia}'].activo=false;refreshAll();document.getElementById('tb-ctx').style.display='none'">
          🗑 Eliminar turno
        </div>`;
      ctx.style.display = 'block';
      ctx.style.left = `${e.clientX}px`;
      ctx.style.top = `${e.clientY}px`;
      // Adjust if off-screen
      requestAnimationFrame(() => {
        const r = ctx.getBoundingClientRect();
        if (r.right > window.innerWidth) ctx.style.left = `${e.clientX - r.width}px`;
        if (r.bottom > window.innerHeight) ctx.style.top = `${e.clientY - r.height}px`;
      });
    });

    // Mover (drag vertical)
    block.addEventListener('mousedown', e => {
      if (e.target.classList.contains('tb-rh') ||
        e.target.classList.contains('tb-del')) return;
      e.preventDefault();
      const { ej, dia } = block.dataset;
      const d = ED.turnos[ED.semIdx][ej][dia];
      const y0 = e.clientY, ent0 = d.ent;
      block.style.cursor = 'grabbing';
      block.style.opacity = '.8';

      const mv = ev => {
        const delta = Math.round((ev.clientY - y0) / SH);
        d.ent = Math.max(SMIN, Math.min(SMAX - d.dur, ent0 + delta));
        block.style.top = `${(d.ent - SMIN) * SH}px`;
        block.querySelector('.tb-top').textContent = slot2str(d.ent);
        block.querySelector('.tb-bot').textContent = slot2str(d.ent + d.dur);
        updateBgColors(dia);
        refreshHorasPanel();
        refreshKPIVal();
      };
      const up = () => {
        document.removeEventListener('mousemove', mv);
        document.removeEventListener('mouseup', up);
        block.style.cursor = 'grab';
        block.style.opacity = '1';
      };
      document.addEventListener('mousemove', mv);
      document.addEventListener('mouseup', up);
    });

    // Mover colación
    const colEl = block.querySelector('.tb-col');
    if (colEl) {
      colEl.addEventListener('mousedown', e => {
        e.preventDefault(); e.stopPropagation();
        const { ej, dia } = e.target.dataset;
        const d = ED.turnos[ED.semIdx][ej][dia];
        const y0 = e.clientY;
        const col0 = d.col;

        const mv = ev => {
          const delta = Math.round((ev.clientY - y0) / SH);
          // col must stay within [1, dur-2] — not at entry or exit slot
          d.col = Math.max(1, Math.min(d.dur - 2, col0 + delta));
          e.target.style.top = `${d.col * SH}px`;
          updateBgColors(dia);
          refreshKPIVal();
        };
        const up = () => {
          document.removeEventListener('mousemove', mv);
          document.removeEventListener('mouseup', up);
        };
        document.addEventListener('mousemove', mv);
        document.addEventListener('mouseup', up);
      });
    }

    // Redimensionar (handle inferior)
    block.querySelector('.tb-rh').addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      const { ej, dia } = e.target.dataset;
      const d = ED.turnos[ED.semIdx][ej][dia];
      const y0 = e.clientY, dur0 = d.dur;

      const mv = ev => {
        const delta = Math.round((ev.clientY - y0) / SH);
        d.dur = Math.max(2, Math.min(SMAX - d.ent, dur0 + delta));
        if (tieneColacion(d.dur)) d.col = Math.max(1, Math.min(d.dur - 2, d.col ?? Math.floor(d.dur / 2)));
        block.style.height = `${d.dur * SH}px`;
        block.querySelector('.tb-bot').textContent = slot2str(d.ent + d.dur);
        updateBgColors(dia);
        refreshHorasPanel();
        refreshKPIVal();
      };
      const up = () => {
        document.removeEventListener('mousemove', mv);
        document.removeEventListener('mouseup', up);
        refreshAll();
      };
      document.addEventListener('mousemove', mv);
      document.addEventListener('mouseup', up);
    });
  });
}

function addTurno(nombre, dia) {
  const d = ED.turnos[ED.semIdx][nombre][dia];
  d.activo = true;
  d.ent = d.ent || SMIN;
  d.dur = d.dur || 8;
  d.col = d.col != null ? d.col : Math.floor(d.dur / 2);
  refreshAll();
}

function refreshAll() {
  renderGrid();
  renderHorasPanel();
  refreshKPIVal();
  renderResumen();
}

function goSem(idx) {
  ED.semIdx = idx;
  renderKPI();
  renderGridHeader();
  renderGrid();
  renderHorasPanel();
  renderResumen();
}

// ── COBERTURA EN VIVO ─────────────────────────────────────────────────────────
function updateBgColors(dia) {
  const sem = ED.turnos[ED.semIdx] || {};
  for (let s = SMIN; s < SMAX; s++) {
    const row = document.querySelector(`[data-dia="${dia}"][data-slot="${s}"]`);
    if (!row) continue;
    const horaCell = row.querySelector('div');   // first child = hora cell
    if (!horaCell) continue;
    const req = ED.dem[dia]?.[s] || 0;
    const cob = calcCobSem(dia, s, sem);
    const even = s % 2 === 0;
    horaCell.style.background = req <= 0 ? (even ? '#f0f2f5' : '#f8f9fb')
      : cob >= req ? '#a7f3c0' : '#fca5a5';
  }
}

function calcCobSem(dia, slot, sem) {
  return E.ejecutivos.filter(ej => {
    const d = sem[ej.nombre]?.[dia];
    if (!d || !d.activo) return false;
    if (slot < d.ent || slot >= d.ent + d.dur) return false;
    // Slot de colación no cuenta como puesto cubierto
    if (tieneColacion(d.dur) && slot === d.ent + d.col) return false;
    return true;
  }).length;
}

function calcDeficit() {
  const sem = ED.turnos[ED.semIdx] || {};
  let def = 0;
  DIAS.forEach(dia => {
    for (let s = SMIN; s < SMAX; s++) {
      const req = ED.dem[dia]?.[s] || 0;
      if (req <= 0) continue;
      const cob = calcCobSem(dia, s, sem);
      if (cob < req) def += req - cob;
    }
  });
  return def;
}

function refreshKPIVal() {
  const el = document.getElementById('kpi-deficit');
  if (el) el.textContent = calcDeficit().toFixed(1);
}

function totalHorasSem() {
  const sem = ED.turnos[ED.semIdx] || {};
  return E.ejecutivos.reduce((s, ej) =>
    s + Object.values(sem[ej.nombre] || {}).filter(d => d.activo).reduce((t, d) => t + horasTrabajadas(d.dur), 0), 0);
}

// ── PANEL HORAS ───────────────────────────────────────────────────────────────
function renderHorasPanel() {
  const panel = document.getElementById('horas-panel');
  if (!panel) return;
  const sem = ED.turnos[ED.semIdx] || {};
  panel.innerHTML = `<div style="font-size:10px;font-weight:700;color:var(--muted);
    text-transform:uppercase;letter-spacing:.8px;margin-bottom:12px">Horas / sem</div>` +
    E.ejecutivos.map(ej => {
      const h = Object.values(sem[ej.nombre] || {}).filter(d => d.activo).reduce((s, d) => s + horasTrabajadas(d.dur), 0);
      const max = ej.horas_semana;
      const pct = Math.min(h / max * 100, 100).toFixed(0);
      const c = h > max ? '#c0392b' : h > max * .9 ? 'var(--warn)' : 'var(--success)';
      return `<div id="hp_${ej.nombre.replace(/\W/g, '_')}" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px">
          <span style="font-weight:600">${ej.nombre.split(' ')[0]}</span>
          <span style="font-family:var(--mono);color:${c};font-weight:700">${h}/${max}h</span>
        </div>
        <div style="height:5px;background:var(--border);border-radius:3px">
          <div style="width:${pct}%;height:100%;background:${c};border-radius:3px"></div>
        </div>
        ${h > max ? '<div style="font-size:9px;color:#c0392b">⚠ Excede</div>' : ''}
      </div>`;
    }).join('');
}

function refreshHorasPanel() {
  const sem = ED.turnos[ED.semIdx] || {};
  E.ejecutivos.forEach(ej => {
    const el = document.getElementById(`hp_${ej.nombre.replace(/\W/g, '_')}`);
    if (!el) return;
    const h = Object.values(sem[ej.nombre] || {}).filter(d => d.activo).reduce((s, d) => s + horasTrabajadas(d.dur), 0);
    const max = ej.horas_semana;
    const pct = Math.min(h / max * 100, 100).toFixed(0);
    const c = h > max ? '#c0392b' : h > max * .9 ? 'var(--warn)' : 'var(--success)';
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px">
        <span style="font-weight:600">${ej.nombre.split(' ')[0]}</span>
        <span style="font-family:var(--mono);color:${c};font-weight:700">${h}/${max}h</span>
      </div>
      <div style="height:5px;background:var(--border);border-radius:3px">
        <div style="width:${pct}%;height:100%;background:${c};border-radius:3px"></div>
      </div>
      ${h > max ? '<div style="font-size:9px;color:#c0392b">⚠ Excede</div>' : ''}`;
  });
}

// ── TOOLTIP ───────────────────────────────────────────────────────────────────
function tipShow(el, dia, slot) {
  const req = ED.dem[dia]?.[slot] || 0;
  if (req <= 0) return;
  const sem = ED.turnos[ED.semIdx] || {};
  const cob = calcCobSem(dia, slot, sem);
  const ok = cob >= req;
  let tip = document.getElementById('glob-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'glob-tip';
    tip.style.cssText = `position:fixed;background:var(--surface);border:1px solid var(--border);
      border-radius:6px;padding:8px 12px;font-size:11px;
      box-shadow:0 4px 12px rgba(0,0,0,.15);z-index:9999;pointer-events:none;min-width:160px`;
    document.body.appendChild(tip);
  }
  tip.innerHTML = `<b>${dia} ${slot2str(slot)}</b><br>
    Req: <b>${req.toFixed(1)}</b> ejec.<br>
    Cob: <b style="color:${ok ? 'var(--success)' : '#c0392b'}">${cob}</b><br>
    <span style="color:${ok ? 'var(--success)' : '#c0392b'}">
      ${ok ? '✓ OK' : '⚠ Déficit ' + (req - cob).toFixed(1)}
    </span>`;
  const r = el.getBoundingClientRect();
  tip.style.left = `${r.right + 6}px`;
  tip.style.top = `${r.top}px`;
  tip.style.display = 'block';
}
function tipHide() {
  const tip = document.getElementById('glob-tip');
  if (tip) tip.style.display = 'none';
}

// ── RESUMEN HORAS MENSUAL ─────────────────────────────────────────────────────
function renderResumen() {
  const area = document.getElementById('resumen-area');
  if (!area) return;
  const rows = E.ejecutivos.map(ej => {
    const semH = ED.semanas.map((_, i) => {
      const map = ED.turnos[i] || {};
      return Object.values(map[ej.nombre] || {}).filter(d => d.activo).reduce((s, d) => s + horasTrabajadas(d.dur), 0);
    });
    const tot = semH.reduce((a, b) => a + b, 0);
    const maxT = ej.horas_semana * ED.semanas.length;
    const c = tot > maxT ? '#c0392b' : tot < ej.horas_semana * .8 ? 'var(--warn)' : 'var(--success)';
    return `<tr>
      <td style="font-weight:600">${ej.nombre}</td>
      ${semH.map((h, i) => `
        <td style="font-family:var(--mono);
          font-weight:${i === ED.semIdx ? '700' : '400'};
          background:${i === ED.semIdx ? 'var(--accent-lt)' : ''}">${h}h</td>`).join('')}
      <td style="font-family:var(--mono);font-weight:700;color:${c}">${tot}h</td>
      <td style="font-family:var(--mono);color:var(--muted)">${maxT}h</td>
    </tr>`;
  }).join('');

  area.innerHTML = `<div class="table-card">
    <div class="table-card-header"><div class="table-card-title">Resumen de Horas Mensual</div></div>
    <div class="table-scroll"><table class="ej-table">
      <thead><tr>
        <th>Ejecutivo</th>
        ${ED.semanas.map((_, i) => `<th>Sem ${i + 1}</th>`).join('')}
        <th>Total</th><th>Máx</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </div>`;
}

// ── GUARDAR MODELO EDITADO ────────────────────────────────────────────────────
function buildTurnosFromED() {
  const turnos = [];
  ED.semanas.forEach((sem, wIdx) => {
    const semMap = ED.turnos[wIdx] || {};
    E.ejecutivos.forEach(ej => {
      DIAS.forEach(dia => {
        const d = semMap[ej.nombre]?.[dia];
        const fechaEntry = sem.dias.find(([, dw]) => dw === dia);
        const fecha = fechaEntry ? fechaEntry[0] : '';
        if (!d || !d.activo) {
          turnos.push({ ejecutivo: ej.nombre, semana: sem.semana, fecha, dia, libre: true });
        } else {
          turnos.push({
            ejecutivo: ej.nombre,
            semana: sem.semana,
            fecha,
            dia,
            libre: false,
            entrada: slot2str(d.ent),
            salida: slot2str(d.ent + d.dur),
            duracion_h: horasTrabajadas(d.dur),
            colacion: tieneColacion(d.dur),
            colacion_offset: d.col ?? Math.floor(d.dur / 2)
          });
        }
      });
      // Domingos siempre libres
      sem.dias.forEach(([fecha, dow]) => {
        if (dow === 'domingo')
          turnos.push({ ejecutivo: ej.nombre, semana: sem.semana, fecha, dia: 'domingo', libre: true });
      });
    });
  });
  return turnos;
}

function mostrarModalGuardarEditado() {
  // Sincronizar turnos editados en S.solverResult antes de pasar al modal
  if (S.solverResult) {
    S.solverResult.turnos = buildTurnosFromED();
    S.solverResult.deficit_cobertura = parseFloat(calcDeficit().toFixed(2));
  }
  mostrarModalGuardar();
}

// ── EXPORTAR EXCEL ────────────────────────────────────────────────────────────
function exportarExcelTurnos() {
  const wb = XLSX.utils.book_new();
  ED.semanas.forEach((sem, wIdx) => {
    const semMap = ED.turnos[wIdx] || {};
    const rows = [['Ejecutivo', 'Día', 'Entrada', 'Salida', 'Duración (h)', 'Colación']];
    E.ejecutivos.forEach(ej => {
      DIAS.forEach(dia => {
        const d = semMap[ej.nombre]?.[dia];
        if (!d || !d.activo) return;
        rows.push([ej.nombre, dia, slot2str(d.ent), slot2str(d.ent + d.dur),
        horasTrabajadas(d.dur), tieneColacion(d.dur) ? '30 min' : '—']);
      });
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws, `Semana ${wIdx + 1}`);
  });
  XLSX.writeFile(wb, `Turnos_CEM_${new Date().toISOString().slice(0, 10)}.xlsx`);
  showToast('Turnos exportados', 'ok');
}