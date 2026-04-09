// ── CEM — Módulo Imagen v1 ────────────────────────────────────────────────────

const IMG_DOW_ORDER = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const IMG_DOW_LABEL = { lunes: 'Lun', martes: 'Mar', 'miércoles': 'Mié', jueves: 'Jue', viernes: 'Vie', sábado: 'Sáb' };
const IMG_MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const IMG_EXAM_COLORS = {
  Resonancia:    { bg: '#ddd6fe', border: '#8b5cf6', text: '#4c1d95' },
  Scanner:       { bg: '#bfdbfe', border: '#3b82f6', text: '#1e3a5f' },
  Ecografias:    { bg: '#bbf7d0', border: '#22c55e', text: '#14532d' },
  Rayos:         { bg: '#fef08a', border: '#eab308', text: '#713f12' },
  Mamografias:   { bg: '#fbcfe8', border: '#ec4899', text: '#831843' },
  Densitometria: { bg: '#fed7aa', border: '#f97316', text: '#7c2d12' },
};
function imgExamColor(nombre) {
  return IMG_EXAM_COLORS[nombre] || { bg: '#e5e7eb', border: '#9ca3af', text: '#374151' };
}

// ── STATE ─────────────────────────────────────────────────────────────────────
const IMG = {
  hojas: {},       // { nombre: { horas[], dows[], avg: {h:{d:val}} } }
  examSel: [],     // nombres seleccionados
  tecnologos: [
    { nombre: 'TM 1', resonancia: false, sel: true, horas_semana: 44 },
    { nombre: 'TM 2', resonancia: false, sel: true, horas_semana: 44 },
    { nombre: 'TM 3', resonancia: true,  sel: true, horas_semana: 44 },
    { nombre: 'TM 4', resonancia: false, sel: true, horas_semana: 44 },
    { nombre: 'TM 5', resonancia: false, sel: true, horas_semana: 44 },
    { nombre: 'TM 6', resonancia: false, sel: true, horas_semana: 44 },
  ],
  params: {},  // no se usa en imagen
  duraciones: {
    Resonancia: 12, Scanner: 13, Ecografias: 13,
    Rayos: 5, Mamografias: 13, Densitometria: 5,
  },
  cfg: {
    mes: null, anio: null,
    puestos_max: 6, turno_min: 4, turno_max: 9,
    horas_min_ejec: 20,
    apertura_min: 1, cierre_min: 1,
    apertura_min_sat: 1, cierre_min_sat: 1,
    hora_apertura: 7, hora_cierre: 21,
    hora_apertura_sat: 9, hora_cierre_sat: 14,
  },
  resultado: null,
  horas: [],
  dows: [],
  fileName: null,
};

let imgCurrentSubtab = 'examenes';

