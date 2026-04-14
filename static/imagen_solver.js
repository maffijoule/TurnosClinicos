// ── CEM — Módulo Imagen — Editor de Turnos ───────────────────────────────────
// Grilla interactiva de turnos para Tecnólogos Médicos
// Adaptación de solver.js para el módulo Imagen
// ─────────────────────────────────────────────────────────────────────────────

// ── ESTADO DEL EDITOR ────────────────────────────────────────────────────────
const IMG_ED = {
  semanas:    [],   // [{semana, dias:[[fecha,dow],...]}]
  turnos:     [],   // uno por semana: {tmNombre:{dia:{activo,ent,dur,col}}}
  dem:        {},   // {dia:{slot:valor}}
  semIdx:     0,
  solverData: null,
};

let IMG_SMIN = 14;
let IMG_SMAX = 42;

// Reusa SH, LW, EJ_COLORS, DIAS, DIAS_SHORT, slot2str, tieneColacion, horasTrabajadas, hasColacion de solver.js

function imgGetTMs() {
  return (IMG_ED.solverData?.tecnologos_sel || []);
}

function imgGetCW() {
  const tms = imgGetTMs();
  if (!tms.length) return 52;
  const maxLen = Math.max(...tms.map(t => t.nombre.split(' ')[0].length));
  return Math.max(52, maxLen * 7 + 12);
}

// ── INIT DESDE RESULTADO SOLVER ──────────────────────────────────────────────
function imgInitED(data) {
  IMG_ED.solverData = data;
  IMG_ED.semanas    = data.semanas;
  IMG_ED.semIdx     = 0;
  if (data.inicio_op != null) IMG_SMIN = data.inicio_op;
  if (data.fin_op    != null) IMG_SMAX = data.fin_op;

  const tms = imgGetTMs();

  // Demanda por slot
  IMG_ED.dem = {};
  DIAS.forEach(dia => {
    IMG_ED.dem[dia] = {};
    const profile = dia === 'sábado' ? data.dem_sat_profile : data.dem_wd_profile;
    if (!profile) return;
    Object.entries(profile).forEach(([timeStr, val]) => {
      const s = timeToMinutes(timeStr) / 30;
      IMG_ED.dem[dia][s]     = val;
      IMG_ED.dem[dia][s + 1] = val;
    });
  });

  // Turnos desde solver → formato ED
  IMG_ED.turnos = data.semanas.map(sem => {
    const map = {};
    tms.forEach(tm => {
      map[tm.nombre] = {};
      DIAS.forEach(dia => {
        const t = data.turnos.find(t2 =>
          t2.ejecutivo === tm.nombre && t2.semana === sem.semana && t2.dia === dia
        );
        if (t && !t.libre) {
          const dur = (timeToMinutes(t.salida) - timeToMinutes(t.entrada)) / 30;
          map[tm.nombre][dia] = {
            activo: true,
            ent: timeToMinutes(t.entrada) / 30,
            dur,
            col: (t.colacion_offset != null) ? t.colacion_offset : Math.floor(dur / 2),
          };
        } else {
          map[tm.nombre][dia] = { activo: false, ent: IMG_SMIN, dur: 8, col: 4 };
        }
      });
    });
    return map;
  });
}

// ── ENTRY POINT ───────────────────────────────────────────────────────────────
function imgRenderSolverResult(data) {
  imgInitED(data);
  imgBuildPage();
}

// ── SCAFFOLD ──────────────────────────────────────────────────────────────────
function imgBuildPage() {
  document.getElementById('content').innerHTML = `
    <div id="img-kpi-area"></div>
    <div id="img-grid-card" class="table-card">
      <div id="img-grid-header" class="table-card-header" style="flex-wrap:wrap;gap:8px"></div>
      <div style="display:flex;overflow:hidden">
        <div id="img-grid-scroll" style="overflow:auto;flex:1"></div>
        <div id="img-horas-panel" style="width:160px;flex-shrink:0;padding:16px;
          border-left:1px solid var(--border);overflow-y:auto;max-height:600px"></div>
      </div>
    </div>
    <div id="img-resumen-area"></div>`;
  imgRenderKPI();
  imgRenderGridHeader();
  imgRenderGrid();
  imgRenderHorasPanel();
  imgRenderResumen();
}

