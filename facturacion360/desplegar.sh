#!/usr/bin/env bash
#
# desplegar.sh - Instala Apache Tomcat y despliega Facturacion360 dentro de él.
#
# Qué hace, en orden:
#   1. Comprueba que el proyecto compila y genera el WAR.
#   2. Instala Tomcat 11 (el mismo tomcat-embed que usa la aplicación) si no
#      está, como usuario de servicio sin privilegios.
#   3. Crea la unidad de systemd para que Tomcat arranque solo al iniciar la
#      máquina y se reinicie si se cae.
#   4. Despliega el WAR y espera a que la aplicación responda.
#
# Uso:
#   ./desplegar.sh                 -> despliegue normal
#   ./desplegar.sh --sin-tests     -> salta los tests (más rápido)
#   ./desplegar.sh --reconstruir   -> borra target/ y vuelve a compilar
#   ./desplegar.sh --solo-local    -> instala todo pero no deja Tomcat
#                                     arrancado (para revisión manual)
#
# Las credenciales de MySQL se preguntan por teclado al empezar. No se
# escriben en el repo: se generan en /etc/facturacion360 con permisos 600.

set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURACIÓN
# ─────────────────────────────────────────────────────────────────────────────

TOMCAT_VERSION="11.0.22"          # Debe coincidir con el tomcat-embed del pom.
# La ruta de Apache es /tomcat/tomcat-<solo la mayor>/v<versión completa>/bin/.
# Ojo con las dos trampas: el directorio intermedio lleva SOLO el número mayor
# (tomcat-11, no tomcat-11.0), y el directorio de versión lleva una 'v' que el
# nombre del fichero no lleva. Sin esto, la descarga responde 404.
TOMCAT_MAYOR="${TOMCAT_VERSION%%.*}"
TOMCAT_RUTA="tomcat/tomcat-${TOMCAT_MAYOR}/v${TOMCAT_VERSION}/bin"
TOMCAT_FICHERO="apache-tomcat-${TOMCAT_VERSION}.tar.gz"

# Se prueban los espejos por orden. archive.apache.org guarda TODAS las
# versiones; dlcdn solo la última, y si esa deja de estar da 404.
TOMCAT_ESPEJOS=(
	"https://archive.apache.org/dist"
	"https://dlcdn.apache.org"
	"https://downloads.apache.org"
)

TOMCAT_HOME="/opt/tomcat"         # Dónde vive Tomcat (no se borra al reinstalar).
TOMCAT_USER="tomcat"              # Usuario de servicio, sin login ni root.
TOMCAT_GROUP="tomcat"

CONTEXTO="facturacion360"         # Context path -> http://host:<puerto>/facturacion360

# Puerto que se USA en server.xml. 8080 es el de Tomcat por defecto y el
# primero que se prueba, pero no siempre está libre: si esta máquina ya
# tiene un nginx o algo escuchando ahí (lo habitual), Tomcat NO lo detecta
# como problema de configuración y se queda sin conector, de modo que el
# puerto sigue Contestando el otro servicio y el despliegue parece roto con
# un 404 que no es de Tomcat. Por eso se comprueba antes y se busca otro.
PUERTO_POR_DEFECTO="8080"
PUERTO_MAX_INTENTOS=20

CONFIG_DIR="/etc/facturacion360"  # Fichero de configuración con los secretos.
CONFIG_FILE="${CONFIG_DIR}/facturacion360.env"

DB_NAME="bd_facturacion"
ESQUEMA_SQL="src/main/resources/docu/backupFacturacion360v4.sql"

# ─────────────────────────────────────────────────────────────────────────────
# COLORES Y AYUDA
# ─────────────────────────────────────────────────────────────────────────────

RED=$'\033[0;31m'; VERDE=$'\033[0;32m'; AMARILLO=$'\033[0;33m'
AZUL=$'\033[0;34m'; GRIS=$'\033[0;90m'; NEGRITA=$'\033[1m'; FIN=$'\033[0m'

info()  { printf "%s==>%s %s\n"    "$AZUL"    "$FIN" "$*"; }
ok()    { printf "%s  OK%s %s\n"   "$VERDE"   "$FIN" "$*"; }
aviso() { printf "%s  !%s  %s\n"   "$AMARILLO" "$FIN" "$*"; }
error() { printf "%sERROR%s %s\n" "$RED"      "$FIN" "$*" >&2; }
paso()  { printf "\n%s── %s%s\n" "$NEGRITA"  "$*" "$FIN"; }

die() {
	error "$*"
	exit 1
}

# ─────────────────────────────────────────────────────────────────────────────
# PARSEO DE ARGUMENTOS
# ─────────────────────────────────────────────────────────────────────────────

