@echo off
REM =============================================================================
REM Imperio Viral - rebuild + arranque
REM
REM Usa este SOLO si cambiaste codigo del proyecto y necesitas que la app
REM refleje los cambios. Tarda ~1-2 minutos extra que el otro arranque.
REM
REM Si solo queres correr la app sin cambios, usa "Imperio Viral.bat".
REM =============================================================================

setlocal
cd /d "%~dp0"

echo.
echo ==========================================
echo   Imperio Viral - rebuild + arranque
echo ==========================================
echo.

REM ---- Verificar Node ----
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js no esta instalado.
    pause
    exit /b 1
)

REM ---- Verificar .env ----
if not exist ".env" (
    echo [ERROR] No existe .env en esta carpeta.
    pause
    exit /b 1
)

REM ---- Borrar build viejo ----
if exist ".next\" (
    echo Borrando build anterior...
    rmdir /s /q ".next"
)

REM ---- Instalar dependencias si faltan ----
if not exist "node_modules\" (
    echo Instalando dependencias...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Fallo npm install.
        pause
        exit /b 1
    )
)

REM ---- Compilar ----
echo Compilando la app...
call npm run build
if errorlevel 1 (
    echo [ERROR] Fallo el build.
    pause
    exit /b 1
)

REM ---- Abrir navegador ----
start "" /min cmd /c "timeout /t 6 >nul && start http://localhost:3000"

echo.
echo ==========================================
echo   Arrancando en http://localhost:3000
echo   Para detener: cerra esta ventana
echo ==========================================
echo.

call npm start

endlocal