// ── KPI ───────────────────────────────────────────────────────────────────────
function imgRenderKPI() {
  const tms = imgGetTMs();
  const def = imgCalcDeficit();
  document.getElementById('img-kpi-area').innerHTML = `
  <div class="kpi-row">
    <div class="kpi-card ${def === 0 ? 'green' : 'amber'}">
      <div class="kpi-label">Déficit semana</div>
      <div class="kpi-val" id="img-kpi-deficit">${def.toFixed(1)}</div>
      <div class="kpi-sub">${def === 0 ? 'Cobertura completa ✓' : 'franjas sin cubrir'}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Semanas</div>
      <div class="kpi-val">${IMG_ED.semanas.length}</div>
      <div class="kpi-sub">semana tipo</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Tecnólogos</div>
      <div class="kpi-val">${tms.length}</div>
      <div class="kpi-sub">${tms.length} seleccionados</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Horas equipo / sem</div>
      <div class="kpi-val">${imgTotalHorasSem()}h</div>
      <div class="kpi-sub">semana ${IMG_ED.semIdx + 1}</div>
    </div>
  </div>`;
}

// ── HEADER ────────────────────────────────────────────────────────────────────
function imgRenderGridHeader() {
  const hdr = document.getElementById('img-grid-header');
  const btns = IMG_ED.semanas.map((sem, i) => `
    <button onclick="imgGoSem(${i})" style="
      padding:5px 12px;border-radius:5px;border:1px solid var(--border);
      background:${i === IMG_ED.semIdx ? 'var(--accent)' : 'var(--surface2)'};
      color:${i === IMG_ED.semIdx ? '#fff' : 'var(--text2)'};
      font-family:var(--sans);font-size:12px;font-weight:600;cursor:pointer">
      Sem ${i + 1}
    </button>`).join('');

  hdr.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:1">
      <div style="display:flex;gap:4px;flex-wrap:wrap">${btns}</div>
      <span style="font-size:11px;color:var(--muted)">
        ${(IMG_ED.semanas[IMG_ED.semIdx] || { dias: [] }).dias.map(([f]) => f).join(' · ')}
      </span>
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <button onclick="imgMostrarModalGuardar()" class="btn-export"
        style="width:auto;padding:5px 14px">💾 Guardar</button>
      <button onclick="imgExportarExcelTurnos()" class="btn-export"
        style="width:auto;padding:5px 14px">↓ Exportar</button>
    </div>`;
}

// ── GRILLA ────────────────────────────────────────────────────────────────────
function imgRenderGrid() {
  const scroll = document.getElementById('img-grid-scroll');
  const sem    = IMG_ED.turnos[IMG_ED.semIdx] || {};
  const tms    = imgGetTMs();
  const nSlots = IMG_SMAX - IMG_SMIN;
  const CW_    = imgGetCW();

  const ejColorMap = {};
  tms.forEach((tm, i) => ejColorMap[tm.nombre] = EJ_COLORS[i % EJ_COLORS.length]);

  // Header fijo
  let headerHTML = `<div style="display:flex;position:sticky;top:0;z-index:10;
    background:var(--surface);border-bottom:2px solid var(--border2)">`;
  DIAS.forEach((dia, di) => {
    headerHTML += `<div style="display:flex;border-left:${di ? '2px' : '0'} solid var(--border2)">
      <div style="width:${LW}px;font-size:9px;font-weight:700;color:var(--muted);
        text-align:center;padding:4px 2px;background:var(--surface2);
        text-transform:uppercase;letter-spacing:.5px">${DIAS_SHORT[di]}</div>`;
    tms.forEach(tm => {
      headerHTML += `<div style="width:${CW_}px;font-size:10px;font-weight:600;
        text-align:center;padding:4px 2px;background:${ejColorMap[tm.nombre]}88;
        border-left:1px solid var(--border);white-space:nowrap;overflow:hidden">
        ${tm.nombre.split(' ')[0]}
      </div>`;
    });
    headerHTML += `</div>`;
  });
  headerHTML += `</div>`;

  // Filas de slots
  let bodyHTML = `<div style="display:flex;position:relative">`;
  DIAS.forEach((dia, di) => {
    bodyHTML += `<div style="display:flex;flex-direction:column;
      border-left:${di ? '2px' : '0'} solid var(--border2);position:relative">`;

    for (let i = 0; i < nSlots; i++) {
      const s    = IMG_SMIN + i;
      const req  = IMG_ED.dem[dia]?.[s] || 0;
      const cob  = imgCalcCobSem(dia, s, sem);
      const even = s % 2 === 0;
      const rowBg  = even ? '#f8f9fb' : '#fff';
      const horaBg = req <= 0 ? (even ? '#f0f2f5' : '#f8f9fb')
        : cob >= req ? '#a7f3c0' : '#fca5a5';
      const bdr = even ? 'var(--border)' : '#f0f0f0';

      bodyHTML += `<div style="display:flex;height:${SH}px;background:${rowBg};
        border-bottom:1px solid ${bdr}"
        data-img-dia="${dia}" data-img-slot="${s}"
        onmouseenter="imgTipShow(this,'${dia}',${s})"
        onmouseleave="imgTipHide()">`;

      bodyHTML += `<div style="width:${LW}px;flex-shrink:0;font-size:9px;
        font-family:var(--mono);
        color:${req > 0 ? '#374151' : 'var(--muted)'};
        font-weight:${req > 0 ? '600' : '400'};
        padding:0 4px;display:flex;align-items:center;
        background:${horaBg};border-right:1px solid var(--border)">
        ${even ? slot2str(s) : ''}
      </div>`;

      tms.forEach(() => {
        bodyHTML += `<div style="width:${CW_}px;flex-shrink:0;
          border-left:1px solid #ebebeb;position:relative"></div>`;
      });

      bodyHTML += `</div>`;
    }

    // Botón "+" para TMs sin turno
    tms.forEach((tm, tmIdx) => {
      const d = sem[tm.nombre]?.[dia];
      if (!d || !d.activo) {
        const left = LW + tmIdx * CW_;
        bodyHTML += `<div onclick="imgAddTurno('${tm.nombre}','${dia}')"
          style="position:absolute;top:4px;left:${left + 2}px;width:${CW_ - 4}px;
            z-index:4;cursor:pointer;text-align:center;
            border:1.5px dashed #93c5fd;border-radius:5px;
            background:rgba(219,234,254,.25);height:${nSlots * SH - 8}px;
            display:flex;align-items:center;justify-content:center;
            font-size:20px;color:#93c5fd;opacity:.45;transition:opacity .15s"
          onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=.45"
          title="Agregar turno a ${tm.nombre} el ${dia}">+</div>`;
      }
    });

    bodyHTML += `</div>`;
  });
  bodyHTML += `</div>`;

  scroll.innerHTML = headerHTML + bodyHTML;
  imgDrawBlocks(sem);
}

