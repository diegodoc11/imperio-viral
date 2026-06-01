#!/usr/bin/env bash
# =============================================================================
# Imperio Viral — arranque local en macOS
# =============================================================================
#
# QUÉ HACE ESTE SCRIPT:
#   1. Verifica que tengas Node.js 20 o superior (lo instala si falta)
#   2. Comprueba que el archivo .env esté en la carpeta
#   3. Instala las dependencias del proyecto (la primera vez tarda ~3 min)
#   4. Compila la app en modo producción (~1-2 min)
#   5. Arranca el servidor en http://localhost:3000
#
# CÓMO USARLO (primera vez):
#   1. Descomprime el ZIP completo en una carpeta. Por ejemplo:
#        ~/Documentos/imperio-viral/
#
#   2. Copia el archivo .env (te lo envió Diego por canal privado) y guárdalo
#      DENTRO de esa misma carpeta, junto a este script.
#
#   3. Abre la app Terminal (Spotlight → escribe "Terminal" → Enter).
#
#   4. Entra a la carpeta del proyecto. Si la descomprimiste en Documentos:
#        cd ~/Documentos/imperio-viral
#
#   5. Corre el script:
#        bash start-mac.sh
#
#   6. Espera a ver el mensaje "Ready - started server on http://localhost:3000".
#      Después abre esa URL en cualquier navegador.
#
# CÓMO PARAR EL SERVIDOR:
#   Presiona Control + C en la Terminal donde está corriendo.
#
# SI ALGO FALLA:
#   El script para apenas detecta un error y te dice qué pasó.
#   Avísale a Diego con el último mensaje rojo que viste.
# =============================================================================

set -e

cd "$(dirname "$0")"

echo ""
echo "=========================================="
echo "  Imperio Viral — arranque local"
echo "=========================================="
echo ""

# -----------------------------------------------------------------------------
# 1. Verificar Node.js
# -----------------------------------------------------------------------------
echo "→ Paso 1/4: Verificando Node.js..."

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  ✗ Node.js no está instalado en este Mac."
  echo ""

  if ! command -v brew >/dev/null 2>&1; then
    echo "  Tampoco tienes Homebrew (el instalador de paquetes para Mac)."
    echo "  Para instalarlo, copia y pega este comando en la Terminal:"
    echo ""
    echo '    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
    echo ""
    echo "  Cuando termine la instalación de Homebrew, vuelve a correr:"
    echo "    bash start-mac.sh"
    exit 1
  fi

  echo "  Instalando Node.js con Homebrew (puede tardar 2-3 minutos)..."
  brew install node@20
  brew link --overwrite --force node@20
fi

NODE_VERSION=$(node -v)
NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/v\([0-9]*\).*/\1/')

if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "  ✗ Tu versión de Node es $NODE_VERSION. La app necesita Node 20 o superior."
  echo ""
  if command -v brew >/dev/null 2>&1; then
    echo "  Actualízalo con:"
    echo "    brew install node@20 && brew link --overwrite --force node@20"
  else
    echo "  Descarga la versión LTS desde: https://nodejs.org/"
  fi
  exit 1
fi

echo "  ✓ Node $NODE_VERSION OK"

# -----------------------------------------------------------------------------
# 2. Verificar .env
# -----------------------------------------------------------------------------
echo ""
echo "→ Paso 2/4: Verificando archivo .env..."

if [ ! -f ".env" ]; then
  echo ""
  echo "  ✗ No encontré el archivo .env en esta carpeta:"
  echo "      $(pwd)"
  echo ""
  echo "  Pídele a Diego que te lo envíe (por canal privado, no por correo)"
  echo "  y guárdalo aquí mismo. Después vuelve a correr:"
  echo "    bash start-mac.sh"
  exit 1
fi

echo "  ✓ .env encontrado"

# -----------------------------------------------------------------------------
# 3. Instalar dependencias
# -----------------------------------------------------------------------------
echo ""
echo "→ Paso 3/4: Instalando dependencias..."

if [ -d "node_modules" ]; then
  echo "  Ya tienes node_modules. Saltando instalación."
  echo "  (Si quieres reinstalar desde cero, borra la carpeta node_modules"
  echo "   y vuelve a correr este script.)"
else
  echo "  Instalando paquetes (la primera vez tarda ~3 minutos)..."
  npm install
fi

echo "  ✓ Dependencias listas"

# -----------------------------------------------------------------------------
# 4. Compilar la app
# -----------------------------------------------------------------------------
echo ""
echo "→ Paso 4/4: Compilando la app en modo producción (~1-2 min)..."
npm run build
echo "  ✓ Build completado"

# -----------------------------------------------------------------------------
# 5. Arrancar el servidor
# -----------------------------------------------------------------------------
echo ""
echo "=========================================="
echo "  Listo. Arrancando el servidor..."
echo ""
echo "  Cuando veas 'Ready', abre en tu navegador:"
echo "    http://localhost:3000"
echo ""
echo "  Para detenerlo, presiona Control + C aquí."
echo "=========================================="
echo ""

npm start
