@echo off
setlocal

REM ==============================================================================
REM   CREAR TAREA PROGRAMADA EN WINDOWS (RESPALDO AUTOMÁTICO DIARIO A LAS 20:00)
REM ==============================================================================

for %%I in ("%~dp0..") do set "PROJECT_ROOT=%%~fI"
set "TASK_NAME=TiendaExpress_RespaldoBD"
set "SCRIPT_PATH=%~dp0hacer-respaldo.bat"
set "BACKUP_DIR=%PROJECT_ROOT%\backups"
set "HORA=20:00"

echo ============================================================
echo   CONFIGURADOR DE RESPALDO AUTOMATICO (TAREA DE WINDOWS)
echo ============================================================
echo Tarea a crear: %TASK_NAME%
echo Hora diaria de respaldo: %HORA% (08:00 PM)
echo Script: %SCRIPT_PATH%
echo.

REM Crear o reemplazar la tarea en el Programador de Tareas de Windows
schtasks /create /tn "%TASK_NAME%" /tr "\"%SCRIPT_PATH%\" --silent" /sc daily /st %HORA% /f

if %errorlevel% equ 0 (
    echo.
    echo [EXITO] La tarea de respaldo automatico ha sido programada con exito.
    echo Se ejecutara todos los dias a las %HORA%.
    echo Los respaldos se guardaran en: %BACKUP_DIR%\
) else (
    echo.
    echo [AVISO] Si dio error de permisos, haz clic derecho en este archivo
    echo y selecciona "Ejecutar como administrador".
)

echo.
pause
