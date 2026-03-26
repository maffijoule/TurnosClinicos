@echo off
echo Limpiando cache de Python...
rd /s /q __pycache__ 2>nul
del /q *.pyc 2>nul

echo Instalando dependencias...
pip install flask pulp --quiet
echo.
echo Iniciando CEM Capacity Planner...
echo Abre tu navegador en: http://localhost:5050
echo.
cd /d "%~dp0"
python app.py
pause