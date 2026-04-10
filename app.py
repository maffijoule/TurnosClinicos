"""
CEM Capacity Planner — Flask App
Uso: python app.py  →  http://localhost:5050
"""
from flask import Flask, render_template, request, jsonify
import pulp
from datetime import date, timedelta
import traceback

app = Flask(__name__)

# ── Módulos adicionales ────────────────────────────────────────────────────────
from hosp_solver import hosp_bp
app.register_blueprint(hosp_bp)
from imagen_solver import imagen_bp
app.register_blueprint(imagen_bp)

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

    P            = int(cfg.get('puestos_fisicos_max', 4))   # max shift types
    turno_min_sl = int(float(cfg.get('turno_min_horas', 4)) * 2)
    turno_max_sl = int(float(cfg.get('turno_max_horas', 9)) * 2)
    # apertura_min / cierre_min / apertura_min_sat / cierre_min_sat
    # se leen más abajo, junto a las restricciones donde se usan
    # Horario de operación semana (Lun-Vie)
    hora_ap = float(cfg.get('hora_apertura', 7))
    hora_ci = float(cfg.get('hora_cierre',  21))
    INICIO_OP = int(hora_ap * 2)
    FIN_OP    = int(hora_ci * 2)
    # Horario de operación sábado (puede diferir)
    hora_ap_sat = float(cfg.get('hora_apertura_sat', hora_ap))
    hora_ci_sat = float(cfg.get('hora_cierre_sat',  hora_ci))
    INICIO_OP_SAT = int(hora_ap_sat * 2)
    FIN_OP_SAT    = int(hora_ci_sat * 2)

    nombres = [e['nombre'] for e in ejecutivos]
    h_max   = {e['nombre']: float(e['horas_semana']) for e in ejecutivos}
    horas_min = float(cfg.get('horas_min_ejecutivo', 0))
    N       = len(nombres)
    K       = list(range(P))   # shift type indices
    # BIG_M acotado al rango completo de operación (semana + sábado)
    BIG_M   = (max(FIN_OP, FIN_OP_SAT) - min(INICIO_OP, INICIO_OP_SAT)) + turno_max_sl + 2

    # Semana tipo genérica (sin dependencia de mes/año)
    DIAS_SEMANA_TIPO = [('Lun','lunes'),('Mar','martes'),('Mié','miércoles'),
                        ('Jue','jueves'),('Vie','viernes'),('Sáb','sábado')]
    semana_gen = {'semana': 1, 'dias': DIAS_SEMANA_TIPO}

    DIAS_LABOR = ['lunes','martes','miércoles','jueves','viernes']

    # ── Demand profiles ───────────────────────────────────────────────────────
    # Weekday: max demand per slot across Mon-Fri.
    # Si un slot cae en FIN_OP (hora exacta de cierre), se reasigna al slot FIN_OP-1
    # para que quede dentro del rango operativo [INICIO_OP, FIN_OP).
    dem_wd = {}
    for dow, slots in demanda.items():
        if dow not in DIAS_LABOR: continue
        for hora, val in slots.items():
            s = str_slot(hora)
            if s == FIN_OP:     s = FIN_OP - 1
            if s == FIN_OP_SAT: s = FIN_OP_SAT - 1
            dem_wd[s] = max(dem_wd.get(s, 0.0), float(val))

    # Saturday
    dem_sat = {}
    if 'sábado' in demanda:
        for hora, val in demanda['sábado'].items():
            s = str_slot(hora)
            if s == FIN_OP_SAT: s = FIN_OP_SAT - 1
            v2 = float(val)
            if v2 > 0:
                dem_sat[s] = v2

    # Filtrar slots al rango de operación configurado.
    # Cada slot s representa [s*30min, (s+1)*30min).
    # FIN_OP es exclusivo: si cierre=20:00 → FIN_OP=40 → último slot válido = 39 (19:30–20:00).
    # TEnd permite T_entry+T_dur <= FIN_OP=40, por lo que un turno puede terminar
    # exactamente a las 20:00 cubriendo el slot 39 sin problema.
    slots_wd  = {s for s,v in dem_wd.items()  if v > 0 and INICIO_OP <= s < FIN_OP}
    slots_sat = {s for s,v in dem_sat.items() if v > 0 and INICIO_OP_SAT <= s < FIN_OP_SAT}

    # ── Debug log ────────────────────────────────────────────────────────────
    import sys
    print(f"[SOLVER] Lun-Vie: {hora_ap}–{hora_ci} (slots {INICIO_OP}–{FIN_OP}) | "
          f"Sáb: {hora_ap_sat}–{hora_ci_sat} (slots {INICIO_OP_SAT}–{FIN_OP_SAT}) | "
          f"turno {turno_min_sl/2}–{turno_max_sl/2}h P={P} N={N} "
          f"slots_wd={len(slots_wd)} slots_sat={len(slots_sat)}",
          flush=True, file=sys.stderr)

    # ── Problem ───────────────────────────────────────────────────────────────
    prob = pulp.LpProblem("CEM_v5", pulp.LpMinimize)

    # ── Shift type variables — SEPARADAS por día ──────────────────────────────
    # Semana (Lun-Vie): acotadas a INICIO_OP / FIN_OP
    T_entry_wd  = {k: pulp.LpVariable(f"TEW_{k}", lowBound=INICIO_OP,
                                       upBound=FIN_OP-turno_min_sl, cat='Integer') for k in K}
    T_dur_wd    = {k: pulp.LpVariable(f"TDW_{k}", lowBound=turno_min_sl,
                                       upBound=turno_max_sl, cat='Integer') for k in K}
    T_used_wd   = {k: pulp.LpVariable(f"TUW_{k}", cat='Binary') for k in K}

    # Sábado: acotadas a INICIO_OP_SAT / FIN_OP_SAT
    T_entry_sat = {k: pulp.LpVariable(f"TES_{k}", lowBound=INICIO_OP_SAT,
                                       upBound=FIN_OP_SAT-turno_min_sl, cat='Integer') for k in K}
    T_dur_sat   = {k: pulp.LpVariable(f"TDS_{k}", lowBound=turno_min_sl,
                                       upBound=turno_max_sl, cat='Integer') for k in K}
    T_used_sat  = {k: pulp.LpVariable(f"TUS_{k}", cat='Binary') for k in K}

    # ── Colación separada por día ─────────────────────────────────────────────
    COL_MIN_SL  = 10
    Has_col_wd  = {k: pulp.LpVariable(f"HCW_{k}", cat='Binary') for k in K}
    Has_col_sat = {k: pulp.LpVariable(f"HCS_{k}", cat='Binary') for k in K}

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

    # ── Slack ─────────────────────────────────────────────────────────────────
    PENALTY = 4
    SLK1_wd  = {s: pulp.LpVariable(f"SWD1_{s}", lowBound=0, upBound=1)
                for s in slots_wd  if dem_wd.get(s,0)  > 0}
    SLK2_wd  = {s: pulp.LpVariable(f"SWD2_{s}", lowBound=0)
                for s in slots_wd  if dem_wd.get(s,0)  > 0}
    SLK1_sat = {s: pulp.LpVariable(f"SST1_{s}", lowBound=0, upBound=1)
                for s in slots_sat if dem_sat.get(s,0) > 0}
    SLK2_sat = {s: pulp.LpVariable(f"SST2_{s}", lowBound=0)
                for s in slots_sat if dem_sat.get(s,0) > 0}

    # ── Horas brutas por ejecutivo ────────────────────────────────────────────
    H_wd  = {n: pulp.LpVariable(f"HWD_{si(n)}", lowBound=0, upBound=turno_max_sl) for n in nombres}
    H_sat = {n: pulp.LpVariable(f"HSAT_{si(n)}", lowBound=0, upBound=turno_max_sl) for n in nombres}

    # Linealizar A_wd[n,k] * Has_col_wd[k]  y  A_sat[n,k] * Has_col_sat[k]
    HCN_wd  = {(n,k): pulp.LpVariable(f"HCNWD_{si(n)}_{k}",  cat='Binary') for n in nombres for k in K}
    HCN_sat = {(n,k): pulp.LpVariable(f"HCNSAT_{si(n)}_{k}", cat='Binary') for n in nombres for k in K}

    # ── Objetivo ──────────────────────────────────────────────────────────────
    prob += (  pulp.lpSum(SLK1_wd.values())  + PENALTY*pulp.lpSum(SLK2_wd.values())
             + pulp.lpSum(SLK1_sat.values()) + PENALTY*pulp.lpSum(SLK2_sat.values())), "MinDeficit"

    # ── Asignación básica ─────────────────────────────────────────────────────
    for n in nombres:
        prob += pulp.lpSum(A_wd[n,k]  for k in K) == 1,        f"OneWD_{si(n)}"
        prob += pulp.lpSum(A_sat[n,k] for k in K) == W_sat[n], f"OneSat_{si(n)}"

    # ── Constraints de turno semana ───────────────────────────────────────────
    for k in K:
        for n in nombres:
            prob += A_wd[n,k] <= T_used_wd[k], f"TUW_{si(n)}_{k}"
        prob += T_entry_wd[k] + T_dur_wd[k] <= FIN_OP     + BIG_M*(1-T_used_wd[k]),  f"TEndW_{k}"
        prob += T_entry_wd[k]               >= INICIO_OP  - BIG_M*(1-T_used_wd[k]),  f"TStartW_{k}"
    for k in K[:-1]:
        prob += T_entry_wd[k] <= T_entry_wd[k+1] + BIG_M*(1-T_used_wd[k]), f"OrdW_{k}"

    # ── Constraints de turno sábado ───────────────────────────────────────────
    for k in K:
        for n in nombres:
            prob += A_sat[n,k] <= T_used_sat[k], f"TUS_{si(n)}_{k}"
        prob += T_entry_sat[k] + T_dur_sat[k] <= FIN_OP_SAT    + BIG_M*(1-T_used_sat[k]), f"TEndS_{k}"
        prob += T_entry_sat[k]                >= INICIO_OP_SAT - BIG_M*(1-T_used_sat[k]), f"TStartS_{k}"
    for k in K[:-1]:
        prob += T_entry_sat[k] <= T_entry_sat[k+1] + BIG_M*(1-T_used_sat[k]), f"OrdS_{k}"

    # ── Colación semana ───────────────────────────────────────────────────────
    for k in K:
        prob += T_dur_wd[k] >= COL_MIN_SL   - BIG_M*(1-Has_col_wd[k]),  f"HCW_lb_{k}"
        prob += T_dur_wd[k] <= COL_MIN_SL-1 + BIG_M*Has_col_wd[k],      f"HCW_ub_{k}"
        prob += Has_col_wd[k] <= T_used_wd[k],                            f"HCW_used_{k}"

    # ── Colación sábado ───────────────────────────────────────────────────────
    for k in K:
        prob += T_dur_sat[k] >= COL_MIN_SL   - BIG_M*(1-Has_col_sat[k]), f"HCS_lb_{k}"
        prob += T_dur_sat[k] <= COL_MIN_SL-1 + BIG_M*Has_col_sat[k],     f"HCS_ub_{k}"
        prob += Has_col_sat[k] <= T_used_sat[k],                           f"HCS_used_{k}"

    # ── Linealizar HCN ────────────────────────────────────────────────────────
    for n in nombres:
        for k in K:
            prob += HCN_wd[n,k]  <= A_wd[n,k],                    f"HCNWD_a_{si(n)}_{k}"
            prob += HCN_wd[n,k]  <= Has_col_wd[k],                f"HCNWD_h_{si(n)}_{k}"
            prob += HCN_wd[n,k]  >= A_wd[n,k]+Has_col_wd[k]-1,   f"HCNWD_l_{si(n)}_{k}"
            prob += HCN_sat[n,k] <= A_sat[n,k],                   f"HCNSAT_a_{si(n)}_{k}"
            prob += HCN_sat[n,k] <= Has_col_sat[k],               f"HCNSAT_h_{si(n)}_{k}"
            prob += HCN_sat[n,k] >= A_sat[n,k]+Has_col_sat[k]-1,  f"HCNSAT_l_{si(n)}_{k}"

    # ── Linealizar H_wd / H_sat ───────────────────────────────────────────────
    for n in nombres:
        for k in K:
            prob += H_wd[n]  >= T_dur_wd[k]  - BIG_M*(1-A_wd[n,k]),  f"HWD_lb_{si(n)}_{k}"
            prob += H_wd[n]  <= T_dur_wd[k]  + BIG_M*(1-A_wd[n,k]),  f"HWD_ub_{si(n)}_{k}"
            prob += H_sat[n] >= T_dur_sat[k] - BIG_M*(1-A_sat[n,k]), f"HSAT_lb_{si(n)}_{k}"
            prob += H_sat[n] <= T_dur_sat[k] + BIG_M*(1-A_sat[n,k]), f"HSAT_ub_{si(n)}_{k}"
        prob += H_sat[n] <= turno_max_sl * W_sat[n], f"HSAT_bound_{si(n)}"

    # ── Horas semanales por ejecutivo ─────────────────────────────────────────
    for n in nombres:
        col_wd_n  = pulp.lpSum(HCN_wd[n,k]  for k in K)
        col_sat_n = pulp.lpSum(HCN_sat[n,k] for k in K)
        horas_trabajadas_n = 5*(H_wd[n] - col_wd_n) + (H_sat[n] - col_sat_n)
        prob += horas_trabajadas_n <= h_max[n] * 2,   f"HMax_{si(n)}"
        if horas_min > 0:
            prob += horas_trabajadas_n >= horas_min * 2, f"HMin_{si(n)}"

    # ── Cobertura semana ──────────────────────────────────────────────────────
    for n in nombres:
        for k in K:
            for s in slots_wd:
                c = COV_wd[n,k,s]
                prob += c <= A_wd[n,k],                                        f"CWD_a_{si(n)}_{k}_{s}"
                prob += T_entry_wd[k] <= s         + BIG_M*(1-c),             f"CWD_e_{si(n)}_{k}_{s}"
                prob += T_entry_wd[k]+T_dur_wd[k] >= s+1 - BIG_M*(1-c),      f"CWD_d_{si(n)}_{k}_{s}"
    for s in slots_wd:
        if dem_wd.get(s,0) <= 0: continue
        prob += pulp.lpSum(COV_wd[n,k,s] for n in nombres for k in K) + SLK1_wd[s] + SLK2_wd[s] >= dem_wd[s], f"CovWD_{s}"

    # ── Cobertura sábado ──────────────────────────────────────────────────────
    for n in nombres:
        for k in K:
            for s in slots_sat:
                c = COV_sat[n,k,s]
                prob += c <= A_sat[n,k],                                          f"CS_a_{si(n)}_{k}_{s}"
                prob += T_entry_sat[k] <= s          + BIG_M*(1-c),              f"CS_e_{si(n)}_{k}_{s}"
                prob += T_entry_sat[k]+T_dur_sat[k] >= s+1 - BIG_M*(1-c),       f"CS_d_{si(n)}_{k}_{s}"
    for s in slots_sat:
        if dem_sat.get(s,0) <= 0: continue
        prob += pulp.lpSum(COV_sat[n,k,s] for n in nombres for k in K) + SLK1_sat[s] + SLK2_sat[s] >= dem_sat[s], f"CovSat_{s}"

    # ── Apertura / Cierre semana (Lun-Vie) ───────────────────────────────────
    apertura_min     = int(cfg.get('apertura_min',     0))
    cierre_min       = int(cfg.get('cierre_min',       0))
    # Sábado: dotación mínima apertura y cierre con horario propio
    apertura_min_sat = int(cfg.get('apertura_min_sat', 0))
    cierre_min_sat   = int(cfg.get('cierre_min_sat',   0))

    s_apertura = INICIO_OP
    s_cierre   = FIN_OP - 1
    # Usar el slot de apertura/cierre real del sábado
    s_apertura_sat = INICIO_OP_SAT
    s_cierre_sat   = FIN_OP_SAT - 1

    if apertura_min > 0 and s_apertura in slots_wd:
        prob += (pulp.lpSum(COV_wd[n,k,s_apertura] for n in nombres for k in K)
                 >= apertura_min), "AperturaMin"
    if cierre_min > 0 and s_cierre in slots_wd:
        prob += (pulp.lpSum(COV_wd[n,k,s_cierre] for n in nombres for k in K)
                 >= cierre_min), "CierreMin"
    if apertura_min_sat > 0 and s_apertura_sat in slots_sat:
        prob += (pulp.lpSum(COV_sat[n,k,s_apertura_sat] for n in nombres for k in K)
                 >= apertura_min_sat), "AperturaMinSat"
    if cierre_min_sat > 0 and s_cierre_sat in slots_sat:
        prob += (pulp.lpSum(COV_sat[n,k,s_cierre_sat] for n in nombres for k in K)
                 >= cierre_min_sat), "CierreMinSat"

    # ── Solve ────────────────────────────────────────────────────────────────
    n_vars = len(prob.variables())
    n_cons = len(prob.constraints)
    print(f"[SOLVER] Tamaño problema: {n_vars} variables, {n_cons} restricciones", flush=True, file=sys.stderr)
    print("[SOLVER] Ejecutando solver CBC (timeLimit=120s)...", flush=True, file=sys.stderr)
    prob.solve(pulp.PULP_CBC_CMD(msg=0, timeLimit=120))
    v = pulp.value
    solver_status = pulp.LpStatus[prob.status]
    print(f"[SOLVER] Status: {solver_status}", flush=True, file=sys.stderr)

    # Verificar que haya solución incumbente (puede haber parcial tras timeLimit)
    has_incumbent = any(v(T_used_wd[k]) is not None for k in K)
    if prob.status == pulp.constants.LpStatusInfeasible or not has_incumbent:
        return {
            'status':   'infeasible',
            'mensaje':  f'Sin solución factible (status: {solver_status}). '
                        'Revisa parámetros: turno_min/max, puestos_max, horas ejecutivos.',
            'causas_posibles': [
                'Los turnos min/max no permiten cubrir el horario de operación con los ejecutivos disponibles.',
                'Las horas máximas de los ejecutivos son insuficientes para la demanda.',
                f'puestos_fisicos_max={P} puede ser demasiado bajo para {N} ejecutivos.',
            ],
            'sugerencias': [
                f'N={N} ejecutivos · P={P} tipos de turno · slots_wd={len(slots_wd)} · slots_sat={len(slots_sat)}',
                f'turno_min={turno_min_sl/2}h · turno_max={turno_max_sl/2}h · horas_min={horas_min}h',
            ],
        }

    # ── Colación offset por tipo de turno (semana y sábado por separado) ───────
    col_offset_wd  = {}
    col_offset_sat = {}
    for k in K:
        if v(T_used_wd[k]) > 0.5 and v(Has_col_wd[k]) > 0.5:
            col_offset_wd[k]  = int(round(v(T_dur_wd[k])))  // 2
        if v(T_used_sat[k]) > 0.5 and v(Has_col_sat[k]) > 0.5:
            col_offset_sat[k] = int(round(v(T_dur_sat[k]))) // 2

    # ── Extract shift types (semana) ──────────────────────────────────────────
    shift_types = []
    for k in K:
        if v(T_used_wd[k]) > 0.5:
            ent = int(round(v(T_entry_wd[k])))
            dur = int(round(v(T_dur_wd[k])))
            shift_types.append({'id':k, 'k':k,
                                 'entrada':slot_str(ent),
                                 'salida': slot_str(ent+dur),
                                 'duracion_h': dur*0.5,
                                 'colacion_offset': col_offset_wd.get(k)})

    # ── Extract assignments ───────────────────────────────────────────────────
    asig_wd  = {n: next((k for k in K if v(A_wd[n,k])  > 0.5), None) for n in nombres}
    asig_sat = {n: next((k for k in K if v(A_sat[n,k]) > 0.5), None) for n in nombres}

    # ── Build turnos (semana tipo genérica) ──────────────────────────────────
    turnos_out = []
    for n in nombres:
        k_wd  = asig_wd.get(n)
        k_sat = asig_sat.get(n)
        ent_wd  = int(round(v(T_entry_wd[k_wd])))   if k_wd  is not None else None
        dur_wd  = int(round(v(T_dur_wd[k_wd])))     if k_wd  is not None else None
        ent_sat = int(round(v(T_entry_sat[k_sat]))) if k_sat is not None else None
        dur_sat = int(round(v(T_dur_sat[k_sat])))   if k_sat is not None else None

        for label, dow in DIAS_SEMANA_TIPO:
            if dow == 'sábado':
                if v(W_sat[n]) > 0.5 and ent_sat is not None:
                    col_off_sat = col_offset_sat.get(k_sat)
                    worked_sat  = (dur_sat - (1 if col_off_sat is not None else 0)) * 0.5
                    turnos_out.append({
                        'ejecutivo':n,'semana':1,'fecha':label,'dia':dow,'libre':False,
                        'entrada':slot_str(ent_sat),'salida':slot_str(ent_sat+dur_sat),
                        'duracion_h':worked_sat,'colacion':col_off_sat is not None,
                        'colacion_offset': col_off_sat
                    })
                else:
                    turnos_out.append({'ejecutivo':n,'semana':1,'fecha':label,'dia':dow,'libre':True})
            else:  # Mon-Fri
                if ent_wd is not None:
                    col_off_wd = col_offset_wd.get(k_wd)
                    worked_wd  = (dur_wd - (1 if col_off_wd is not None else 0)) * 0.5
                    turnos_out.append({
                        'ejecutivo':n,'semana':1,'fecha':label,'dia':dow,'libre':False,
                        'entrada':slot_str(ent_wd),'salida':slot_str(ent_wd+dur_wd),
                        'duracion_h':worked_wd,'colacion':col_off_wd is not None,
                        'colacion_offset': col_off_wd
                    })
                else:
                    turnos_out.append({'ejecutivo':n,'semana':1,'fecha':label,'dia':dow,'libre':True})

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

    # semana_tipo for frontend compatibility
    semana_tipo = []
    for n in nombres:
        k_wd = asig_wd.get(n)
        if k_wd is None: continue
        ent = int(round(v(T_entry_wd[k_wd])))
        dur = int(round(v(T_dur_wd[k_wd])))
        dias_lab = DIAS_LABOR[:]
        if v(W_sat[n]) > 0.5 and asig_sat.get(n) is not None:
            dias_lab_all = dias_lab + ['sábado']
        else:
            dias_lab_all = dias_lab
        entradas = {d: slot_str(ent) for d in dias_lab}
        salidas  = {d: slot_str(ent+dur) for d in dias_lab}
        if v(W_sat[n]) > 0.5 and asig_sat.get(n) is not None:
            k_s = asig_sat[n]
            es = int(round(v(T_entry_sat[k_s]))); ds = int(round(v(T_dur_sat[k_s])))
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
        'semanas':           [semana_gen]
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

