@echo off
REM =============================================================================
REM Imperio Viral - arranque local en Windows
REM
REM DOBLE-CLICK aqui para arrancar la app en http://localhost:3000
REM
REM Para detenerla: cerra esta ventana o presiona Ctrl+C dos veces.
REM Si cambiaste codigo, corre antes "Imperio Viral - rebuild.bat"
REM =============================================================================

setlocal
cd /d "%~dp0"

echo.
echo ==========================================
echo   Imperio Viral - arranque local
echo ==========================================
echo.

REM ---- Verificar Node ----
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js no esta instalado.
    echo Descargalo desde https://nodejs.org/ ^(version LTS^) y volve a intentar.
    echo.
    pause
    exit /b 1
)

REM ---- Verificar .env ----
if not exist ".env" (
    echo [ERROR] No existe el archivo .env en esta carpeta:
    echo   %CD%
    echo Sin .env la app no puede conectarse a la base de datos.
    echo.
    pause
    exit /b 1
)

REM ---- Verificar puerto 3000 libre ----
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul
if not errorlevel 1 (
    echo [AVISO] Ya hay algo corriendo en el puerto 3000.
    echo Puede ser otra instancia de la app. Cierrala antes o presiona
    echo Ctrl+C para salir y revisar.
    echo.
    pause
)

REM ---- Instalar dependencias si faltan ----
if not exist "node_modules\" (
    echo Instalando dependencias por primera vez ^(2-3 minutos^)...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Fallo npm install. Revisa el mensaje arriba.
        pause
        exit /b 1
    )
)

REM ---- Compilar si no hay build previo ----
if not exist ".next\BUILD_ID" (
    echo Compilando la app por primera vez ^(1-2 minutos^)...
    call npm run build
    if errorlevel 1 (
        echo [ERROR] Fallo el build. Revisa el mensaje arriba.
        pause
        exit /b 1
    )
)

REM ---- Abrir navegador despues de unos segundos ----
start "" /min cmd /c "timeout /t 6 >nul && start http://localhost:3000"

echo.
echo ==========================================
echo   Arrancando servidor en http://localhost:3000
echo   ^(el navegador se abre solo en 6 segundos^)
echo.
echo   Para detener: cerra esta ventana
echo ==========================================
echo.

call npm start

endlocal