// ── DIBUJAR BLOQUES ───────────────────────────────────────────────────────────
function imgDrawBlocks(sem) {
  const scroll = document.getElementById('img-grid-scroll');
  scroll.querySelectorAll('.img-tb-block').forEach(el => el.remove());
  const body = scroll.querySelector('div[style*="position:relative"]');
  if (!body) return;

  const tms    = imgGetTMs();
  const CW_    = imgGetCW();
  const ejColorMap = {};
  tms.forEach((tm, i) => ejColorMap[tm.nombre] = EJ_COLORS[i % EJ_COLORS.length]);

  DIAS.forEach((dia, di) => {
    tms.forEach((tm, tmIdx) => {
      const d = sem[tm.nombre]?.[dia];
      if (!d || !d.activo) return;

      const dayW = LW + tms.length * CW_;
      const left = di * dayW + di * 2 + LW + tmIdx * CW_;
      const top  = (d.ent - IMG_SMIN) * SH;
      const h    = d.dur * SH;
      const col  = ejColorMap[tm.nombre];
      const colPos = Math.min(Math.max(d.col ?? Math.floor(d.dur / 2), 1), d.dur - 2);

      const block = document.createElement('div');
      block.className = 'img-tb-block';
      block.dataset.tm  = tm.nombre;
      block.dataset.dia = dia;
      block.style.cssText = `
        position:absolute;left:${left + 2}px;top:${top}px;
        width:${CW_ - 4}px;height:${h}px;
        background:${col};border:1.5px solid rgba(0,0,0,.12);
        border-radius:5px;z-index:5;overflow:hidden;
        cursor:grab;box-shadow:0 1px 4px rgba(0,0,0,.08)`;

      block.innerHTML = `
        <div class="img-tb-top" style="font-size:9px;font-weight:700;padding:2px 4px;
          background:rgba(255,255,255,.65);border-bottom:1px solid rgba(0,0,0,.06);
          white-space:nowrap">${slot2str(d.ent)}</div>
        ${hasColacion(d) ? `<div class="img-tb-col" data-tm="${tm.nombre}" data-dia="${dia}"
          style="position:absolute;top:${colPos * SH}px;
          left:0;right:0;height:${SH}px;cursor:ns-resize;z-index:6;
          background:repeating-linear-gradient(45deg,rgba(255,255,255,.45) 0px,rgba(255,255,255,.45) 3px,rgba(0,0,0,.08) 3px,rgba(0,0,0,.08) 6px);
          border-top:1px dashed rgba(100,116,139,.5);border-bottom:1px dashed rgba(100,116,139,.5);
          font-size:7px;text-align:center;line-height:${SH}px;color:#374151;letter-spacing:.3px;font-weight:700">☕</div>` : ''}
        <div class="img-tb-bot" style="position:absolute;bottom:8px;left:0;right:0;
          font-size:9px;font-weight:700;padding:2px 4px;text-align:right;
          background:rgba(255,255,255,.65)">${slot2str(d.ent + d.dur)}</div>
        <div class="img-tb-rh" data-tm="${tm.nombre}" data-dia="${dia}"
          style="position:absolute;bottom:0;left:0;right:0;height:7px;
            cursor:ns-resize;background:rgba(100,116,139,.25);z-index:6"></div>`;

      body.appendChild(block);
    });
  });

  imgAttachBlockHandlers();
}

