"""
CEM Capacity Planner — Flask App
Uso: python app.py  →  http://localhost:5050
"""
from flask import Flask, render_template, request, jsonify
import pulp
from datetime import date, timedelta
import traceback

app = Flask(__name__)

# ── HELPERS ───────────────────────────────────────────────────────────────────
INICIO_OP = 7 * 2   # slot 14 = 07:00
FIN_OP    = 21 * 2  # slot 42 = 21:00
DIAS_LAB  = ['lunes','martes','miércoles','jueves','viernes','sábado']
DOW_MAP   = {0:'lunes',1:'martes',2:'miércoles',3:'jueves',
             4:'viernes',5:'sábado',6:'domingo'}

_cnt = [0]
def si(s):
    s = str(s)
    if not hasattr(si, '_cache'): si._cache = {}
    if s not in si._cache:
        si._cache[s] = str(_cnt[0]); _cnt[0] += 1
    return si._cache[s]

def slot_str(s):  return f"{s//2:02d}:{(s%2)*30:02d}"
def str_slot(s):
    h, m = map(int, str(s).strip().split(':'))
    return h*2 + m//30

def build_semanas(mes, anio):
    primer = date(anio, mes, 1)
    ultimo = date(anio, mes+1 if mes<12 else 1, 1) - timedelta(days=1)
    semanas, sem, cur = [], [], primer
    while cur <= ultimo:
        if cur.month == mes:
            sem.append((cur.isoformat(), DOW_MAP[cur.weekday()]))
        cur += timedelta(days=1)
        if cur.weekday() == 0 and sem:
            semanas.append(sem); sem = []
    if sem: semanas.append(sem)
    return [s for s in semanas if any(d != 'domingo' for _,d in s)]

# ── ROUTES ────────────────────────────────────────────────────────────────────
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/ping')
def ping():
    return jsonify({'status': 'ok', 'version': '4.1-fix'})

@app.route('/solve', methods=['POST'])
def solve():
    try:
        return jsonify(resolver(request.get_json()))
    except Exception as e:
        return jsonify({'status':'error','mensaje':str(e),
                        'trace':traceback.format_exc()}), 500

