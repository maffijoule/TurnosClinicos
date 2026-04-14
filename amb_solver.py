"""
CEM Capacity Planner — Ambulatorio Blueprint
Rutas: /amb/ping, /amb/solve, /amb/models/*
"""
from flask import Blueprint, jsonify, request
import pulp
import traceback
import sys
import json
import os
import uuid
import time

amb_bp = Blueprint('ambulatorio', __name__)

# ── HELPERS ───────────────────────────────────────────────────────────────────
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

# ── ROUTES ────────────────────────────────────────────────────────────────────
@amb_bp.route('/amb/ping')
def amb_ping():
    return jsonify({'status': 'ok', 'module': 'ambulatorio'})

@amb_bp.route('/amb/solve', methods=['POST'])
def amb_solve():
    try:
        return jsonify(resolver(request.get_json()))
    except Exception as e:
        return jsonify({'status': 'error', 'mensaje': str(e),
                        'trace': traceback.format_exc()}), 500

# ── SOLVER ────────────────────────────────────────────────────────────────────
def resolver(data):
    si._cache = {}; _cnt[0] = 0

    ejecutivos = data['ejecutivos']
    demanda    = data['demanda']        # {dow: {HH:MM: float}}
    cfg        = data['configuracion']

    P            = int(cfg.get('puestos_fisicos_max', 4))
    turno_min_sl = int(float(cfg.get('turno_min_horas', 4)) * 2)
    turno_max_sl = int(float(cfg.get('turno_max_horas', 9)) * 2)
    hora_ap      = float(cfg.get('hora_apertura', 7))
    hora_ci      = float(cfg.get('hora_cierre', 21))
    INICIO_OP    = int(hora_ap * 2)
    FIN_OP       = int(hora_ci * 2)
    hora_ap_sat  = float(cfg.get('hora_apertura_sat', hora_ap))
    hora_ci_sat  = float(cfg.get('hora_cierre_sat', hora_ci))
    INICIO_OP_SAT = int(hora_ap_sat * 2)
    FIN_OP_SAT    = int(hora_ci_sat * 2)

    nombres   = [e['nombre'] for e in ejecutivos]
    h_max     = {e['nombre']: float(e['horas_semana']) for e in ejecutivos}
    horas_min = float(cfg.get('horas_min_ejecutivo', 0))
    N         = len(nombres)
    K         = list(range(P))
    BIG_M     = (max(FIN_OP, FIN_OP_SAT) - min(INICIO_OP, INICIO_OP_SAT)) + turno_max_sl + 2

    DIAS_SEMANA_TIPO = [('Lun','lunes'),('Mar','martes'),('Mié','miércoles'),
                        ('Jue','jueves'),('Vie','viernes'),('Sáb','sábado')]
    semana_gen   = {'semana': 1, 'dias': DIAS_SEMANA_TIPO}
    DIAS_LABOR   = ['lunes','martes','miércoles','jueves','viernes']

    # ── Demand profiles ───────────────────────────────────────────────────────
    dem_wd = {}
    for dow, slots in demanda.items():
        if dow not in DIAS_LABOR: continue
        for hora, val in slots.items():
            s = str_slot(hora)
            if s == FIN_OP:     s = FIN_OP - 1
            if s == FIN_OP_SAT: s = FIN_OP_SAT - 1
            dem_wd[s] = max(dem_wd.get(s, 0.0), float(val))

    dem_sat = {}
    if 'sábado' in demanda:
        for hora, val in demanda['sábado'].items():
            s = str_slot(hora)
            if s == FIN_OP_SAT: s = FIN_OP_SAT - 1
            v2 = float(val)
            if v2 > 0: dem_sat[s] = v2

    slots_wd  = {s for s,v in dem_wd.items()  if v > 0 and INICIO_OP <= s < FIN_OP}
    slots_sat = {s for s,v in dem_sat.items() if v > 0 and INICIO_OP_SAT <= s < FIN_OP_SAT}

    print(f"[AMB-SOLVER] Lun-Vie: {hora_ap}–{hora_ci} (slots {INICIO_OP}–{FIN_OP}) | "
          f"Sáb: {hora_ap_sat}–{hora_ci_sat} (slots {INICIO_OP_SAT}–{FIN_OP_SAT}) | "
          f"turno {turno_min_sl/2}–{turno_max_sl/2}h P={P} N={N} "
          f"slots_wd={len(slots_wd)} slots_sat={len(slots_sat)}",
          flush=True, file=sys.stderr)

    # ── Problem ───────────────────────────────────────────────────────────────
    prob = pulp.LpProblem("AMB_SemTipo", pulp.LpMinimize)

    T_entry_wd  = {k: pulp.LpVariable(f"TEW_{k}", lowBound=INICIO_OP,
                                       upBound=FIN_OP-turno_min_sl, cat='Integer') for k in K}
    T_dur_wd    = {k: pulp.LpVariable(f"TDW_{k}", lowBound=turno_min_sl,
                                       upBound=turno_max_sl, cat='Integer') for k in K}
    T_used_wd   = {k: pulp.LpVariable(f"TUW_{k}", cat='Binary') for k in K}

    T_entry_sat = {k: pulp.LpVariable(f"TES_{k}", lowBound=INICIO_OP_SAT,
                                       upBound=FIN_OP_SAT-turno_min_sl, cat='Integer') for k in K}
    T_dur_sat   = {k: pulp.LpVariable(f"TDS_{k}", lowBound=turno_min_sl,
                                       upBound=turno_max_sl, cat='Integer') for k in K}
    T_used_sat  = {k: pulp.LpVariable(f"TUS_{k}", cat='Binary') for k in K}

    COL_MIN_SL  = 13   # 6.5 h en slots de 30 min
    Has_col_wd  = {k: pulp.LpVariable(f"HCW_{k}", cat='Binary') for k in K}
    Has_col_sat = {k: pulp.LpVariable(f"HCS_{k}", cat='Binary') for k in K}

    A_wd  = {(n,k): pulp.LpVariable(f"AWD_{si(n)}_{k}", cat='Binary')
             for n in nombres for k in K}
    W_sat = {n: pulp.LpVariable(f"WS_{si(n)}", cat='Binary') for n in nombres}
    A_sat = {(n,k): pulp.LpVariable(f"AS_{si(n)}_{k}", cat='Binary')
             for n in nombres for k in K}

    COV_wd  = {(n,k,s): pulp.LpVariable(f"CWD_{si(n)}_{k}_{s}", cat='Binary')
               for n in nombres for k in K for s in slots_wd}
    COV_sat = {(n,k,s): pulp.LpVariable(f"CS_{si(n)}_{k}_{s}", cat='Binary')
               for n in nombres for k in K for s in slots_sat}

    PENALTY = 4
    SLK1_wd  = {s: pulp.LpVariable(f"SWD1_{s}", lowBound=0, upBound=1)
                for s in slots_wd  if dem_wd.get(s,0)  > 0}
    SLK2_wd  = {s: pulp.LpVariable(f"SWD2_{s}", lowBound=0)
                for s in slots_wd  if dem_wd.get(s,0)  > 0}
    SLK1_sat = {s: pulp.LpVariable(f"SST1_{s}", lowBound=0, upBound=1)
                for s in slots_sat if dem_sat.get(s,0) > 0}
    SLK2_sat = {s: pulp.LpVariable(f"SST2_{s}", lowBound=0)
                for s in slots_sat if dem_sat.get(s,0) > 0}

    H_wd  = {n: pulp.LpVariable(f"HWD_{si(n)}", lowBound=0, upBound=turno_max_sl) for n in nombres}
    H_sat = {n: pulp.LpVariable(f"HSAT_{si(n)}", lowBound=0, upBound=turno_max_sl) for n in nombres}
    HCN_wd  = {(n,k): pulp.LpVariable(f"HCNWD_{si(n)}_{k}",  cat='Binary') for n in nombres for k in K}
    HCN_sat = {(n,k): pulp.LpVariable(f"HCNSAT_{si(n)}_{k}", cat='Binary') for n in nombres for k in K}

    # ── Objetivo ──────────────────────────────────────────────────────────────
    prob += (  pulp.lpSum(SLK1_wd.values())  + PENALTY*pulp.lpSum(SLK2_wd.values())
             + pulp.lpSum(SLK1_sat.values()) + PENALTY*pulp.lpSum(SLK2_sat.values())), "MinDeficit"

    # ── Asignación ───────────────────────────────────────────────────────────
    for n in nombres:
        prob += pulp.lpSum(A_wd[n,k]  for k in K) == 1,        f"OneWD_{si(n)}"
        prob += pulp.lpSum(A_sat[n,k] for k in K) == W_sat[n], f"OneSat_{si(n)}"

    # ── Turno semana ──────────────────────────────────────────────────────────
    for k in K:
        for n in nombres:
            prob += A_wd[n,k] <= T_used_wd[k], f"TUW_{si(n)}_{k}"
        prob += T_entry_wd[k]+T_dur_wd[k] <= FIN_OP    + BIG_M*(1-T_used_wd[k]), f"TEndW_{k}"
        prob += T_entry_wd[k]             >= INICIO_OP - BIG_M*(1-T_used_wd[k]), f"TStartW_{k}"
    for k in K[:-1]:
        prob += T_entry_wd[k] <= T_entry_wd[k+1]+BIG_M*(1-T_used_wd[k]), f"OrdW_{k}"

    # ── Turno sábado ─────────────────────────────────────────────────────────
    for k in K:
        for n in nombres:
            prob += A_sat[n,k] <= T_used_sat[k], f"TUS_{si(n)}_{k}"
        prob += T_entry_sat[k]+T_dur_sat[k] <= FIN_OP_SAT    + BIG_M*(1-T_used_sat[k]), f"TEndS_{k}"
        prob += T_entry_sat[k]              >= INICIO_OP_SAT - BIG_M*(1-T_used_sat[k]), f"TStartS_{k}"
    for k in K[:-1]:
        prob += T_entry_sat[k] <= T_entry_sat[k+1]+BIG_M*(1-T_used_sat[k]), f"OrdS_{k}"

    # ── Colación ─────────────────────────────────────────────────────────────
    for k in K:
        prob += T_dur_wd[k]  >= COL_MIN_SL   - BIG_M*(1-Has_col_wd[k]),  f"HCW_lb_{k}"
        prob += T_dur_wd[k]  <= COL_MIN_SL-1 + BIG_M*Has_col_wd[k],      f"HCW_ub_{k}"
        prob += Has_col_wd[k]  <= T_used_wd[k],                            f"HCW_used_{k}"
        prob += T_dur_sat[k] >= COL_MIN_SL   - BIG_M*(1-Has_col_sat[k]), f"HCS_lb_{k}"
        prob += T_dur_sat[k] <= COL_MIN_SL-1 + BIG_M*Has_col_sat[k],     f"HCS_ub_{k}"
        prob += Has_col_sat[k] <= T_used_sat[k],                           f"HCS_used_{k}"

    # ── Linealizar HCN ────────────────────────────────────────────────────────
    for n in nombres:
        for k in K:
            prob += HCN_wd[n,k]  <= A_wd[n,k];  prob += HCN_wd[n,k]  <= Has_col_wd[k];  prob += HCN_wd[n,k]  >= A_wd[n,k]+Has_col_wd[k]-1
            prob += HCN_sat[n,k] <= A_sat[n,k]; prob += HCN_sat[n,k] <= Has_col_sat[k]; prob += HCN_sat[n,k] >= A_sat[n,k]+Has_col_sat[k]-1

    # ── Linealizar H_wd / H_sat ───────────────────────────────────────────────
    for n in nombres:
        for k in K:
            prob += H_wd[n]  >= T_dur_wd[k]  - BIG_M*(1-A_wd[n,k]),  f"HWD_lb_{si(n)}_{k}"
            prob += H_wd[n]  <= T_dur_wd[k]  + BIG_M*(1-A_wd[n,k]),  f"HWD_ub_{si(n)}_{k}"
            prob += H_sat[n] >= T_dur_sat[k] - BIG_M*(1-A_sat[n,k]), f"HSAT_lb_{si(n)}_{k}"
            prob += H_sat[n] <= T_dur_sat[k] + BIG_M*(1-A_sat[n,k]), f"HSAT_ub_{si(n)}_{k}"
        prob += H_sat[n] <= turno_max_sl * W_sat[n], f"HSAT_bound_{si(n)}"

    # ── Horas semanales ───────────────────────────────────────────────────────
    for n in nombres:
        col_wd_n  = pulp.lpSum(HCN_wd[n,k]  for k in K)
        col_sat_n = pulp.lpSum(HCN_sat[n,k] for k in K)
        horas_trab = 5*(H_wd[n]-col_wd_n) + (H_sat[n]-col_sat_n)
        prob += horas_trab <= h_max[n]*2, f"HMax_{si(n)}"
        if horas_min > 0: prob += horas_trab >= horas_min*2, f"HMin_{si(n)}"

    # ── Cobertura semana ──────────────────────────────────────────────────────
    for n in nombres:
        for k in K:
            for s in slots_wd:
                c = COV_wd[n,k,s]
                prob += c <= A_wd[n,k],                                    f"CWD_a_{si(n)}_{k}_{s}"
                prob += T_entry_wd[k] <= s         + BIG_M*(1-c),         f"CWD_e_{si(n)}_{k}_{s}"
                prob += T_entry_wd[k]+T_dur_wd[k] >= s+1 - BIG_M*(1-c),  f"CWD_d_{si(n)}_{k}_{s}"
    for s in slots_wd:
        if dem_wd.get(s,0) <= 0: continue
        prob += pulp.lpSum(COV_wd[n,k,s] for n in nombres for k in K) + SLK1_wd[s]+SLK2_wd[s] >= dem_wd[s], f"CovWD_{s}"

    # ── Cobertura sábado ──────────────────────────────────────────────────────
    for n in nombres:
        for k in K:
            for s in slots_sat:
                c = COV_sat[n,k,s]
                prob += c <= A_sat[n,k],                                      f"CS_a_{si(n)}_{k}_{s}"
                prob += T_entry_sat[k] <= s          + BIG_M*(1-c),          f"CS_e_{si(n)}_{k}_{s}"
                prob += T_entry_sat[k]+T_dur_sat[k] >= s+1 - BIG_M*(1-c),   f"CS_d_{si(n)}_{k}_{s}"
    for s in slots_sat:
        if dem_sat.get(s,0) <= 0: continue
        prob += pulp.lpSum(COV_sat[n,k,s] for n in nombres for k in K) + SLK1_sat[s]+SLK2_sat[s] >= dem_sat[s], f"CovSat_{s}"

    # ── Apertura / Cierre ─────────────────────────────────────────────────────
    apertura_min     = int(cfg.get('apertura_min',     0))
    cierre_min       = int(cfg.get('cierre_min',       0))
    apertura_min_sat = int(cfg.get('apertura_min_sat', 0))
    cierre_min_sat   = int(cfg.get('cierre_min_sat',   0))
    if apertura_min > 0 and INICIO_OP in slots_wd:
        prob += pulp.lpSum(COV_wd[n,k,INICIO_OP] for n in nombres for k in K) >= apertura_min, "AperturaMin"
    if cierre_min > 0 and (FIN_OP-1) in slots_wd:
        prob += pulp.lpSum(COV_wd[n,k,FIN_OP-1] for n in nombres for k in K) >= cierre_min, "CierreMin"
    if apertura_min_sat > 0 and INICIO_OP_SAT in slots_sat:
        prob += pulp.lpSum(COV_sat[n,k,INICIO_OP_SAT] for n in nombres for k in K) >= apertura_min_sat, "AperturaMinSat"
    if cierre_min_sat > 0 and (FIN_OP_SAT-1) in slots_sat:
        prob += pulp.lpSum(COV_sat[n,k,FIN_OP_SAT-1] for n in nombres for k in K) >= cierre_min_sat, "CierreMinSat"

    # ── Solve ─────────────────────────────────────────────────────────────────
    n_vars = len(prob.variables())
    n_cons = len(prob.constraints)
    print(f"[AMB-SOLVER] {n_vars} vars · {n_cons} constraints", flush=True, file=sys.stderr)
    prob.solve(pulp.PULP_CBC_CMD(msg=0, timeLimit=120))
    v = pulp.value
    solver_status = pulp.LpStatus[prob.status]
    print(f"[AMB-SOLVER] Status: {solver_status}", flush=True, file=sys.stderr)

    has_incumbent = any(v(T_used_wd[k]) is not None for k in K)
    if prob.status == pulp.constants.LpStatusInfeasible or not has_incumbent:
        return {
            'status':  'infeasible',
            'mensaje': f'Sin solución factible ({solver_status}). Revisa turno_min/max, puestos_max, horas ejecutivos.',
            'causas_posibles': [
                'Los turnos min/max no permiten cubrir el horario con los ejecutivos disponibles.',
                'Las horas máximas de los ejecutivos son insuficientes para la demanda.',
                f'puestos_fisicos_max={P} puede ser demasiado bajo para {N} ejecutivos.',
            ],
            'sugerencias': [
                f'N={N} ejecutivos · P={P} tipos · slots_wd={len(slots_wd)} · slots_sat={len(slots_sat)}',
                f'turno_min={turno_min_sl/2}h · turno_max={turno_max_sl/2}h · horas_min={horas_min}h',
            ],
        }

    # ── Extraer resultados ────────────────────────────────────────────────────
    col_offset_wd  = {k: int(round(v(T_dur_wd[k])))//2  for k in K if v(T_used_wd[k])>0.5 and v(Has_col_wd[k])>0.5}
    col_offset_sat = {k: int(round(v(T_dur_sat[k])))//2 for k in K if v(T_used_sat[k])>0.5 and v(Has_col_sat[k])>0.5}

    shift_types = []
    for k in K:
        if v(T_used_wd[k]) > 0.5:
            ent = int(round(v(T_entry_wd[k]))); dur = int(round(v(T_dur_wd[k])))
            shift_types.append({'id':k,'k':k,'entrada':slot_str(ent),'salida':slot_str(ent+dur),
                                 'duracion_h':dur*0.5,'colacion_offset':col_offset_wd.get(k)})

    asig_wd  = {n: next((k for k in K if v(A_wd[n,k])  > 0.5), None) for n in nombres}
    asig_sat = {n: next((k for k in K if v(A_sat[n,k]) > 0.5), None) for n in nombres}

    turnos_out = []
    for n in nombres:
        k_wd  = asig_wd.get(n);  k_sat = asig_sat.get(n)
        ent_wd  = int(round(v(T_entry_wd[k_wd])))   if k_wd  is not None else None
        dur_wd  = int(round(v(T_dur_wd[k_wd])))     if k_wd  is not None else None
        ent_sat = int(round(v(T_entry_sat[k_sat]))) if k_sat is not None else None
        dur_sat = int(round(v(T_dur_sat[k_sat])))   if k_sat is not None else None

        for label, dow in DIAS_SEMANA_TIPO:
            if dow == 'sábado':
                if v(W_sat[n]) > 0.5 and ent_sat is not None:
                    col_off = col_offset_sat.get(k_sat)
                    worked  = (dur_sat - (1 if col_off is not None else 0)) * 0.5
                    turnos_out.append({'ejecutivo':n,'semana':1,'fecha':label,'dia':dow,'libre':False,
                        'entrada':slot_str(ent_sat),'salida':slot_str(ent_sat+dur_sat),
                        'duracion_h':worked,'colacion':col_off is not None,'colacion_offset':col_off})
                else:
                    turnos_out.append({'ejecutivo':n,'semana':1,'fecha':label,'dia':dow,'libre':True})
            else:
                if ent_wd is not None:
                    col_off = col_offset_wd.get(k_wd)
                    worked  = (dur_wd - (1 if col_off is not None else 0)) * 0.5
                    turnos_out.append({'ejecutivo':n,'semana':1,'fecha':label,'dia':dow,'libre':False,
                        'entrada':slot_str(ent_wd),'salida':slot_str(ent_wd+dur_wd),
                        'duracion_h':worked,'colacion':col_off is not None,'colacion_offset':col_off})
                else:
                    turnos_out.append({'ejecutivo':n,'semana':1,'fecha':label,'dia':dow,'libre':True})

    horas_out = {n:{} for n in nombres}
    for t in turnos_out:
        if t['libre']: continue
        horas_out[t['ejecutivo']]['semana_1'] = horas_out[t['ejecutivo']].get('semana_1',0) + t['duracion_h']
    for n in nombres:
        horas_out[n]['total'] = horas_out[n].get('semana_1', 0)

    deficit = (sum(v(sv) or 0 for sv in SLK1_wd.values())  + sum(v(sv) or 0 for sv in SLK2_wd.values()) +
               sum(v(sv) or 0 for sv in SLK1_sat.values()) + sum(v(sv) or 0 for sv in SLK2_sat.values()))

    return {
        'status':            'ok',
        'inicio_op':         INICIO_OP,
        'fin_op':            FIN_OP,
        'solver_status':     solver_status,
        'deficit_cobertura': round(deficit, 2),
        'shift_types':       shift_types,
        'semana_tipo':       [],
        'turnos':            turnos_out,
        'horas_ejecutivo':   horas_out,
        'dem_wd_profile':    {slot_str(s): dem_wd[s]         for s in sorted(dem_wd)  if dem_wd[s]  > 0},
        'dem_sat_profile':   {slot_str(s): dem_sat.get(s,0)  for s in sorted(slots_sat)},
        'semanas':           [semana_gen],
    }

# ── MODELS ────────────────────────────────────────────────────────────────────
MODELS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'amb_models.json')

def load_models():
    try:
        with open(MODELS_FILE) as f: return json.load(f)
    except: return []

def save_models_to_disk(models):
    os.makedirs(os.path.dirname(MODELS_FILE), exist_ok=True)
    with open(MODELS_FILE, 'w') as f:
        json.dump(models, f, ensure_ascii=False, indent=2)

@amb_bp.route('/amb/models/list')
def amb_models_list():
    models = load_models()
    return jsonify([{
        'id': m['id'], 'nombre': m['nombre'], 'descripcion': m['descripcion'],
        'fecha': m['fecha'], 'deficit': m.get('deficit_cobertura', '-'),
        'mes': m.get('params', {}).get('mes'), 'anio': m.get('params', {}).get('anio'),
        'n_ejecutivos': m.get('params', {}).get('n_ejecutivos'),
    } for m in models])

@amb_bp.route('/amb/models/save', methods=['POST'])
def amb_models_save():
    data = request.get_json(); models = load_models()
    model = {
        'id': str(uuid.uuid4())[:8], 'nombre': data.get('nombre', 'Sin nombre'),
        'descripcion': data.get('descripcion', ''), 'fecha': time.strftime('%Y-%m-%d %H:%M'),
        'deficit_cobertura': data.get('solver_result', {}).get('deficit_cobertura'),
        'params': data.get('params', {}), 'solver_result': data.get('solver_result', {}),
        'ejecutivos': data.get('ejecutivos', []),
    }
    models.insert(0, model); save_models_to_disk(models)
    return jsonify({'status': 'ok', 'id': model['id']})

@amb_bp.route('/amb/models/get/<model_id>')
def amb_models_get(model_id):
    model = next((m for m in load_models() if m['id'] == model_id), None)
    if not model: return jsonify({'error': 'not found'}), 404
    return jsonify(model)

@amb_bp.route('/amb/models/update/<model_id>', methods=['PUT'])
def amb_models_update(model_id):
    data = request.get_json(); models = load_models()
    idx = next((i for i,m in enumerate(models) if m['id'] == model_id), None)
    if idx is None: return jsonify({'error': 'not found'}), 404
    models[idx].update({
        'descripcion':       data.get('descripcion', models[idx].get('descripcion', '')),
        'fecha':             time.strftime('%Y-%m-%d %H:%M'),
        'deficit_cobertura': data.get('solver_result', {}).get('deficit_cobertura', models[idx].get('deficit_cobertura')),
        'params':            data.get('params',        models[idx].get('params', {})),
        'solver_result':     data.get('solver_result', models[idx].get('solver_result', {})),
        'ejecutivos':        data.get('ejecutivos',    models[idx].get('ejecutivos', [])),
    })
    save_models_to_disk(models)
    return jsonify({'status': 'ok', 'id': model_id})

@amb_bp.route('/amb/models/delete/<model_id>', methods=['DELETE'])
def amb_models_delete(model_id):
    models = [m for m in load_models() if m['id'] != model_id]
    save_models_to_disk(models)
    return jsonify({'status': 'ok'})
