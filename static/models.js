// ── CEM Capacity Planner — models.js ─────────────────────────────────────────
// Guardar, listar y visualizar modelos guardados del solver
// v2: vista de modelo usa grilla interactiva idéntica al solver activo,
//     con detección de cambios y opción sobrescribir / guardar como nuevo
// ─────────────────────────────────────────────────────────────────────────────

const MESES_M = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Estado del modelo que está siendo visto/editado en la pestaña Modelos
const MV = {
  modeloId: null,          // id del modelo cargado
  modeloNombre: null,
  modeloDesc: null,
  snapshotTurnos: null,    // JSON.stringify de turnos al momento de cargar
  ejecutivos: [],          // ejecutivos del modelo (puede diferir del E global)
  solverResult: null,      // solver_result guardado
};

// ── HELPERS ───────────────────────────────────────────────────────────────────
function _turnosHash() {
  // Serializa ED.turnos de forma estable para detectar cambios
  return JSON.stringify(ED.turnos);
}

function _modeloHaCambiado() {
  return MV.snapshotTurnos !== null && _turnosHash() !== MV.snapshotTurnos;
}

// ── GUARDAR MODELO (nuevo) ────────────────────────────────────────────────────
function mostrarModalGuardar() {
  if (!S.solverResult) return;
  _abrirModalGuardarConModo('nuevo', null);
}

// ── MODAL UNIFICADO ───────────────────────────────────────────────────────────
// modo: 'nuevo' | 'sobrescribir' | 'nuevo_desde_modelo'
// id: id del modelo a sobrescribir (solo en 'sobrescribir')
function _abrirModalGuardarConModo(modo, id) {
  cerrarModal();

  const esNuevo = modo !== 'sobrescribir';
  const titulo = modo === 'sobrescribir' ? '♻️ Sobrescribir modelo'
    : modo === 'nuevo_desde_modelo' ? '💾 Guardar como nuevo modelo'
      : '💾 Guardar modelo';

  const nombreDefault = modo === 'sobrescribir' ? MV.modeloNombre
    : modo === 'nuevo_desde_modelo' ? (MV.modeloNombre + ' (copia)') : '';
  const descDefault = modo === 'sobrescribir' ? MV.modeloDesc : '';

  const overlay = document.createElement('div');
  overlay.id = 'modal-overlay';
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.45);
    z-index:1000;display:flex;align-items:center;justify-content:center`;

  overlay.innerHTML = `
    <div style="background:var(--surface);border-radius:10px;padding:28px;
      width:420px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,.2)">
      <div style="font-size:16px;font-weight:700;margin-bottom:16px">${titulo}</div>

      ${modo === 'sobrescribir' ? `
      <div style="background:var(--accent-lt);border:1px solid var(--accent);
        border-radius:7px;padding:10px 14px;margin-bottom:16px;font-size:12px;
        color:var(--accent2)">
        ⚠️ Se reemplazarán los turnos guardados con los cambios actuales.
      </div>` : ''}

      <div style="margin-bottom:12px">
        <div style="font-size:12px;font-weight:600;color:var(--text2);margin-bottom:6px">Nombre *</div>
        <input id="m-nombre" type="text" value="${nombreDefault}"
          placeholder="ej: Escenario base Junio 2025"
          style="width:100%;padding:8px 10px;border:1px solid var(--border);
            border-radius:6px;font-family:var(--sans);font-size:13px;
            background:var(--bg);color:var(--text);outline:none"
          ${modo === 'sobrescribir' ? 'disabled' : ''}
          oninput="this.style.borderColor='var(--accent)'">
      </div>

      <div style="margin-bottom:20px">
        <div style="font-size:12px;font-weight:600;color:var(--text2);margin-bottom:6px">Descripción</div>
        <textarea id="m-desc" rows="3" placeholder="Notas sobre este escenario..."
          style="width:100%;padding:8px 10px;border:1px solid var(--border);
            border-radius:6px;font-family:var(--sans);font-size:12px;
            background:var(--bg);color:var(--text);outline:none;resize:vertical"
          oninput="this.style.borderColor='var(--accent)'">${descDefault}</textarea>
      </div>

      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button onclick="cerrarModal()"
          style="padding:8px 18px;border:1px solid var(--border);border-radius:6px;
            background:var(--surface2);cursor:pointer;font-family:var(--sans);font-size:13px">
          Cancelar
        </button>
        <button onclick="_confirmarGuardarConModo('${modo}','${id || ''}')"
          style="padding:8px 18px;border:none;border-radius:6px;
            background:${modo === 'sobrescribir' ? 'var(--warn)' : 'var(--accent)'};
            color:#fff;cursor:pointer;font-family:var(--sans);font-size:13px;font-weight:600">
          ${modo === 'sobrescribir' ? 'Sobrescribir' : 'Guardar'}
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) cerrarModal(); });
  setTimeout(() => {
    const inp = document.getElementById('m-nombre');
    if (inp && !inp.disabled) inp.focus();
  }, 50);
}

