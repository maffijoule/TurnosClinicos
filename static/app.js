// ── CEM Capacity Planner — app.js ────────────────────────────────────────────
// Estado, carga de Excel, cálculo de demanda, UI principal
// ─────────────────────────────────────────────────────────────────────────────
const DOW_ORDER = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const DOW_LABEL = { lunes: 'Lunes', martes: 'Martes', 'miércoles': 'Mier', jueves: 'Jueves', viernes: 'Viernes' };

const S = {
  raw: null,
  horas: [],
  dows: [],
  params: { tiempo: 10, prod: 0.80, usab: 0.50 },
  resultado: null,
  demandaAvg: null,
};

function recalcIfReady() { if (S.raw) calcular(); }

// ── DRAG & DROP ────────────────────────────────────────────────────────────
// Prevent browser from navigating to dropped files — preventDefault only, NO stopPropagation
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt =>
  document.addEventListener(evt, e => e.preventDefault(), true)
);

const dz = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');

dz.addEventListener('click', () => fileInput.click());
dz.addEventListener('dragenter', () => dz.classList.add('over'));
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
dz.addEventListener('dragleave', () => dz.classList.remove('over'));
dz.addEventListener('drop', e => {
  e.preventDefault();
  dz.classList.remove('over');
  const file = e.dataTransfer && e.dataTransfer.files[0];
  if (file) processFile(file);
});

function handleFile(e) { if (e.target.files[0]) processFile(e.target.files[0]); }

// ── FILE PROCESSING ────────────────────────────────────────────────────────
function processFile(file) {
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const wb = XLSX.read(ev.target.result, { type: 'array' });

      // ── Demanda (required) ──
      const demSheet = wb.SheetNames.find(n => n.toLowerCase().includes('demanda')) || wb.SheetNames[0];
      parseDemanda(XLSX.utils.sheet_to_json(wb.Sheets[demSheet], { header: 1, defval: null }));

      // ── Ejecutivos (optional) ──
      const ejSheet = wb.SheetNames.find(n => n.toLowerCase().includes('ejecutivo'));
      if (ejSheet) parseEjecutivos(XLSX.utils.sheet_to_json(wb.Sheets[ejSheet], { header: 1, defval: null }));

      // ── Configuracion (optional) ──
      const cfgSheet = wb.SheetNames.find(n => n.toLowerCase().includes('config'));
      if (cfgSheet) parseConfigSheet(XLSX.utils.sheet_to_json(wb.Sheets[cfgSheet], { header: 1, defval: null }));

      // Update dropzone UI
      const dzEl = document.getElementById('dropzone');
      dzEl.classList.add('loaded');
      document.getElementById('dzIcon').textContent = '✅';
      document.getElementById('dzTitle').textContent = file.name;
      const parts = [`Demanda: ${S.horas.length}h × ${S.dows.length} días`];
      if (E.ejecutivos.length) parts.push(`${E.ejecutivos.length} ejecutivos`);
      if (C.mes && C.anio) parts.push(`${MESES[C.mes]} ${C.anio}`);
      document.getElementById('dzSub').textContent = parts.join(' · ');

      // Update ejecutivos sidebar mini-list
      updateEjSidebarSummary();

      document.getElementById('btnCalc').disabled = false;
      calcular();
      showToast(`Archivo cargado: ${wb.SheetNames.length} hoja(s)`, 'ok');
    } catch (err) {
      showToast('Error al leer el archivo: ' + err.message, 'err');
      console.error(err);
    }
  };
  reader.readAsArrayBuffer(file);
}

function updateEjSidebarSummary() {
  const status = document.getElementById('ej-sidebar-status');
  const summary = document.getElementById('ej-sidebar-summary');
  if (!E.ejecutivos.length) {
    if (status) status.textContent = 'Carga el archivo CEM desde la pestaña Demanda';
    if (summary) summary.innerHTML = '';
    return;
  }
  const total = E.ejecutivos.reduce((s, e) => s + e.horas_semana, 0);
  if (status) status.textContent = `${E.ejecutivos.length} ejecutivos · ${total}h/sem totales`;
  const btnS = document.getElementById('btnSolver');
  if (btnS) btnS.disabled = !(E.ejecutivos.length > 0 && S.resultado);
  if (summary) summary.innerHTML = E.ejecutivos.map(ej => `
    <div style="display:flex;justify-content:space-between;align-items:center;
                padding:5px 0;border-bottom:1px solid #f0f2f5;font-size:11px">
      <span style="font-weight:600;color:var(--text)">${ej.nombre}</span>
      <span style="font-family:var(--mono);color:var(--accent)">${ej.horas_semana}h/sem</span>
    </div>`).join('');
}

