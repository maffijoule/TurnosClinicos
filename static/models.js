// ── CEM Capacity Planner — models.js ─────────────────────────────────────────
// Guardar, listar y visualizar modelos guardados del solver
// ─────────────────────────────────────────────────────────────────────────────

const MESES_M = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// ── GUARDAR MODELO ────────────────────────────────────────────────────────────
function mostrarModalGuardar() {
    if (!S.solverResult) return;

    const overlay = document.createElement('div');
    overlay.id = 'modal-overlay';
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.45);
    z-index:1000;display:flex;align-items:center;justify-content:center`;

    overlay.innerHTML = `
    <div style="background:var(--surface);border-radius:10px;padding:28px;
      width:420px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,.2)">
      <div style="font-size:16px;font-weight:700;margin-bottom:16px">💾 Guardar modelo</div>

      <div style="margin-bottom:12px">
        <div style="font-size:12px;font-weight:600;color:var(--text2);margin-bottom:6px">Nombre *</div>
        <input id="m-nombre" type="text" placeholder="ej: Escenario base Junio 2025"
          style="width:100%;padding:8px 10px;border:1px solid var(--border);
            border-radius:6px;font-family:var(--sans);font-size:13px;
            background:var(--bg);color:var(--text);outline:none"
          oninput="this.style.borderColor='var(--accent)'">
      </div>

      <div style="margin-bottom:20px">
        <div style="font-size:12px;font-weight:600;color:var(--text2);margin-bottom:6px">Descripción</div>
        <textarea id="m-desc" rows="3" placeholder="Notas sobre este escenario..."
          style="width:100%;padding:8px 10px;border:1px solid var(--border);
            border-radius:6px;font-family:var(--sans);font-size:12px;
            background:var(--bg);color:var(--text);outline:none;resize:vertical"
          oninput="this.style.borderColor='var(--accent)'"></textarea>
      </div>

      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button onclick="cerrarModal()"
          style="padding:8px 18px;border:1px solid var(--border);border-radius:6px;
            background:var(--surface2);cursor:pointer;font-family:var(--sans);font-size:13px">
          Cancelar
        </button>
        <button onclick="confirmarGuardar()"
          style="padding:8px 18px;border:none;border-radius:6px;
            background:var(--accent);color:#fff;cursor:pointer;
            font-family:var(--sans);font-size:13px;font-weight:600">
          Guardar
        </button>
      </div>
    </div>`;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) cerrarModal(); });
    setTimeout(() => document.getElementById('m-nombre').focus(), 50);
}

function cerrarModal() {
    const el = document.getElementById('modal-overlay');
    if (el) el.remove();
}

async function confirmarGuardar() {
    const nombre = document.getElementById('m-nombre').value.trim();
    const desc = document.getElementById('m-desc').value.trim();
    if (!nombre) {
        document.getElementById('m-nombre').style.borderColor = '#c0392b';
        return;
    }

    const payload = {
        nombre,
        descripcion: desc,
        solver_result: S.solverResult,
        ejecutivos: E.ejecutivos,
        params: {
            mes: C.mes,
            anio: C.anio,
            n_ejecutivos: E.ejecutivos.length,
            tiempo: S.params.tiempo,
            prod: S.params.prod,
            usab: S.params.usab,
            puestos_max: C.puestos_max,
            turno_min: C.turno_min,
            turno_max: C.turno_max,
            apertura_min: C.apertura_min,
            cierre_min: C.cierre_min,
            sabado_min: C.sabado_min,
        }
    };

    try {
        const res = await fetch('/models/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        cerrarModal();
        showToast('Modelo guardado ✓', 'ok');
    } catch (e) {
        showToast('Error al guardar: ' + e.message, 'err');
    }
}

// ── LISTAR MODELOS ────────────────────────────────────────────────────────────
async function renderModelosContent() {
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

// ── VER MODELO ────────────────────────────────────────────────────────────────
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

    const p = model.params || {};
    const mes = p.mes ? (MESES_M[p.mes] || p.mes) : '—';

    // Params card
    const paramsHTML = `<div class="table-card">
    <div class="table-card-header">
      <div class="table-card-title">Parámetros del modelo</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0">
      ${[
            ['Período', `${mes} ${p.anio || ''}`],
            ['Ejecutivos', p.n_ejecutivos],
            ['Déficit', model.deficit_cobertura ?? '—'],
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

    // Ejecutivos
    const ejHTML = model.ejecutivos && model.ejecutivos.length ? `<div class="table-card">
    <div class="table-card-header"><div class="table-card-title">Dotación</div></div>
    <div class="table-scroll"><table class="ej-table">
      <thead><tr><th>Nombre</th><th>Tipo</th><th>Horas/sem</th></tr></thead>
      <tbody>${model.ejecutivos.map(ej => `<tr>
        <td style="font-weight:600">${ej.nombre}</td>
        <td><span class="ej-badge ${ej.tipo}">${ej.tipo === 'full' ? 'Full' : 'Part'}</span></td>
        <td style="font-family:var(--mono)">${ej.horas_semana}h</td>
      </tr>`).join('')}</tbody>
    </table></div>
  </div>` : '';

    // Horas resumen
    const sr = model.solver_result || {};
    const sems = sr.semanas || [];
    const horasHTML = model.ejecutivos && sr.horas_ejecutivo ? `<div class="table-card">
    <div class="table-card-header"><div class="table-card-title">Resumen de Horas</div></div>
    <div class="table-scroll"><table class="ej-table">
      <thead><tr>
        <th>Ejecutivo</th>
        ${sems.map(s => `<th>Sem ${s.semana}</th>`).join('')}
        <th>Total</th><th>Máx</th>
      </tr></thead>
      <tbody>${model.ejecutivos.map(ej => {
        const hd = sr.horas_ejecutivo[ej.nombre] || {};
        const total = hd.total || 0;
        const maxT = ej.horas_semana * sems.length;
        const color = total > maxT ? '#c0392b' : total < ej.horas_semana ? 'var(--warn)' : 'var(--success)';
        return `<tr>
          <td style="font-weight:600">${ej.nombre}</td>
          ${sems.map(s => `<td style="font-family:var(--mono)">${hd['semana_' + s.semana] || 0}h</td>`).join('')}
          <td style="font-family:var(--mono);font-weight:700;color:${color}">${total}h</td>
          <td style="font-family:var(--mono);color:var(--muted)">${maxT}h</td>
        </tr>`;
    }).join('')}</tbody>
    </table></div>
  </div>` : '';

    // Grilla semana tipo (usa la semana 1)
    const grillaHTML = renderGrillaModelo(sr, model.ejecutivos || []);

    content.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:4px">
      <button onclick="renderModelosContent()"
        style="padding:6px 14px;border:1px solid var(--border);border-radius:6px;
          background:var(--surface2);cursor:pointer;font-size:12px;font-family:var(--sans)">
        ← Volver
      </button>
      <div>
        <div style="font-size:17px;font-weight:700">${model.nombre}</div>
        <div style="font-size:12px;color:var(--muted)">${model.descripcion || ''} · ${model.fecha}</div>
      </div>
    </div>
    ${paramsHTML}
    ${ejHTML}
    ${grillaHTML}
    ${horasHTML}`;
}

function renderGrillaModelo(sr, ejecutivos) {
    if (!sr.semanas || !sr.semanas.length || !sr.turnos) return '';

    const DIAS_ORDEN = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const diasP = DIAS_ORDEN.filter(d =>
        sr.semanas.some(sem => sem.dias.some(([, dw]) => dw === d))
    );

    const EJ_COLORS = ['#dbeafe', '#dcfce7', '#fef9c3', '#fce7f3',
        '#ede9fe', '#ffedd5', '#cffafe', '#fef3c7'];
    const ejColor = {};
    ejecutivos.forEach((ej, i) => ejColor[ej.nombre] = EJ_COLORS[i % EJ_COLORS.length]);

    const turnosLibres = sr.turnos.filter(t => !t.libre);
    const allSlots = new Set();
    turnosLibres.forEach(t => {
        const e = timeToMinutes(t.entrada) / 30;
        const s = timeToMinutes(t.salida) / 30;
        for (let i = e; i < s; i++) allSlots.add(i);
    });
    const slots = [...allSlots].sort((a, b) => a - b);

    // Build nav state for this model view
    let semIdxM = 0;

    function buildGrillaM(semIdx) {
        const sem = sr.semanas[semIdx];
        const turnS = sr.turnos.filter(t => t.semana === sem.semana);

        const navBtns = sr.semanas.map((s, i) =>
            `<button onclick="verModeloSem('${sr.semanas[0]?.semana}',${i},this)"
        data-semidx="${i}"
        style="padding:4px 10px;border-radius:5px;border:1px solid var(--border);
          background:${i === semIdx ? 'var(--accent)' : 'var(--surface2)'};
          color:${i === semIdx ? '#fff' : 'var(--text2)'};
          font-family:var(--sans);font-size:12px;font-weight:600;cursor:pointer">
        Sem ${s.semana}
      </button>`).join('');

        const thDias = diasP.map(dia =>
            `<th colspan="${ejecutivos.length}"
        style="text-align:center;padding:5px 4px;background:var(--surface2);
          border-bottom:1px solid var(--border);border-left:2px solid var(--border2);
          font-size:11px;font-weight:700;text-transform:capitalize">
        ${dia.charAt(0).toUpperCase() + dia.slice(1, 3)}
      </th>`).join('');

        const thEjecs = diasP.map(() =>
            ejecutivos.map(ej =>
                `<th style="padding:4px;background:${ejColor[ej.nombre]}55;
          border-bottom:2px solid var(--border2);font-size:10px;
          min-width:48px;text-align:center;white-space:nowrap;font-weight:600">
          ${ej.nombre.split(' ')[0].slice(0, 8)}
        </th>`).join('')
        ).join('');

        const rows = slots.map(s => {
            const cells = diasP.map(dia =>
                ejecutivos.map(ej => {
                    const t = turnS.find(t2 =>
                        t2.ejecutivo === ej.nombre && t2.dia === dia && !t2.libre &&
                        timeToMinutes(t2.entrada) / 30 <= s && timeToMinutes(t2.salida) / 30 > s
                    );
                    if (!t) return `<td style="border-bottom:1px solid #f0f2f5;background:#fafafa;
            border-left:1px solid #f5f5f5"></td>`;
                    return `<td style="background:${ejColor[ej.nombre]};border-bottom:1px solid #e8eef8;
            border-left:1px solid #e0e8f4;padding:2px 3px"></td>`;
                }).join('')
            ).join('');
            return `<tr>
        <td style="font-family:var(--mono);font-size:10px;color:var(--muted);
          padding:3px 8px;white-space:nowrap;border-right:1px solid var(--border);
          background:var(--surface);position:sticky;left:0;z-index:1">${slot_to_str_js(s)}</td>
        ${cells}
      </tr>`;
        }).join('');

        return `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">${navBtns}</div>
      <div style="overflow-x:auto;overflow-y:auto;max-height:480px">
        <table style="border-collapse:collapse;font-size:11px;white-space:nowrap">
          <thead style="position:sticky;top:0;z-index:3">
            <tr>
              <th style="padding:6px 8px;background:var(--surface2);border-bottom:1px solid var(--border);
                text-align:left;position:sticky;left:0;z-index:4;min-width:52px">Slot</th>
              ${thDias}
            </tr>
            <tr>
              <th style="background:var(--surface2);position:sticky;left:0;z-index:4;
                border-bottom:2px solid var(--border2)"></th>
              ${thEjecs}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    }

    // Store for nav
    window._modeloGrillaData = { sr, ejecutivos, diasP, ejColor, slots };

    return `<div class="table-card" id="modelo-grilla-card">
    <div class="table-card-header">
      <div class="table-card-title">Horario semanal</div>
    </div>
    <div style="padding:12px 16px 0" id="modelo-grilla-nav-wrap">
      ${buildGrillaM(0)}
    </div>
  </div>`;
}

function verModeloSem(_, semIdx, btn) {
    const { sr, ejecutivos, diasP, ejColor, slots } = window._modeloGrillaData || {};
    if (!sr) return;

    // Update button styles
    btn.closest('div').querySelectorAll('button').forEach((b, i) => {
        b.style.background = i === semIdx ? 'var(--accent)' : 'var(--surface2)';
        b.style.color = i === semIdx ? '#fff' : 'var(--text2)';
    });

    const wrap = document.getElementById('modelo-grilla-nav-wrap');
    const EJ_COLORS = ['#dbeafe', '#dcfce7', '#fef9c3', '#fce7f3',
        '#ede9fe', '#ffedd5', '#cffafe', '#fef3c7'];

    const sem = sr.semanas[semIdx];
    const turnS = sr.turnos.filter(t => t.semana === sem.semana);
    const DIAS_ORDEN = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

    const thDias = diasP.map(dia =>
        `<th colspan="${ejecutivos.length}"
      style="text-align:center;padding:5px 4px;background:var(--surface2);
        border-bottom:1px solid var(--border);border-left:2px solid var(--border2);
        font-size:11px;font-weight:700;text-transform:capitalize">
      ${dia.charAt(0).toUpperCase() + dia.slice(1, 3)}
    </th>`).join('');

    const thEjecs = diasP.map(() =>
        ejecutivos.map(ej =>
            `<th style="padding:4px;background:${ejColor[ej.nombre]}55;
        border-bottom:2px solid var(--border2);font-size:10px;
        min-width:48px;text-align:center;white-space:nowrap;font-weight:600">
        ${ej.nombre.split(' ')[0].slice(0, 8)}
      </th>`).join('')
    ).join('');

    const rows = slots.map(s => {
        const cells = diasP.map(dia =>
            ejecutivos.map(ej => {
                const t = turnS.find(t2 =>
                    t2.ejecutivo === ej.nombre && t2.dia === dia && !t2.libre &&
                    timeToMinutes(t2.entrada) / 30 <= s && timeToMinutes(t2.salida) / 30 > s
                );
                if (!t) return `<td style="border-bottom:1px solid #f0f2f5;background:#fafafa;
          border-left:1px solid #f5f5f5"></td>`;
                return `<td style="background:${ejColor[ej.nombre]};border-bottom:1px solid #e8eef8;
          border-left:1px solid #e0e8f4;padding:2px 3px"></td>`;
            }).join('')
        ).join('');
        return `<tr>
      <td style="font-family:var(--mono);font-size:10px;color:var(--muted);
        padding:3px 8px;white-space:nowrap;border-right:1px solid var(--border);
        background:var(--surface);position:sticky;left:0;z-index:1">${slot_to_str_js(s)}</td>
      ${cells}
    </tr>`;
    }).join('');

    // Replace only the table part, keep nav buttons
    const navDiv = wrap.querySelector('div');
    const tableDiv = wrap.querySelector('div + div') || wrap.lastElementChild;
    if (tableDiv) tableDiv.remove();

    const newTable = document.createElement('div');
    newTable.style.cssText = 'overflow-x:auto;overflow-y:auto;max-height:480px';
    newTable.innerHTML = `
    <table style="border-collapse:collapse;font-size:11px;white-space:nowrap">
      <thead style="position:sticky;top:0;z-index:3">
        <tr>
          <th style="padding:6px 8px;background:var(--surface2);border-bottom:1px solid var(--border);
            text-align:left;position:sticky;left:0;z-index:4;min-width:52px">Slot</th>
          ${thDias}
        </tr>
        <tr>
          <th style="background:var(--surface2);position:sticky;left:0;z-index:4;
            border-bottom:2px solid var(--border2)"></th>
          ${thEjecs}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
    wrap.appendChild(newTable);
}

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