// ── HANDLERS DE BLOQUES ───────────────────────────────────────────────────────
function imgAttachBlockHandlers() {
  const old = document.getElementById('img-tb-ctx');
  if (old) old.remove();

  const ctx = document.createElement('div');
  ctx.id = 'img-tb-ctx';
  ctx.style.cssText = `display:none;position:fixed;z-index:9999;
    background:var(--surface);border:1px solid var(--border);
    border-radius:7px;box-shadow:0 4px 16px rgba(0,0,0,.15);
    padding:4px;min-width:150px;font-family:var(--sans);font-size:12px`;
  document.body.appendChild(ctx);

  const hideCtx = () => { ctx.style.display = 'none'; };
  document.addEventListener('mousedown', e => { if (!ctx.contains(e.target)) hideCtx(); });

  document.querySelectorAll('.img-tb-block').forEach(block => {

    // Click derecho → menú contextual
    block.addEventListener('contextmenu', e => {
      e.preventDefault();
      const { tm, dia } = block.dataset;
      ctx.innerHTML = `
        <div style="padding:4px 8px;font-size:10px;font-weight:700;color:var(--muted);
          text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border);
          margin-bottom:4px">${tm.split(' ').slice(0,2).join(' ')} — ${dia}</div>
        <div style="padding:7px 12px;border-radius:5px;cursor:pointer;
          color:#c0392b;font-weight:600;display:flex;align-items:center;gap:6px"
          onmouseenter="this.style.background='#fff5f5'"
          onmouseleave="this.style.background=''"
          onclick="IMG_ED.turnos[IMG_ED.semIdx]['${tm}']['${dia}'].activo=false;imgRefreshAll();document.getElementById('img-tb-ctx').style.display='none'">
          🗑 Eliminar turno
        </div>
        ${tieneColacion(IMG_ED.turnos[IMG_ED.semIdx]['${tm}']['${dia}'].dur) ? `<div style="padding:7px 12px;border-radius:5px;cursor:pointer;
          font-weight:600;display:flex;align-items:center;gap:6px"
          onmouseenter="this.style.background='#f0f0f0'"
          onmouseleave="this.style.background=''"
          onclick="const _d=IMG_ED.turnos[IMG_ED.semIdx]['${tm}']['${dia}'];_d.noCol=!_d.noCol;imgRefreshAll();document.getElementById('img-tb-ctx').style.display='none'">
          🍽 ${IMG_ED.turnos[IMG_ED.semIdx]['${tm}']['${dia}'].noCol ? 'Restaurar colación' : 'Eliminar colación'}
        </div>` : ''}`;
      ctx.style.display = 'block';
      ctx.style.left = `${e.clientX}px`;
      ctx.style.top  = `${e.clientY}px`;
      requestAnimationFrame(() => {
        const r = ctx.getBoundingClientRect();
        if (r.right  > window.innerWidth)  ctx.style.left = `${e.clientX - r.width}px`;
        if (r.bottom > window.innerHeight) ctx.style.top  = `${e.clientY - r.height}px`;
      });
    });

    // Arrastrar bloque (mover verticalmente)
    block.addEventListener('mousedown', e => {
      if (e.target.classList.contains('img-tb-rh') ||
          e.target.classList.contains('img-tb-col')) return;
      e.preventDefault();
      const { tm, dia } = block.dataset;
      const d = IMG_ED.turnos[IMG_ED.semIdx][tm][dia];
      const y0 = e.clientY, ent0 = d.ent;
      block.style.cursor  = 'grabbing';
      block.style.opacity = '.8';

      const mv = ev => {
        const delta = Math.round((ev.clientY - y0) / SH);
        d.ent = Math.max(IMG_SMIN, Math.min(IMG_SMAX - d.dur, ent0 + delta));
        block.style.top = `${(d.ent - IMG_SMIN) * SH}px`;
        block.querySelector('.img-tb-top').textContent = slot2str(d.ent);
        block.querySelector('.img-tb-bot').textContent = slot2str(d.ent + d.dur);
        imgUpdateBgColors(dia);
        imgRefreshHorasPanel();
        imgRefreshKPIVal();
      };
      const up = () => {
        document.removeEventListener('mousemove', mv);
        document.removeEventListener('mouseup',   up);
        block.style.cursor  = 'grab';
        block.style.opacity = '1';
      };
      document.addEventListener('mousemove', mv);
      document.addEventListener('mouseup',   up);
    });

    // Mover colación
    const colEl = block.querySelector('.img-tb-col');
    if (colEl) {
      colEl.addEventListener('mousedown', e => {
        e.preventDefault(); e.stopPropagation();
        const { tm, dia } = e.target.dataset;
        const d = IMG_ED.turnos[IMG_ED.semIdx][tm][dia];
        const y0 = e.clientY, col0 = d.col;

        const mv = ev => {
          const delta = Math.round((ev.clientY - y0) / SH);
          d.col = Math.max(1, Math.min(d.dur - 2, col0 + delta));
          e.target.style.top = `${d.col * SH}px`;
          imgUpdateBgColors(dia);
          imgRefreshKPIVal();
        };
        const up = () => {
          document.removeEventListener('mousemove', mv);
          document.removeEventListener('mouseup',   up);
        };
        document.addEventListener('mousemove', mv);
        document.addEventListener('mouseup',   up);
      });
    }

    // Redimensionar (handle inferior)
    block.querySelector('.img-tb-rh').addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      const { tm, dia } = e.target.dataset;
      const d = IMG_ED.turnos[IMG_ED.semIdx][tm][dia];
      const y0 = e.clientY, dur0 = d.dur;

      const mv = ev => {
        const delta = Math.round((ev.clientY - y0) / SH);
        d.dur = Math.max(2, Math.min(IMG_SMAX - d.ent, dur0 + delta));
        if (hasColacion(d)) d.col = Math.max(1, Math.min(d.dur - 2, d.col ?? Math.floor(d.dur / 2)));
        block.style.height = `${d.dur * SH}px`;
        block.querySelector('.img-tb-bot').textContent = slot2str(d.ent + d.dur);
        imgUpdateBgColors(dia);
        imgRefreshHorasPanel();
        imgRefreshKPIVal();
      };
      const up = () => {
        document.removeEventListener('mousemove', mv);
        document.removeEventListener('mouseup',   up);
        imgRefreshAll();
      };
      document.addEventListener('mousemove', mv);
      document.addEventListener('mouseup',   up);
    });
  });
}