// ── HELPERS ───────────────────────────────────────────────────────────────────
function imgHoraStr(h) {
  const hh = Math.floor(h), mm = (h % 1 === 0.5) ? '30' : '00';
  return `${String(hh).padStart(2, '0')}:${mm}`;
}
function imgFmt(v) {
  if (!v || v < 0.005) return '—';
  return v.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
function imgHeatClass(v, max) {
  if (v < 0.005) return 'h0';
  const r = v / max;
  if (r < 0.15) return 'h1';
  if (r < 0.30) return 'h2';
  if (r < 0.50) return 'h3';
  if (r < 0.70) return 'h4';
  return 'h5';
}

// ── MODELS (localStorage) ─────────────────────────────────────────────────────
const IMG_MODELS_KEY = 'cem_img_models';
function imgLoadModels() { try { return JSON.parse(localStorage.getItem(IMG_MODELS_KEY) || '[]'); } catch { return []; } }
function imgSaveModels(list) { localStorage.setItem(IMG_MODELS_KEY, JSON.stringify(list)); }

function imgGuardarModelo() {
  const nombre = document.getElementById('img-modelo-nombre')?.value?.trim();
  const desc = document.getElementById('img-modelo-desc')?.value?.trim();
  if (!nombre) { showToast('Ingresa un nombre para el modelo', 'err'); return; }
  const models = imgLoadModels();
  const snap = {
    id: Date.now(), nombre, descripcion: desc || '',
    fecha: new Date().toLocaleDateString('es-CL'),
    tecnologos: JSON.parse(JSON.stringify(IMG.tecnologos)),
    duraciones: { ...IMG.duraciones },
    cfg: { ...IMG.cfg },
    examSel: [...IMG.examSel],
    hojas: JSON.parse(JSON.stringify(IMG.hojas)),
    resultado: IMG.resultado ? JSON.parse(JSON.stringify(IMG.resultado)) : null,
    horas: [...IMG.horas], dows: [...IMG.dows],
    fileName: IMG.fileName,
  };
  const idx = models.findIndex(m => m.nombre === nombre);
  if (idx >= 0) models[idx] = snap; else models.unshift(snap);
  imgSaveModels(models);
  document.getElementById('img-modelo-nombre').value = '';
  document.getElementById('img-modelo-desc').value = '';
  showToast(`Modelo "${nombre}" guardado`, 'ok');
  imgRenderModelosPanel();
}

function imgCargarModelo(id) {
  const m = imgLoadModels().find(x => x.id === id); if (!m) return;
  IMG.tecnologos = JSON.parse(JSON.stringify(m.tecnologos));
  if (m.duraciones) IMG.duraciones = { ...IMG.duraciones, ...m.duraciones };
  IMG.cfg = { ...m.cfg };
  IMG.examSel = [...(m.examSel || [])];
  IMG.hojas = m.hojas ? JSON.parse(JSON.stringify(m.hojas)) : {};
  IMG.resultado = m.resultado ? JSON.parse(JSON.stringify(m.resultado)) : null;
  IMG.horas = [...(m.horas || [])];
  IMG.dows = [...(m.dows || [])];
  IMG.fileName = m.fileName || null;
  showToast(`Modelo "${m.nombre}" cargado`, 'ok');
  switchImgSubtab('examenes');
  if (IMG.resultado) imgRenderResultado();
}

function imgEliminarModelo(id) {
  imgSaveModels(imgLoadModels().filter(x => x.id !== id));
  imgRenderModelosPanel();
  showToast('Modelo eliminado', 'ok');
}

function imgRenderModelosPanel() {
  const el = document.getElementById('panel-img-modelos'); if (!el) return;
  const models = imgLoadModels();
  const saveHTML = `
    <div class="sidebar-section">
      <div class="section-label">Guardar Modelo Actual</div>
      <input type="text" id="img-modelo-nombre" placeholder="Nombre del modelo" class="cfg-input" style="margin-bottom:6px">
      <textarea id="img-modelo-desc" placeholder="Descripción opcional..." class="cfg-input"
        style="resize:vertical;min-height:44px;font-family:var(--sans);margin-bottom:6px"></textarea>
      <button onclick="imgGuardarModelo()" class="btn-primary">💾 Guardar Modelo</button>
    </div>`;
  const lista = !models.length
    ? `<div style="font-size:11px;color:var(--muted);padding:8px 0;text-align:center">No hay modelos guardados</div>`
    : models.map(m => `
      <div style="border:1px solid var(--border);border-radius:6px;padding:9px 10px;margin-bottom:8px;background:var(--surface2)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div style="font-size:12px;font-weight:700;color:var(--text)">${m.nombre}</div>
          <span style="font-size:9px;color:var(--muted)">${m.fecha}</span>
        </div>
        ${m.descripcion ? `<div style="font-size:10px;color:var(--muted);margin-top:2px">${m.descripcion}</div>` : ''}
        <div style="font-size:10px;color:var(--muted);margin-top:3px">
          ${m.tecnologos?.length || 0} TMs · ${m.examSel?.length || 0} exámenes
          ${m.cfg?.mes ? ' · ' + IMG_MESES[m.cfg.mes] + ' ' + m.cfg.anio : ''}
          ${m.resultado ? ' · ✓ resultado' : ''}
        </div>
        <div style="display:flex;gap:6px;margin-top:8px">
          <button onclick="imgCargarModelo(${m.id})" style="flex:1;padding:5px;border-radius:5px;border:1.5px solid var(--accent);background:transparent;color:var(--accent);font-size:11px;font-weight:600;cursor:pointer">↩ Cargar</button>
          <button onclick="if(confirm('¿Eliminar?'))imgEliminarModelo(${m.id})" style="padding:5px 8px;border-radius:5px;border:1.5px solid #e0c8c8;background:transparent;color:#c0392b;font-size:11px;cursor:pointer">✕</button>
        </div>
      </div>`).join('');
  el.innerHTML = saveHTML + `<div class="sidebar-section"><div class="section-label">Modelos Guardados</div>${lista}</div>`;
}

// ── EXCEL PARSING ─────────────────────────────────────────────────────────────
function imgHandleFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      IMG.hojas = {};
      IMG.examSel = [];

      for (const sheetName of wb.SheetNames) {
        const lower = sheetName.toLowerCase();
        if (lower.includes('config') || lower.includes('tecno') || lower.includes('param')) continue;

        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: 0 });
        if (rows.length < 2) continue;

        // Header row: (_, lunes, martes, miércoles, jueves, viernes, sábado, domingo)
        const header = rows[0];
        const dowCols = {};
        for (let c = 1; c < header.length; c++) {
          const raw = header[c] ? String(header[c]).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() : null;
          if (!raw) continue;
          const matched = IMG_DOW_ORDER.find(d =>
            d.normalize('NFD').replace(/[\u0300-\u036f]/g, '').startsWith(raw.slice(0, 3))
          );
          if (matched) dowCols[matched] = c;
        }

        // Data rows: (hour 0-23, val, val, ...)
        const avg = {};
        const horas = [];
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r];
          const h = row[0];
          if (h === null || h === undefined || h === '') continue;
          const horaNum = Number(h);
          if (isNaN(horaNum)) continue;
          const hora = String(Math.round(horaNum)).padStart(2, '0') + ':00';
          if (!avg[hora]) { avg[hora] = {}; horas.push(hora); }
          for (const [dow, c] of Object.entries(dowCols)) {
            avg[hora][dow] = (avg[hora][dow] || 0) + (Number(row[c]) || 0);
          }
        }
        // Each hour appears once → values are already the average per the source pivot

        const dows = IMG_DOW_ORDER.filter(d => horas.some(h => (avg[h][d] || 0) > 0));
        if (!horas.length) continue;

        IMG.hojas[sheetName] = { horas, dows, avg };
        IMG.examSel.push(sheetName);
      }

      // Tecnólogos sheet (optional)
      const tmSheet = wb.SheetNames.find(n => n.toLowerCase().includes('tecno'));
      if (tmSheet) {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[tmSheet], { header: 1, defval: '' });
        const tms = [];
        for (let r = 1; r < rows.length; r++) {
          const [nombre, res, horas] = rows[r];
          if (!nombre) continue;
          tms.push({
            nombre: String(nombre).trim(),
            resonancia: String(res).toLowerCase().startsWith('s') || res === true || res === 1,
            sel: true,
            horas_semana: Number(horas) || 44,
          });
        }
        if (tms.length) IMG.tecnologos = tms;
      }

      IMG.fileName = file.name;
      showToast(`Excel cargado: ${Object.keys(IMG.hojas).length} tipo(s) de examen`, 'ok');
      imgRenderExamenesPanel();
      imgCalcular();
    } catch (err) {
      showToast('Error al leer Excel: ' + err.message, 'err');
      console.error(err);
    }
  };
  reader.readAsArrayBuffer(file);
}