# ── SOLVER ────────────────────────────────────────────────────────────────────
def resolver(data):
    si._cache = {}; _cnt[0] = 0

    ejecutivos = data['ejecutivos']
    demanda    = data['demanda']        # {dow: {HH:MM: float}}
    cfg        = data['configuracion']

    mes          = int(cfg.get('mes', 6))
    anio         = int(cfg.get('anio', 2025))
    P            = int(cfg.get('puestos_fisicos_max', 4))   # max shift types
    turno_min_sl = int(float(cfg.get('turno_min_horas', 4)) * 2)
    turno_max_sl = int(float(cfg.get('turno_max_horas', 9)) * 2)
    apertura_min = int(cfg.get('apertura_min', 0))
    cierre_min   = int(cfg.get('cierre_min',   0))
    sabado_min   = int(cfg.get('sabado_min',   0))
    # Override operating hours if provided
    hora_ap = float(cfg.get('hora_apertura', 7))
    hora_ci = float(cfg.get('hora_cierre',  21))
    INICIO_OP = int(hora_ap * 2)
    FIN_OP    = int(hora_ci * 2)

    nombres = [e['nombre'] for e in ejecutivos]
    h_max   = {e['nombre']: float(e['horas_semana']) for e in ejecutivos}
    N       = len(nombres)
    K       = list(range(P))   # shift type indices
    BIG_M   = FIN_OP + turno_max_sl + 4

    semanas = build_semanas(mes, anio)

    DIAS_LABOR = ['lunes','martes','miércoles','jueves','viernes']

    # ── Demand profiles ───────────────────────────────────────────────────────
    # Weekday: max demand per slot across Mon-Fri
    dem_wd = {}
    for dow, slots in demanda.items():
        if dow not in DIAS_LABOR: continue
        for hora, val in slots.items():
            s = str_slot(hora)
            dem_wd[s] = max(dem_wd.get(s, 0.0), float(val))

    # Saturday
    dem_sat = {}
    if 'sábado' in demanda:
        for hora, val in demanda['sábado'].items():
            s = str_slot(hora)
            v2 = float(val)
            if v2 > 0:
                dem_sat[s] = v2

    slots_wd  = {s for s,v in dem_wd.items()  if v > 0}
    slots_sat = {s for s,v in dem_sat.items() if v > 0}

    # ── Debug log ────────────────────────────────────────────────────────────
    import sys
    print(f"[SOLVER] hora_ap={hora_ap} hora_ci={hora_ci} "
          f"INICIO_OP={INICIO_OP} FIN_OP={FIN_OP} "
          f"turno_min={turno_min_sl} turno_max={turno_max_sl} "
          f"P={P} N={N} slots_wd={len(slots_wd)} slots_sat={len(slots_sat)}",
          flush=True, file=sys.stderr)

    # ── Problem ───────────────────────────────────────────────────────────────
    prob = pulp.LpProblem("CEM_v4", pulp.LpMinimize)

    # ── Shift type variables ──────────────────────────────────────────────────
    T_entry = {k: pulp.LpVariable(f"TE_{k}", lowBound=INICIO_OP,
                                   upBound=FIN_OP-turno_min_sl, cat='Integer') for k in K}
    T_dur   = {k: pulp.LpVariable(f"TD_{k}", lowBound=turno_min_sl,
                                   upBound=turno_max_sl, cat='Integer') for k in K}
    T_used  = {k: pulp.LpVariable(f"TU_{k}", cat='Binary') for k in K}

    # ── Colación: modelled as a SINGLE lost slot for coverage and hours ───────
    # Has_col[k]=1 iff T_dur[k] >= COL_MIN_SL (5h = 10 slots)
    # The exact position is set in the frontend; solver just knows 0.5h is lost.
    COL_MIN_SL = 10
    Has_col = {k: pulp.LpVariable(f"HC_{k}", cat='Binary') for k in K}

    # ── Assignment variables ──────────────────────────────────────────────────
    A_wd  = {(n,k): pulp.LpVariable(f"AWD_{si(n)}_{k}", cat='Binary')
             for n in nombres for k in K}
    W_sat = {n: pulp.LpVariable(f"WS_{si(n)}", cat='Binary') for n in nombres}
    A_sat = {(n,k): pulp.LpVariable(f"AS_{si(n)}_{k}", cat='Binary')
             for n in nombres for k in K}

    # ── Coverage variables ────────────────────────────────────────────────────
    COV_wd  = {(n,k,s): pulp.LpVariable(f"CWD_{si(n)}_{k}_{s}", cat='Binary')
               for n in nombres for k in K for s in slots_wd}
    COV_sat = {(n,k,s): pulp.LpVariable(f"CS_{si(n)}_{k}_{s}", cat='Binary')
               for n in nombres for k in K for s in slots_sat}

    # ── Slack (tiered to penalise deep deficits more) ─────────────────────────
    PENALTY = 4
    SLK1_wd  = {s: pulp.LpVariable(f"SWD1_{s}", lowBound=0, upBound=1)
                for s in slots_wd  if dem_wd.get(s,0)  > 0}
    SLK2_wd  = {s: pulp.LpVariable(f"SWD2_{s}", lowBound=0)
                for s in slots_wd  if dem_wd.get(s,0)  > 0}
    SLK1_sat = {s: pulp.LpVariable(f"SST1_{s}", lowBound=0, upBound=1)
                for s in slots_sat if dem_sat.get(s,0) > 0}
    SLK2_sat = {s: pulp.LpVariable(f"SST2_{s}", lowBound=0)
                for s in slots_sat if dem_sat.get(s,0) > 0}

    # Linearized gross hours per exec
    H_wd  = {n: pulp.LpVariable(f"HWD_{si(n)}", lowBound=0, upBound=turno_max_sl) for n in nombres}
    H_sat = {n: pulp.LpVariable(f"HSAT_{si(n)}", lowBound=0, upBound=turno_max_sl) for n in nombres}

    # Linearize A_wd[n,k] * Has_col[k]  (for hour accounting)
    HCN_wd  = {(n,k): pulp.LpVariable(f"HCNWD_{si(n)}_{k}",  cat='Binary') for n in nombres for k in K}
    HCN_sat = {(n,k): pulp.LpVariable(f"HCNSAT_{si(n)}_{k}", cat='Binary') for n in nombres for k in K}

    # ── Objective ────────────────────────────────────────────────────────────
    prob += (  pulp.lpSum(SLK1_wd.values())  + PENALTY*pulp.lpSum(SLK2_wd.values())
             + pulp.lpSum(SLK1_sat.values()) + PENALTY*pulp.lpSum(SLK2_sat.values())), "MinDeficit"

    # ── Basic constraints ─────────────────────────────────────────────────────
    for n in nombres:
        prob += pulp.lpSum(A_wd[n,k]  for k in K) == 1,        f"OneWD_{si(n)}"
        prob += pulp.lpSum(A_sat[n,k] for k in K) == W_sat[n], f"OneSat_{si(n)}"
    for k in K:
        for n in nombres:
            prob += A_wd[n,k]  <= T_used[k], f"TU_WD_{si(n)}_{k}"
            prob += A_sat[n,k] <= T_used[k], f"TU_SAT_{si(n)}_{k}"
        # Shift end within operating hours
        prob += T_entry[k] + T_dur[k] <= FIN_OP + BIG_M*(1-T_used[k]), f"TEnd_{k}"
    # Symmetry break: order shift types by entry
    for k in K[:-1]:
        prob += T_entry[k] <= T_entry[k+1] + BIG_M*(1-T_used[k]), f"Ord_{k}"

    # ── Colación constraints ──────────────────────────────────────────────────
    for k in K:
        prob += T_dur[k] >= COL_MIN_SL - BIG_M*(1-Has_col[k]), f"HC_lb_{k}"
        prob += T_dur[k] <= COL_MIN_SL-1 + BIG_M*Has_col[k],   f"HC_ub_{k}"
        prob += Has_col[k] <= T_used[k],                         f"HC_used_{k}"

    # Linearize HCN = A * Has_col
    for n in nombres:
        for k in K:
            prob += HCN_wd[n,k]  <= A_wd[n,k],               f"HCNWD_a_{si(n)}_{k}"
            prob += HCN_wd[n,k]  <= Has_col[k],              f"HCNWD_h_{si(n)}_{k}"
            prob += HCN_wd[n,k]  >= A_wd[n,k]+Has_col[k]-1, f"HCNWD_l_{si(n)}_{k}"
            prob += HCN_sat[n,k] <= A_sat[n,k],              f"HCNSAT_a_{si(n)}_{k}"
            prob += HCN_sat[n,k] <= Has_col[k],              f"HCNSAT_h_{si(n)}_{k}"
            prob += HCN_sat[n,k] >= A_sat[n,k]+Has_col[k]-1, f"HCNSAT_l_{si(n)}_{k}"

    # ── Linearize H_wd/H_sat ────────────────────────────────────────────────
    for n in nombres:
        for k in K:
            prob += H_wd[n]  >= T_dur[k] - BIG_M*(1-A_wd[n,k]),  f"HWD_lb_{si(n)}_{k}"
            prob += H_wd[n]  <= T_dur[k] + BIG_M*(1-A_wd[n,k]),  f"HWD_ub_{si(n)}_{k}"
            prob += H_sat[n] >= T_dur[k] - BIG_M*(1-A_sat[n,k]), f"HSAT_lb_{si(n)}_{k}"
            prob += H_sat[n] <= T_dur[k] + BIG_M*(1-A_sat[n,k]), f"HSAT_ub_{si(n)}_{k}"
        prob += H_sat[n] <= turno_max_sl * W_sat[n], f"HSAT_bound_{si(n)}"

    # ── Weekly hours: worked = gross − colación ≤ h_max ──────────────────────
    # Worked slots = T_dur - 1 if has_col else T_dur
    # For exec n: 5*(H_wd[n] - col_wd_n) + (H_sat[n] - col_sat_n) ≤ h_max*2
    for n in nombres:
        col_wd_n  = pulp.lpSum(HCN_wd[n,k]  for k in K)
        col_sat_n = pulp.lpSum(HCN_sat[n,k] for k in K)
        prob += (5*(H_wd[n] - col_wd_n) + (H_sat[n] - col_sat_n)
                 <= h_max[n] * 2), f"HMax_{si(n)}"

    # ── Weekday coverage ──────────────────────────────────────────────────────
    for n in nombres:
        for k in K:
            for s in slots_wd:
                c = COV_wd[n,k,s]
                prob += c <= A_wd[n,k],                                  f"CWD_a_{si(n)}_{k}_{s}"
                prob += T_entry[k] <= s + BIG_M*(1-c),                  f"CWD_e_{si(n)}_{k}_{s}"
                prob += T_entry[k]+T_dur[k] >= s+1 - BIG_M*(1-c),      f"CWD_d_{si(n)}_{k}_{s}"
    for s in slots_wd:
        if dem_wd.get(s,0) <= 0: continue
        cov  = pulp.lpSum(COV_wd[n,k,s] for n in nombres for k in K)
        slk1 = SLK1_wd[s]; slk2 = SLK2_wd[s]
        prob += cov + slk1 + slk2 >= dem_wd[s], f"CovWD_{s}"

    # ── Saturday coverage ─────────────────────────────────────────────────────
    for n in nombres:
        for k in K:
            for s in slots_sat:
                c = COV_sat[n,k,s]
                prob += c <= A_sat[n,k],                                 f"CS_a_{si(n)}_{k}_{s}"
                prob += T_entry[k] <= s + BIG_M*(1-c),                  f"CS_e_{si(n)}_{k}_{s}"
                prob += T_entry[k]+T_dur[k] >= s+1 - BIG_M*(1-c),      f"CS_d_{si(n)}_{k}_{s}"
    for s in slots_sat:
        if dem_sat.get(s,0) <= 0: continue
        cov  = pulp.lpSum(COV_sat[n,k,s] for n in nombres for k in K)
        slk1 = SLK1_sat[s]; slk2 = SLK2_sat[s]
        prob += cov + slk1 + slk2 >= dem_sat[s], f"CovSat_{s}"

    # ── Apertura / Cierre / Sabado minimo ─────────────────────────────────────
    s_apertura = INICIO_OP
    s_cierre   = FIN_OP - 1

    if apertura_min > 0 and s_apertura in slots_wd:
        prob += (pulp.lpSum(COV_wd[n,k,s_apertura] for n in nombres for k in K)
                 >= apertura_min), "AperturaMin"
    if cierre_min > 0 and s_cierre in slots_wd:
        prob += (pulp.lpSum(COV_wd[n,k,s_cierre] for n in nombres for k in K)
                 >= cierre_min), "CierreMin"
    if sabado_min > 0 and slots_sat:
        s_sat_ap = min(slots_sat)
        if s_sat_ap in slots_sat:
            prob += (pulp.lpSum(COV_sat[n,k,s_sat_ap] for n in nombres for k in K)
                     >= sabado_min), "SabadoMin"

    # ── Solve ────────────────────────────────────────────────────────────────
    print("[SOLVER] Ejecutando solver CBC...", flush=True, file=sys.stderr)
    prob.solve(pulp.PULP_CBC_CMD(msg=0))
    v = pulp.value
    print(f"[SOLVER] Status: {pulp.LpStatus[prob.status]}", flush=True, file=sys.stderr)

    # ── Extract colación offset per shift type ────────────────────────────────
    # Without ISCS, default to midpoint; frontend lets user move it
    col_offset = {}
    for k in K:
        if v(T_used[k]) > 0.5 and v(Has_col[k]) > 0.5:
            dur_k = int(round(v(T_dur[k])))
            col_offset[k] = dur_k // 2   # midpoint offset, moveable in frontend

    # ── Extract shift types ───────────────────────────────────────────────────
    shift_types = []
    for k in K:
        if v(T_used[k]) > 0.5:
            ent = int(round(v(T_entry[k])))
            dur = int(round(v(T_dur[k])))
            shift_types.append({'id':k, 'k':k,
                                 'entrada':slot_str(ent),
                                 'salida': slot_str(ent+dur),
                                 'duracion_h': dur*0.5,
                                 'colacion_offset': col_offset.get(k)})

    # ── Extract assignments ───────────────────────────────────────────────────
    asig_wd  = {n: next((k for k in K if v(A_wd[n,k])  > 0.5), None) for n in nombres}
    asig_sat = {n: next((k for k in K if v(A_sat[n,k]) > 0.5), None) for n in nombres}

    # ── Build monthly turnos ──────────────────────────────────────────────────
    turnos_out = []
    for w_idx, sem in enumerate(semanas):
        for n in nombres:
            k_wd  = asig_wd.get(n)
            k_sat = asig_sat.get(n)
            ent_wd  = int(round(v(T_entry[k_wd])))  if k_wd  is not None else None
            dur_wd  = int(round(v(T_dur[k_wd])))    if k_wd  is not None else None
            ent_sat = int(round(v(T_entry[k_sat]))) if k_sat is not None else None
            dur_sat = int(round(v(T_dur[k_sat])))   if k_sat is not None else None

            for fecha, dow in sem:
                if dow == 'domingo':
                    turnos_out.append({'ejecutivo':n,'semana':w_idx+1,
                                       'fecha':fecha,'dia':dow,'libre':True})
                elif dow == 'sábado':
                    if v(W_sat[n]) > 0.5 and ent_sat is not None:
                        col_off_sat = col_offset.get(k_sat)
                        worked_sat  = (dur_sat - (1 if col_off_sat is not None else 0)) * 0.5
                        turnos_out.append({
                            'ejecutivo':n,'semana':w_idx+1,'fecha':fecha,'dia':dow,'libre':False,
                            'entrada':slot_str(ent_sat),'salida':slot_str(ent_sat+dur_sat),
                            'duracion_h':worked_sat,'colacion':col_off_sat is not None,
                            'colacion_offset': col_off_sat
                        })
                    else:
                        turnos_out.append({'ejecutivo':n,'semana':w_idx+1,
                                           'fecha':fecha,'dia':dow,'libre':True})
                else:  # Mon-Fri
                    if ent_wd is not None:
                        col_off_wd = col_offset.get(k_wd)
                        worked_wd  = (dur_wd - (1 if col_off_wd is not None else 0)) * 0.5
                        turnos_out.append({
                            'ejecutivo':n,'semana':w_idx+1,'fecha':fecha,'dia':dow,'libre':False,
                            'entrada':slot_str(ent_wd),'salida':slot_str(ent_wd+dur_wd),
                            'duracion_h':worked_wd,'colacion':col_off_wd is not None,
                            'colacion_offset': col_off_wd
                        })
                    else:
                        turnos_out.append({'ejecutivo':n,'semana':w_idx+1,
                                           'fecha':fecha,'dia':dow,'libre':True})

    # ── Hours summary ─────────────────────────────────────────────────────────
    horas_out = {n:{} for n in nombres}
    for t in turnos_out:
        if t['libre']: continue
        sl = f"semana_{t['semana']}"
        horas_out[t['ejecutivo']][sl] = horas_out[t['ejecutivo']].get(sl,0) + t['duracion_h']
    for n in nombres:
        horas_out[n]['total'] = sum(v2 for k2,v2 in horas_out[n].items() if k2!='total')

    deficit = (sum(v(sv) for sv in SLK1_wd.values())  + sum(v(sv) for sv in SLK2_wd.values()) +
               sum(v(sv) for sv in SLK1_sat.values()) + sum(v(sv) for sv in SLK2_sat.values()))

    # semana_tipo for frontend compatibility (same schedule every week — no rotation)
    semana_tipo = []
    for n in nombres:
        k_wd = asig_wd.get(n)
        if k_wd is None: continue
        ent = int(round(v(T_entry[k_wd])))
        dur = int(round(v(T_dur[k_wd])))
        dias_lab = DIAS_LABOR[:]
        if v(W_sat[n]) > 0.5 and asig_sat.get(n) is not None:
            dias_lab_all = dias_lab + ['sábado']
        else:
            dias_lab_all = dias_lab
        entradas = {d: slot_str(ent) for d in dias_lab}
        salidas  = {d: slot_str(ent+dur) for d in dias_lab}
        if v(W_sat[n]) > 0.5 and asig_sat.get(n) is not None:
            k_s = asig_sat[n]
            es = int(round(v(T_entry[k_s]))); ds = int(round(v(T_dur[k_s])))
            entradas['sábado'] = slot_str(es); salidas['sábado'] = slot_str(es+ds)
        semana_tipo.append({
            'ejecutivo':    n,
            'duracion_h':   dur*0.5,
            'colacion':     dur>10,
            'dias_trabajo': dias_lab_all,
            'dias_libres':  ['domingo'] if v(W_sat[n]) > 0.5 else ['sábado','domingo'],
            'entradas':     entradas,
            'salidas':      salidas
        })

    return {
        'status':            'ok',
        'inicio_op':         INICIO_OP,
        'fin_op':            FIN_OP,
        'solver_status':     pulp.LpStatus[prob.status],
        'deficit_cobertura': round(deficit, 2),
        'shift_types':       shift_types,
        'semana_tipo':       semana_tipo,
        'turnos':            turnos_out,
        'horas_ejecutivo':   horas_out,
        'dem_wd_profile':    {slot_str(s): dem_wd[s] for s in sorted(dem_wd) if dem_wd[s]>0},
        'dem_sat_profile':   {slot_str(s): dem_sat.get(s,0) for s in sorted(slots_sat)},
        'semanas': [{'semana': w+1,
                     'dias':   [(f,d) for f,d in sem if d!='domingo']}
                    for w,sem in enumerate(semanas)]
    }