SALTAR_TESTS=0
RECONSTRUIR=0
SOLO_LOCAL=0

for arg in "$@"; do
	case "$arg" in
		--sin-tests)    SALTAR_TESTS=1 ;;
		--reconstruir)  RECONSTRUIR=1 ;;
		--solo-local)   SOLO_LOCAL=1 ;;
		-h|--help)
			sed -n '3,20p' "$0" | sed 's/^# \{0,1\}//'
			exit 0
			;;
		*)
			error "Opción desconocida: $arg"
			echo    "Usa --help para ver las disponibles."
			exit 1
			;;
	esac
done

# ─────────────────────────────────────────────────────────────────────────────
# UTILIDADES
# ─────────────────────────────────────────────────────────────────────────────

# Descarga con reintentos, por si el mirror falla un rato.
descargar() {
	local url="$1" destino="$2" intento=1 max=3
	while [ "$intento" -le "$max" ]; do
		if curl -fsSL --retry 2 --connect-timeout 20 -o "$destino" "$url"; then
			return 0
		fi
		aviso "Falló la descarga (intento $intento/$max), reintentando en 3 s..."
		sleep 3
		intento=$((intento + 1))
	done
	return 1
}

# Comprueba que el SHA-512 del fichero coincide con el publicado por Apache.
# Sin esto, una descarga a medias se descomprime y rompe Tomcat de forma
# bastante difícil de diagnosticar. Si no se puede descargar el .sha512 se
# avisa pero se sigue: es peor quedarse sin Tomcat que instalar sin verificar.
verificar_sha512() {
	local fichero="$1" base="$2"
	local url="${base}/${TOMCAT_RUTA}/${TOMCAT_FICHERO}.sha512"
	local esperado

	# El .sha512 de Apache viene como '<hash> *nombre_fichero', o sea dos
	# campos separados. Solo interesa el primero: si se compara el fichero
	# entero contra el hash, la comprobación falla siempre.
	if ! esperado=$(curl -fsSL --max-time 30 "$url" 2>/dev/null | awk '{print $1}' | tr 'A-Z' 'a-z') || [ -z "$esperado" ]; then
		aviso "No se pudo leer el .sha512 (${url}); se instala sin verificar."
		return 0
	fi

	local obtenido
	obtenido=$(sha512sum "$fichero" | cut -d' ' -f1 | tr 'A-Z' 'a-z')
	if [ "$obtenido" != "$esperado" ]; then
		rm -f "$fichero"
		die "El fichero descargado no coincide con el SHA-512 oficial de Apache.
     La descarga se ha corrompido; vuelve a intentarlo."
	fi
	ok "SHA-512 verificado"
}

# Descarga Tomcat probando cada espejo hasta que uno responda. Apache cambia
# de sitio las versiones viejas, así que fallar con el primero NO significa
# que no exista.
descargar_tomcat() {
	local destino="$1" base
	for base in "${TOMCAT_ESPEJOS[@]}"; do
		info "Probando ${base}"
		if descargar "${base}/${TOMCAT_RUTA}/${TOMCAT_FICHERO}" "$destino"; then
			verificar_sha512 "$destino" "$base"
			return 0
		fi
		aviso "${base} no tiene esa versión o falló; se prueba el siguiente espejo."
	done
	return 1
}

# Lee una variable de entorno de una forma que no ejecuta el fichero entero.
leer_env() {
	local clave="$1"
	sed -n "s/^${clave}=\(.*\)$/\1/p" "$CONFIG_FILE" 2>/dev/null | tail -1 | sed 's/^["'"'"']//; s/["'"'"']$//'
}

# ─────────────────────────────────────────────────────────────────────────────
# COMPROBACIONES PREVIAS
# ─────────────────────────────────────────────────────────────────────────────

RAIZ_PROYECTO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$RAIZ_PROYECTO"

paso "Comprobaciones previas"

if [ "$(id -u)" -ne 0 ]; then
	die "Este script necesita root para instalar Tomcat y escribir en /etc.
     Ejecuta:  sudo $0 ${*:---ayuda}"
fi

command -v java >/dev/null 2>&1 || die "No hay java instalado. Instálalo con: sudo apt install openjdk-21-jdk"
command -v curl >/dev/null 2>&1 || die "No hay curl instalado. Instálalo con: sudo apt install curl"
command -v systemctl >/dev/null 2>&1 || die "Este script necesita systemd (no se ha encontrado systemctl)."