function cerrarModal() {
  const el = document.getElementById('modal-overlay');
  if (el) el.remove();
}

async function _confirmarGuardarConModo(modo, id) {
  const nombreEl = document.getElementById('m-nombre');
  const nombre = nombreEl.disabled
    ? MV.modeloNombre
    : nombreEl.value.trim();
  const desc = document.getElementById('m-desc').value.trim();

  if (!nombre) {
    if (nombreEl) nombreEl.style.borderColor = '#c0392b';
    return;
  }

  // Construir solver_result con los turnos editados actuales
  const esEnVistaModelo = MV.modeloId !== null;
  let srToSave, ejecutivosToSave;

  if (esEnVistaModelo) {
    // Venimos de ver un modelo — usar el solverResult del modelo + turnos de ED
    srToSave = JSON.parse(JSON.stringify(MV.solverResult));
    srToSave.turnos = buildTurnosFromED();
    srToSave.deficit_cobertura = parseFloat(calcDeficit().toFixed(2));
    ejecutivosToSave = MV.ejecutivos;
  } else {
    // Venimos del solver activo
    if (S.solverResult) {
      S.solverResult.turnos = buildTurnosFromED();
      S.solverResult.deficit_cobertura = parseFloat(calcDeficit().toFixed(2));
    }
    srToSave = S.solverResult;
    ejecutivosToSave = E.ejecutivos;
  }

  const payload = {
    nombre,
    descripcion: desc,
    solver_result: srToSave,
    ejecutivos: ejecutivosToSave,
    params: _buildParams(ejecutivosToSave),
  };

  try {
    let url = '/models/save';
    let method = 'POST';
    if (modo === 'sobrescribir' && id) {
      url = `/models/update/${id}`;
      method = 'PUT';
    }
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    cerrarModal();

    if (modo === 'sobrescribir') {
      // Actualizar snapshot para que el botón vuelva a estado "sin cambios"
      MV.snapshotTurnos = _turnosHash();
      MV.modeloNombre = nombre;
      MV.modeloDesc = desc;
      _actualizarBannerCambios();
      showToast('Modelo sobrescrito ✓', 'ok');
    } else {
      showToast('Modelo guardado ✓', 'ok');
      if (esEnVistaModelo) {
        // Si guardó como nuevo desde un modelo, actualizar id del modelo activo
        if (data.id) {
          MV.modeloId = data.id;
          MV.snapshotTurnos = _turnosHash();
          _actualizarBannerCambios();
        }
      }
    }
  } catch (e) {
    showToast('Error al guardar: ' + e.message, 'err');
  }
}

function _buildParams(ejecutivos) {
  return {
    mes: C.mes,
    anio: C.anio,
    n_ejecutivos: (ejecutivos || []).length,
    tiempo: S.params.tiempo,
    prod: S.params.prod,
    usab: S.params.usab,
    puestos_max: C.puestos_max,
    turno_min: C.turno_min,
    turno_max: C.turno_max,
    apertura_min: C.apertura_min,
    cierre_min: C.cierre_min,
    sabado_min: C.sabado_min,
  };
}

// Función pública que sigue llamando solver.js
async function confirmarGuardar() {
  await _confirmarGuardarConModo('nuevo', null);
}

