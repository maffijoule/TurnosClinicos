#!/bin/bash
echo "Instalando dependencias..."
pip install flask pulp --quiet
echo ""
echo "Iniciando CEM Capacity Planner..."
echo "Abre tu navegador en: http://localhost:5050"
echo ""
cd "$(dirname "$0")"
python3 app.py