function imgAddTurno(nombre, dia) {
  const d = IMG_ED.turnos[IMG_ED.semIdx][nombre][dia];
  d.activo = true;
  d.ent    = d.ent || IMG_SMIN;
  d.dur    = d.dur || 8;
  d.col    = d.col != null ? d.col : Math.floor(d.dur / 2);
  imgRefreshAll();
}

function imgRefreshAll() {
  imgRenderGrid();
  imgRenderHorasPanel();
  imgRefreshKPIVal();
  imgRenderResumen();
}

function imgGoSem(idx) {
  IMG_ED.semIdx = idx;
  imgRenderKPI();
  imgRenderGridHeader();
  imgRenderGrid();
  imgRenderHorasPanel();
  imgRenderResumen();
}

// ── COBERTURA ─────────────────────────────────────────────────────────────────
function imgUpdateBgColors(dia) {
  const sem = IMG_ED.turnos[IMG_ED.semIdx] || {};
  for (let s = IMG_SMIN; s < IMG_SMAX; s++) {
    const row = document.querySelector(`[data-img-dia="${dia}"][data-img-slot="${s}"]`);
    if (!row) continue;
    const horaCell = row.querySelector('div');
    if (!horaCell) continue;
    const req  = IMG_ED.dem[dia]?.[s] || 0;
    const cob  = imgCalcCobSem(dia, s, sem);
    const even = s % 2 === 0;
    horaCell.style.background = req <= 0 ? (even ? '#f0f2f5' : '#f8f9fb')
      : cob >= req ? '#a7f3c0' : '#fca5a5';
  }
}

