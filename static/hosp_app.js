// ── CEM — Módulo Hospitalizado v3 ─────────────────────────────────────────────

const HOSP = {
    resultado: null,
    semanaIdx: 0,
    // Estado editable de la semana tipo — se sincroniza con resultado tras solver
    // hospPlan[nombre][dow] = 'M'|'T'|'I'|''
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
};

const ROL_LABEL = {
    aux_aseo: 'Aux. Aseo', enfermera_eu: 'Enfermera EU',
    arsenalera: 'Arsenalera', pabellonera: 'Pabellonera', aux_anestesia: 'Aux. Anestesia',
};
const TURNO_OPTS = ['M', 'T', 'I', ''];
const TURNO_COLOR = {
    M: { bg: '#bfdbfe', border: '#3b82f6', text: '#1e3a5f' },
    T: { bg: '#bbf7d0', border: '#22c55e', text: '#14532d' },
    I: { bg: '#fef08a', border: '#eab308', text: '#713f12' },
    DOM: { bg: '#f3f4f6', border: '#d1d5db', text: '#9ca3af' },
    '': { bg: '#f9fafb', border: '#e5e7eb', text: '#9ca3af' },
};
const MESES_HOSP = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DOW_SHORT = {
    lunes: 'Lun', martes: 'Mar', 'miércoles': 'Mié',
    jueves: 'Jue', viernes: 'Vie', sábado: 'Sáb', domingo: 'Dom'
};
const DIAS_LAB = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function slotFromTime(t) {
    const [h, m] = t.split(':').map(Number);
    return h * 2 + Math.floor(m / 30);
}
function timeFromSlot(s) {
    const h = Math.floor(s / 2) % 24, m = (s % 2) * 30;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ── SIDEBAR ───────────────────────────────────────────────────────────────────
function renderHospSidebar() {
    const panel = document.getElementById('panel-hospitalizado');
    if (!panel) return;
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
          value="${slotFromTime(HOSP.cfg.hora_apertura) / 2}"
          oninput="hospSetApertura(+this.value)">
      </div>
      <div class="param-row">
        <div class="param-label">Cierre <span class="param-val" id="hosp-ci-val">${HOSP.cfg.hora_cierre}</span></div>
        <input type="range" id="hosp-ci" min="12" max="24" step="0.5"
          value="${slotFromTime(HOSP.cfg.hora_cierre) / 2}"
          oninput="hospSetCierre(+this.value)">
      </div>
      <div style="font-size:10px;color:var(--muted);margin-top:6px;line-height:1.5">
        Los 3 turnos se distribuyen en partes iguales dentro del rango.
      </div>
    </div>

    <div class="sidebar-section">
      <div class="section-label">Demanda de Pabellones</div>
      <div id="hosp-franjas"></div>
      <button onclick="hospAddFranja()" style="margin-top:8px;width:100%;padding:7px;
        border:1.5px dashed var(--border2);border-radius:6px;background:transparent;
        color:var(--muted);font-size:12px;cursor:pointer;font-family:var(--sans)">
        + Agregar franja
      </button>
    </div>

    <div class="sidebar-section">
      <div class="section-label">Personal (${HOSP.personal.length})</div>
      ${Object.entries(porRol).map(([rol, personas]) => `
        <div style="margin-bottom:10px">
          <div style="font-size:10px;font-weight:700;color:var(--muted);
            text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">
            ${ROL_LABEL[rol] || rol}</div>
          ${personas.map(p => `
            <div style="display:flex;justify-content:space-between;align-items:center;
              padding:4px 0;border-bottom:1px solid #f0f2f5;font-size:11px">
              <span style="font-weight:600">${p.nombre}</span>
              <span style="font-family:var(--mono);color:var(--accent);font-size:10px">${p.horas_semana}h</span>
            </div>`).join('')}
        </div>`).join('')}
    </div>

    <div class="sidebar-section">
      <div class="section-label">Acciones</div>
      <button class="btn-primary" id="btnHospSolver" onclick="ejecutarHospSolver()">▶ Calcular Plantilla</button>
      <div id="hosp-solver-status" style="margin-top:10px;font-size:11px;color:var(--muted);line-height:1.5"></div>
    </div>`;

    renderHospFranjas();
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
    const el = document.getElementById('hosp-franjas');
    if (!el) return;
    el.innerHTML = HOSP.demanda.map((f, i) => `
    <div style="display:flex;align-items:center;gap:5px;margin-bottom:7px;font-size:11px">
      <input type="time" value="${f.inicio}" style="width:70px;padding:3px 4px;
        border:1px solid var(--border);border-radius:5px;font-size:10px;font-family:var(--mono)"
        onchange="HOSP.demanda[${i}].inicio=this.value">
      <span style="color:var(--muted);font-size:10px">→</span>
      <input type="time" value="${f.fin === '24:00' ? '23:59' : f.fin}" style="width:70px;padding:3px 4px;
        border:1px solid var(--border);border-radius:5px;font-size:10px;font-family:var(--mono)"
        onchange="HOSP.demanda[${i}].fin=this.value==='23:59'?'24:00':this.value">
      <input type="number" min="0" max="10" value="${f.pabellones}" style="width:36px;padding:3px 4px;
        border:1px solid var(--border);border-radius:5px;font-size:10px;font-family:var(--mono);text-align:center"
        onchange="HOSP.demanda[${i}].pabellones=+this.value">
      <span style="color:var(--muted);font-size:9px">pab</span>
      <button onclick="hospRemoveFranja(${i})" style="border:none;background:none;
        color:#c0392b;cursor:pointer;font-size:13px;padding:0 2px">×</button>
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
        const ping = await fetch('http://localhost:5050/hosp/ping', { signal: AbortSignal.timeout(3000) });
        if (!ping.ok) throw new Error('no responde');
    } catch {
        st.innerHTML = '❌ Solver no disponible. Ejecuta <b>run.bat</b> o <b>run.sh</b>.';
        btn.disabled = false; return;
    }
    st.innerHTML = '⏳ Optimizando turnos...';
    const t0 = Date.now();
    try {
        const res = await fetch('http://localhost:5050/hosp/solve', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ personal: HOSP.personal, demanda: HOSP.demanda, configuracion: HOSP.cfg }),
            signal: AbortSignal.timeout(180000),
        });
        const data = await res.json();
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        if (data.status === 'error') { st.innerHTML = `❌ ${data.mensaje}`; btn.disabled = false; return; }
        if (data.status === 'infeasible') { st.innerHTML = `⚠️ Sin solución factible.<br><span style="font-size:10px">${data.mensaje}</span>`; btn.disabled = false; return; }

        HOSP.resultado = data;
        HOSP.semanaIdx = 0;
        // Copiar semana_tipo a estado editable
        HOSP.hospPlan = JSON.parse(JSON.stringify(data.semana_tipo));
        st.innerHTML = `✅ Listo en ${elapsed}s`;
        showToast('Plantilla generada', 'ok');
        renderHospContent();
    } catch (e) { st.innerHTML = `❌ ${e.message}`; }
    btn.disabled = false;
}