// ── CALCULATION ───────────────────────────────────────────────────────────────
// Fórmula: TMs(h,d) = Σ_examen [ D_examen(h,d) × T_examen / 60 ]
// Sin factor de usabilidad ni productividad (imagenología: TMs 100% productivos, sin tótem)
function imgCalcular() {
  if (!Object.keys(IMG.hojas).length || !IMG.examSel.length) {
    imgRenderResultado(); return;
  }

  const allHoras = new Set(), allDows = new Set();
  for (const n of IMG.examSel) {
    const h = IMG.hojas[n]; if (!h) continue;
    h.horas.forEach(hora => allHoras.add(hora));
    h.dows.forEach(d => allDows.add(d));
  }

  const horas = [...allHoras].sort();
  const dows = IMG_DOW_ORDER.filter(d => allDows.has(d));

  const demandaAvg = {}, resultado = {};
  for (const h of horas) {
    demandaAvg[h] = {}; resultado[h] = {};
    for (const d of dows) {
      let tmTotal = 0, demTotal = 0;
      for (const n of IMG.examSel) {
        const dem = IMG.hojas[n]?.avg[h]?.[d] || 0;
        const dur = IMG.duraciones[n] ?? 15;
        demTotal += dem;
        tmTotal  += dem * dur / 60;
      }
      demandaAvg[h][d] = demTotal;
      resultado[h][d]  = tmTotal;
    }
  }

  IMG.horas = horas;
  IMG.dows = dows;
  IMG.resultado = { demandaAvg, resultado };
  imgRenderResultado();
}

// ── RENDER RESULTADO ──────────────────────────────────────────────────────────
function imgRenderResultado() {
  const content = document.getElementById('content'); if (!content) return;
  if (!IMG.resultado || !IMG.horas.length) {
    content.innerHTML = `<div class="empty">
      <div class="empty-icon">🩻</div>
      <div class="empty-title">Módulo Imagen</div>
      <div class="empty-sub">Carga el Excel de demanda y selecciona los exámenes a considerar.</div>
    </div>`; return;
  }

  const { demandaAvg, resultado } = IMG.resultado;
  const { horas, dows } = IMG;
  const labels = dows.map(d => IMG_DOW_LABEL[d] || d.slice(0, 3));
  const tmSel = IMG.tecnologos.filter(t => t.sel);
  const puestosMax = tmSel.length || IMG.cfg.puestos_max;

  const allVals = horas.flatMap(h => dows.map(d => resultado[h][d]));
  const globalMax = Math.max(...allVals, 0.001);
  const totalDem = Math.round(horas.flatMap(h => dows.map(d => demandaAvg[h][d])).reduce((a, b) => a + b, 0));

  const dowStats = dows.map(d => {
    const rVals = horas.map(h => resultado[h][d]);
    const dVals = horas.map(h => demandaAvg[h][d]);
    return {
      max: Math.max(...rVals),
      avg: (() => { const vs = rVals.filter(v => v > 0); return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : 0; })(),
      dem: Math.round(dVals.reduce((a, b) => a + b, 0)),
    };
  });

  // Badges selección activa
  const examBadges = IMG.examSel.map(n => {
    const c = imgExamColor(n);
    return `<span style="padding:2px 9px;border-radius:10px;background:${c.bg};border:1px solid ${c.border};color:${c.text};font-size:10px;font-weight:700">${n}</span>`;
  }).join(' ');

  const tmBadges = tmSel.map(t =>
    `<span style="padding:2px 8px;border-radius:10px;background:var(--surface2);border:1px solid var(--border);font-size:10px;font-weight:600">
      ${t.nombre}${t.resonancia ? ' 🔬' : ''}
    </span>`
  ).join(' ');

  const kpiHTML = `<div class="kpi-row">
    <div class="kpi-card">
      <div class="kpi-label">Demanda total</div>
      <div class="kpi-val">${totalDem.toLocaleString('es-CL')}</div>
      <div class="kpi-sub">pacientes prom / semana</div>
    </div>
    <div class="kpi-card blue">
      <div class="kpi-label">TMs requeridos (pico)</div>
      <div class="kpi-val">${imgFmt(globalMax)}</div>
      <div class="kpi-sub">simultáneos</div>
    </div>
    <div class="kpi-card ${tmSel.length >= Math.ceil(globalMax) ? 'green' : 'amber'}">
      <div class="kpi-label">TMs seleccionados</div>
      <div class="kpi-val">${tmSel.length}</div>
      <div class="kpi-sub">${tmSel.filter(t => t.resonancia).length} con resonancia 🔬</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Franjas horarias</div>
      <div class="kpi-val">${horas.length}</div>
      <div class="kpi-sub">con demanda registrada</div>
    </div>
  </div>`;

  const selHTML = `<div class="table-card" style="padding:12px 16px">
    <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
      <span style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;white-space:nowrap">Exámenes:</span>
      ${examBadges}
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:8px">
      <span style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;white-space:nowrap">TMs:</span>
      ${tmBadges || '<span style="font-size:10px;color:var(--muted)">Ninguno seleccionado</span>'}
    </div>
  </div>`;

  const dowHTML = `<div class="table-card">
    <div class="table-card-header">
      <div>
        <div class="table-card-title">Resumen por Día de Semana</div>
        <div class="table-card-sub">${IMG.examSel.map(n => `${n}: ${IMG.duraciones[n] ?? 15} min`).join(' · ')}</div>
      </div>
    </div>
    <div class="dow-grid">
      ${dows.map((d, i) => {
        const s = dowStats[i];
        const bar = globalMax > 0 ? (s.max / globalMax * 100).toFixed(1) : 0;
        return `<div class="dow-card">
          <div class="dow-name">${labels[i]}</div>
          <div class="dow-stat"><span class="dow-stat-label">TMs pico</span><span class="dow-stat-val">${imgFmt(s.max)}</span></div>
          <div class="dow-stat"><span class="dow-stat-label">Promedio activo</span><span class="dow-stat-val">${imgFmt(s.avg)}</span></div>
          <div class="dow-stat"><span class="dow-stat-label">Pacientes / sem</span><span class="dow-stat-val" style="font-size:12px">${s.dem.toLocaleString('es-CL')}</span></div>
          <div class="dow-bar-wrap"><div class="dow-bar" style="width:${bar}%"></div></div>
        </div>`;
      }).join('')}
    </div>
  </div>`;

  const hayExceso = horas.some(h => dows.some(d => resultado[h][d] > puestosMax));
  const warningBanner = hayExceso ? `<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:var(--radius);
    padding:10px 16px;font-size:12px;display:flex;align-items:center;gap:10px">
    <span style="font-size:16px">⚠️</span>
    <div><strong>Demanda supera los TMs seleccionados (${puestosMax})</strong><br>
    <span style="color:var(--muted)">Las celdas en rojo exceden la capacidad disponible.</span></div>
  </div>` : '';

  const thDays = labels.map(l => `<th class="th-day">${l}</th>`).join('');
  const trows = horas.map(h => {
    const cells = dows.map(d => {
      const v = resultado[h][d];
      const excede = v > puestosMax;
      return `<td class="${excede ? '' : imgHeatClass(v, globalMax)}"
        style="${excede ? 'color:#c0392b;font-weight:700;background:#fff0f0' : ''}">
        ${imgFmt(v)}${excede ? ' ⚠' : ''}</td>`;
    }).join('');
    const rowMax = Math.max(...dows.map(d => resultado[h][d]));
    const rowEx = rowMax > puestosMax;
    return `<tr>
      <td class="td-hora">${h}</td>${cells}
      <td class="td-max" style="${rowEx ? 'color:#c0392b;font-weight:700' : ''}">${imgFmt(rowMax)}${rowEx ? ' ⚠' : ''}</td>
    </tr>`;
  }).join('');

  const tableHTML = `${warningBanner}<div class="table-card">
    <div class="table-card-header">
      <div>
        <div class="table-card-title">TMs Requeridos por Hora</div>
        <div class="table-card-sub">Tecnólogos simultáneos necesarios · promedio del período · ⚠ = supera TMs seleccionados (${puestosMax})</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;font-size:11px;color:var(--muted)">
        <span style="width:10px;height:10px;background:#cfe0f4;border-radius:2px;display:inline-block"></span>bajo
        <span style="width:10px;height:10px;background:#3a78b5;border-radius:2px;display:inline-block"></span>alto
      </div>
    </div>
    <div class="table-scroll">
      <table>
        <thead><tr><th class="th-hora">Hora</th>${thDays}<th class="th-max">Pico</th></tr></thead>
        <tbody>${trows}</tbody>
      </table>
    </div>
  </div>`;

  content.innerHTML = kpiHTML + selHTML + dowHTML + tableHTML;
}