// ── PARSE ──────────────────────────────────────────────────────────────────
function parseDemanda(raw) {
  // row 0: "Días", 1, 2, 3, ... (día del mes numérico)
  // row 1: "Horas", "lunes", "martes", ... (nombre día semana)
  // row 2+: hora, val, val, ...
  const row0 = raw[0];
  const row1 = raw[1];

  // Map each column index to its dow name (skip col 0 and "Total general")
  const colMap = [];
  for (let c = 1; c < row0.length; c++) {
    const dia = row0[c];
    const dow = row1[c] ? String(row1[c]).toLowerCase().trim() : null;
    if (dia === null || dia === undefined || !dow) continue;
    if (String(dia).toLowerCase().includes('total')) continue;
    colMap.push({ c, dow });
  }

  // Accumulate: acc[hora][dow] = [val, val, ...]
  const acc = {};
  const horas = [];

  for (let r = 2; r < raw.length; r++) {
    const row = raw[r];
    const horaRaw = row[0];
    if (horaRaw === null || horaRaw === undefined) continue;
    const horaStr = String(horaRaw).trim();
    if (!horaStr || horaStr.toLowerCase().includes('total')) continue;

    // Parse hour — integer (7,8,...) or Excel time serial (fraction of day)
    const num = parseFloat(horaStr);
    let horaLabel;
    if (!isNaN(num)) {
      if (num < 25) {
        horaLabel = String(Math.round(num)).padStart(2, '0') + ':00';
      } else {
        // Excel serial time
        const totalMin = Math.round(num * 24 * 60);
        horaLabel = String(Math.floor(totalMin / 60)).padStart(2, '0') + ':' + String(totalMin % 60).padStart(2, '0');
      }
    } else {
      horaLabel = horaStr;
    }

    if (!acc[horaLabel]) { acc[horaLabel] = {}; horas.push(horaLabel); }

    for (const { c, dow } of colMap) {
      const v = row[c];
      const n = (v !== null && v !== undefined && !isNaN(v)) ? Number(v) : 0;
      if (!acc[horaLabel][dow]) acc[horaLabel][dow] = [];
      acc[horaLabel][dow].push(n);
    }
  }

  // Detect which L-V dows are actually present with non-zero data
  const outputDows = DOW_ORDER.filter(d =>
    d !== 'domingo' &&
    horas.some(h => acc[h][d] && acc[h][d].some(v => v > 0))
  );

  S.raw = acc;
  S.horas = horas;
  S.dows = outputDows;
}

// ── CALCULATE ─────────────────────────────────────────────────────────────
// personal = D_avg × (1−U) × T / (60 × P)
function calcular() {
  if (!S.raw) return;
  const { tiempo, prod, usab } = S.params;
  const demandaAvg = {}, resultado = {};

  for (const h of S.horas) {
    demandaAvg[h] = {}; resultado[h] = {};
    for (const d of S.dows) {
      const vals = S.raw[h][d] || [];
      // divide by total number of occurrences (including zeros for missing days)
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      demandaAvg[h][d] = avg;
      resultado[h][d] = avg * (1 - usab) * tiempo / (60 * prod);
    }
  }

  S.demandaAvg = demandaAvg;
  S.resultado = resultado;
  renderResultado();
  document.getElementById('btnExport').disabled = false;
  const btnS2 = document.getElementById('btnSolver');
  if (btnS2) btnS2.disabled = !(E.ejecutivos.length > 0);
}