// ── RECALCULAR COBERTURA EN FRONTEND ─────────────────────────────────────────
function calcCobertura() {
    const d = HOSP.resultado;
    if (!d || !d.turnos_opt) return {};

    // req_slot desde HOSP.demanda
    const reqSlot = {};
    HOSP.demanda.forEach(f => {
        const ini = slotFromTime(f.inicio);
        const fin = Math.min(slotFromTime(f.fin === '24:00' ? '23:59' : f.fin) + 1, 48);
        for (let s = ini; s < fin; s++) reqSlot[s] = Math.max(reqSlot[s] || 0, f.pabellones);
    });

    const turnos = d.turnos_opt;   // {M:{ini_slot,fin_slot}, T:..., I:...}
    const eu_nombres = d.personal.filter(p => p.rol === 'enfermera_eu').map(p => p.nombre);
    const aseo_nombres = d.personal.filter(p => p.rol === 'aux_aseo').map(p => p.nombre);

    // Días que opera cada turno (sábado solo turno M)
    const DIAS_X_TURNO = {
        'M': DIAS_LAB,
        'I': ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'],
        'T': ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'],
    };

    const cob = {};
    Object.entries(reqSlot).sort(([a], [b]) => +a - +b).forEach(([sStr, pab]) => {
        const s = +sStr;
        const req_eu = Math.max(1, Math.ceil(pab / 2));
        const euDias = [], aseoDias = [];

        // Solo iterar días donde al menos un turno que cubre este slot puede operar
        const diasOperan = DIAS_LAB.filter(dow => {
            return Object.entries(turnos).some(([t, to]) =>
                to.ini_slot <= s && s < to.fin_slot && DIAS_X_TURNO[t].includes(dow)
            );
        });

        diasOperan.forEach(dow => {
            let eu_c = 0, aseo_c = 0;
            d.personal.forEach(p => {
                const t = HOSP.hospPlan[p.nombre]?.[dow] || '';
                if (!t || t === 'DOM') return;
                const to = turnos[t];
                if (!to) return;
                // Verificar que este turno opera este día Y cubre este slot
                if (!DIAS_X_TURNO[t].includes(dow)) return;
                if (!(to.ini_slot <= s && s < to.fin_slot)) return;
                if (eu_nombres.includes(p.nombre)) eu_c++;
                if (aseo_nombres.includes(p.nombre)) aseo_c++;
            });
            euDias.push(eu_c); aseoDias.push(aseo_c);
        });

        if (euDias.length === 0) return;  // slot fuera de horario operativo, skip

        const hora = timeFromSlot(s);
        cob[hora] = {
            pabellones: pab,
            req_eu,
            cob_eu: Math.min(...euDias),
            deficit_eu: Math.max(0, req_eu - Math.min(...euDias)),
            req_aseo: 1,
            cob_aseo: Math.min(...aseoDias),
            deficit_aseo: Math.max(0, 1 - Math.min(...aseoDias)),
        };
    });
    return cob;
}