# ── MODELS ────────────────────────────────────────────────────────────────────
import json, os, uuid, time

MODELS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'models.json')

def load_models():
    try:
        with open(MODELS_FILE) as f:
            return json.load(f)
    except:
        return []

def save_models_to_disk(models):
    os.makedirs(os.path.dirname(MODELS_FILE), exist_ok=True)
    with open(MODELS_FILE, 'w') as f:
        json.dump(models, f, ensure_ascii=False, indent=2)

@app.route('/models/list')
def models_list():
    models = load_models()
    return jsonify([{
        'id':          m['id'],
        'nombre':      m['nombre'],
        'descripcion': m['descripcion'],
        'fecha':       m['fecha'],
        'deficit':     m.get('deficit_cobertura', '-'),
        'mes':         m.get('params', {}).get('mes'),
        'anio':        m.get('params', {}).get('anio'),
        'n_ejecutivos': m.get('params', {}).get('n_ejecutivos'),
    } for m in models])

@app.route('/models/save', methods=['POST'])
def models_save():
    data   = request.get_json()
    models = load_models()
    model  = {
        'id':                str(uuid.uuid4())[:8],
        'nombre':            data.get('nombre', 'Sin nombre'),
        'descripcion':       data.get('descripcion', ''),
        'fecha':             time.strftime('%Y-%m-%d %H:%M'),
        'deficit_cobertura': data.get('solver_result', {}).get('deficit_cobertura'),
        'params':            data.get('params', {}),
        'solver_result':     data.get('solver_result', {}),
        'ejecutivos':        data.get('ejecutivos', []),
    }
    models.insert(0, model)
    save_models_to_disk(models)
    return jsonify({'status': 'ok', 'id': model['id']})

@app.route('/models/get/<model_id>')
def models_get(model_id):
    models = load_models()
    model  = next((m for m in models if m['id'] == model_id), None)
    if not model:
        return jsonify({'error': 'not found'}), 404
    return jsonify(model)

@app.route('/models/delete/<model_id>', methods=['DELETE'])
def models_delete(model_id):
    models = load_models()
    models = [m for m in models if m['id'] != model_id]
    save_models_to_disk(models)
    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    print("="*50)
    print("  CEM Capacity Planner v4.1-fix")
    print("  http://localhost:5050")
    print("="*50)
    app.run(port=5050, debug=False)