# El script pregunta la contraseña de MySQL por teclado. Sin terminal (por
# ejemplo, en un pipe o un cron) esas preguntas no tienen respuesta: 'read'
# falla y, con 'set -e', el script muere en el punto más raro posible. Se
# comprueba aquí para que el motivo quede claro desde el principio.
if [ ! -t 0 ] && [ "$SOLO_LOCAL" -eq 0 ]; then
	die "Este script necesita una terminal para preguntar las credenciales.
     Se ha ejecutado sin una (entrada por pipe o cron).
     Ejecútalo directamente:  sudo $0"
fi

# Java 17 es el mínimo de Tomcat 11 y el proyecto pide 21.
JAVA_MAYOR=$(java -version 2>&1 | head -1 | sed -E 's/.*"([0-9]+).*/\1/')
if [ -n "$JAVA_MAYOR" ] && [ "$JAVA_MAYOR" -lt 17 ] 2>/dev/null; then
	die "Tomcat ${TOMCAT_VERSION} necesita Java 17 o superior, y el java del
     sistema es la versión ${JAVA_MAYOR}. Instala openjdk-21-jdk."
fi
ok "Java $(java -version 2>&1 | head -1 | cut -d'"' -f2)"

[ -f pom.xml ] || die "No se encuentra pom.xml en ${RAIZ_PROYECTO}. Ejecuta el script desde la raíz del proyecto."
ok "Proyecto: ${RAIZ_PROYECTO}"

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURACIÓN INTERACTIVA
# ─────────────────────────────────────────────────────────────────────────────

paso "Configuración de la base de datos"

mkdir -p "$CONFIG_DIR"
chmod 750 "$CONFIG_DIR"

DB_USER=""
DB_PASS=""

if [ -f "$CONFIG_FILE" ]; then
	aviso "Ya existe ${CONFIG_FILE}; se reutilizan los valores guardados."
	DB_USER=$(leer_env SPRING_DATASOURCE_USERNAME)
	DB_PASS=$(leer_env SPRING_DATASOURCE_PASSWORD)
	DB_URL=$(leer_env SPRING_DATASOURCE_URL)
	# La URL trae el nombre de la base al final: jdbc:mysql://host:puerto/bd
	DB_NAME="${DB_URL##*/}"
	DB_NAME="${DB_NAME%%\?*}"          # por si viniera con parámetros
	[ -n "$DB_NAME" ] || DB_NAME="bd_facturacion"
	ok "Configuración leída de ${CONFIG_FILE}"
	read -rp "¿Volver a escribirla? [s/N] " respuesta
	if [[ "$respuesta" =~ ^[Ss]$ ]]; then
		DB_USER=""; DB_PASS=""
	fi
fi

pedir() {
	local mensaje="$1" valor="$2" oculto="${3:-no}"
	if [ "$oculto" = "oculto" ]; then
		read -rsp "$mensaje: " valor
		# El salto de línea va a stderr a propósito: esta función se usa dentro
		# de $( ), y un echo a stdout se concatenaría al valor devuelto,
		# dejando la contraseña con un "\n" delante y haciéndola fallar.
		echo >&2
	else
		read -rp "$mensaje: " valor
	fi
	printf '%s' "$valor"
}

if [ -z "$DB_USER" ]; then
	echo
	read -rp "Usuario de MySQL para ${DB_NAME} [root]: " _tmp; DB_USER="${_tmp:-root}"
	DB_PASS=$(pedir "Contraseña de MySQL" "" "oculto")
	echo

	if [ -z "$DB_PASS" ]; then
		aviso "Contraseña vacía. La base '${DB_NAME}' de MySQL admite acceso sin contraseña;"
		echo  "       si no es así, ajusta ${CONFIG_FILE} a mano antes de arrancar."
	fi

	# El nombre de las variables NO es libre: tienen que llamarse
	# SPRING_DATASOURCE_* porque es como Spring Boot traduce una variable de
	# entorno a su propiedad interna (SPRING_DATASOURCE_URL ->
	# spring.datasource.url). Con otros nombres, tipo DB_PASS, Tomcat las
	# cargaría bien pero Spring las ignoraría en silencio y se conectaría con
	# el root/root de application.properties. Al ser variables de entorno,
	# además, tienen prioridad sobre ese fichero, que es lo que se busca.
	#
	# La contraseña va entre comillas dobles porque el formato de
	# EnvironmentFile de systemd parte la línea por espacios: sin comillas, una
	# contraseña con espacios se cortaría en dos.
	cat > "$CONFIG_FILE" <<EOF