function imgCalcCobSem(dia, slot, sem) {
  return imgGetTMs().filter(tm => {
    const d = sem[tm.nombre]?.[dia];
    if (!d || !d.activo) return false;
    if (slot < d.ent || slot >= d.ent + d.dur) return false;
    if (hasColacion(d) && slot === d.ent + d.col) return false;
    return true;
  }).length;
}

function imgCalcDeficit() {
  const sem = IMG_ED.turnos[IMG_ED.semIdx] || {};
  let def = 0;
  DIAS.forEach(dia => {
    for (let s = IMG_SMIN; s < IMG_SMAX; s++) {
      const req = IMG_ED.dem[dia]?.[s] || 0;
      if (req <= 0) continue;
      const cob = imgCalcCobSem(dia, s, sem);
      if (cob < req) def += req - cob;
    }
  });
  return def;
}

function imgRefreshKPIVal() {
  const el = document.getElementById('img-kpi-deficit');
  if (el) el.textContent = imgCalcDeficit().toFixed(1);
}

function imgTotalHorasSem() {
  const sem = IMG_ED.turnos[IMG_ED.semIdx] || {};
  return imgGetTMs().reduce((s, tm) =>
    s + Object.values(sem[tm.nombre] || {}).filter(d => d.activo)
      .reduce((t, d) => t + horasTrabajadas(d.dur, d.noCol), 0), 0);
}

// ── PANEL HORAS ───────────────────────────────────────────────────────────────
function imgRenderHorasPanel() {
  const panel = document.getElementById('img-horas-panel');
  if (!panel) return;
  const sem = IMG_ED.turnos[IMG_ED.semIdx] || {};
  panel.innerHTML = `<div style="font-size:10px;font-weight:700;color:var(--muted);
    text-transform:uppercase;letter-spacing:.8px;margin-bottom:12px">Horas / sem</div>` +
    imgGetTMs().map(tm => {
      const h   = Object.values(sem[tm.nombre] || {}).filter(d => d.activo)
                    .reduce((s, d) => s + horasTrabajadas(d.dur, d.noCol), 0);
      const max = tm.horas_semana || 44;
      const pct = Math.min(h / max * 100, 100).toFixed(0);
      const c   = h > max ? '#c0392b' : h > max * .9 ? 'var(--warn)' : 'var(--success)';
      return `<div id="img-hp_${tm.nombre.replace(/\W/g, '_')}" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px">
          <span style="font-weight:600">${tm.nombre.split(' ').slice(0,2).join(' ')}</span>
          <span style="font-family:var(--mono);color:${c};font-weight:700">${h}/${max}h</span>
        </div>
        <div style="height:5px;background:var(--border);border-radius:3px">
          <div style="width:${pct}%;height:100%;background:${c};border-radius:3px"></div>
        </div>
        ${h > max ? '<div style="font-size:9px;color:#c0392b">⚠ Excede</div>' : ''}
      </div>`;
    }).join('');
}