// ── GUARDAR DESDE GRILLA DE MODELO (detecta cambios) ─────────────────────────
function mostrarModalGuardarDesdeModelo() {
  const haCambiado = _modeloHaCambiado();

  if (!haCambiado) {
    // Sin cambios → ofrecer solo "guardar como nuevo"
    _abrirModalGuardarConModo('nuevo_desde_modelo', null);
    return;
  }

  // Hay cambios → modal de elección
  cerrarModal();
  const overlay = document.createElement('div');
  overlay.id = 'modal-overlay';
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.45);
    z-index:1000;display:flex;align-items:center;justify-content:center`;

  overlay.innerHTML = `
    <div style="background:var(--surface);border-radius:10px;padding:28px;
      width:400px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,.2)">
      <div style="font-size:16px;font-weight:700;margin-bottom:8px">💾 Guardar cambios</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:20px;line-height:1.5">
        Has modificado los turnos de <b>${MV.modeloNombre}</b>.<br>
        ¿Qué deseas hacer?
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <button onclick="cerrarModal();_abrirModalGuardarConModo('sobrescribir','${MV.modeloId}')"
          style="padding:12px 16px;border:1.5px solid var(--warn);border-radius:7px;
            background:transparent;color:var(--warn);font-family:var(--sans);
            font-size:13px;font-weight:600;cursor:pointer;text-align:left;
            transition:background .15s"
          onmouseenter="this.style.background='#fff8e6'"
          onmouseleave="this.style.background='transparent'">
          ♻️ Sobrescribir este modelo
          <div style="font-size:11px;font-weight:400;color:var(--muted);margin-top:2px">
            Reemplaza los turnos guardados con los cambios actuales
          </div>
        </button>
        <button onclick="cerrarModal();_abrirModalGuardarConModo('nuevo_desde_modelo',null)"
          style="padding:12px 16px;border:1.5px solid var(--accent);border-radius:7px;
            background:transparent;color:var(--accent);font-family:var(--sans);
            font-size:13px;font-weight:600;cursor:pointer;text-align:left;
            transition:background .15s"
          onmouseenter="this.style.background='var(--accent-lt)'"
          onmouseleave="this.style.background='transparent'">
          ✨ Guardar como nuevo modelo
          <div style="font-size:11px;font-weight:400;color:var(--muted);margin-top:2px">
            El modelo original se mantiene intacto
          </div>
        </button>
        <button onclick="cerrarModal()"
          style="padding:8px;border:1px solid var(--border);border-radius:7px;
            background:var(--surface2);font-family:var(--sans);font-size:12px;cursor:pointer">
          Cancelar
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) cerrarModal(); });
}

// ── BANNER DE CAMBIOS (se inyecta en el header de la grilla) ──────────────────
function _actualizarBannerCambios() {
  const banner = document.getElementById('mv-cambios-banner');
  if (!banner) return;
  const cambio = _modeloHaCambiado();
  banner.style.display = cambio ? 'flex' : 'none';
}