// ── PANEL EXAMENES ────────────────────────────────────────────────────────────
function imgRenderExamenesPanel() {
  const panel = document.getElementById('panel-img-examenes'); if (!panel) return;
  const tieneHojas = Object.keys(IMG.hojas).length > 0;

  const dropHTML = `<div class="sidebar-section">
    <div class="section-label">Archivo de Demanda</div>
    <div class="dropzone ${tieneHojas ? 'loaded' : ''}" id="img-dropzone"
      onclick="document.getElementById('img-file-input').click()"
      ondragover="event.preventDefault();this.style.borderColor='var(--accent)'"
      ondragleave="this.style.borderColor=''"
      ondrop="event.preventDefault();this.style.borderColor='';imgHandleFile(event.dataTransfer.files[0])">
      <input type="file" id="img-file-input" accept=".xlsx,.xls" style="display:none"
        onchange="imgHandleFile(this.files[0])">
      <div class="dropzone-icon">${tieneHojas ? '✅' : '🩻'}</div>
      <div class="dropzone-title">${tieneHojas ? (IMG.fileName || 'Archivo cargado') : 'Arrastra tu Excel aquí'}</div>
      <div class="dropzone-sub">${tieneHojas
        ? Object.keys(IMG.hojas).length + ' tipo(s) de examen detectados'
        : 'Una hoja por tipo de examen'}</div>
    </div>
    <button onclick="window.open('/imagen/template','_blank')" class="btn-export" style="margin-top:6px">↓ Descargar Template</button>
  </div>`;

  // Exam chips
  const examHTML = tieneHojas ? `<div class="sidebar-section">
    <div class="section-label" style="display:flex;justify-content:space-between;align-items:center">
      Exámenes a Considerar
      <div style="display:flex;gap:4px">
        <button onclick="IMG.examSel=[...Object.keys(IMG.hojas)];imgRenderExamenesPanel();imgCalcular()"
          style="border:none;background:transparent;color:var(--accent);font-size:10px;font-weight:700;cursor:pointer;padding:0">todos</button>
        <span style="color:var(--muted);font-size:10px">·</span>
        <button onclick="IMG.examSel=[];imgRenderExamenesPanel();imgCalcular()"
          style="border:none;background:transparent;color:var(--muted);font-size:10px;cursor:pointer;padding:0">ninguno</button>
      </div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:6px">
      ${Object.keys(IMG.hojas).map(nombre => {
        const sel = IMG.examSel.includes(nombre);
        const c = imgExamColor(nombre);
        return `<button onclick="imgToggleExamen('${nombre}')" style="padding:5px 10px;border-radius:12px;
          border:2px solid ${sel ? c.border : 'var(--border)'};
          background:${sel ? c.bg : 'var(--surface2)'};
          color:${sel ? c.text : 'var(--muted)'};
          font-size:11px;font-weight:${sel ? '700' : '400'};cursor:pointer;transition:all .15s">
          ${nombre}
        </button>`;
      }).join('')}
    </div>
    <div style="font-size:10px;color:var(--muted)">${IMG.examSel.length} de ${Object.keys(IMG.hojas).length} seleccionado(s)</div>
  </div>` : '';

  // TM chips
  const tmSel = IMG.tecnologos.filter(t => t.sel);
  const tmHTML = `<div class="sidebar-section">
    <div class="section-label" style="display:flex;justify-content:space-between;align-items:center">
      Tecnólogos a Incluir
      <div style="display:flex;gap:4px">
        <button onclick="IMG.tecnologos.forEach(t=>t.sel=true);imgRenderExamenesPanel();imgCalcular()"
          style="border:none;background:transparent;color:var(--accent);font-size:10px;font-weight:700;cursor:pointer;padding:0">todos</button>
        <span style="color:var(--muted);font-size:10px">·</span>
        <button onclick="IMG.tecnologos.forEach(t=>t.sel=false);imgRenderExamenesPanel();imgCalcular()"
          style="border:none;background:transparent;color:var(--muted);font-size:10px;cursor:pointer;padding:0">ninguno</button>
      </div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:6px">
      ${IMG.tecnologos.map((t, i) => `
        <button onclick="imgToggleTM(${i})" style="padding:4px 9px;border-radius:10px;
          border:2px solid ${t.sel ? 'var(--accent)' : 'var(--border)'};
          background:${t.sel ? 'var(--accent-lt)' : 'var(--surface2)'};
          color:${t.sel ? 'var(--accent)' : 'var(--muted)'};
          font-size:11px;font-weight:${t.sel ? '700' : '400'};cursor:pointer;transition:all .15s">
          ${t.nombre}${t.resonancia ? ' 🔬' : ''}
        </button>`).join('')}
    </div>
    <div style="font-size:10px;color:var(--muted)">${tmSel.length} TM(s) · ${tmSel.filter(t => t.resonancia).length} con resonancia</div>
  </div>`;

  const EXAM_DUR_DEFAULTS = {
    Resonancia: 12, Scanner: 13, Ecografias: 13,
    Rayos: 5, Mamografias: 13, Densitometria: 5,
  };
  // Duraciones configurables para los exámenes cargados (o todos los conocidos si no hay hojas)
  const examDurRows = Object.keys(IMG.hojas).length
    ? Object.keys(IMG.hojas)
    : Object.keys(EXAM_DUR_DEFAULTS);
  const durRows = examDurRows.map(nombre => {
    const val = IMG.duraciones[nombre] ?? EXAM_DUR_DEFAULTS[nombre] ?? 10;
    const c = imgExamColor(nombre);
    return `<div class="param-row">
      <div class="param-label">
        <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${c.border};margin-right:4px;vertical-align:middle"></span>
        ${nombre} <span class="param-val" id="img-dur-${nombre}">${val} min</span>
      </div>
      <input type="range" min="1" max="60" value="${val}"
        oninput="IMG.duraciones['${nombre}']=+this.value;document.getElementById('img-dur-${nombre}').textContent=this.value+' min';imgCalcular()">
    </div>`;
  }).join('');
  const paramsHTML = `<div class="sidebar-section">
    <div class="section-label">Duración por Examen</div>
    ${durRows || '<div style="font-size:11px;color:var(--muted)">Carga un Excel para ver los exámenes</div>'}
    <div style="font-size:9px;color:var(--muted);margin-top:6px;line-height:1.4">TMs = Σ D_examen × T_examen / 60<br>Sin tótem · productividad 100%</div>
  </div>`;

  const accionesHTML = `<div class="sidebar-section">
    <div class="section-label">Acciones</div>
    <button class="btn-primary" id="btn-img-calc" onclick="imgCalcular()" ${!tieneHojas ? 'disabled' : ''}>▶ Calcular</button>
    <button class="btn-export" id="btn-img-export" onclick="imgExportarExcel()" ${!IMG.resultado ? 'disabled' : ''}>↓ Exportar Excel</button>
  </div>`;

  panel.innerHTML = dropHTML + examHTML + tmHTML + paramsHTML + accionesHTML;
}