// ── RENDER ─────────────────────────────────────────────────────────────────
function fmt(v) {
  if (!v || v < 0.005) return '—';
  return v.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function heatClass(v, max) {
  if (v < 0.005) return 'h0';
  const r = v / max;
  if (r < 0.15) return 'h1';
  if (r < 0.30) return 'h2';
  if (r < 0.50) return 'h3';
  if (r < 0.70) return 'h4';
  return 'h5';
}

function renderResultado() {
  const { resultado, demandaAvg, horas, dows, params } = S;
  const labels = dows.map(d => DOW_LABEL[d] || d.charAt(0).toUpperCase() + d.slice(1, 4));

  const allVals = horas.flatMap(h => dows.map(d => resultado[h][d]));
  const globalMax = Math.max(...allVals);
  const totalDem = Math.round(horas.flatMap(h => dows.map(d => demandaAvg[h][d])).reduce((a, b) => a + b, 0));

  // DOW stats
  const dowStats = dows.map(d => {
    const rVals = horas.map(h => resultado[h][d]);
    const dVals = horas.map(h => demandaAvg[h][d]);
    return {
      max: Math.max(...rVals),
      avg: rVals.filter(v => v > 0).reduce((a, b) => a + b, 0) / (rVals.filter(v => v > 0).length || 1),
      dem: Math.round(dVals.reduce((a, b) => a + b, 0))
    };
  });

  // KPI row
  const kpiHTML = `
  <div class="kpi-row">
    <div class="kpi-card">
      <div class="kpi-label">Demanda total</div>
      <div class="kpi-val">${totalDem.toLocaleString('es-CL')}</div>
      <div class="kpi-sub">personas promedio / semana</div>
    </div>
    <div class="kpi-card blue">
      <div class="kpi-label">Demanda máxima</div>
      <div class="kpi-val">${globalMax.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</div>
      <div class="kpi-sub">ejecutivos simultáneos pico</div>
    </div>
    <div class="kpi-card green">
      <div class="kpi-label">Días de semana</div>
      <div class="kpi-val">${dows.length}</div>
      <div class="kpi-sub">lunes a viernes</div>
    </div>
    <div class="kpi-card amber">
      <div class="kpi-label">Franjas horarias</div>
      <div class="kpi-val">${horas.length}</div>
      <div class="kpi-sub">con demanda registrada</div>
    </div>
  </div>`;

  // DOW summary
  const dowHTML = `
  <div class="table-card">
    <div class="table-card-header">
      <div>
        <div class="table-card-title">Resumen por Día de Semana</div>
        <div class="table-card-sub">T = ${params.tiempo} min &nbsp;·&nbsp; P = ${(params.prod * 100).toFixed(0)}% &nbsp;·&nbsp; U = ${(params.usab * 100).toFixed(0)}%</div>
      </div>
    </div>
    <div class="dow-grid">
      ${dows.map((d, i) => {
    const s = dowStats[i];
    const bar = (s.max / globalMax * 100).toFixed(1);
    return `<div class="dow-card">
          <div class="dow-name">${labels[i]}</div>
          <div class="dow-stat"><span class="dow-stat-label">Demanda máxima</span><span class="dow-stat-val">${fmt(s.max)}</span></div>
          <div class="dow-stat"><span class="dow-stat-label">Promedio activo</span><span class="dow-stat-val">${fmt(s.avg)}</span></div>
          <div class="dow-stat"><span class="dow-stat-label">Personas / semana</span><span class="dow-stat-val" style="font-size:12px">${s.dem.toLocaleString('es-CL')}</span></div>
          <div class="dow-bar-wrap"><div class="dow-bar" style="width:${bar}%"></div></div>
        </div>`;
  }).join('')}
    </div>
  </div>`;

  // Main table
  const thDays = labels.map(l => `<th class="th-day">${l}</th>`).join('');
  const trows = horas.map(h => {
    const cells = dows.map(d => {
      const v = resultado[h][d];
      const capReal = Math.min(C.puestos_max, E.ejecutivos.length || C.puestos_max);
      const excede = v > capReal;
      const cellStyle = excede
        ? 'color:#c0392b;font-weight:700;background:#fff0f0'
        : '';
      const displayVal = excede
        ? `${fmt(v)} ⚠`
        : fmt(v);
      return `<td class="${excede ? '' : heatClass(v, globalMax)}" style="${cellStyle}">${displayVal}</td>`;
    }).join('');
    const rowMax = Math.max(...dows.map(d => resultado[h][d]));
    const capRealRow = Math.min(C.puestos_max, E.ejecutivos.length || C.puestos_max);
    const rowExcede = rowMax > capRealRow;
    return `<tr><td class="td-hora">${h}</td>${cells}
      <td class="td-max" style="${rowExcede ? 'color:#c0392b;font-weight:700' : ''}">${fmt(rowMax)}${rowExcede ? ' ⚠' : ''}</td>
    </tr>`;
  }).join('');

  // Check if any value exceeds puestos_max
  const capResultado = Math.min(C.puestos_max, E.ejecutivos.length || C.puestos_max);
  const hayExceso = horas.some(h => dows.some(d => resultado[h][d] > capResultado));
  const warningBanner = hayExceso ? `
    <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:var(--radius);
                padding:10px 16px;font-size:12px;display:flex;align-items:center;gap:10px">
      <span style="font-size:16px">⚠️</span>
      <div>
        <strong>Demanda supera la capacidad máxima real</strong><br>
        <span style="color:var(--muted)">Las celdas en rojo exceden
        min(puestos físicos, ejecutivos) = ${Math.min(C.puestos_max, E.ejecutivos.length || C.puestos_max)}.
        El solver usará ese valor como techo de cobertura.</span>
      </div>
    </div>` : '';

  const tableHTML = `
  ${warningBanner}
  <div class="table-card">
    <div class="table-card-header">
      <div>
        <div class="table-card-title">Personal Requerido por Hora</div>
        <div class="table-card-sub">Ejecutivos simultáneos necesarios — promedio del período · ⚠ = supera min(puestos, ejecutivos) = ${Math.min(C.puestos_max, E.ejecutivos.length || C.puestos_max)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;font-size:11px;color:var(--muted)">
        <span style="width:10px;height:10px;background:#cfe0f4;border-radius:2px;display:inline-block"></span>bajo
        <span style="width:10px;height:10px;background:#3a78b5;border-radius:2px;display:inline-block"></span>medio
        <span style="width:10px;height:10px;background:#0a2e5c;border-radius:2px;display:inline-block"></span>alto
      </div>
    </div>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th class="th-hora">Hora</th>
            ${thDays}
            <th class="th-max">Demanda máxima</th>
          </tr>
        </thead>
        <tbody>${trows}</tbody>
      </table>
    </div>
  </div>`;

  document.getElementById('content').innerHTML = kpiHTML + dowHTML + tableHTML;
}

// ── EXPORT ─────────────────────────────────────────────────────────────────
function exportarExcel() {
  if (!S.resultado) return;
  const { resultado, demandaAvg, horas, dows, params } = S;
  const labels = dows.map(d => DOW_LABEL[d] || d);
  const wb = XLSX.utils.book_new();

  // Personal requerido
  const h1 = ['Hora', ...labels, 'Demanda máxima'];
  const r1 = horas.map(h => {
    const vals = dows.map(d => parseFloat(resultado[h][d].toFixed(4)));
    return [h, ...vals, parseFloat(Math.max(...vals).toFixed(4))];
  });
  const ws1 = XLSX.utils.aoa_to_sheet([h1, ...r1]);
  ws1['!cols'] = [{ wch: 8 }, ...labels.map(() => ({ wch: 10 })), { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'PersonalRequerido');

  // Demanda promedio
  const h2 = ['Hora', ...labels];
  const r2 = horas.map(h => [h, ...dows.map(d => parseFloat(demandaAvg[h][d].toFixed(2)))]);
  const ws2 = XLSX.utils.aoa_to_sheet([h2, ...r2]);
  ws2['!cols'] = [{ wch: 8 }, ...labels.map(() => ({ wch: 10 }))];
  XLSX.utils.book_append_sheet(wb, ws2, 'DemandaPromedio');

  // Parámetros
  const ws3 = XLSX.utils.aoa_to_sheet([
    ['Parámetro', 'Valor'],
    ['Tiempo de atención (min)', params.tiempo],
    ['Productividad', params.prod],
    ['Usabilidad tótem (%)', (params.usab * 100).toFixed(0)],
    [],
    ['Fórmula', 'D_prom × (1−U) × T / (60 × P)'],
  ]);
  ws3['!cols'] = [{ wch: 24 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws3, 'Parámetros');

  XLSX.writeFile(wb, `CapacidadCEM_${new Date().toISOString().slice(0, 10)}.xlsx`);
  showToast('Excel exportado correctamente', 'ok');
}

// ── TOAST ──────────────────────────────────────────────────────────────────
function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast ' + type;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ── CONFIG STATE ──────────────────────────────────────────────────────────
const C = {
  mes: null, anio: null,
  puestos_max: 4, turno_min: 4, turno_max: 9,
  horas_min_ejec: 20,
  apertura_min: 2, cierre_min: 2, sabado_min: 2,
  hora_apertura: 7, hora_cierre: 21,
};

const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function horaSlotStr(h) {
  const hh = Math.floor(h);
  const mm = (h % 1) === 0.5 ? '30' : '00';
  return `${String(hh).padStart(2, '0')}:${mm}`;
}

function slotToTime(slot) {
  const totalMin = slot * 30 + 7 * 60; // starts at 07:00
  return String(Math.floor(totalMin / 60)).padStart(2, '0') + ':' + String(totalMin % 60).padStart(2, '0');
}

function updateCfg() {
  const m = parseInt(document.getElementById('cfg-mes').value);
  const a = parseInt(document.getElementById('cfg-anio').value);
  if (m >= 1 && m <= 12) { C.mes = m; document.getElementById('cfg-mes-val').textContent = MESES[m]; }
  if (a >= 2024) { C.anio = a; document.getElementById('cfg-anio-val').textContent = a; }
  if (E.ejecutivos.length > 0 || S.resultado) renderContentForCurrentTab();
}

// ── SUB-TAB SWITCHING ─────────────────────────────────────────────────────
let currentSubtab = 'demanda';

function switchSubtab(tab) {
  currentSubtab = tab;
  ['demanda', 'ejecutivos', 'config', 'modelos'].forEach(t => {
    const btn = document.getElementById('st-' + t);
    const panel = document.getElementById('panel-' + t);
    if (btn) btn.classList.toggle('active', t === tab);
    if (panel) panel.style.display = t === tab ? '' : 'none';
  });
  renderContentForCurrentTab();
}

function switchModulo(m) { /* placeholder for hospitalizado */ }

function renderContentForCurrentTab() {
  if (currentSubtab === 'demanda' && S.resultado) renderResultado();
  else if (currentSubtab === 'ejecutivos') renderEjecutivosContent();
  else if (currentSubtab === 'config') renderConfigContent();
  else if (currentSubtab === 'modelos') renderModelosContent();
}

// ── EJECUTIVOS STATE ──────────────────────────────────────────────────────
const E = { ejecutivos: [] };

// Drag & drop unificado en dropzone principal

function parseEjecutivos(raw) {
  // Skip header row, read Nombre + Horas_mes
  E.ejecutivos = [];
  for (let r = 1; r < raw.length; r++) {
    const row = raw[r];
    if (!row || !row[0]) continue;
    const nombre = String(row[0]).trim();
    const horas = parseFloat(row[1]) || 0;
    const tipo = row[2] ? String(row[2]).trim().toLowerCase() : (horas >= 40 ? 'full' : 'part');
    if (nombre && horas > 0) E.ejecutivos.push({ nombre, horas_semana: horas, tipo });
  }
}

function parseConfigSheet(raw) {
  const map = {};
  for (const row of raw) {
    if (!row || !row[0] || !row[1]) continue;
    map[String(row[0]).trim().toLowerCase()] = row[1];
  }
  if (map['mes']) { C.mes = parseInt(map['mes']); document.getElementById('cfg-mes').value = C.mes; document.getElementById('cfg-mes-val').textContent = MESES[C.mes] || C.mes; }
  if (map['año'] || map['anio']) { C.anio = parseInt(map['año'] || map['anio']); document.getElementById('cfg-anio').value = C.anio; document.getElementById('cfg-anio-val').textContent = C.anio; }
  if (map['puestos_fisicos_max']) { C.puestos_max = +map['puestos_fisicos_max']; document.getElementById('cfg-puestos').value = C.puestos_max; document.getElementById('cfg-puestos-val').textContent = C.puestos_max; }
  if (map['turno_min_horas']) { C.turno_min = +map['turno_min_horas']; document.getElementById('cfg-tmin').value = C.turno_min; document.getElementById('cfg-tmin-val').textContent = C.turno_min + 'h'; }
  if (map['turno_max_horas']) { C.turno_max = +map['turno_max_horas']; document.getElementById('cfg-tmax').value = C.turno_max; document.getElementById('cfg-tmax-val').textContent = C.turno_max + 'h'; }
  if (map['horas_min_ejecutivo']) { C.horas_min_ejec = +map['horas_min_ejecutivo']; const el = document.getElementById('cfg-hmin'); if (el) { el.value = C.horas_min_ejec; document.getElementById('cfg-hmin-val').textContent = C.horas_min_ejec + 'h'; } }
  if (map['hora_apertura'] || map['apertura_hora']) { C.hora_apertura = +(map['hora_apertura'] || map['apertura_hora']); const eAp = document.getElementById('cfg-hop'); if (eAp) { eAp.value = C.hora_apertura; document.getElementById('cfg-hop-val').textContent = horaSlotStr(C.hora_apertura); } }
  if (map['hora_cierre'] || map['cierre_hora']) { C.hora_cierre = +(map['hora_cierre'] || map['cierre_hora']); const eCi = document.getElementById('cfg-hci'); if (eCi) { eCi.value = C.hora_cierre; document.getElementById('cfg-hci-val').textContent = horaSlotStr(C.hora_cierre); } }
  if (map['ejecutivos_apertura_min']) { C.apertura_min = +map['ejecutivos_apertura_min']; document.getElementById('cfg-ap').value = C.apertura_min; document.getElementById('cfg-ap-val').textContent = C.apertura_min; }
  if (map['ejecutivos_cierre_min']) { C.cierre_min = +map['ejecutivos_cierre_min']; document.getElementById('cfg-ci').value = C.cierre_min; document.getElementById('cfg-ci-val').textContent = C.cierre_min; }
  if (map['ejecutivos_sabado_min']) { C.sabado_min = +map['ejecutivos_sabado_min']; document.getElementById('cfg-sab').value = C.sabado_min; document.getElementById('cfg-sab-val').textContent = C.sabado_min; }
}

// ── RENDER EJECUTIVOS CONTENT ─────────────────────────────────────────────
function renderEjecutivosContent() {
  const content = document.getElementById('content');
  if (!E.ejecutivos.length) {
    content.innerHTML = `<div class="empty">
      <div class="empty-icon">👥</div>
      <div class="empty-title">Sin ejecutivos</div>
      <div class="empty-sub">Carga el Excel de ejecutivos o descarga el template para comenzar.</div>
    </div>`;
    return;
  }

  const totalHoras = E.ejecutivos.reduce((s, e) => s + e.horas_semana, 0);
  const nFull = E.ejecutivos.filter(e => e.tipo === 'full').length;
  const nPart = E.ejecutivos.filter(e => e.tipo === 'part').length;

  // Horas mensuales por día de semana (aprox, asumiendo mes actual o C.mes)
  const mesLabel = C.mes ? MESES[C.mes] : '—';
  const anioLabel = C.anio || '—';

  const kpiHTML = `<div class="kpi-row">
    <div class="kpi-card">
      <div class="kpi-label">Ejecutivos</div>
      <div class="kpi-val">${E.ejecutivos.length}</div>
      <div class="kpi-sub">${nFull} full · ${nPart} part-time</div>
    </div>
    <div class="kpi-card blue">
      <div class="kpi-label">Horas totales / semana</div>
      <div class="kpi-val">${totalHoras.toLocaleString('es-CL')}</div>
      <div class="kpi-sub">horas semanales suma</div>
    </div>
    <div class="kpi-card green">
      <div class="kpi-label">Período</div>
      <div class="kpi-val" style="font-size:18px">${mesLabel}</div>
      <div class="kpi-sub">${anioLabel}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Puestos físicos</div>
      <div class="kpi-val">${C.puestos_max}</div>
      <div class="kpi-sub">máx simultáneos</div>
    </div>
  </div>`;

  // Ejecutivos table with hours bar
  const rows = E.ejecutivos.map(ej => {
    const pct = Math.min(ej.horas_semana / 50 * 100, 100);
    const barClass = ej.horas_semana > 48 ? 'over' : ej.horas_semana > 44 ? 'warn' : 'ok';
    return `<tr>
      <td style="font-weight:600">${ej.nombre}</td>
      <td><span class="ej-badge ${ej.tipo}">${ej.tipo === 'full' ? 'Full' : 'Part'}</span></td>
      <td>
        <div style="font-family:var(--mono);font-size:12px;font-weight:600">${ej.horas_semana}h/sem</div>
        <div class="horas-bar-wrap"><div class="horas-bar ${barClass}" style="width:${pct}%"></div></div>
      </td>
    </tr>`;
  }).join('');

  const tableHTML = `<div class="table-card">
    <div class="table-card-header">
      <div>
        <div class="table-card-title">Dotación de Ejecutivos</div>
        <div class="table-card-sub">Horas máximas mensuales por persona</div>
      </div>
    </div>
    <div class="table-scroll">
      <table class="ej-table">
        <thead><tr><th>Nombre</th><th>Tipo</th><th>Horas / mes</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;

  // Config summary
  const cfgHTML = `<div class="cfg-card">
    <div class="cfg-card-title">Configuración activa</div>
    <div class="cfg-row"><span class="cfg-key">Turno mín / máx</span><span class="cfg-val">${C.turno_min}h – ${C.turno_max}h</span></div>
    <div class="cfg-row"><span class="cfg-key">Horas mín por ejecutivo</span><span class="cfg-val">${C.horas_min_ejec}h / sem</span></div>
    <div class="cfg-row"><span class="cfg-key">Ejecutivos apertura</span><span class="cfg-val">≥ ${C.apertura_min}</span></div>
    <div class="cfg-row"><span class="cfg-key">Ejecutivos cierre</span><span class="cfg-val">≥ ${C.cierre_min}</span></div>
    <div class="cfg-row"><span class="cfg-key">Ejecutivos sábado</span><span class="cfg-val">≥ ${C.sabado_min}</span></div>

  </div>`;

  content.innerHTML = kpiHTML + tableHTML + cfgHTML;
}

// ── RENDER CONFIG CONTENT ─────────────────────────────────────────────────
function renderConfigContent() {
  const content = document.getElementById('content');
  if (!C.mes || !C.anio) {
    content.innerHTML = `<div class="empty">
      <div class="empty-icon">⚙️</div>
      <div class="empty-title">Configure el período</div>
      <div class="empty-sub">Ingresa el mes y año en el panel izquierdo para ver el calendario del período.</div>
    </div>`;
    return;
  }

  // Build calendar overview for the selected month
  const firstDay = new Date(C.anio, C.mes - 1, 1);
  const lastDay = new Date(C.anio, C.mes, 0);
  const nDays = lastDay.getDate();
  const DOW_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const DOW_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  // Count occurrences of each DOW
  const counts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  for (let d = 1; d <= nDays; d++) {
    const dow = new Date(C.anio, C.mes - 1, d).getDay();
    counts[dow]++;
  }

  const dowCountHTML = `<div class="cfg-card">
    <div class="cfg-card-title">${MESES[C.mes]} ${C.anio} — Distribución de días</div>
    ${[1, 2, 3, 4, 5, 6, 0].map(d => `
      <div class="cfg-row">
        <span class="cfg-key">${DOW_FULL[d]}</span>
        <span class="cfg-val">${counts[d]} ${d === 0 || d === 6 ? '(fin de semana)' : ''}</span>
      </div>`).join('')}
  </div>`;

  // Semanas del mes
  let semanas = [];
  let semana = [];
  let cur = new Date(C.anio, C.mes - 1, 1);
  // Pad to Monday
  let startDow = cur.getDay() === 0 ? 6 : cur.getDay() - 1; // 0=Mon
  for (let i = 0; i < startDow; i++) semana.push(null);
  for (let d = 1; d <= nDays; d++) {
    semana.push(d);
    if (semana.length === 7) { semanas.push(semana); semana = []; }
  }
  if (semana.length) semanas.push(semana);

  const calHTML = `<div class="table-card">
    <div class="table-card-header">
      <div class="table-card-title">Calendario ${MESES[C.mes]} ${C.anio}</div>
    </div>
    <div style="padding:16px;overflow-x:auto">
      <table style="border-collapse:collapse;width:100%;font-size:12px;text-align:center">
        <thead>
          <tr>${['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => `<th style="padding:6px 10px;color:var(--muted);font-size:11px;font-weight:700;letter-spacing:.5px">${d}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${semanas.map(sem => `<tr>${sem.map(d => {
    if (!d) return '<td></td>';
    const dow = new Date(C.anio, C.mes - 1, d).getDay();
    const isWeekend = dow === 0 || dow === 6;
    return `<td style="padding:8px;border-radius:6px;font-family:var(--mono);font-weight:${isWeekend ? '400' : '600'};color:${isWeekend ? 'var(--muted)' : 'var(--text)'};">${d}</td>`;
  }).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;

  content.innerHTML = dowCountHTML + calHTML;
}

// ── DOWNLOAD TEMPLATE ─────────────────────────────────────────────────────
function descargarTemplateEjecutivos() {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Demanda (instrucciones)
  const wsDem = XLSX.utils.aoa_to_sheet([
    ['*** HOJA DEMANDA ***', '', '', ''],
    ['Esta hoja la genera tu sistema de datos.', '', '', ''],
    ['Estructura requerida:', '', '', ''],
    ['Fila 1:', 'Días →', 'Número del día del mes (1, 2, 3...)', ''],
    ['Fila 2:', 'Horas →', 'Nombre del día de semana (lunes, martes...)', ''],
    ['Fila 3+:', 'Hora del día', 'Demanda en esa franja horaria', ''],
    ['', '', '', ''],
    ['Ejemplo:', '', '', ''],
    ['Días', 1, 2, 3],
    ['Horas', 'lunes', 'martes', 'miércoles'],
    [8, 12, 19, 17],
    [9, 30, 27, 23],
    [10, 34, 33, 34],
  ]);
  wsDem['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 36 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsDem, 'Demanda');

  // Sheet 2: Ejecutivos
  const wsEj = XLSX.utils.aoa_to_sheet([
    ['Nombre', 'Horas_semana', 'Tipo'],
    ['Ejecutivo 1', 45, 'full'],
    ['Ejecutivo 2', 45, 'full'],
    ['Ejecutivo 3', 45, 'full'],
    ['Ejecutivo 4', 45, 'full'],
    ['Ejecutivo 5', 25, 'part'],
    ['Ejecutivo 6', 25, 'part'],
  ]);
  wsEj['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, wsEj, 'Ejecutivos');

  // Sheet 3: Configuracion
  const wsCfg = XLSX.utils.aoa_to_sheet([
    ['Parámetro', 'Valor', 'Descripción'],
    ['Mes', 6, 'Número de mes (1-12)'],
    ['Año', 2025, ''],
    ['Puestos_fisicos_max', 4, 'Máx ejecutivos simultáneos en sala'],
    ['Turno_min_horas', 4, 'Duración mínima de turno en horas'],
    ['Turno_max_horas', 9, 'Duración máxima de turno en horas'],
    ['Horas_min_ejecutivo', 20, 'Mínimo de horas semanales por ejecutivo'],
    ['Ejecutivos_apertura_min', 2, 'Mínimo al abrir'],
    ['Ejecutivos_cierre_min', 2, 'Mínimo al cerrar'],
    ['Ejecutivos_sabado_min', 2, 'Mínimo los sábados'],
  ]);
  wsCfg['!cols'] = [{ wch: 26 }, { wch: 14 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsCfg, 'Configuracion');

  XLSX.writeFile(wb, 'Template_CEM.xlsx');
  showToast('Template descargado', 'ok');
}


// ── SOLVER INTEGRATION ────────────────────────────────────────────────────
const SOLVER_URL = 'http://localhost:5050';

async function ejecutarSolver() {
  const btn = document.getElementById('btnSolver');
  const status = document.getElementById('solver-status');

  // Check server alive
  status.innerHTML = '⏳ Conectando con el solver...';
  btn.disabled = true;

  try {
    const ping = await fetch(`${SOLVER_URL}/ping`, { signal: AbortSignal.timeout(3000) });
    if (!ping.ok) throw new Error('Servidor no responde');
  } catch (e) {
    status.innerHTML = `❌ Solver no disponible.<br>
      <span style="color:var(--text2)">Ejecuta <b>run.bat</b> (Windows) o <b>run.sh</b> (Mac/Linux) primero.</span>`;
    btn.disabled = false;
    return;
  }

  // Build payload
  status.innerHTML = '⏳ Preparando datos...';
  const payload = buildSolverPayload();
  if (!payload) {
    status.innerHTML = '❌ Faltan datos (demanda o ejecutivos)';
    btn.disabled = false;
    return;
  }

  // Call solver
  status.innerHTML = `⏳ Resolviendo...<br><span style="color:var(--muted);font-size:10px">Puede tomar 30–120 seg</span>`;
  try {
    const t0 = Date.now();
    const res = await fetch(`${SOLVER_URL}/solve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(600000)
    });
    const data = await res.json();
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    if (data.status === 'error') {
      status.innerHTML = `❌ Error del solver:<br><span style="font-family:var(--mono);font-size:10px">${data.mensaje}</span>`;
      btn.disabled = false;
      return;
    }
    if (data.status === 'infeasible') {
      status.innerHTML = `⚠️ Sin solución factible`;
      showToast('Infeasible — revisa parámetros', 'err');
      renderInfeasible(data);
      btn.disabled = false;
      return;
    }

    // Store result
    S.solverResult = data;
    status.innerHTML = `✅ Solución encontrada en ${elapsed}s<br>
      <span style="color:var(--muted)">Déficit: ${data.deficit_cobertura} franjas</span>`;
    showToast(`Solver completado en ${elapsed}s`, 'ok');

    // Switch to result view
    switchSubtab('ejecutivos');
    renderSolverResult(data);

    // Show save button in solver status
    status.innerHTML += `<br><button onclick="mostrarModalGuardar()"
      style="margin-top:8px;padding:5px 12px;border:1px solid var(--accent);
        border-radius:5px;background:transparent;color:var(--accent);
        font-family:var(--sans);font-size:11px;font-weight:600;cursor:pointer">
      💾 Guardar modelo
    </button>`;
  } catch (e) {
    status.innerHTML = `❌ Timeout o error de red.<br><span style="font-size:10px">${e.message}</span>`;
  }
  btn.disabled = false;
}

function buildSolverPayload() {
  if (!S.demandaAvg || !E.ejecutivos.length) return null;
  const demanda = {};
  for (const dow of S.dows) {
    demanda[dow] = {};
    for (const hora of S.horas) {
      const val = (S.resultado[hora] || {})[dow] || 0;
      if (val > 0)
        demanda[dow][hora] = Math.min(val, C.puestos_max, E.ejecutivos.length);
    }
  }
  return {
    ejecutivos: E.ejecutivos,
    demanda,
    configuracion: {
      mes: C.mes || new Date().getMonth() + 1,
      anio: C.anio || new Date().getFullYear(),
      puestos_fisicos_max: C.puestos_max,
      turno_min_horas: C.turno_min,
      turno_max_horas: C.turno_max,
      apertura_min: C.apertura_min,
      cierre_min: C.cierre_min,
      sabado_min: C.sabado_min,
      hora_apertura: C.hora_apertura,
      hora_cierre: C.hora_cierre,
    }
  };
}

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function slot_to_str_js(s) {
  const h = Math.floor(s / 2);
  const m = (s % 2) * 30;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}


function renderInfeasible(data) {
  const content = document.getElementById('content');
  const causas = (data.causas_posibles || []).map(c =>
    `<div style="padding:10px 14px;border-left:3px solid var(--danger,#c0392b);
                 background:#fff5f5;border-radius:0 6px 6px 0;
                 font-size:12px;line-height:1.6;margin-bottom:8px">${c}</div>`
  ).join('');
  const sugs = (data.sugerencias || []).map(s =>
    `<div style="padding:6px 0;font-size:12px;border-bottom:1px solid #f0f2f5">
       <span style="color:var(--accent)">→</span> ${s}</div>`
  ).join('');

  content.innerHTML = `
    <div class="kpi-card" style="border-left:4px solid #c0392b">
      <div class="kpi-label">Estado del solver</div>
      <div class="kpi-val" style="font-size:18px;color:#c0392b">Sin solución factible</div>
      <div class="kpi-sub">${data.mensaje}</div>
    </div>
    <div class="table-card">
      <div class="table-card-header">
        <div>
          <div class="table-card-title">⚠️ Causas identificadas</div>
          <div class="table-card-sub">Revisa estos conflictos entre parámetros y datos</div>
        </div>
      </div>
      <div style="padding:16px">${causas || '<p style="color:var(--muted);font-size:12px">No se identificaron causas específicas.</p>'}</div>
    </div>
    <div class="table-card">
      <div class="table-card-header">
        <div class="table-card-title">💡 Contexto actual</div>
      </div>
      <div style="padding:16px">${sugs}</div>
    </div>`;
}