// ── LISTAR MODELOS ────────────────────────────────────────────────────────────
async function renderModelosContent() {
  // Limpiar estado de modelo en vista
  MV.modeloId = null;
  MV.snapshotTurnos = null;
  MV.ejecutivos = [];
  MV.solverResult = null;

  const content = document.getElementById('content');
  content.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;
    padding:60px;color:var(--muted)">Cargando modelos...</div>`;

  let models = [];
  try {
    const res = await fetch('/models/list');
    models = await res.json();
  } catch (e) {
    content.innerHTML = `<div class="empty">
      <div class="empty-icon">⚠️</div>
      <div class="empty-title">Error al cargar modelos</div>
      <div class="empty-sub">Asegúrate de que el servidor está corriendo.</div>
    </div>`;
    return;
  }

  if (!models.length) {
    content.innerHTML = `<div class="empty">
      <div class="empty-icon">🗂️</div>
      <div class="empty-title">Sin modelos guardados</div>
      <div class="empty-sub">Ejecuta el solver y guarda el resultado con el botón "Guardar modelo".</div>
    </div>`;
    return;
  }

  const cards = models.map(m => {
    const mesLabel = m.mes ? (MESES_M[m.mes] || m.mes) : '—';
    const defColor = m.deficit == 0 ? 'var(--success)' : 'var(--warn)';
    return `<div class="model-card" onclick="verModelo('${m.id}')"
      style="background:var(--surface);border:1px solid var(--border);
        border-radius:10px;padding:18px 20px;cursor:pointer;
        transition:box-shadow .15s,border-color .15s;box-shadow:var(--shadow)"
      onmouseenter="this.style.borderColor='var(--accent)';this.style.boxShadow='0 4px 16px rgba(26,111,186,.15)'"
      onmouseleave="this.style.borderColor='var(--border)';this.style.boxShadow='var(--shadow)'">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:700;margin-bottom:4px;
            white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.nombre}</div>
          <div style="font-size:12px;color:var(--muted);margin-bottom:10px;
            line-height:1.5">${m.descripcion || '—'}</div>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <span style="font-size:11px;background:var(--surface2);
              border:1px solid var(--border);border-radius:4px;padding:2px 8px">
              📅 ${mesLabel} ${m.anio || ''}
            </span>
            <span style="font-size:11px;background:var(--surface2);
              border:1px solid var(--border);border-radius:4px;padding:2px 8px">
              👥 ${m.n_ejecutivos || '?'} ejecutivos
            </span>
            <span style="font-size:11px;border-radius:4px;padding:2px 8px;
              background:${m.deficit == 0 ? 'var(--success-lt)' : '#fff8e6'};
              color:${defColor};border:1px solid ${defColor}40;font-weight:600">
              ${m.deficit == 0 ? '✓ Cobertura OK' : '⚠ Déficit: ' + m.deficit}
            </span>
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:10px;color:var(--muted)">${m.fecha}</div>
          <div style="font-family:var(--mono);font-size:10px;
            color:var(--muted);margin-top:2px">#${m.id}</div>
          <button onclick="event.stopPropagation();eliminarModelo('${m.id}',this)"
            style="margin-top:8px;padding:3px 10px;border:1px solid #fca5a5;
              border-radius:4px;background:transparent;color:#c0392b;
              font-size:11px;cursor:pointer">Eliminar</button>
        </div>
      </div>
    </div>`;
  }).join('');

  content.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
      <div>
        <div style="font-size:18px;font-weight:700">Modelos guardados</div>
        <div style="font-size:12px;color:var(--muted)">${models.length} escenario${models.length !== 1 ? 's' : ''} · haz clic para ver detalle</div>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px">${cards}</div>`;
}