// Recalcular horas por persona desde hospPlan
function calcHorasTipo() {
    const d = HOSP.resultado;
    if (!d || !d.turnos_opt) return {};
    const DIAS_X_TURNO = {
        'M': DIAS_LAB,
        'I': ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'],
        'T': ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'],
    };
    const out = {};
    d.personal.forEach(p => {
        const n = p.nombre;
        let h = 0;
        DIAS_LAB.forEach(dow => {
            const t = HOSP.hospPlan[n]?.[dow] || '';
            if (!t || t === 'DOM') return;
            // No contar sábado para turnos I y T (no operan ese día)
            if (!DIAS_X_TURNO[t]?.includes(dow)) return;
            const to = d.turnos_opt[t];
            if (!to) return;
            const dur = to.fin_slot - to.ini_slot;
            h += (dur - 1) * 0.5;  // -1 slot colación siempre
        });
        out[n] = Math.round(h * 10) / 10;
    });
    return out;
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
    const cob = calcCobertura();
    const horasTipo = calcHorasTipo();
    const defTotal = Object.values(cob).reduce((s, c) => s + c.deficit_eu + c.deficit_aseo, 0);

    // ── KPIs ──────────────────────────────────────────────────────────────────
    const kpiHTML = `<div class="kpi-row">
    <div class="kpi-card ${defTotal === 0 ? 'green' : 'amber'}">
      <div class="kpi-label">Déficit cobertura</div>
      <div class="kpi-val">${defTotal.toFixed(1)}</div>
      <div class="kpi-sub">${defTotal === 0 ? 'Cobertura completa ✓' : 'franjas sin cubrir'}</div>
    </div>
    <div class="kpi-card blue">
      <div class="kpi-label">Turnos optimizados</div>
      <div class="kpi-val" style="font-size:14px">${Object.entries(d.turnos_opt).map(([t, o]) => `${t}:${o.ini_str}–${o.fin_str}`).join(' · ')
        }</div>
      <div class="kpi-sub">${d.hora_apertura} – ${d.hora_cierre}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Semanas</div>
      <div class="kpi-val">${d.semanas.length}</div>
      <div class="kpi-sub">${MESES_HOSP[HOSP.cfg.mes]} ${HOSP.cfg.anio}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Horas equipo/sem</div>
      <div class="kpi-val">${Object.values(horasTipo).reduce((a, b) => a + b, 0)}h</div>
      <div class="kpi-sub">total</div>
    </div>
  </div>`;

    // ── Leyenda turnos optimizados ────────────────────────────────────────────
    const leyenda = `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;
    padding:10px 16px;background:var(--surface);border:1px solid var(--border);
    border-radius:var(--radius);font-size:11px">
    <span style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;
      letter-spacing:.5px">Turnos:</span>
    ${Object.entries(d.turnos_opt).map(([t, o]) => {
        const c = TURNO_COLOR[t];
        return `<span style="background:${c.bg};border:1px solid ${c.border};color:${c.text};
        padding:2px 10px;border-radius:4px;font-weight:700">${t}
        <span style="font-weight:400;opacity:.75">${o.ini_str}–${o.fin_str} (${o.dur_h}h)</span></span>`;
    }).join('')}
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
      letter-spacing:.5px;align-self:center;margin-right:4px">Semana:</span>
    ${semBtns}
  </div>`;

    // ── Tabla plantilla editable ──────────────────────────────────────────────
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
        <div style="font-weight:400;color:var(--muted);font-size:9px">${fecha.slice(8)}</div>
      </th>`;
        }).join('');

        const rows = personas.map(p => {
            const n = p.nombre;
            const celdas = diasSem.map(([fecha, dow]) => {
                const t = HOSP.hospPlan[n]?.[dow] ?? '';
                const c = TURNO_COLOR[t] || TURNO_COLOR[''];
                // Dropdown editable para cambiar turno
                const opts = (dow === 'sábado' ? ['M', ''] : ['M', 'T', 'I', '']).map(o =>
                    `<option value="${o}" ${o === t ? 'selected' : ''}>${o || '—'}</option>`
                ).join('');
                return `<td style="padding:2px 3px;text-align:center;border-bottom:1px solid #f0f2f5">
          <select onchange="hospSetTurno('${n}','${dow}',this.value)"
            style="background:${c.bg};border:1px solid ${c.border};color:${c.text};
            border-radius:3px;font-size:11px;font-weight:700;padding:2px 3px;
            cursor:pointer;width:44px;text-align:center">
            ${opts}
          </select>
        </td>`;
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
          <div class="table-card-sub">Semana ${HOSP.semanaIdx + 1} · ${personas.length} persona${personas.length > 1 ? 's' : ''} · click turno para editar</div>
        </div>
        <button onclick="exportarHospExcel('${rol}')" class="btn-export"
          style="width:auto;padding:5px 12px">↓ Exportar</button>
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

    // ── Tabla de cobertura ────────────────────────────────────────────────────
    const cobRows = Object.entries(cob).map(([hora, c]) => {
        const okEu = c.deficit_eu === 0, okAs = c.deficit_aseo === 0;
        return `<tr>
      <td style="padding:5px 12px;font-family:var(--mono);font-size:11px;
        font-weight:600;border-bottom:1px solid #f0f2f5">${hora}</td>
      <td style="padding:5px 8px;text-align:center;font-family:var(--mono);font-size:11px;
        border-bottom:1px solid #f0f2f5">${c.pabellones}</td>
      <td style="padding:5px 8px;text-align:center;font-family:var(--mono);font-size:11px;
        border-bottom:1px solid #f0f2f5;border-left:2px solid #e8eaed">${c.req_eu}</td>
      <td style="padding:5px 8px;text-align:center;font-family:var(--mono);font-size:11px;
        border-bottom:1px solid #f0f2f5">${c.cob_eu}</td>
      <td style="padding:5px 8px;text-align:center;font-size:11px;font-weight:700;
        color:${okEu ? 'var(--success)' : '#c0392b'};border-bottom:1px solid #f0f2f5">
        ${okEu ? '✓' : '−' + c.deficit_eu}</td>
      <td style="padding:5px 8px;text-align:center;font-family:var(--mono);font-size:11px;
        border-bottom:1px solid #f0f2f5;border-left:2px solid #e8eaed">${c.req_aseo}</td>
      <td style="padding:5px 8px;text-align:center;font-family:var(--mono);font-size:11px;
        border-bottom:1px solid #f0f2f5">${c.cob_aseo}</td>
      <td style="padding:5px 8px;text-align:center;font-size:11px;font-weight:700;
        color:${okAs ? 'var(--success)' : '#c0392b'};border-bottom:1px solid #f0f2f5">
        ${okAs ? '✓' : '−' + c.deficit_aseo}</td>
    </tr>`;
    }).join('');

    const thGrp = (label, cols) => `<th colspan="${cols}" style="padding:5px 8px;font-size:10px;
    font-weight:700;text-align:center;background:var(--surface2);border-bottom:1px solid var(--border);
    border-left:2px solid #e8eaed;color:var(--text2)">${label}</th>`;

    const cobHTML = `<div class="table-card" id="hosp-cob-card">
    <div class="table-card-header">
      <div class="table-card-title">Cobertura por Franja Horaria</div>
      <div class="table-card-sub">Se actualiza al editar turnos · peor caso entre días laborables</div>
    </div>
    <div class="table-scroll">
      <table style="border-collapse:collapse;width:100%">
        <thead>
          <tr>
            <th rowspan="2" style="padding:5px 12px;font-size:10px;font-weight:700;text-align:left;
              background:var(--surface2);border-bottom:1px solid var(--border)">Franja</th>
            <th rowspan="2" style="padding:5px 8px;font-size:10px;font-weight:700;text-align:center;
              background:var(--surface2);border-bottom:1px solid var(--border)">Pab.</th>
            ${thGrp('Enfermera EU', 3)}${thGrp('Aux. Aseo', 3)}
          </tr>
          <tr>
            ${['Req.', 'Asig.', 'Estado', 'Req.', 'Asig.', 'Estado'].map((h, i) =>
        `<th style="padding:4px 8px;font-size:9px;font-weight:600;text-align:center;
                background:var(--surface2);border-bottom:1px solid var(--border);color:var(--muted);
                ${i === 3 ? 'border-left:2px solid #e8eaed' : ''}">${h}</th>`
    ).join('')}
          </tr>
        </thead>
        <tbody id="hosp-cob-body">${cobRows}</tbody>
      </table>
    </div>
  </div>`;

    content.innerHTML = kpiHTML + leyenda + semSelector + tablaHTML + cobHTML;
}

// ── EDICIÓN DE TURNO ──────────────────────────────────────────────────────────
function hospSetTurno(nombre, dow, nuevoTurno) {
    // Actualizar en hospPlan — aplica a todas las semanas (es semana tipo)
    if (!HOSP.hospPlan[nombre]) HOSP.hospPlan[nombre] = {};
    HOSP.hospPlan[nombre][dow] = nuevoTurno;

    // Actualizar plantilla mensual en resultado
    const d = HOSP.resultado;
    if (d && d.semanas) {
        d.semanas.forEach(sem => {
            sem.dias.forEach(([fecha, fdow]) => {
                if (fdow === dow) d.plantilla[nombre][fecha] = nuevoTurno;
            });
        });
    }

    // Recalcular horas y cobertura sin re-renderizar toda la página
    const horasTipo = calcHorasTipo();
    const cob = calcCobertura();

    // Actualizar celda de horas
    const hEl = document.getElementById(`h_${nombre.replace(/\W/g, '_')}`);
    if (hEl) {
        const h = horasTipo[nombre] ?? 0;
        hEl.textContent = h + 'h';
        hEl.style.color = h > HOSP.cfg.horas_max_semana ? '#c0392b' : 'var(--success)';
    }

    // Actualizar tabla de cobertura
    const body = document.getElementById('hosp-cob-body');
    if (body) {
        const defTotal = Object.values(cob).reduce((s, c) => s + c.deficit_eu + c.deficit_aseo, 0);
        body.innerHTML = Object.entries(cob).map(([hora, c]) => {
            const okEu = c.deficit_eu === 0, okAs = c.deficit_aseo === 0;
            return `<tr>
        <td style="padding:5px 12px;font-family:var(--mono);font-size:11px;font-weight:600;border-bottom:1px solid #f0f2f5">${hora}</td>
        <td style="padding:5px 8px;text-align:center;font-family:var(--mono);font-size:11px;border-bottom:1px solid #f0f2f5">${c.pabellones}</td>
        <td style="padding:5px 8px;text-align:center;font-family:var(--mono);font-size:11px;border-bottom:1px solid #f0f2f5;border-left:2px solid #e8eaed">${c.req_eu}</td>
        <td style="padding:5px 8px;text-align:center;font-family:var(--mono);font-size:11px;border-bottom:1px solid #f0f2f5">${c.cob_eu}</td>
        <td style="padding:5px 8px;text-align:center;font-size:11px;font-weight:700;color:${okEu ? 'var(--success)' : '#c0392b'};border-bottom:1px solid #f0f2f5">${okEu ? '✓' : '−' + c.deficit_eu}</td>
        <td style="padding:5px 8px;text-align:center;font-family:var(--mono);font-size:11px;border-bottom:1px solid #f0f2f5;border-left:2px solid #e8eaed">${c.req_aseo}</td>
        <td style="padding:5px 8px;text-align:center;font-family:var(--mono);font-size:11px;border-bottom:1px solid #f0f2f5">${c.cob_aseo}</td>
        <td style="padding:5px 8px;text-align:center;font-size:11px;font-weight:700;color:${okAs ? 'var(--success)' : '#c0392b'};border-bottom:1px solid #f0f2f5">${okAs ? '✓' : '−' + c.deficit_aseo}</td>
      </tr>`;
        }).join('');
        // Actualizar KPI déficit
        const kpiDef = document.querySelector('.kpi-val');
        if (kpiDef) kpiDef.textContent = defTotal.toFixed(1);
    }
}

function hospGoSem(idx) { HOSP.semanaIdx = idx; renderHospContent(); }

// ── EXPORTAR ──────────────────────────────────────────────────────────────────
function exportarHospExcel(rol) {
    const d = HOSP.resultado; if (!d) return;
    const wb = XLSX.utils.book_new();
    const pers = d.personal.filter(p => !rol || p.rol === rol);
    const rows = [['Nombre', 'Rol', ...d.fechas],
    ...pers.map(p => [p.nombre, ROL_LABEL[p.rol] || p.rol,
    ...d.fechas.map(f => d.plantilla[p.nombre]?.[f] ?? '')])];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 20 }, { wch: 16 }, ...d.fechas.map(() => ({ wch: 5 }))];
    XLSX.utils.book_append_sheet(wb, ws, ROL_LABEL[rol] || 'Plantilla');
    XLSX.writeFile(wb, `Plantilla_Hosp_${MESES_HOSP[HOSP.cfg.mes]}_${HOSP.cfg.anio}.xlsx`);
    showToast('Exportado', 'ok');
}