function imgRefreshHorasPanel() {
  const sem = IMG_ED.turnos[IMG_ED.semIdx] || {};
  imgGetTMs().forEach(tm => {
    const el = document.getElementById(`img-hp_${tm.nombre.replace(/\W/g, '_')}`);
    if (!el) return;
    const h   = Object.values(sem[tm.nombre] || {}).filter(d => d.activo)
                  .reduce((s, d) => s + horasTrabajadas(d.dur, d.noCol), 0);
    const max = tm.horas_semana || 44;
    const pct = Math.min(h / max * 100, 100).toFixed(0);
    const c   = h > max ? '#c0392b' : h > max * .9 ? 'var(--warn)' : 'var(--success)';
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px">
        <span style="font-weight:600">${tm.nombre.split(' ').slice(0,2).join(' ')}${tm.resonancia ? ' 🔬' : ''}</span>
        <span style="font-family:var(--mono);color:${c};font-weight:700">${h}/${max}h</span>
      </div>
      <div style="height:5px;background:var(--border);border-radius:3px">
        <div style="width:${pct}%;height:100%;background:${c};border-radius:3px"></div>
      </div>
      ${h > max ? '<div style="font-size:9px;color:#c0392b">⚠ Excede</div>' : ''}`;
  });
}

// ── TOOLTIP ───────────────────────────────────────────────────────────────────
function imgTipShow(el, dia, slot) {
  const req = IMG_ED.dem[dia]?.[slot] || 0;
  if (req <= 0) return;
  const sem = IMG_ED.turnos[IMG_ED.semIdx] || {};
  const cob = imgCalcCobSem(dia, slot, sem);
  const ok  = cob >= req;
  let tip = document.getElementById('img-glob-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'img-glob-tip';
    tip.style.cssText = `position:fixed;background:var(--surface);border:1px solid var(--border);
      border-radius:6px;padding:8px 12px;font-size:11px;
      box-shadow:0 4px 12px rgba(0,0,0,.15);z-index:9999;pointer-events:none;min-width:160px`;
    document.body.appendChild(tip);
  }
  tip.innerHTML = `<b>${dia} ${slot2str(slot)}</b><br>
    Req: <b>${req.toFixed(1)}</b> TMs<br>
    Cob: <b style="color:${ok ? 'var(--success)' : '#c0392b'}">${cob}</b><br>
    <span style="color:${ok ? 'var(--success)' : '#c0392b'}">
      ${ok ? '✓ OK' : '⚠ Déficit ' + (req - cob).toFixed(1)}</span>`;
  const r = el.getBoundingClientRect();
  tip.style.left    = `${r.right + 6}px`;
  tip.style.top     = `${r.top}px`;
  tip.style.display = 'block';
}
function imgTipHide() {
  const tip = document.getElementById('img-glob-tip');
  if (tip) tip.style.display = 'none';
}

// ── RESUMEN HORAS MENSUAL ─────────────────────────────────────────────────────
function imgRenderResumen() {
  const area = document.getElementById('img-resumen-area');
  if (!area) return;
  const tms = imgGetTMs();
  const rows = tms.map(tm => {
    const semH = IMG_ED.semanas.map((_, i) => {
      const map = IMG_ED.turnos[i] || {};
      return Object.values(map[tm.nombre] || {}).filter(d => d.activo)
        .reduce((s, d) => s + horasTrabajadas(d.dur, d.noCol), 0);
    });
    const tot  = semH.reduce((a, b) => a + b, 0);
    const max  = (tm.horas_semana || 44) * IMG_ED.semanas.length;
    const c    = tot > max ? '#c0392b' : tot < (tm.horas_semana || 44) * .8 ? 'var(--warn)' : 'var(--success)';
    return `<tr>
      <td style="font-weight:600">${tm.nombre}</td>
      ${semH.map((h, i) => `
        <td style="font-family:var(--mono);
          font-weight:${i === IMG_ED.semIdx ? '700' : '400'};
          background:${i === IMG_ED.semIdx ? 'var(--accent-lt)' : ''}">${h}h</td>`).join('')}
      <td style="font-family:var(--mono);font-weight:700;color:${c}">${tot}h</td>
      <td style="font-family:var(--mono);color:var(--muted)">${max}h</td>
    </tr>`;
  }).join('');

  area.innerHTML = `<div class="table-card">
    <div class="table-card-header"><div class="table-card-title">Resumen de Horas Mensual</div></div>
    <div class="table-scroll"><table class="ej-table">
      <thead><tr>
        <th>Tecnólogo</th>
        ${IMG_ED.semanas.map((_, i) => `<th>Sem ${i + 1}</th>`).join('')}
        <th>Total</th><th>Máx</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </div>`;
}

// ── GUARDAR DESDE EDITOR ──────────────────────────────────────────────────────
function imgBuildTurnosFromED() {
  const turnos = [];
  IMG_ED.semanas.forEach((sem, wIdx) => {
    const semMap = IMG_ED.turnos[wIdx] || {};
    imgGetTMs().forEach(tm => {
      DIAS.forEach(dia => {
        const d = semMap[tm.nombre]?.[dia];
        const fechaEntry = sem.dias.find(([, dw]) => dw === dia);
        const fecha = fechaEntry ? fechaEntry[0] : '';
        if (!d || !d.activo) {
          turnos.push({ ejecutivo: tm.nombre, semana: sem.semana, fecha, dia, libre: true });
        } else {
          turnos.push({
            ejecutivo: tm.nombre, semana: sem.semana, fecha, dia,
            libre: false,
            entrada:          slot2str(d.ent),
            salida:           slot2str(d.ent + d.dur),
            duracion_h:       horasTrabajadas(d.dur, d.noCol),
            colacion:         hasColacion(d),
            colacion_offset:  d.col ?? Math.floor(d.dur / 2),
          });
        }
      });
      sem.dias.forEach(([fecha, dow]) => {
        if (dow === 'domingo')
          turnos.push({ ejecutivo: tm.nombre, semana: sem.semana, fecha, dia: 'domingo', libre: true });
      });
    });
  });
  return turnos;
}

function imgMostrarModalGuardar() {
  // Cerrar si ya hay uno
  const existing = document.getElementById('img-modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'img-modal-overlay';
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.45);
    z-index:1000;display:flex;align-items:center;justify-content:center`;

  overlay.innerHTML = `
    <div style="background:var(--surface);border-radius:10px;padding:28px;
      width:420px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,.2)">
      <div style="font-size:16px;font-weight:700;margin-bottom:16px">💾 Guardar modelo Imagen</div>
      <div style="margin-bottom:12px">
        <div style="font-size:12px;font-weight:600;color:var(--text2);margin-bottom:6px">Nombre *</div>
        <input id="img-m-nombre" type="text" placeholder="ej: Turnos TMs Junio 2025"
          style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--border);
            border-radius:6px;font-family:var(--sans);font-size:13px;
            background:var(--bg);color:var(--text);outline:none"
          oninput="this.style.borderColor='var(--accent)'">
      </div>
      <div style="margin-bottom:20px">
        <div style="font-size:12px;font-weight:600;color:var(--text2);margin-bottom:6px">Descripción</div>
        <textarea id="img-m-desc" placeholder="Descripción opcional..."
          style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--border);
            border-radius:6px;font-family:var(--sans);font-size:13px;resize:vertical;
            background:var(--bg);color:var(--text);outline:none;min-height:60px"></textarea>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button onclick="document.getElementById('img-modal-overlay').remove()"
          style="padding:9px 20px;border-radius:6px;border:1px solid var(--border);
            background:transparent;color:var(--text2);font-family:var(--sans);
            font-size:13px;cursor:pointer">Cancelar</button>
        <button onclick="imgConfirmarGuardar()"
          style="padding:9px 20px;border-radius:6px;border:none;
            background:var(--accent);color:#fff;font-family:var(--sans);
            font-size:13px;font-weight:700;cursor:pointer">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById('img-m-nombre').focus();
}

function imgConfirmarGuardar() {
  const nombre = document.getElementById('img-m-nombre')?.value?.trim();
  const desc   = document.getElementById('img-m-desc')?.value?.trim();
  if (!nombre) {
    showToast('Ingresa un nombre para el modelo', 'err'); return;
  }

  // Actualizar turnos en solverData
  const updatedResult = Object.assign({}, IMG_ED.solverData, {
    turnos: imgBuildTurnosFromED(),
    deficit_cobertura: parseFloat(imgCalcDeficit().toFixed(2)),
  });

  const models = imgLoadModels();
  const snap = {
    id:          Date.now(),
    nombre,
    descripcion: desc || '',
    fecha:       new Date().toLocaleDateString('es-CL'),
    tecnologos:  JSON.parse(JSON.stringify(IMG.tecnologos)),
    duraciones:  { ...IMG.duraciones },
    cfg:         { ...IMG.cfg },
    examSel:     [...IMG.examSel],
    hojas:       JSON.parse(JSON.stringify(IMG.hojas)),
    horas:       [...IMG.horas],
    dows:        [...IMG.dows],
    fileName:    IMG.fileName,
    resultado:   IMG.resultado ? JSON.parse(JSON.stringify(IMG.resultado)) : null,
    solverResult: JSON.parse(JSON.stringify(updatedResult)),
  };

  const idx = models.findIndex(m => m.nombre === nombre);
  if (idx >= 0) models[idx] = snap; else models.unshift(snap);
  imgSaveModels(models);

  document.getElementById('img-modal-overlay')?.remove();
  showToast(`Modelo "${nombre}" guardado`, 'ok');
  imgRenderModelosPanel();
}

// ── EXPORTAR EXCEL DE TURNOS ──────────────────────────────────────────────────
function imgExportarExcelTurnos() {
  const wb = XLSX.utils.book_new();
  IMG_ED.semanas.forEach((sem, wIdx) => {
    const semMap = IMG_ED.turnos[wIdx] || {};
    const rows   = [['Tecnólogo', 'Día', 'Entrada', 'Salida', 'Duración (h)', 'Colación']];
    imgGetTMs().forEach(tm => {
      DIAS.forEach(dia => {
        const d = semMap[tm.nombre]?.[dia];
        if (!d || !d.activo) return;
        rows.push([
          tm.nombre,
          dia,
          slot2str(d.ent),
          slot2str(d.ent + d.dur),
          horasTrabajadas(d.dur, d.noCol),
          hasColacion(d) ? '30 min' : '—',
        ]);
      });
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws, `Semana ${wIdx + 1}`);
  });
  XLSX.writeFile(wb, `TurnosTM_${new Date().toISOString().slice(0, 10)}.xlsx`);
  showToast('Turnos exportados', 'ok');
}