// ── VER MODELO — ahora usa la grilla interactiva del solver ───────────────────
async function verModelo(id) {
  const content = document.getElementById('content');
  content.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;
    padding:60px;color:var(--muted)">Cargando modelo...</div>`;

  let model;
  try {
    const res = await fetch(`/models/get/${id}`);
    model = await res.json();
  } catch (e) {
    content.innerHTML = `<div class="empty"><div class="empty-title">Error al cargar</div></div>`;
    return;
  }

  // ── Guardar estado del modelo en MV ───────────────────────────────────────
  MV.modeloId = id;
  MV.modeloNombre = model.nombre;
  MV.modeloDesc = model.descripcion || '';
  MV.ejecutivos = model.ejecutivos || [];
  MV.solverResult = model.solver_result || {};

  // ── Restaurar ejecutivos al estado global E para que solver.js los use ────
  // Guardamos los originales del solver activo para no destruirlos
  const _ejBackup = E.ejecutivos.slice();
  E.ejecutivos = MV.ejecutivos;

  // ── Inicializar ED con los datos del modelo ───────────────────────────────
  const sr = MV.solverResult;
  initED(sr);

  // Tomar snapshot DESPUÉS de initED (estado "limpio" del modelo)
  MV.snapshotTurnos = _turnosHash();

  // ── Restaurar E (initED ya copió lo que necesitaba en ED.turnos) ─────────
  // No restaurar aún — E.ejecutivos lo necesita renderGrid/renderHorasPanel.
  // Lo restauraremos cuando el usuario salga de la vista de modelo.

  // ── Parámetros del modelo ─────────────────────────────────────────────────
  const p = model.params || {};
  const mes = p.mes ? (MESES_M[p.mes] || p.mes) : '—';

  const paramsHTML = `<div class="table-card">
    <div class="table-card-header">
      <div class="table-card-title">Parámetros del modelo</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0">
      ${[
      ['Período', `${mes} ${p.anio || ''}`],
      ['Ejecutivos', p.n_ejecutivos],
      ['Déficit guardado', model.deficit_cobertura ?? '—'],
      ['Tiempo atención', `${p.tiempo || '—'} min`],
      ['Productividad', `${p.prod ? Math.round(p.prod * 100) : '—'}%`],
      ['Usabilidad tótem', `${p.usab ? Math.round(p.usab * 100) : '—'}%`],
      ['Puestos máx', p.puestos_max],
      ['Turno mín/máx', `${p.turno_min || '—'}h – ${p.turno_max || '—'}h`],
      ['Apertura/Cierre mín', `${p.apertura_min || '—'} / ${p.cierre_min || '—'}`],
    ].map(([k, v]) => `<div style="padding:10px 16px;border-bottom:1px solid var(--border);
          border-right:1px solid var(--border)">
          <div style="font-size:10px;color:var(--muted);font-weight:600;
            text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">${k}</div>
          <div style="font-family:var(--mono);font-size:13px;font-weight:600">${v ?? '—'}</div>
        </div>`).join('')}
    </div>
  </div>`;

  // ── Dotación ──────────────────────────────────────────────────────────────
  const ejHTML = MV.ejecutivos.length ? `<div class="table-card">
    <div class="table-card-header"><div class="table-card-title">Dotación</div></div>
    <div class="table-scroll"><table class="ej-table">
      <thead><tr><th>Nombre</th><th>Tipo</th><th>Horas/sem</th></tr></thead>
      <tbody>${MV.ejecutivos.map(ej => `<tr>
        <td style="font-weight:600">${ej.nombre}</td>
        <td><span class="ej-badge ${ej.tipo}">${ej.tipo === 'full' ? 'Full' : 'Part'}</span></td>
        <td style="font-family:var(--mono)">${ej.horas_semana}h</td>
      </tr>`).join('')}</tbody>
    </table></div>
  </div>` : '';

  // ── Scaffold de la grilla interactiva (igual que buildPage en solver.js) ──
  const grillaHTML = `
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

  // ── Layout completo ───────────────────────────────────────────────────────
  content.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:4px">
      <button onclick="_salirVistaModelo()"
        style="padding:6px 14px;border:1px solid var(--border);border-radius:6px;
          background:var(--surface2);cursor:pointer;font-size:12px;font-family:var(--sans)">
        ← Volver
      </button>
      <div style="flex:1;min-width:0">
        <div style="font-size:17px;font-weight:700">${model.nombre}</div>
        <div style="font-size:12px;color:var(--muted)">${model.descripcion || ''} · ${model.fecha}</div>
      </div>
      <div id="mv-cambios-banner"
        style="display:none;align-items:center;gap:8px;background:#fff8e6;
          border:1px solid var(--warn);border-radius:7px;padding:6px 12px;
          font-size:12px;color:var(--warn);font-weight:600;flex-shrink:0">
        ✏️ Cambios sin guardar
      </div>
    </div>
    ${paramsHTML}
    ${ejHTML}
    ${grillaHTML}`;

  // ── Renderizar grilla interactiva ─────────────────────────────────────────
  renderKPI();
  renderGridHeader_MV();   // versión con botón Guardar adaptado
  renderGrid();
  renderHorasPanel();
  renderResumen();
}