@app.route('/models/update/<model_id>', methods=['PUT'])
def models_update(model_id):
    """Sobrescribe los turnos/solver_result de un modelo existente (mantiene id y nombre)."""
    data   = request.get_json()
    models = load_models()
    idx    = next((i for i,m in enumerate(models) if m['id'] == model_id), None)
    if idx is None:
        return jsonify({'error': 'not found'}), 404
    models[idx].update({
        'descripcion':       data.get('descripcion', models[idx].get('descripcion', '')),
        'fecha':             time.strftime('%Y-%m-%d %H:%M'),
        'deficit_cobertura': data.get('solver_result', {}).get('deficit_cobertura',
                                      models[idx].get('deficit_cobertura')),
        'params':            data.get('params',        models[idx].get('params', {})),
        'solver_result':     data.get('solver_result', models[idx].get('solver_result', {})),
        'ejecutivos':        data.get('ejecutivos',    models[idx].get('ejecutivos', [])),
    })
    save_models_to_disk(models)
    return jsonify({'status': 'ok', 'id': model_id})

@app.route('/models/delete/<model_id>', methods=['DELETE'])
def models_delete(model_id):
    models = load_models()
    models = [m for m in models if m['id'] != model_id]
    save_models_to_disk(models)
    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    print("="*50)
    print("  CEM Capacity Planner v4.1-fix")
    print("  http://127.0.0.1:5050")
    print("="*50)
    app.run(port=5050, debug=False, threaded=True)