// ── PANEL TECNÓLOGOS ──────────────────────────────────────────────────────────
function imgRenderTecnologosPanel() {
  const panel = document.getElementById('panel-img-tecnologos'); if (!panel) return;
  panel.innerHTML = `
    <div class="sidebar-section">
      <div class="section-label" style="display:flex;justify-content:space-between;align-items:center">
        Tecnólogos (${IMG.tecnologos.length})
        <button onclick="imgToggleAgregarTM()" style="border:none;background:transparent;color:var(--accent);font-size:11px;font-weight:700;cursor:pointer;padding:0">+ Agregar</button>
      </div>
      <div id="img-agregar-tm" style="display:none;margin-bottom:10px;padding:10px;background:var(--accent-lt);border-radius:7px;border:1px solid var(--border)">
        <div style="font-size:10px;font-weight:700;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">Nuevo Tecnólogo</div>
        <input type="text" id="img-tm-nombre" placeholder="Nombre (ej: TM 7)" class="cfg-input" style="margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;padding:6px 0">
          <input type="checkbox" id="img-tm-res" style="cursor:pointer;width:14px;height:14px">
          <label for="img-tm-res" style="font-size:11px;color:var(--text2);cursor:pointer">Especialidad Resonancia 🔬</label>
        </div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
          <span style="font-size:11px;color:var(--text2)">Horas/sem:</span>
          <input type="number" id="img-tm-horas" min="4" max="48" value="44" class="cfg-input" style="width:60px">
        </div>
        <div style="display:flex;gap:6px">
          <button onclick="imgAgregarTM()" style="flex:1;padding:6px;border-radius:5px;border:none;background:var(--accent);color:#fff;font-size:11px;font-weight:700;cursor:pointer">✓ Agregar</button>
          <button onclick="imgToggleAgregarTM()" style="padding:6px 10px;border-radius:5px;border:1px solid var(--border);background:transparent;color:var(--muted);font-size:11px;cursor:pointer">✕</button>
        </div>
      </div>
      ${IMG.tecnologos.map((t, i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #f0f2f5">
          <div>
            <div style="font-size:11px;font-weight:600;color:var(--text)">${t.nombre}</div>
            <div style="font-size:10px;color:var(--muted)">${t.horas_semana}h/sem · ${t.resonancia ? 'Resonancia 🔬' : 'Sin especialidad'}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <button onclick="imgToggleResonancia(${i})" title="${t.resonancia ? 'Quitar resonancia' : 'Agregar resonancia'}"
              style="border:1px solid ${t.resonancia ? 'var(--accent)' : 'var(--border)'};
              background:${t.resonancia ? 'var(--accent-lt)' : 'transparent'};
              color:${t.resonancia ? 'var(--accent)' : 'var(--muted)'};
              border-radius:4px;padding:2px 7px;font-size:11px;cursor:pointer">🔬</button>
            <button onclick="imgEliminarTM(${i})" style="border:none;background:none;color:#c0392b;cursor:pointer;font-size:13px;padding:0 2px">×</button>
          </div>
        </div>`).join('')}
    </div>
    <div class="sidebar-section">
      <div style="font-size:10px;color:var(--muted);line-height:1.5;padding:4px 0">
        🔬 La especialidad de resonancia es <strong>referencial</strong> (PTI).<br>
        Un TM sin especialidad no puede hacer resonancia; uno con especialidad puede hacer cualquier examen.
      </div>
    </div>
    <div class="sidebar-section">
      <div class="section-label">Solver</div>
      <button class="btn-primary" id="btn-img-solver" onclick="imgEjecutarSolver()"
        ${!IMG.resultado ? 'disabled' : ''}>▶ Ejecutar Solver</button>
      <div id="img-solver-status" style="margin-top:8px;font-size:11px;color:var(--muted);line-height:1.5"></div>
    </div>`;
}

// ── PANEL CONFIG ──────────────────────────────────────────────────────────────
function imgRenderConfigPanel() {
  const panel = document.getElementById('panel-img-config'); if (!panel) return;
  const cfg = IMG.cfg;
  panel.innerHTML = `
    <div class="sidebar-section">
      <div class="section-label">Parámetros Globales</div>
      <div class="param-row">
        <div class="param-label">Mes <span class="param-val" id="img-cfg-mes-val">${cfg.mes ? IMG_MESES[cfg.mes] : '—'}</span></div>
        <input type="number" id="img-cfg-mes" min="1" max="12" value="${cfg.mes || ''}" placeholder="1–12" class="cfg-input"
          oninput="IMG.cfg.mes=+this.value;document.getElementById('img-cfg-mes-val').textContent=IMG_MESES[+this.value]||'—'">
      </div>
      <div class="param-row">
        <div class="param-label">Año <span class="param-val" id="img-cfg-anio-val">${cfg.anio || '—'}</span></div>
        <input type="number" id="img-cfg-anio" min="2024" max="2099" value="${cfg.anio || ''}" placeholder="2025" class="cfg-input"
          oninput="IMG.cfg.anio=+this.value;document.getElementById('img-cfg-anio-val').textContent=this.value">
      </div>
      <div class="param-row">
        <div class="param-label">Puestos físicos máx <span class="param-val" id="img-cfg-puestos-val">${cfg.puestos_max}</span></div>
        <input type="range" min="1" max="20" value="${cfg.puestos_max}"
          oninput="IMG.cfg.puestos_max=+this.value;document.getElementById('img-cfg-puestos-val').textContent=this.value">
      </div>
      <div class="param-row">
        <div class="param-label">Turno mín (h) <span class="param-val" id="img-cfg-tmin-val">${cfg.turno_min}h</span></div>
        <input type="range" min="1" max="12" step="0.5" value="${cfg.turno_min}"
          oninput="IMG.cfg.turno_min=+this.value;document.getElementById('img-cfg-tmin-val').textContent=this.value+'h'">
      </div>
      <div class="param-row">
        <div class="param-label">Turno máx (h) <span class="param-val" id="img-cfg-tmax-val">${cfg.turno_max}h</span></div>
        <input type="range" min="4" max="12" step="0.5" value="${cfg.turno_max}"
          oninput="IMG.cfg.turno_max=+this.value;document.getElementById('img-cfg-tmax-val').textContent=this.value+'h'">
      </div>
      <div class="param-row">
        <div class="param-label">Horas mín/TM <span class="param-val" id="img-cfg-hmin-val">${cfg.horas_min_ejec}h</span></div>
        <input type="range" min="4" max="48" value="${cfg.horas_min_ejec}"
          oninput="IMG.cfg.horas_min_ejec=+this.value;document.getElementById('img-cfg-hmin-val').textContent=this.value+'h'">
      </div>
    </div>
    <div class="sidebar-section">
      <div class="section-label">Horario de Operación</div>
      <div class="param-row">
        <div class="param-label">Apertura <span class="param-val" id="img-cfg-hop-val">${imgHoraStr(cfg.hora_apertura)}</span></div>
        <input type="range" min="6" max="12" step="0.5" value="${cfg.hora_apertura}"
          oninput="IMG.cfg.hora_apertura=+this.value;document.getElementById('img-cfg-hop-val').textContent=imgHoraStr(+this.value)">
      </div>
      <div class="param-row">
        <div class="param-label">Cierre <span class="param-val" id="img-cfg-hci-val">${imgHoraStr(cfg.hora_cierre)}</span></div>
        <input type="range" min="16" max="22" step="0.5" value="${cfg.hora_cierre}"
          oninput="IMG.cfg.hora_cierre=+this.value;document.getElementById('img-cfg-hci-val').textContent=imgHoraStr(+this.value)">
      </div>
    </div>
    <div class="sidebar-section">
      <div class="section-label">Dotación mínima — Lun a Vie</div>
      <div class="param-row">
        <div class="param-label">Apertura mín <span class="param-val" id="img-cfg-ap-val">${cfg.apertura_min}</span></div>
        <input type="range" min="0" max="6" value="${cfg.apertura_min}"
          oninput="IMG.cfg.apertura_min=+this.value;document.getElementById('img-cfg-ap-val').textContent=this.value">
      </div>
      <div class="param-row">
        <div class="param-label">Cierre mín <span class="param-val" id="img-cfg-ci-val">${cfg.cierre_min}</span></div>
        <input type="range" min="0" max="6" value="${cfg.cierre_min}"
          oninput="IMG.cfg.cierre_min=+this.value;document.getElementById('img-cfg-ci-val').textContent=this.value">
      </div>
    </div>
    <div class="sidebar-section">
      <div class="section-label">Horario Sábado</div>
      <div class="param-row">
        <div class="param-label">Apertura sáb <span class="param-val" id="img-cfg-hsat-ap-val">${imgHoraStr(cfg.hora_apertura_sat)}</span></div>
        <input type="range" min="6" max="14" step="0.5" value="${cfg.hora_apertura_sat}"
          oninput="IMG.cfg.hora_apertura_sat=+this.value;document.getElementById('img-cfg-hsat-ap-val').textContent=imgHoraStr(+this.value)">
      </div>
      <div class="param-row">
        <div class="param-label">Cierre sáb <span class="param-val" id="img-cfg-hsat-ci-val">${imgHoraStr(cfg.hora_cierre_sat)}</span></div>
        <input type="range" min="10" max="20" step="0.5" value="${cfg.hora_cierre_sat}"
          oninput="IMG.cfg.hora_cierre_sat=+this.value;document.getElementById('img-cfg-hsat-ci-val').textContent=imgHoraStr(+this.value)">
      </div>
    </div>
    <div class="sidebar-section">
      <div class="section-label">Dotación mínima — Sábado</div>
      <div class="param-row">
        <div class="param-label">Apertura sáb mín <span class="param-val" id="img-cfg-sat-ap-val">${cfg.apertura_min_sat}</span></div>
        <input type="range" min="0" max="6" value="${cfg.apertura_min_sat}"
          oninput="IMG.cfg.apertura_min_sat=+this.value;document.getElementById('img-cfg-sat-ap-val').textContent=this.value">
      </div>
      <div class="param-row">
        <div class="param-label">Cierre sáb mín <span class="param-val" id="img-cfg-sat-ci-val">${cfg.cierre_min_sat}</span></div>
        <input type="range" min="0" max="6" value="${cfg.cierre_min_sat}"
          oninput="IMG.cfg.cierre_min_sat=+this.value;document.getElementById('img-cfg-sat-ci-val').textContent=this.value">
      </div>
    </div>`;
}

// ── TM ACTIONS ────────────────────────────────────────────────────────────────
function imgToggleExamen(nombre) {
  const idx = IMG.examSel.indexOf(nombre);
  if (idx >= 0) IMG.examSel.splice(idx, 1); else IMG.examSel.push(nombre);
  imgRenderExamenesPanel();
  imgCalcular();
}
function imgToggleTM(i) {
  IMG.tecnologos[i].sel = !IMG.tecnologos[i].sel;
  imgRenderExamenesPanel();
  imgCalcular();
}
function imgToggleResonancia(i) {
  IMG.tecnologos[i].resonancia = !IMG.tecnologos[i].resonancia;
  imgRenderTecnologosPanel();
}
function imgToggleAgregarTM() {
  const el = document.getElementById('img-agregar-tm');
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}
function imgAgregarTM() {
  const nombre = document.getElementById('img-tm-nombre')?.value?.trim();
  const res = document.getElementById('img-tm-res')?.checked;
  const horas = parseInt(document.getElementById('img-tm-horas')?.value) || 44;
  if (!nombre) { showToast('Ingresa un nombre', 'err'); return; }
  if (IMG.tecnologos.find(t => t.nombre === nombre)) { showToast('Ya existe ese nombre', 'err'); return; }
  IMG.tecnologos.push({ nombre, resonancia: !!res, sel: true, horas_semana: horas });
  showToast(`${nombre} agregado`, 'ok');
  imgRenderTecnologosPanel();
  imgRenderExamenesPanel();
}
function imgEliminarTM(i) {
  if (!confirm(`¿Eliminar a ${IMG.tecnologos[i].nombre}?`)) return;
  IMG.tecnologos.splice(i, 1);
  imgRenderTecnologosPanel();
  imgRenderExamenesPanel();
}

// ── SOLVER ────────────────────────────────────────────────────────────────────
async function imgEjecutarSolver() {
  if (!IMG.resultado) { showToast('Primero calcula la demanda en la pestaña Examenes', 'err'); return; }

  const tmsSel = IMG.tecnologos.filter(t => t.sel);
  if (!tmsSel.length) { showToast('Selecciona al menos un tecnólogo', 'err'); return; }

  const btn = document.getElementById('btn-img-solver');
  const statusEl = document.getElementById('img-solver-status');
  if (btn) btn.disabled = true;
  if (statusEl) statusEl.textContent = '⏳ Optimizando…';

  // Construir demanda en formato {dow: {HH:MM: tm_requeridos}}
  // IMG.horas ya tiene formato "HH:MM", no agregar ":00"
  const demanda = {};
  const { resultado } = IMG.resultado;  // TMs requeridos (ya calculados)
  IMG.dows.forEach(dow => {
    demanda[dow] = {};
    IMG.horas.forEach(h => {
      const v = resultado[h]?.[dow] || 0;
      if (v > 0.005) demanda[dow][h] = v;  // h ya es "HH:MM"
    });
  });

  const payload = {
    tecnologos: tmsSel.map(t => ({
      nombre:       t.nombre,
      horas_semana: t.horas_semana || 44,
      resonancia:   t.resonancia,
    })),
    demanda,
    configuracion: {
      puestos_fisicos_max:  IMG.cfg.puestos_max,
      turno_min_horas:      IMG.cfg.turno_min,
      turno_max_horas:      IMG.cfg.turno_max,
      horas_min_ejecutivo:  IMG.cfg.horas_min_ejec,
      hora_apertura:        IMG.cfg.hora_apertura,
      hora_cierre:          IMG.cfg.hora_cierre,
      hora_apertura_sat:    IMG.cfg.hora_apertura_sat,
      hora_cierre_sat:      IMG.cfg.hora_cierre_sat,
      apertura_min:         IMG.cfg.apertura_min,
      cierre_min:           IMG.cfg.cierre_min,
      apertura_min_sat:     IMG.cfg.apertura_min_sat,
      cierre_min_sat:       IMG.cfg.cierre_min_sat,
    },
  };

  try {
    const res = await fetch(`${window.location.origin}/imagen/solve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || data.status === 'error' || data.status === 'infeasible') {
      throw new Error(data.mensaje || 'Error en el servidor');
    }
    if (statusEl) statusEl.textContent = `✓ Solver completado · déficit ${data.deficit_cobertura ?? '?'}`;
    showToast('Solver completado', 'ok');
    imgRenderSolverResult(data);
  } catch (err) {
    if (statusEl) statusEl.textContent = '✗ Error: ' + err.message;
    showToast('Error solver: ' + err.message, 'err');
    console.error(err);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── SUB-TAB SWITCHING ─────────────────────────────────────────────────────────
function switchImgSubtab(tab) {
  imgCurrentSubtab = tab;
  ['examenes', 'tecnologos', 'config', 'modelos'].forEach(t => {
    const btn = document.getElementById('st-img-' + t);
    const p = document.getElementById('panel-img-' + t);
    if (btn) btn.classList.toggle('active', t === tab);
    if (p) p.style.display = t === tab ? '' : 'none';
  });
  const content = document.getElementById('content');
  if (tab === 'examenes') {
    imgRenderExamenesPanel();
    if (IMG.resultado) imgRenderResultado();
    else if (content) content.innerHTML = `<div class="empty"><div class="empty-icon">🩻</div>
      <div class="empty-title">Módulo Imagen</div>
      <div class="empty-sub">Carga el Excel de demanda y selecciona los exámenes a considerar.</div></div>`;
  } else if (tab === 'tecnologos') {
    imgRenderTecnologosPanel();
    const solverBtn = document.getElementById('btn-img-solver');
    if (solverBtn) solverBtn.disabled = !IMG.resultado;
    if (IMG.resultado) imgRenderResultado();
    else if (content) content.innerHTML = `<div class="empty"><div class="empty-icon">🩻</div>
      <div class="empty-title">Módulo Imagen</div>
      <div class="empty-sub">Gestiona los tecnólogos y sus especialidades.</div></div>`;
  } else if (tab === 'config') {
    imgRenderConfigPanel();
    if (content) content.innerHTML = `<div class="empty"><div class="empty-icon">⚙️</div>
      <div class="empty-title">Configuración Imagen</div>
      <div class="empty-sub">Ajusta los parámetros de operación para el módulo de Imagen.</div></div>`;
  } else if (tab === 'modelos') {
    imgRenderModelosPanel();
    if (content) content.innerHTML = `<div class="empty"><div class="empty-icon">📁</div>
      <div class="empty-title">Modelos Guardados</div>
      <div class="empty-sub">Guarda y carga configuraciones de exámenes y tecnólogos.</div></div>`;
  }
}

// ── EXPORT ────────────────────────────────────────────────────────────────────
function imgExportarExcel() {
  if (!IMG.resultado) return;
  const { demandaAvg, resultado } = IMG.resultado;
  const { horas, dows } = IMG;
  const labels = dows.map(d => IMG_DOW_LABEL[d] || d);
  const wb = XLSX.utils.book_new();

  const ws1 = XLSX.utils.aoa_to_sheet([
    ['Hora', ...labels, 'Pico'],
    ...horas.map(h => {
      const vals = dows.map(d => +resultado[h][d].toFixed(4));
      return [h, ...vals, +Math.max(...vals).toFixed(4)];
    }),
  ]);
  ws1['!cols'] = [{ wch: 8 }, ...labels.map(() => ({ wch: 10 })), { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'TMs_Requeridos');

  const ws2 = XLSX.utils.aoa_to_sheet([
    ['Hora', ...labels],
    ...horas.map(h => [h, ...dows.map(d => +(demandaAvg[h][d] || 0).toFixed(2))]),
  ]);
  XLSX.utils.book_append_sheet(wb, ws2, 'DemandaPromedio');

  const tmSel = IMG.tecnologos.filter(t => t.sel);
  const durRows3 = IMG.examSel.map(n => [`Duración ${n} (min)`, IMG.duraciones[n] ?? 15]);
  const ws3 = XLSX.utils.aoa_to_sheet([
    ['Parámetro', 'Valor'],
    ['Exámenes', IMG.examSel.join(', ')],
    ['TMs incluidos', tmSel.map(t => t.nombre + (t.resonancia ? ' (🔬)' : '')).join(', ')],
    ...durRows3,
    [], ['Fórmula', 'TMs(h,d) = Σ D_examen(h,d) × T_examen / 60'],
    ['Productividad', '100% (sin factor)'],
    ['Tótem', 'No aplica'],
  ]);
  XLSX.utils.book_append_sheet(wb, ws3, 'Parámetros');

  XLSX.writeFile(wb, `CapacidadImagen_${new Date().toISOString().slice(0, 10)}.xlsx`);
  showToast('Excel exportado', 'ok');
}