// ── HEADER DE GRILLA EN VISTA MODELO (reemplaza renderGridHeader) ─────────────
function renderGridHeader_MV() {
  const hdr = document.getElementById('grid-header');
  if (!hdr) { renderGridHeader(); return; }

  const btns = ED.semanas.map((sem, i) => `
    <button onclick="goSem_MV(${i})" style="
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
      <button onclick="mostrarModalGuardarDesdeModelo()" class="btn-export"
        style="width:auto;padding:5px 14px">💾 Guardar</button>
      <button onclick="exportarExcelTurnosModelo()" class="btn-export"
        style="width:auto;padding:5px 14px">↓ Exportar</button>
    </div>`;
}

// goSem equivalente para vista modelo (re-renderiza header con la versión MV)
function goSem_MV(idx) {
  ED.semIdx = idx;
  renderKPI();
  renderGridHeader_MV();
  renderGrid();
  renderHorasPanel();
  renderResumen();
}

// ── HOOK: detectar cambios tras editar bloques ────────────────────────────────
// Se llama después de cualquier refreshAll() en solver.js cuando estamos
// en vista de modelo. Lo conseguimos sobreescribiendo refreshAll temporalmente
// al entrar y restaurándolo al salir.
const _refreshAll_orig = typeof refreshAll === 'function' ? refreshAll : null;

function _hookRefreshAll() {
  // Envuelve refreshAll para disparar actualización del banner
  window._mv_hooked = true;
  const orig = refreshAll;
  window.refreshAll = function () {
    orig();
    _actualizarBannerCambios();
  };
  // También enganchamos goSem para actualizar header correcto
  const origGoSem = goSem;
  window._goSem_orig = origGoSem;
  window.goSem = goSem_MV;
  // Y renderGridHeader para usar versión MV
  window._renderGridHeader_orig = renderGridHeader;
  window.renderGridHeader = renderGridHeader_MV;
}

function _unhookRefreshAll() {
  if (window._mv_hooked) {
    window._mv_hooked = false;
    // No podemos recuperar el original fácilmente aquí; como la función
    // es idempotente excepto por el banner, dejamos el wrapper (inofensivo
    // fuera de vista modelo ya que _actualizarBannerCambios es no-op
    // cuando MV.snapshotTurnos === null).
  }
  if (window._goSem_orig) { window.goSem = window._goSem_orig; delete window._goSem_orig; }
  if (window._renderGridHeader_orig) { window.renderGridHeader = window._renderGridHeader_orig; delete window._renderGridHeader_orig; }
}

// ── SALIR DE VISTA MODELO ────────────────────────────────────────────────────
function _salirVistaModelo() {
  // Advertir si hay cambios sin guardar
  if (_modeloHaCambiado()) {
    if (!confirm('Tienes cambios sin guardar. ¿Salir sin guardar?')) return;
  }
  _unhookRefreshAll();
  MV.modeloId = null;
  MV.snapshotTurnos = null;
  MV.ejecutivos = [];
  MV.solverResult = null;
  renderModelosContent();
}

// Sobrescribir verModelo para enganchar hooks al terminar de renderizar
const _verModelo_orig = verModelo;
// (verModelo ya está definido arriba con la lógica nueva; el hook se aplica via setTimeout)

// Parche: después de montar la vista modelo, activar hooks
const _verModeloPatch = verModelo;
window.verModelo = async function (id) {
  _unhookRefreshAll(); // limpiar cualquier hook previo
  await _verModeloPatch(id);
  _hookRefreshAll();
  _actualizarBannerCambios();
};

// ── EXPORTAR DESDE VISTA MODELO ───────────────────────────────────────────────
function exportarExcelTurnosModelo() {
  exportarExcelTurnos(); // reutiliza la función de solver.js
}

// ── GUARDAR MODELO EDITADO (llamado desde solver activo, sin cambios) ─────────
function mostrarModalGuardarEditado() {
  if (S.solverResult) {
    S.solverResult.turnos = buildTurnosFromED();
    S.solverResult.deficit_cobertura = parseFloat(calcDeficit().toFixed(2));
  }
  mostrarModalGuardar();
}

// ── ELIMINAR MODELO ───────────────────────────────────────────────────────────
async function eliminarModelo(id, btn) {
  if (!confirm('¿Eliminar este modelo?')) return;
  try {
    await fetch(`/models/delete/${id}`, { method: 'DELETE' });
    showToast('Modelo eliminado', 'ok');
    renderModelosContent();
  } catch (e) {
    showToast('Error al eliminar', 'err');
  }
}