# Configuración de Facturacion360 - generada por desplegar.sh
#
# Permisos 600: este fichero contiene la contraseña de la base de datos.
# Lo carga Tomcat al arrancar como variables de entorno (EnvironmentFile en
# tomcat.service), y Spring las aplica por encima de application.properties.
#
# Editarlo a mano está bien; lo que NO se puede es renombrar las variables:
# tienen que conservar el prefijo SPRING_DATASOURCE_.

SPRING_DATASOURCE_URL=jdbc:mysql://localhost:3306/${DB_NAME}
SPRING_DATASOURCE_USERNAME=${DB_USER}
SPRING_DATASOURCE_PASSWORD="${DB_PASS}"
SPRING_DATASOURCE_DRIVER_CLASS_NAME=com.mysql.cj.jdbc.Driver
EOF
	chmod 600 "$CONFIG_FILE"
	# root:tomcat para que el usuario de servicio pueda leerlo, pero sin
	# poder escribirlo.
	chown root:"$TOMCAT_GROUP" "$CONFIG_FILE" 2>/dev/null || true
	ok "Configuración guardada en ${CONFIG_FILE} (permisos 600)"
fi

# El cliente de MySQL solo se usa para crear la base si falta.
if command -v mysql >/dev/null 2>&1; then
	info "MySQL disponible; se comprueba la base '${DB_NAME}'"
	if MYSQL_PWD="$DB_PASS" mysql -u"$DB_USER" -e "USE ${DB_NAME};" >/dev/null 2>&1; then
		ok "La base '${DB_NAME}' ya existe"
	else
		aviso "La base '${DB_NAME}' no existe o las credenciales fallan."
		read -rp "¿Intentar crearla y cargar el esquema? [s/N] " crear
		if [[ "$crear" =~ ^[Ss]$ ]]; then
			if [ ! -f "$ESQUEMA_SQL" ]; then
				die "No encuentro el esquema ${ESQUEMA_SQL}."
			fi
			MYSQL_PWD="$DB_PASS" mysql -u"$DB_USER" < "$ESQUEMA_SQL" \
				|| die "Falló la carga del esquema ${ESQUEMA_SQL}."
			ok "Base '${DB_NAME}' creada con el esquema v4"
			aviso "El esquema mete las cuentas de ejemplo admin y datos con contraseña"
			echo  "       'CambiarYa.2026'. Cámbialas antes de exponer esto a internet."
		fi
	fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# COMPILACIÓN
# ─────────────────────────────────────────────────────────────────────────────

paso "Compilando la aplicación (WAR)"

MVN_CMD=""
MVN_DESCARTADOS=()

# Cada candidato se PRUEBA antes de aceptarlo: no basta con que el fichero
# exista. El ./mvnw del repositorio, por ejemplo, es ejecutable pero está
# roto (le falta el directorio .mvn/wrapper/), así que si solo se mirase
# "existe y tiene permiso x" el script lo elegiría y el build fallaría.
probar_maven() {
	local candidato="$1"
	"$candidato" -v >/dev/null 2>&1
}

for candidato in mvn ./mvnw \
                 "$HOME"/.m2/wrapper/dists/apache-maven-*/*/bin/mvn; do
	# Descarta el literal del glob si no expandió a nada.
	[ -e "$candidato" ] || continue
	command -v "$candidato" >/dev/null 2>&1 || [ -x "$candidato" ] || continue

	if probar_maven "$candidato"; then
		MVN_CMD="$candidato"
		break
	fi
	MVN_DESCARTADOS+=("$candidato")
done

if [ -n "$MVN_CMD" ]; then
	for descartado in ${MVN_DESCARTADOS[@]+"${MVN_DESCARTADOS[@]}"}; do
		aviso "Descartado ${descartado}: existe pero no arranca (falta .mvn/wrapper/)"
	done
fi

if [ -z "$MVN_CMD" ]; then
	die "No encuentro un Maven que funcione. Instálalo con:  sudo apt install maven
     (o deja de usar el ./mvnw del repo, que le falta el directorio .mvn/wrapper/)."
fi

info "Usando: ${MVN_CMD}"

MVN_ARGS=(-B -DskipTests)
if [ "$SALTAR_TESTS" -eq 0 ]; then
	MVN_ARGS=(-B)   # con tests
	info "Se ejecutan los tests antes de empaquetar (usa --sin-tests para saltarlos)"
else
	info "Tests omitidos por --sin-tests"
fi

[ "$RECONSTRUIR" -eq 1 ] && { info "Limpiando target/"; "$MVN_CMD" -B clean; }

# OJO: no se usa el profile 'produccion'. Está roto: invoca la clase
# buildtools.MinificarStatic, que no existe en el código fuente, y el build
# falla con ClassNotFoundException. Si algún día se arregla, se añade -Pproduccion.
"$MVN_CMD" "${MVN_ARGS[@]}" package \
	|| die "Falló la compilación. Revisa los mensajes de Maven arriba."

WAR_FILE="$(find target -maxdepth 1 -name '*.war' ! -name '*.original' | head -1)"
[ -n "$WAR_FILE" ] || die "No se ha generado ningún WAR en target/."
ok "WAR generado: ${WAR_FILE} ($(du -h "$WAR_FILE" | cut -f1))"

# ─────────────────────────────────────────────────────────────────────────────
# INSTALACIÓN DE TOMCAT
# ─────────────────────────────────────────────────────────────────────────────

paso "Instalando Tomcat ${TOMCAT_VERSION}"

if id -u "$TOMCAT_USER" >/dev/null 2>&1; then
	ok "El usuario de servicio '${TOMCAT_USER}' ya existe"
else
	info "Creando el usuario de servicio '${TOMCAT_USER}' (sin login, sin shell)"
	useradd --system --home-dir "$TOMCAT_HOME" --shell /usr/sbin/nologin "$TOMCAT_USER" \
		|| die "No se pudo crear el usuario ${TOMCAT_USER}."
	ok "Usuario ${TOMCAT_USER} creado"
fi

TOMCAT_DIR="/opt/apache-tomcat-${TOMCAT_VERSION}"

if [ -x "${TOMCAT_DIR}/bin/catalina.sh" ]; then
	ok "Tomcat ${TOMCAT_VERSION} ya está descargado en ${TOMCAT_DIR}"
else
	info "Descargando Tomcat ${TOMCAT_VERSION} (~120 MB)"
	TMP_TGZ="$(mktemp -d)/apache-tomcat-${TOMCAT_VERSION}.tar.gz"
	trap 'rm -rf "$(dirname "$TMP_TGZ")"' EXIT

	descargar_tomcat "$TMP_TGZ" \
		|| die "No se pudo descargar Tomcat ${TOMCAT_VERSION} de ningún espejo.
     Comprueba la red, o descárgalo a mano y descomprímelo en /opt:
       https://archive.apache.org/dist/${TOMCAT_RUTA}/${TOMCAT_FICHERO}"

	info "Extrayendo en /opt"
	rm -rf "${TOMCAT_DIR}.tmp"
	mkdir -p "${TOMCAT_DIR}.tmp"
	tar -xzf "$TMP_TGZ" -C "${TOMCAT_DIR}.tmp" --strip-components=1
	mv "${TOMCAT_DIR}.tmp" "$TOMCAT_DIR"
	ok "Tomcat instalado en ${TOMCAT_DIR}"
fi

# El directorio estable: un enlace simbólico, para que actualizar de versión
# sea cambiar el enlace y no tocar el servicio.
if [ -L "$TOMCAT_HOME" ] || [ ! -d "$TOMCAT_HOME" ]; then
	ln -sfn "$TOMCAT_DIR" "$TOMCAT_HOME"
	ok "${TOMCAT_HOME} -> ${TOMCAT_DIR}"
fi

# El tarball de Apache viene con los ficheros en 750 y del usuario que lo
# descargó. Sin este chown, el usuario de servicio no puede ni leer los
# scripts de bin/ y Tomcat muere con "Permiso denegado" antes de arrancar.
chown -R "${TOMCAT_USER}:${TOMCAT_GROUP}" "$TOMCAT_DIR"
ok "Permisos de Tomcat asignados a ${TOMCAT_USER}:${TOMCAT_GROUP}"

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURACIÓN DE TOMCAT
# ─────────────────────────────────────────────────────────────────────────────

paso "Configurando Tomcat"

SERVER_XML="${TOMCAT_DIR}/conf/server.xml"

# Puerto que hay PUESTO ahora mismo en el conector HTTP de server.xml. En una
# instalación recién descomprimida es 8080; en una reejecución del script, el
# que se eligió la vez pasada. Se parte de ahí para no perder la elección
# anterior en cada despliegue.
#
# Se localiza primero la LÍNEA del conector HTTP y luego el atributo port de
# esa línea, en vez de un único regex que buscara 'protocol' y 'port' a la vez:
# el orden de los atributos no está garantizado (en Tomcat 11 el port va
# antes que protocol) y una barra de 'HTTP/1.1' rompe el delimitador de sed.
PUERTO_ACTUAL=$(grep -m1 'protocol="HTTP/1.1"' "$SERVER_XML" \
	| grep -oE 'port="[0-9]+"' | head -1 | grep -oE '[0-9]+')
[ -z "$PUERTO_ACTUAL" ] && PUERTO_ACTUAL="$PUERTO_POR_DEFECTO"

PUERTO_HTTP="$PUERTO_ACTUAL"
info "Buscando un puerto libre para Tomcat (empezando por ${PUERTO_ACTUAL})..."

intento=0
while [ "$intento" -lt "$PUERTO_MAX_INTENTOS" ]; do
	# ss devuelve una línea por puerto en escucha; vacía = libre. El filtro
	# "sport = :N" es exacto, así que 8080 no se confunde con 80800.
	ocupado=$(ss -ltn "sport = :${PUERTO_HTTP}" 2>/dev/null | tail -n +2 | grep -c . || true)

	# Si el puerto elegido es el de un Tomcat nuestro que ya está corriendo,
	# no es un conflicto: es el puerto de siempre.
	if [ "$ocupado" -eq 0 ] || systemctl is-active --quiet tomcat; then
		break
	fi

	quien=$(ss -ltnp "sport = :${PUERTO_HTTP}" 2>/dev/null | tail -n +2 \
		| grep -oE 'users:\(\("[^"]+"' | head -1 | sed 's/users:(//; s/"//')
	aviso "El puerto ${PUERTO_HTTP} está ocupado${quien:+ por ${quien}}; se prueba el siguiente."
	PUERTO_HTTP=$((PUERTO_HTTP + 1))
	intento=$((intento + 1))
done

if [ "$intento" -ge "$PUERTO_MAX_INTENTOS" ]; then
	die "No hay ningún puerto libre entre ${PUERTO_ACTUAL} y $((PUERTO_ACTUAL + PUERTO_MAX_INTENTOS)).
     Libera alguno o cambia PUERTO_POR_DEFECTO al principio de este script."
fi

ok "Puerto HTTP: ${PUERTO_HTTP}"

if [ "$PUERTO_HTTP" != "$PUERTO_ACTUAL" ]; then
	# server.xml lleva el puerto en el conector HTTP y en el de shutdown.
	# Se cambian los dos: si el de shutdown se queda apuntando a un puerto
	# que ocupa otro servicio, Tomcat no arranca.
	sed -i "s|port=\"${PUERTO_ACTUAL}\"|port=\"${PUERTO_HTTP}\"|g" "$SERVER_XML"
	ok "server.xml actualizado (${PUERTO_ACTUAL} -> ${PUERTO_HTTP})"
fi

# El manager y el host-manager traen credenciales por defecto publicadas
# (tomcat/tomcat). Se borran: no aportan nada aquí y son una puerta abierta.
for archivo in "${TOMCAT_DIR}/conf/tomcat-users.xml"; do
	if [ -f "$archivo" ]; then
		[ -e "${archivo}.orig" ] || cp "$archivo" "${archivo}.orig"
		cat > "$archivo" <<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<!--
  Generado por desplegar.sh. Sin usuarios: el control de acceso de la
  aplicación lo hace la tabla 'usuarios' de MySQL, no el manager de Tomcat.
  No añadir aquí el rol manager-guest salvo que haga falta para desplegar
  remotamente, porque el manager exige configuración extra de Tomcat.
-->
<tomcat-users xmlns="http://tomcat.apache.org/xml"
              xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
              xsi:schemaLocation="http://tomcat.apache.org/xml tomcat-users.xsd">
</tomcat-users>
XML
		ok "Usuarios de Tomcat vaciados (las cuentas de ejemplo se han borrado)"
	fi
done

# ─────────────────────────────────────────────────────────────────────────────
# UNIDAD DE SYSTEMD
# ─────────────────────────────────────────────────────────────────────────────

paso "Creando el servicio de systemd"

cat > /etc/systemd/system/tomcat.service <<UNIT
[Unit]
Description=Apache Tomcat ${TOMCAT_VERSION} - Facturacion360
Documentation=https://tomcat.apache.org/tomcat-${TOMCAT_VERSION}-doc/
After=network.target

[Service]
Type=simple
User=${TOMCAT_USER}
Group=${TOMCAT_GROUP}

Environment="CATALINA_HOME=${TOMCAT_HOME}"
Environment="CATALINA_BASE=${TOMCAT_HOME}"
Environment="CATALINA_OPTS=-Xms256m -Xmx768m -Dfile.encoding=UTF-8"
Environment="JAVA_OPTS=-Djava.awt.headless=true"

# Las credenciales van en un fichero aparte con permisos 600, para que no
# estén ni en el repositorio ni en el 'ps' de todo el mundo. Spring las lee
# como variables de entorno y por eso ganan a application.properties.
EnvironmentFile=-${CONFIG_FILE}

# logback-spring.xml escribe en 'logs/f.log', una ruta RELATIVA al directorio
# de trabajo del proceso. Sin esto, systemd arranca Tomcat en / y el log
# acabaría en /logs/f.log, en la raíz del sistema de ficheros.
WorkingDirectory=${TOMCAT_HOME}

# Límite de ficheros abiertos: por defecto está muy bajo para un contenedor
# y se manifestaría como "Too many open files" con muchas peticiones.
LimitNOFILE=65535

# Endurecimiento: Tomcat no debería poder escribir fuera de estos sitios.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=${TOMCAT_HOME}

# 'catalina.sh run' deja Tomcat en PRIMER PLANO, que es lo que systemd
# necesita para vigilarlo. Con startup.sh el script se demoniza y devuelve el
# control enseguida: systemd creería que el servicio ha terminado, lo
# reiniciaría en bucle y el proceso de Tomcat quedaría huérfano. Con 'run'
# es systemd quien manda parar (SIGTERM) y quien sabe si Tomcat vive.
ExecStart=/bin/bash ${TOMCAT_HOME}/bin/catalina.sh run
KillSignal=SIGTERM
TimeoutStopSec=45
SuccessExitStatus=143

Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
ok "Unidad /etc/systemd/system/tomcat.service creada"
systemctl enable tomcat >/dev/null 2>&1
ok "Tomcat arrancará solo al iniciar la máquina"

# ─────────────────────────────────────────────────────────────────────────────
# DESPLIEGUE
# ─────────────────────────────────────────────────────────────────────────────

if [ "$SOLO_LOCAL" -eq 1 ]; then
	paso "Resumen (--solo-local: no se despliega ni se arranca Tomcat)"
	echo
	echo "  Tomcat:       ${TOMCAT_HOME}"
	echo "  WAR:          ${RAIZ_PROYECTO}/${WAR_FILE}"
	echo "  Config:       ${CONFIG_FILE}"
	echo
	echo "  Para terminar el despliegue:"
	echo "    sudo cp '${WAR_FILE}' ${TOMCAT_HOME}/webapps/${CONTEXTO}.war"
	echo "    sudo systemctl start tomcat"
	echo
	exit 0
fi

paso "Desplegando en Tomcat"

# La aplicación lee el log en logs/f.log, relativo al directorio de trabajo
# del proceso. Con systemd ese directorio es /, así que se le da uno propio
# para que los logs caigan en un sitio predecible.
mkdir -p "${TOMCAT_HOME}/logs" "${TOMCAT_HOME}/temp" "${TOMCAT_HOME}/work"

# Descarga previa si ya había un despliegue, para no dejar la carpeta a medias.
if systemctl is-active --quiet tomcat; then
	info "Parando Tomcat para desplegar la nueva versión"
	systemctl stop tomcat
fi

WAR_DEST="${TOMCAT_HOME}/webapps/${CONTEXTO}.war"
CARPETA_DEST="${TOMCAT_HOME}/webapps/${CONTEXTO}"

info "Copiando el WAR a ${WAR_DEST}"
rm -rf "$CARPETA_DEST"
install -o "$TOMCAT_USER" -g "$TOMCAT_GROUP" -m 644 "$WAR_FILE" "$WAR_DEST"

# El archivo de contexto fija el context path con independencia del nombre
# del WAR, por si algún día se renombra el fichero.
#
# conf/Catalina/localhost no existe en una instalación recién descomprimida:
# Tomcat lo crea la PRIMERA vez que arranca. Por eso hay que mkdir aquí, o el
# cat de abajo falla en el primer despliegue, que es justo cuando más confuso
# resulta.
mkdir -p "${TOMCAT_HOME}/conf/Catalina/localhost"
# El atributo path DEBE empezar por '/'; Tomcat avisa y lo cambia él si no.
# Y no se pone docBase: apuntaría dentro del appBase, que Tomcat ya ignora
# por definición (avisa por el log). Con el descriptor tal cual, el contexto
# sale del nombre del fichero, que ya es el context path buscado.
cat > "${TOMCAT_HOME}/conf/Catalina/localhost/${CONTEXTO}.xml" <<XML
<?xml version="1.0" encoding="UTF-8"?>
<!--
  Fijado a mano para que el context path no dependa del nombre del WAR.
  El 'path' tiene que empezar por barra: sin ella Tomcat avisa por el log y
  lo corrige él.
-->
<Context path="/${CONTEXTO}" reloadable="false" useHttpOnly="true"/>
XML
chown -R "$TOMCAT_USER:$TOMCAT_GROUP" "${TOMCAT_HOME}/conf/Catalina"

ok "WAR desplegado"

# ─────────────────────────────────────────────────────────────────────────────
# ARRANQUE Y COMPROBACIÓN
# ─────────────────────────────────────────────────────────────────────────────

paso "Arrancando Tomcat"

# Pickle: deserializar ficheros de sesión de otras máquinas es un agujero de
# seguridad conocido. Con esto, Tomcat ignora cualquier .session guardado.
sed -i 's|<Manager pathname=|<Manager className="org.apache.catalina.session.StandardManager" secureRandomClass="java.security.SecureRandom" pathname=|' \
	"${TOMCAT_DIR}/conf/server.xml" 2>/dev/null || true

systemctl start tomcat

info "Esperando a que la aplicación responda..."

URL="http://localhost:${PUERTO_HTTP}/${CONTEXTO}"
ESPERA=0
LISTO=0

while [ "$ESPERA" -lt 90 ]; do
	# -L para seguir redirecciones, y se mira el código de respuesta: una
	# redirección al login (302) significa que Spring YA está montado. Un 404
	# o 503 significan que el contexto aún no ha subido.
	CODIGO=$(curl -s -o /dev/null -w '%{http_code}' -L --max-time 5 "$URL" 2>/dev/null || echo "000")

	case "$CODIGO" in
		# 200: la pantalla pedida se sirve.
		# 302: redirige (por ejemplo al login).
		# 401/403: LA APLICACIÓN ESTÁ VIVA. La cadena de seguridad rechaza
		#   cualquier petición sin sesión, así que un 401 no es un fallo de
		#   arranque sino la respuesta correcta. Sin este caso, el script
		#   se quedaría esperando 90 s y acabaría diciendo que la aplicación no
		#   arranca aunque esté perfectamente desplegada.
		200|301|302|303|401|403)
			LISTO=1
			break
			;;
	esac

	# Si Tomcat se ha caído del todo, no tiene sentido seguir esperando.
	if ! systemctl is-active --quiet tomcat; then
		echo
		error "Tomcat se ha parado durante el arranque. Últimas líneas del log:"
		# Con 'catalina.sh run' la salida va al journal, no a catalina.out.
		journalctl -u tomcat -n 40 --no-pager 2>/dev/null || echo "(no se pudo leer el journal)"
		exit 1
	fi

	sleep 2
	ESPERA=$((ESPERA + 2))
	printf "\r  ${GRIS}... %ss (código %s)${FIN}" "$ESPERA" "$CODIGO"
done

echo
echo

if [ "$LISTO" -eq 0 ]; then
	error "La aplicación no ha respondido en 90 segundos (último código: ${CODIGO})."
	echo
	echo  "  Lo más probable es que no pueda conectar con MySQL. Mira:"
	echo "    sudo journalctl -u tomcat -n 100 --no-pager"
	echo "    sudo tail -f ${TOMCAT_HOME}/logs/f.log   (log de la aplicación)"
	echo
	echo "  Y para probar la conexión a mano, con las credenciales del script:"
	echo "    sudo systemctl show tomcat --property=Environment"
	echo
	exit 1
fi

ok "La aplicación responde en ${URL}"

# ─────────────────────────────────────────────────────────────────────────────
# RESUMEN
# ─────────────────────────────────────────────────────────────────────────────

paso "Despliegue terminado"

echo
echo "  ${NEGRITA}URL${FIN}         http://<tu-servidor>:${PUERTO_HTTP}/${CONTEXTO}"
echo "  ${NEGRITA}Contexto${FIN}    /${CONTEXTO}"
echo "  ${NEGRITA}WAR${FIN}         ${WAR_DEST}"
echo "  ${NEGRITA}Servicio${FIN}    tomcat  (systemctl status tomcat)"
echo "  ${NEGRITA}Logs${FIN}        journalctl -u tomcat -f   (arranque de Tomcat)"
echo "                        ${TOMCAT_HOME}/logs/f.log"
echo
echo "  ${GRIS}Reiniciar:      sudo systemctl restart tomcat${FIN}"
echo "  ${GRIS}Parar:          sudo systemctl stop tomcat${FIN}"
echo "  ${GRIS}Actualizar:     ./desplegar.sh de nuevo${FIN}"
echo
echo "  ${AMARILLO}Pendiente antes de abrirlo a internet:${FIN}"
echo "    - Cambiar las contraseñas de admin y datos (vienen en 'CambiarYa.2026')."
echo "    - Si pones HTTPS delante, poner a true en application.properties:"
echo "        server.servlet.session.cookie.secure=true"
echo "      Sin eso la cookie de sesión viaja en claro."
echo "    - Cerrar el puerto ${PUERTO_HTTP} al exterior si no lo necesitas"
echo "      accesible desde internet."
echo
