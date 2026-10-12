#!/usr/bin/env bash
#
# desplegar.sh - Prepara la máquina de principio a fin y despliega
# Facturacion360 en Apache Tomcat.
#
# Qué hace, en orden:
#   1. Pregunta los puertos de HTTP y HTTPS, si se activa HTTPS y dónde está la
#      base de datos. Nada se ejecuta a ciegas: lo que no se conteste, se
#      comprueba antes de escribirlo en un fichero de configuración.
#   2. Instala Java 21 (OpenJDK del sistema o, si no está disponible, la
#      descarga de Eclipse Temurin a /opt/java).
#   3. Instala Maven (apt o descarga de Apache), porque el ./mvnw del
#      repositorio está roto: le falta el directorio .mvn/wrapper/.
#   4. Si la base de datos va en esta máquina, instala MySQL 8 (o MariaDB) si
#      falta, crea la base, el usuario de la aplicación y su contraseña, y
#      carga el esquema. Si está en otro sitio, no toca ningún servidor.
#   5. Escribe esos datos en src/main/resources/application.properties (de ahí
#      se compila el WAR) y en /etc/facturacion360/facturacion360.env.
#   6. Compila el proyecto y genera el WAR.
#   7. Instala Tomcat 11 (el mismo tomcat-embed que usa la aplicación) si no
#      está, como usuario de servicio sin privilegios.
#   8. Configura los puertos en server.xml y añade el conector HTTPS con un
#      keystore autofirmado en /etc, salvo que ya haya un certificado.
#   9. Crea la unidad de systemd para que MySQL y Tomcat arranquen solos al
#      iniciar la máquina y se reinicien si se caen.
#  10. Despliega el WAR y espera a que la aplicación responda por los dos puertos.
#
# Los secretos (contraseña de la base, del keystore) se guardan en
# /etc/facturacion360 con permisos 600. La contraseña de la base SÍ se escribe
# también en application.properties, porque el WAR se compila desde ahí: por
# eso el script deja el original en application.properties.orig y avisa al
# final de que ese fichero no se suba a git.

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

# Valores por defecto de lo que se pregunta al principio. 8080 es el de Tomcat
# de serie; 8443 el de su conector HTTPS. Los dos se preguntan siempre, pero
# estos son los que se ofrecen si se pulsa Enter.
PUERTO_POR_DEFECTO="8080"

# ─── Maven ───────────────────────────────────────────────────────────────────

# El ./mvnw del repositorio no sirve: es un script que busca su configuración
# en .mvn/wrapper/, y ese directorio no está en el repo. Así que el script
# instala Maven él mismo, primero con apt y, si no hay, desde Apache.
MAVEN_VERSIONES=("3.9.11" "3.9.10" "3.9.9" "3.9.8" "3.9.7" "3.9.6")
MAVEN_ESPEJOS=("https://archive.apache.org/dist/maven/maven-3"
               "https://dlcdn.apache.org/maven/maven-3")

# ─── Java ────────────────────────────────────────────────────────────────────

# El pom pide Java 21 y Tomcat 11 no arranca con menos de 17. Se exige 21.
JAVA_REQUERIDA="21"
JAVA_DIR_OPT="/opt/java"            # Solo se usa si hay que descargarla.
JAVA_TEMURIN="https://api.adoptium.net/v3/binary/latest/${JAVA_REQUERIDA}/ga/linux"

# ─── MySQL ───────────────────────────────────────────────────────────────────

# Se instala con apt si el sistema es Debian/Ubuntu (que es lo normal). Si no
# hay apt, o si el paquete no existe para esa versión, se descarga el binario
# oficial. MariaDB también vale: habla el mismo protocolo y el driver JDBC de
# MySQL se conecta sin problema, así que no se distingue.
MYSQL_PUERTO="3306"
MYSQL_DATADIR="/var/lib/mysql"
MYSQL_DIR_OPT="/opt/mysql"          # Solo se usa en la instalación por descarga.
MYSQL_SOCKET="/var/run/mysqld/mysqld.sock"
MYSQL_VERSIONES_TGZ=("8.4.7" "8.4.6" "8.4.5" "8.4.4" "8.4.3" "8.4.2" "8.4.1" "8.4.0")
MYSQL_GLIBC_MIN="2.28"              # MySQL 8.4 lo pide como mínimo.

# ─── HTTPS ───────────────────────────────────────────────────────────────────

# Petición explícita: Tomcat en 8443 y no en 443, porque el servicio corre como
# usuario sin privilegios y 443 es un puerto que solo puede abrir root. Con un
# nginx o un Apache delante, el 443 lo abre ese y aquí el 8443 se queda de
# puerto interno.
PUERTO_HTTPS="8443"
# Nombre que se mete en el certificado autofirmado; el usuario lo cambia
# cuando responde al principio del script.
DOMINIO="localhost"

CONFIG_DIR="/etc/facturacion360"  # Fichero de configuración con los secretos.
CONFIG_FILE="${CONFIG_DIR}/facturacion360.env"
KEYSTORE_FILE="${CONFIG_DIR}/tomcat.p12"
KEYSTORE_ALIAS="facturacion360"

DB_NAME="bd_facturacion"
DB_USUARIO_DEFECTO="facturacion360"
# Parámetros de la URL JDBC. allowPublicKeyRetrieval hace falta con MySQL 8:
# su autenticación por defecto (caching_sha2_password) no viaja en claro sobre
# una conexión sin TLS, así que sin esto el driver lanza "Public Key Retrieval
# is not allowed" y la aplicación no arranca.
DB_PARAMETROS_JDBC="useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Europe/Madrid"
ESQUEMA_SQL="src/main/resources/docu/backupFacturacion360v4.sql"
PROPERTIES="src/main/resources/application.properties"

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
SIN_HTTPS=0
PUERTO_HTTPS_ELEGIDO=""
PUERTO_HTTP_ELEGIDO=""
DOMINIO_ELEGIDO=""

for arg in "$@"; do
	case "$arg" in
		--sin-tests)    SALTAR_TESTS=1 ;;
		--reconstruir)  RECONSTRUIR=1 ;;
		--solo-local)   SOLO_LOCAL=1 ;;
		--sin-https)    SIN_HTTPS=1 ;;
		--puerto-https=*) PUERTO_HTTPS_ELEGIDO="${arg#*=}" ;;
		--puerto-http=*)  PUERTO_HTTP_ELEGIDO="${arg#*=}" ;;
		--dominio=*)      DOMINIO_ELEGIDO="${arg#*=}" ;;
		-h|--help)
			cat <<'AYUDA'
desplegar.sh - prepara la máquina y despliega Facturacion360 en Tomcat.

Uso:
  sudo ./desplegar.sh [opciones]

Qué hace, preguntando por el camino:
  - Java 21 (OpenJDK del sistema; si no está disponible, lo descarga de
    Eclipse Temurin a /opt/java).
  - Puertos de Tomcat: HTTP y HTTPS. Se preguntan, y si uno ya lo está
    usando otro servicio no lo deja pasar.
  - HTTPS con un certificado autofirmado generado en /etc, o el que traigas.
  - MySQL 8 o MariaDB: si dices que la base está en esta máquina, la instala,
    crea el usuario y la contraseña, y deja el servicio arrancado y
    habilitado al arrancar. Si dices que está en otro sitio, no toca ningún
    servidor y solo escribe los datos de conexión.
  - Esos datos (usuario, contraseña, URL) en application.properties y en
    /etc/facturacion360/facturacion360.env (permisos 600).
  - Tomcat 11 como servicio de systemd, sin usuario root.

Opciones:
  --sin-tests          salta los tests de Maven (más rápido)
  --reconstruir        borra target/ y vuelve a compilar desde cero
  --solo-local         instala y configura todo, pero no despliega ni arranca
  --sin-https          no configura el conector HTTPS, solo el HTTP
  --puerto-http=N      puerto HTTP sin preguntar
  --puerto-https=N     puerto HTTPS sin preguntar (implica activar HTTPS)
  --dominio=nombre     nombre del certificado sin preguntar
  -h, --help           esta ayuda

Para un despliegue normal:
  sudo ./desplegar.sh
AYUDA
			exit 0
			;;
		*)
			error "Opción desconocida: $arg"
			echo    "Usa --help para ver las disponibles."
			exit 1
			;;
	esac
done

[ -n "$PUERTO_HTTPS_ELEGIDO" ] && PUERTO_HTTPS="$PUERTO_HTTPS_ELEGIDO"
[ -n "$DOMINIO_ELEGIDO" ]      && DOMINIO="$DOMINIO_ELEGIDO"

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

# Cadena aleatoria de [A-Za-z0-9] para contraseñas y secretos.
#
# Solo esos caracteres a propósito. Una contraseña acaba copiada en un fichero
# .properties, en un EnvironmentFile de systemd y en un CREATE USER de MySQL:
# comillas, barras invertidas, dollars o acentos rompen alguno de los tres
# formatos, y el fallo aparece luego como un error de sintaxis SQL o una
# contraseña que "no es la misma" según dónde se mire.
aleatorio() {
	local longitud="${1:-24}" salida=""
	salida=$(LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom 2>/dev/null | head -c "$longitud" || true)
	if [ "${#salida}" -lt "$longitud" ]; then
		# Alternativa con od, por si tr no está instalado.
		salida=$(od -An -N "$longitud" -tx1 /dev/urandom | tr -d ' \n' || true)
	fi
	printf '%s' "$salida"
}

# Instala paquetes con apt-get sin preguntar nada. La lista de paquetes se
# actualiza solo si el directorio está vacío, para no ralentizar cada
# ejecución.
instalar_paquetes() {
	local paquete
	command -v apt-get >/dev/null 2>&1 || return 1
	export DEBIAN_FRONTEND=noninteractive
	if [ -d /var/lib/apt/lists ] && [ -z "$(ls -A /var/lib/apt/lists 2>/dev/null)" ]; then
		info "apt-get update (la lista de paquetes está vacía)"
		apt-get update -qq >/dev/null 2>&1 || return 1
	fi
	for paquete in "$@"; do
		if dpkg -s "$paquete" >/dev/null 2>&1; then
			continue
		fi
		info "Instalando ${paquete}"
		if ! apt-get install -y -qq "$paquete" >/dev/null; then
			return 1
		fi
	done
	return 0
}

# Sustitución multilínea en un fichero de texto con perl. Se usa en server.xml
# porque los conectores de Tomcat ocupan varias líneas y un sed línea a línea
# no puede tocar un elemento que empieza en una línea y acaba en otra.
perl_multilinea() {
	local fichero="$1" programa="$2"
	perl -0777 -i -pe "$programa" -- "$fichero"
}

# Descarga el binario de Apache Maven y lo deja en /opt/maven. Es el plan B de
# la instalación de Maven: se usa cuando no hay apt, o cuando el paquete no
# existe para esa distribución.
instalar_maven_descargando() {
	local version espejo url tmp dir

	for version in "${MAVEN_VERSIONES[@]}"; do
		for espejo in "${MAVEN_ESPEJOS[@]}"; do
			url="${espejo}/${version}/binaries/apache-maven-${version}-bin.tar.gz"

			info "Buscando Maven ${version} en ${espejo}"
			curl -fsI --max-time 20 "$url" >/dev/null 2>&1 || continue

			tmp=$(mktemp -d)
			if ! descargar "$url" "${tmp}/maven.tar.gz"; then
				rm -rf "$tmp"
				continue
			fi

			# El SHA-512 va junto al tarball. Sin verificar, una descarga a
			# medias se descomprime y el fallo aparece dentro de Maven, con un
			# mensaje que no apunta al fichero corrupto.
			local esperado obtenido
			esperado=$(curl -fsSL --max-time 30 "${url}.sha512" 2>/dev/null \
				| awk '{print $1}' | tr 'A-Z' 'a-z' || true)
			obtenido=$(sha512sum "${tmp}/maven.tar.gz" | cut -d' ' -f1 | tr 'A-Z' 'a-z')
			if [ -n "$esperado" ] && [ "$esperado" != "$obtenido" ]; then
				rm -rf "$tmp"
				aviso "El SHA-512 de Maven no coincide; el fichero se descarta."
				break
			fi

			dir="/opt/apache-maven-${version}"
			rm -rf "${dir}.tmp"; mkdir -p "${dir}.tmp"
			tar -xzf "${tmp}/maven.tar.gz" -C "${dir}.tmp" --strip-components=1
			rm -rf "$dir"
			mv "${dir}.tmp" "$dir"
			rm -rf "$tmp"
			ln -sfn "$dir" /opt/maven

			# Que se encuentre desde cualquier shell, no solo desde este script.
			cat > /etc/profile.d/maven.sh <<PERFIL
export MAVEN_HOME=${dir}
export PATH=\$MAVEN_HOME/bin:\$PATH
PERFIL
			chmod 644 /etc/profile.d/maven.sh

			ok "Maven ${version} instalado en ${dir}"
			return 0
		done
	done

	aviso "No se ha podido descargar Maven de Apache."
	return 1
}

# ¿El puerto está libre de verdad, o lo tiene nuestro propio Tomcat? Cuando
# el script se reejecuta sobre una instalación viva, el puerto 8080/8443 lo
# ocupa el Tomcat que hay en marcha, y eso NO es un conflicto: es el puerto de
# siempre. Distinguirlo evita que cada reejecución vaya desplazando el puerto.
puerto_ocupado_por_otro() {
	local puerto="$1" pid
	ss -ltn "sport = :${puerto}" 2>/dev/null | tail -n +2 | grep -q . || return 1   # libre

	# Ocupado. Solo es aceptable si el dueño es el Tomcat de este script.
	systemctl is-active --quiet tomcat || return 0
	pid=$(systemctl show -p MainPID --value tomcat 2>/dev/null || echo 0)
	[ -n "$pid" ] && [ "$pid" != "0" ] || return 0
	ss -ltnp "sport = :${puerto}" 2>/dev/null | grep -q "pid=${pid}," && return 1
	return 0
}

nombre_proceso_en_puerto() {
	ss -ltnp "sport = :$1" 2>/dev/null | tail -n +2 \
		| grep -oE 'users:\(\("[^"]+"' | head -1 | sed 's/users:(//; s/"//'
}

# ─────────────────────────────────────────────────────────────────────────────
# COMPROBACIONES PREVIAS
# ─────────────────────────────────────────────────────────────────────────────

RAIZ_PROYECTO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$RAIZ_PROYECTO"

paso "Comprobaciones previas"

if [ "$(id -u)" -ne 0 ]; then
	die "Este script necesita root para instalar Java, MySQL y Tomcat.
     Ejecuta:  sudo $0 --help"
fi

command -v systemctl >/dev/null 2>&1 || die "Este script necesita systemd (no se ha encontrado systemctl)."
# curl es imprescindible: es como se descargan Tomcat, Temurin y MySQL.
# iproute2 aporta 'ss', que es como se comprueba si un puerto está libre.
instalar_paquetes curl ca-certificates iproute2 xz-utils perl \
	|| die "Necesito curl, ca-certificates, iproute2, xz-utils y perl, y no
     he podido instalarlos. Instálalos con: sudo apt install curl ca-certificates iproute2 xz-utils perl"

# El script pregunta los puertos, la contraseña de MySQL y el resto por
# teclado. Sin terminal (por ejemplo, en un pipe o un cron) esas preguntas no
# tienen respuesta: 'read' falla y, con 'set -e', el script muere en el punto
# más raro posible. Se comprueba aquí para que el motivo quede claro desde el
# principio y no a mitad de la instalación.
if [ ! -t 0 ]; then
	die "Este script necesita una terminal: pregunta los puertos, la base de
     datos y las contraseñas. Se ha ejecutado sin una (entrada por pipe o
     cron). Ejecútalo directamente:  sudo $0"
fi

[ -f pom.xml ] || die "No se encuentra pom.xml en ${RAIZ_PROYECTO}. Ejecuta el script desde la raíz del proyecto."
ok "Proyecto: ${RAIZ_PROYECTO}"

# ─────────────────────────────────────────────────────────────────────────────
# PREGUNTAS: PUERTOS Y BASE DE DATOS
# ─────────────────────────────────────────────────────────────────────────────

paso "Configuración"

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

# "¿Sí?" por defecto: una respuesta vacía significa que sí.
es_si() {
	local r="${1:-S}"
	[[ "$r" =~ ^[Ss]$ ]] || [[ -z "$r" ]]
}

puerto_valido() {
	[[ "$1" =~ ^[0-9]+$ ]] && [ "$1" -ge 1 ] && [ "$1" -le 65535 ]
}

# Una contraseña escrita a mano acaba en tres sitios a la vez: el CREATE USER
# de MySQL, el EnvironmentFile de systemd (formato CLAVE="valor") y
# application.properties. Los espacios, las comillas, la barra invertida y el
# dollar rompen al menos uno de los tres, y el síntoma es un "Access denied"
# dos días después que no señala el origen. Por eso se admite un conjunto
# reducido de caracteres y se avisa de lo que se rechaza, en vez de dejar que
# reviente más abajo.
password_valida() {
	[[ "$1" =~ ^[A-Za-z0-9._@%+:,/-]+$ ]]
}

# Pregunta una contraseña y la deja en PASSWORD_ESCOGIDA. Como preguntar_puerto,
# no se devuelve con echo: los avisos de "esa no vale" saldrían por stdout y
# se concatenarían a la contraseña.
PASSWORD_ESCOGIDA=""
pedir_password() {
	local etiqueta="$1" valor intentos=0
	while :; do
		valor=$(pedir "$etiqueta" "" "oculto")
		echo

		# Vacía se permite: hay quien tiene la base sin contraseña, y es un
		# error del script impedirlo (sí avisa después).
		if [ -z "$valor" ] || password_valida "$valor"; then
			PASSWORD_ESCOGIDA="$valor"
			return 0
		fi

		intentos=$((intentos + 1))
		aviso "Esa contraseña tiene espacios, comillas, \$ o \\."
		echo  "       Rompería el fichero de systemd o el .properties, y luego"
		echo  "       MySQL no dejaría entrar a la aplicación. Escribe otra."
		if [ "$intentos" -ge 3 ]; then
			aviso "Tres intentos: pongo una contraseña generada."
			PASSWORD_ESCOGIDA="$(aleatorio 24)"
			return 0
		fi
	done
}

# Pregunta un puerto y no lo deja pasar si ya lo está usando otro servicio.
#
# Preguntar y COMPROBAR van juntos a propósito: si solo se preguntara y el
# Tomcat arrancara sin poder abrir el puerto, no se vería nada de ello desde
# fuera. Lo que pasa es que Tomcat anota su propio fallo en el log y sigue con
# vida, así que el despliegue parece bueno y lo que falla es la web.
#
# El resultado NO se devuelve con echo: se deja en PUERTO_ESCOGIDO. Con $( )
# cualquier aviso que saliera por stdout se concatenaría al puerto y
# acabaría escrito en server.xml como "Ocupado8080\n".
PUERTO_ESCOGIDO=""
preguntar_puerto() {
	local etiqueta="$1" defecto="$2" valor quien
	PUERTO_ESCOGIDO="$defecto"

	while :; do
		# El || cubre el fin de fichero: sin terminal, 'read' falla y con
		# 'set -e' el script moriría dentro de este bucle sin decir por qué.
		read -rp "  Puerto ${etiqueta} [${defecto}]: " valor \
			|| die "Se ha terminado la entrada sin que se eligiera un puerto."
		valor="${valor:-$defecto}"

		if ! puerto_valido "$valor"; then
			aviso "'${valor}' no es un puerto válido (entero entre 1 y 65535)."
			continue
		fi

		if puerto_ocupado_por_otro "$valor"; then
			quien=$(nombre_proceso_en_puerto "$valor")
			aviso "El puerto ${valor} ya lo está usando${quien:+ ${quien}}."
			echo  "       Tomcat no podría abrirlo. Pon otro."
			continue
		fi

		PUERTO_ESCOGIDO="$valor"
		return 0
	done
}

# Si el puerto viene en la línea de órdenes no se pregunta: quien lo ha
# escrito en la consola quiere automatizar, no que le pregunten otra vez.
if [ -n "$PUERTO_HTTP_ELEGIDO" ]; then
	PUERTO_HTTP="$PUERTO_HTTP_ELEGIDO"
	puerto_valido "$PUERTO_HTTP" || die "--puerto-http=${PUERTO_HTTP} no es un puerto válido."
else
	preguntar_puerto "HTTP (texto plano)" "$PUERTO_POR_DEFECTO"
	PUERTO_HTTP="$PUERTO_ESCOGIDO"
fi

echo
if [ -n "$PUERTO_HTTPS_ELEGIDO" ]; then
	# Si el puerto HTTPS viene en la línea de órdenes, HTTPS se da por
	# activado y no se pregunta: quien lo ha escrito ya ha contestado.
	PUERTO_HTTPS="$PUERTO_HTTPS_ELEGIDO"
	puerto_valido "$PUERTO_HTTPS" || die "--puerto-https=${PUERTO_HTTPS} no es un puerto válido."
	ok "HTTPS en ${PUERTO_HTTPS} (indicado en la línea de órdenes) para '${DOMINIO}'"
else
	read -rp "  ¿Activar HTTPS? [S/n] " _r
	if es_si "$_r"; then
		preguntar_puerto "HTTPS (TLS, el que se usa de verdad)" "$PUERTO_HTTPS"
		PUERTO_HTTPS="$PUERTO_ESCOGIDO"
		read -rp "  Nombre del servidor para el certificado [${DOMINIO}]: " _d
		DOMINIO="${_d:-$DOMINIO}"
		ok "HTTPS en ${PUERTO_HTTPS} para '${DOMINIO}'"
	else
		SIN_HTTPS=1
		ok "HTTPS desactivado"
	fi
fi
ok "HTTP en ${PUERTO_HTTP}"

# ─── ¿Base de datos aquí o en otro sitio? ────────────────────────────────────

echo
info "¿Dónde está la base de datos?"

read -rp "  ¿Instalar y configurar MySQL en ESTA máquina? [S/n] " _r
if es_si "$_r"; then
	MYSQL_LOCAL=1
	ok "MySQL local: se instala si falta y se configura aquí"
else
	MYSQL_LOCAL=0
	aviso "MySQL externo: no se instala ni se toca ningún servidor de base de datos."
fi

# ─────────────────────────────────────────────────────────────────────────────
# JAVA 21
# ─────────────────────────────────────────────────────────────────────────────

paso "Java ${JAVA_REQUERIDA}"

version_java_mayor() {
	java -version 2>&1 | head -1 | sed -E 's/.*version "([0-9]+).*/\1/'
}

# Descarga el JDK oficial de Eclipse Temurin y lo deja en /opt/java/jdk-21.
# Es el plan B: se usa cuando no hay apt o el repositorio no tiene el paquete.
instalar_java_descargando() {
	local arquitectura tmp destino
	case "$(uname -m)" in
		x86_64|amd64) arquitectura="x64" ;;
		aarch64|arm64) arquitectura="aarch64" ;;
		*) die "Arquitectura no soportada por Temurin en este script: $(uname -m)" ;;
	esac

	info "Descargando Eclipse Temurin (JDK ${JAVA_REQUERIDA}, ${arquitectura}, ~190 MB)"
	tmp=$(mktemp -d)
	descargar "${JAVA_TEMURIN}/${arquitectura}/jdk/hotspot/normal/eclipse" "${tmp}/jdk.tar.gz" \
		|| { rm -rf "$tmp"; return 1; }

	destino="${JAVA_DIR_OPT}/jdk-${JAVA_REQUERIDA}"
	rm -rf "${destino}.tmp"
	mkdir -p "${destino}.tmp"
	tar -xzf "${tmp}/jdk.tar.gz" -C "${destino}.tmp" --strip-components=1
	mv "${destino}.tmp" "$destino"
	rm -rf "$tmp"

	# Para shells nuevas: sin esto, quien abra otra terminal (y las tareas de
	# cron, que no leen /etc/profile) seguiría sin encontrar este java.
	cat > /etc/profile.d/java21.sh <<PERFIL
export JAVA_HOME=${destino}
export PATH=\$JAVA_HOME/bin:\$PATH
PERFIL
	chmod 644 /etc/profile.d/java21.sh
	export JAVA_HOME="$destino"
	export PATH="${JAVA_HOME}/bin:${PATH}"
	ok "Java ${JAVA_REQUERIDA} instalado en ${destino}"
}

if [ -n "$(command -v java || true)" ]; then
	JAVA_MAYOR=$(version_java_mayor)
else
	JAVA_MAYOR=""
fi

if [ -n "$JAVA_MAYOR" ] && [ "$JAVA_MAYOR" -ge "$JAVA_REQUERIDA" ] 2>/dev/null; then
	JAVA_HOME="$(dirname "$(dirname "$(readlink -f "$(command -v java)")")")"
	export JAVA_HOME
	ok "Java $(java -version 2>&1 | head -1 | cut -d'"' -f2) ya instalado (${JAVA_HOME})"
else
	if [ -n "$JAVA_MAYOR" ]; then
		aviso "La máquina tiene Java ${JAVA_MAYOR} y el proyecto pide ${JAVA_REQUERIDA}."
	else
		info "No hay Java instalado."
	fi

	if instalar_paquetes "openjdk-${JAVA_REQUERIDA}-jdk-headless"; then
		hash -r 2>/dev/null || true
		if [ -n "$(command -v java || true)" ]; then
			ok "OpenJDK ${JAVA_REQUERIDA} instalado con apt"
		fi
	fi

	# Comprobación real, no la del exit code de apt: un java antiguo ya
	# instalado hace que dpkg diga que el paquete está bien y no se toque
	# nada, y el script seguiría adelante con un Java incompatible.
	if [ -z "$(command -v java || true)" ] || [ "$(version_java_mayor)" -lt "$JAVA_REQUERIDA" ] 2>/dev/null; then
		aviso "apt no ha dejado una versión ${JAVA_REQUERIDA} utilizable; se descarga Temurin."
		instalar_java_descargando \
			|| die "No se ha podido instalar Java ${JAVA_REQUERIDA} ni con apt ni descargándolo."
	fi

	JAVA_MAYOR=$(version_java_mayor)
	JAVA_HOME="$(dirname "$(dirname "$(readlink -f "$(command -v java)")")")"
	export JAVA_HOME
fi

# Última comprobación antes de seguir: de aquí en adelante Maven, Tomcat y
# keytool asumen que java existe y es 21 o superior.
[ -n "$JAVA_MAYOR" ] && [ "$JAVA_MAYOR" -ge "$JAVA_REQUERIDA" ] 2>/dev/null \
	|| die "Sigue sin haber un Java ${JAVA_REQUERIDA} o superior (ahora: '${JAVA_MAYOR:-ninguno}')."
ok "Java en uso: $(java -version 2>&1 | head -1 | cut -d'"' -f2)"

# keytool es quien va a generar el certificado HTTPS más adelante.
if ! command -v keytool >/dev/null 2>&1; then
	instalar_paquetes "openjdk-${JAVA_REQUERIDA}-jdk-headless" || true
fi
command -v keytool >/dev/null 2>&1 || die "No encuentro keytool, que es necesario para el certificado HTTPS.
     Suele venir en el JDK: sudo apt install openjdk-${JAVA_REQUERIDA}-jdk-headless"
ok "keytool disponible (certificados TLS)"

# ─────────────────────────────────────────────────────────────────────────────
# MYSQL
# ─────────────────────────────────────────────────────────────────────────────

paso "MySQL"

MYSQL_FAMILIA=""

detectar_mysql() {
	if command -v mysqld >/dev/null 2>&1; then
		if mysqld --version 2>&1 | grep -qi mariadb; then MYSQL_FAMILIA="mariadb"; else MYSQL_FAMILIA="mysql"; fi
		return 0
	fi
	if command -v mariadbd >/dev/null 2>&1; then
		MYSQL_FAMILIA="mariadb"
		return 0
	fi
	return 1
}

arrancar_mysql() {
	local servicio=""
	for servicio in mysqld mysql mariadb; do
		if systemctl list-unit-files "${servicio}.service" --no-legend 2>/dev/null | grep -q .; then
			info "Arrancando el servicio ${servicio}"
			systemctl enable "$servicio" >/dev/null 2>&1 || true
			if systemctl restart "$servicio"; then
				ok "Servicio ${servicio} arrancado y habilitado al inicio"
				return 0
			fi
		fi
	done
	return 1
}

# Instalación por descarga del binario oficial, para sistemas sin apt.
instalar_mysql_descargando() {
	local arquitectura version url tmp dir
	case "$(uname -m)" in
		x86_64|amd64) arquitectura="x86_64" ;;
		aarch64|arm64) arquitectura="aarch64" ;;
		*) aviso "Arquitectura $(uname -m) sin binario genérico conocido; solo hay apt."; return 1 ;;
	esac

	for version in "${MYSQL_VERSIONES_TGZ[@]}"; do
		url="https://cdn.mysql.com/Downloads/MySQL-${version%.*}/mysql-${version}-linux-glibc${MYSQL_GLIBC_MIN}-${arquitectura}.tar.xz"

		info "Buscando el binario de MySQL ${version}"
		if ! curl -fsI --max-time 20 "$url" >/dev/null 2>&1; then
			continue
		fi

		tmp=$(mktemp -d)
		if ! descargar "$url" "${tmp}/mysql.tar.xz"; then
			rm -rf "$tmp"; continue
		fi

		dir="${MYSQL_DIR_OPT}-${version}"
		info "Extrayendo en ${MYSQL_DIR_OPT} (~1 GB, tarda)"
		rm -rf "${dir}.tmp"; mkdir -p "${dir}.tmp"
		tar -xJf "${tmp}/mysql.tar.xz" -C "${dir}.tmp" --strip-components=1
		rm -rf "$dir"
		mv "${dir}.tmp" "$dir"
		rm -rf "$tmp"
		ln -sfn "$dir" "$MYSQL_DIR_OPT"

		id -u mysql >/dev/null 2>&1 \
			|| useradd --system --home-dir "$MYSQL_DIR_OPT" --shell /usr/sbin/nologin mysql
		mkdir -p "$MYSQL_DATADIR" /var/run/mysqld
		chown -R mysql:mysql "$MYSQL_DATADIR" /var/run/mysqld

		# Sin --initialize no hay ninguna base de datos en el datadir y el
		# servidor se niega a arrancar ("datadir is not initialized").
		if [ -z "$(ls -A "$MYSQL_DATADIR" 2>/dev/null)" ]; then
			info "Inicializando el directorio de datos (tarda un poco)"
			"${MYSQL_DIR_OPT}/bin/mysqld" --initialize-insecure \
				--user=mysql --basedir="$MYSQL_DIR_OPT" --datadir="$MYSQL_DATADIR" \
				|| return 1
		fi

		cat > /etc/systemd/system/mysqld.service <<UNIT
[Unit]
Description=MySQL Server (instalado por desplegar.sh)
After=network.target

[Service]
Type=simple
User=mysql
Group=mysql
ExecStart=${MYSQL_DIR_OPT}/bin/mysqld --defaults-file=/etc/my-facturacion.cnf
Restart=on-failure
RestartSec=10
LimitNOFILE=65535
TimeoutStartSec=600

[Install]
WantedBy=multi-user.target
UNIT

		# mysqlx=OFF evita que el servidor intente abrir el 33060, que en
		# una máquina con otro MySQL ya ocupado daría un fallo al arrancar.
		cat > /etc/my-facturacion.cnf <<CNF
[mysqld]
user            = mysql
basedir         = ${MYSQL_DIR_OPT}
datadir         = ${MYSQL_DATADIR}
socket          = ${MYSQL_SOCKET}
pid-file        = /var/run/mysqld/mysqld.pid
port            = ${MYSQL_PUERTO}
mysqlx          = OFF
log-error       = /var/log/mysql/error.log
CNF
		mkdir -p /var/log/mysql
		chown mysql:mysql /var/log/mysql

		systemctl daemon-reload
		systemctl enable mysqld >/dev/null 2>&1 || true
		ok "MySQL ${version} instalado en ${MYSQL_DIR_OPT}"
		return 0
	done

	aviso "No se ha encontrado ningún binario de MySQL descargable en cdn.mysql.com."
	return 1
}

# Todo lo de abajo solo tiene sentido si la base de datos va en esta máquina.
# Con una base externa el script no instala ni arranca ningún servidor: solo
# deja los datos de conexión bien escritos en application.properties.
if [ "$MYSQL_LOCAL" -eq 0 ]; then
	aviso "Saltada la instalación de MySQL: has indicado que la base está en otro sitio."
	ok "No se ha tocado ningún servidor de base de datos"
	MYSQL_FAMILIA="externa"
	MYSQL_PUERTO=3306
else

	if detectar_mysql; then
		# Puerto con el que escucha el servidor ya instalado. 'mysqld --help'
		# lo escribe como una línea "port   3306" (columnas separadas por
		# espacios, sin '='), tanto en MySQL como en MariaDB.
		MYSQL_PUERTO_DETECTADO=$(mysqld --verbose --help 2>/dev/null \
			| awk '$1 == "port" && $2 ~ /^[0-9]+$/ { print $2; exit }' || true)
		[ -n "${MYSQL_PUERTO_DETECTADO:-}" ] && MYSQL_PUERTO="$MYSQL_PUERTO_DETECTADO"
		ok "Ya está instalado: ${MYSQL_FAMILIA} en el puerto ${MYSQL_PUERTO}"
	else
		info "No hay servidor de base de datos instalado; se instala MySQL."
		MYSQL_OK=0

		# Se prueban los nombres de paquete en orden: en Ubuntu 24.04 el que
		# trae MySQL 8.4 es mysql-server-8.4; en 22.04 y en Debian es
		# mysql-server.
		for paquete in mysql-server-8.4 mysql-server-8.0 mysql-server default-mysql-server; do
			info "Probando el paquete '${paquete}'"
			if instalar_paquetes "$paquete" && detectar_mysql; then
				MYSQL_OK=1
				break
			fi
		done

		if [ "$MYSQL_OK" -eq 0 ]; then
			aviso "apt no ha servido; se prueba la descarga del binario oficial."
			instalar_mysql_descargando && detectar_mysql && MYSQL_OK=1 || true
		fi

		[ "$MYSQL_OK" -eq 1 ] || die "No he podido instalar MySQL.
     Instálalo a mano con uno de estos y vuelve a ejecutar el script:
       sudo apt install mysql-server          (Debian/Ubuntu)
       sudo apt install default-mysql-server   (alias del mismo)"

		if ! arrancar_mysql; then
			aviso "El servicio de MySQL no arrancó con systemctl."
		fi
		ok "MySQL instalado"
	fi

	# El servidor puede tardar unos segundos en aceptar conexiones tras
	# arrancar. mysqladmin ping es la prueba de que escucha de verdad, no solo
	# de que el proceso existe; pero en un servidor con contraseña puesta
	# responde "Access denied" aunque esté perfectamente sano, así que un
	# servicio activo también cuenta como "está en pie".
	info "Esperando a que MySQL acepte conexiones..."
	MYSQL_LISTO=0
	ESPERA_MYSQL=0
	while [ "$ESPERA_MYSQL" -lt 60 ]; do
		if mysqladmin ping >/dev/null 2>&1 \
			|| mysqladmin --socket="$MYSQL_SOCKET" ping >/dev/null 2>&1 \
			|| systemctl is-active --quiet "mysql" \
			|| systemctl is-active --quiet "mysqld" \
			|| systemctl is-active --quiet "mariadb"; then
			MYSQL_LISTO=1
			break
		fi
		sleep 2
		ESPERA_MYSQL=$((ESPERA_MYSQL + 2))
	done

	if [ "$MYSQL_LISTO" -eq 1 ]; then
		ok "MySQL responde en localhost:${MYSQL_PUERTO}"
	else
		aviso "MySQL no contesta a ping. Puede que tarde más; si el despliegue falla,
       mira: sudo journalctl -u ${MYSQL_FAMILIA} -n 50 --no-pager"
	fi

fi   # fin del if MYSQL_LOCAL

# ─────────────────────────────────────────────────────────────────────────────
# BASE DE DATOS: USUARIO, CONTRASEÑA Y ESQUEMA
# ─────────────────────────────────────────────────────────────────────────────

paso "Configurando la base de datos"

mkdir -p "$CONFIG_DIR"
chmod 750 "$CONFIG_DIR"

DB_USER=""
DB_PASS=""
DB_HOST="localhost"
KEYSTORE_PASS=""
DOMINIO_KEYSTORE=""

# Si ya hay una configuración guardada, sus valores salen como propuesta: las
# preguntas que vienen después los ofrecen como defecto. Preguntar de cero en
# cada redespliegue invitaba a teclear una contraseña distinta cada vez, que es
# la forma más rápida de dejar la aplicación sin poder conectar con su base.
if [ -f "$CONFIG_FILE" ]; then
	DB_USER=$(leer_env SPRING_DATASOURCE_USERNAME)
	DB_PASS=$(leer_env SPRING_DATASOURCE_PASSWORD)
	KEYSTORE_PASS=$(leer_env TOMCAT_HTTPS_KEYSTORE_PASSWORD)
	DOMINIO_KEYSTORE=$(leer_env TOMCAT_HTTPS_DOMINIO)
	DB_URL=$(leer_env SPRING_DATASOURCE_URL)
	if [ -n "$DB_URL" ]; then
		DB_HOST="$(printf '%s' "$DB_URL" | sed -nE 's|^jdbc:mysql://([^:/]+).*|\1|p')"
		DB_HOST="${DB_HOST:-localhost}"
		DB_NAME="$(printf '%s' "$DB_URL" | sed -nE 's|^jdbc:mysql://[^/]+/([^?]+).*|\1|p')"
		[ -n "$DB_NAME" ] || DB_NAME="bd_facturacion"
		ok "Hay una configuración guardada: ${DB_USER}@${DB_HOST}/${DB_NAME}"
	fi
fi

# ─── Base de datos externa: aquí solo se anotan los datos ────────────────────

if [ "$MYSQL_LOCAL" -eq 0 ]; then
	echo
	read -rp "  Host o IP del servidor de MySQL [localhost]: " _h
	DB_HOST="${_h:-localhost}"

	read -rp "  Puerto [${MYSQL_PUERTO}]: " _p
	MYSQL_PUERTO="${_p:-$MYSQL_PUERTO}"
	puerto_valido "$MYSQL_PUERTO" || die "El puerto '${MYSQL_PUERTO}' no es válido."

	read -rp "  Nombre de la base [${DB_NAME}]: " _n
	DB_NAME="${_n:-$DB_NAME}"

	read -rp "  Usuario [root]: " _u
	DB_USER="${_u:-root}"

	pedir_password "  Contraseña"
	DB_PASS="$PASSWORD_ESCOGIDA"

	DB_URL="jdbc:mysql://${DB_HOST}:${MYSQL_PUERTO}/${DB_NAME}?${DB_PARAMETROS_JDBC}"

	ok "Base externa: ${DB_USER}@${DB_HOST}:${MYSQL_PUERTO}/${DB_NAME}"
	aviso "No se ha creado nada en ese servidor: la base, el usuario y las tablas"
	echo  "       tienen que existir ya. Compruébalo con:"
	echo "         mysql -h ${DB_HOST} -P ${MYSQL_PUERTO} -u ${DB_USER} -p -e 'SHOW TABLES;' ${DB_NAME}"
else

# ─── Base local: se crea usuario, contraseña, base y esquema ─────────────────

echo
info "Voy a crear un usuario de MySQL solo para la aplicación, con permisos"
echo  "   sobre '${DB_NAME}' y sobre nada más. No hace falta que sea root."

read -rp "  Nombre de la base [${DB_NAME}]: " _n
DB_NAME="${_n:-$DB_NAME}"

read -rp "  Usuario de MySQL [${DB_USUARIO_DEFECTO}]: " _u
DB_USER="${_u:-$DB_USUARIO_DEFECTO}"

read -rp "  ¿Generar una contraseña aleatoria? [S/n] " _gen
if es_si "$_gen"; then
	DB_PASS="$(aleatorio 24)"
	ok "Contraseña generada: ${DB_PASS}"
	echo  "       Queda en ${PROPERTIES}. Cópiala en tu gestor de contraseñas:"
	echo  "       no vuelve a mostrarse."
else
	pedir_password "  Contraseña de MySQL"
	DB_PASS="$PASSWORD_ESCOGIDA"
	if [ -z "$DB_PASS" ]; then
		aviso "Contraseña vacía: MySQL aceptará el acceso sin contraseña. Eso es"
		echo  "       una puerta abierta; se permite, pero no es lo correcto."
	fi
fi

DB_URL="jdbc:mysql://localhost:${MYSQL_PUERTO}/${DB_NAME}?${DB_PARAMETROS_JDBC}"

# ─── Acceso administrativo a MySQL ───────────────────────────────────────────
#
# Para crear la base y el usuario hace falta una cuenta con permisos. En una
# instalación recién hecha de MySQL o MariaDB en Debian/Ubuntu, root entra sin
# contraseña por el socket (plugin unix_socket); si alguien la puso, se prueban
# las demás vías antes de rendirse. El orden importa: primero lo que no
# necesita nada de este script, después lo que sí.
MYSQL_ADMIN=()
MYSQL_ADMIN_PWD=""

configurar_acceso_admin() {
	# 1) root por socket, sin contraseña (MySQL/MariaDB recién instalados).
	if mysql -u root -e 'SELECT 1' >/dev/null 2>&1; then
		MYSQL_ADMIN=(mysql -u root)
		ok "Acceso administrativo: root por socket"
		return 0
	fi

	# 2) La cuenta de mantenimiento que crea el propio paquete en Debian.
	if [ -f /etc/mysql/debian.cnf ]; then
		if mysql --defaults-file=/etc/mysql/debian.cnf -e 'SELECT 1' >/dev/null 2>&1; then
			MYSQL_ADMIN=(mysql --defaults-file=/etc/mysql/debian.cnf)
			ok "Acceso administrativo: /etc/mysql/debian.cnf"
			return 0
		fi
	fi

	# 3) ~/.my.cnf del root, si alguien guardó ahí sus credenciales.
	if [ -f /root/.my.cnf ] && mysql -e 'SELECT 1' >/dev/null 2>&1; then
		MYSQL_ADMIN=(mysql)
		ok "Acceso administrativo: /root/.my.cnf"
		return 0
	fi

	# 4) root con la contraseña que se acaba de escribir para el usuario.
	#    Solo aplica si el usuario elegido ES root.
	if [ "$DB_USER" = "root" ]; then
		if MYSQL_PWD="$DB_PASS" mysql -u root -e 'SELECT 1' >/dev/null 2>&1; then
			MYSQL_ADMIN=(mysql -u root)
			MYSQL_ADMIN_PWD="$DB_PASS"
			ok "Acceso administrativo: root con la contraseña indicada"
			return 0
		fi
	fi

	# 5) El propio usuario de la aplicación, si ya existe y puede crear.
	if MYSQL_PWD="$DB_PASS" mysql -u"$DB_USER" -e 'SELECT 1' >/dev/null 2>&1; then
		MYSQL_ADMIN=(mysql -u "$DB_USER")
		MYSQL_ADMIN_PWD="$DB_PASS"
		ok "Acceso administrativo: el usuario '${DB_USER}' ya existente"
		return 0
	fi

	# 6) Última opción: preguntar la contraseña de root. Es lo único que queda
	#    por probar, y casi siempre es lo que hace falta en un servidor ya
	#    montado por alguien.
	local pass
	aviso "No he podido entrar como administrador con ninguna de las vías automáticas."
	echo
	pedir_password "  Contraseña de root de MySQL"
	pass="$PASSWORD_ESCOGIDA"
	if [ -n "$pass" ] && MYSQL_PWD="$pass" mysql -u root -e 'SELECT 1' >/dev/null 2>&1; then
		MYSQL_ADMIN=(mysql -u root)
		MYSQL_ADMIN_PWD="$pass"
		ok "Acceso administrativo: root con contraseña escrita a mano"
		return 0
	fi

	die "No puedo entrar en MySQL como administrador.
     Ninguna de estas vías funciona:
       mysql -u root                          (sin contraseña)
       mysql --defaults-file=/etc/mysql/debian.cnf
       mysql                                  (con /root/.my.cnf)
       mysql -u '${DB_USER}' -p...            (con la contraseña del usuario)
     Si el servidor usa otro socket u otro puerto, añade lo que falte aquí."
}

admin_mysql() {
	if [ -n "$MYSQL_ADMIN_PWD" ]; then
		MYSQL_PWD="$MYSQL_ADMIN_PWD" "${MYSQL_ADMIN[@]}" "$@"
	else
		"${MYSQL_ADMIN[@]}" "$@"
	fi
}

configurar_acceso_admin

# ─── Base, usuario y permisos ────────────────────────────────────────────────

info "Asegurando la base '${DB_NAME}' y el usuario '${DB_USER}'"

# El nombre de la base y el del usuario no se escapan porque los genera este
# script o los ha escrito el usuario en el prompt (solo [A-Za-z0-9_]), y una
# comilla de más lo convertiría en inyección de SQL silenciosa. Aun así se
# filtra: es una línea de más y evita tener que confiar en eso.
sanear() {
	printf '%s' "$1" | tr -cd 'A-Za-z0-9_-'
}
DB_NAME_SEGURA="$(sanear "$DB_NAME")"
DB_USER_SEGURO="$(sanear "$DB_USER")"
[ "$DB_NAME_SEGURA" = "$DB_NAME" ] || die "El nombre de la base '${DB_NAME}' tiene caracteres no permitidos."
[ "$DB_USER_SEGURO" = "$DB_USER" ] || die "El nombre de usuario '${DB_USER}' tiene caracteres no permitidos."

# La contraseña va entre comillas en el SQL. Si la ha tecleado el usuario puede
# traer casi cualquier cosa, así que se escapan a mano lo que rompería el
# literal: la comilla simple, la doble, la barra y el % (que en una URL JDBC
# es un carácter de escape).
PASS_SQL="${DB_PASS//\'/\'\'}"
PASS_SQL="${PASS_SQL//\\/\\\\}"

admin_mysql -e "
CREATE DATABASE IF NOT EXISTS \`${DB_NAME_SEGURA}\`
	CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER_SEGURO}'@'localhost' IDENTIFIED BY '${PASS_SQL}';
ALTER USER '${DB_USER_SEGURO}'@'localhost' IDENTIFIED BY '${PASS_SQL}';
GRANT ALL PRIVILEGES ON \`${DB_NAME_SEGURA}\`.* TO '${DB_USER_SEGURO}'@'localhost';
" || die "No se ha podido crear el usuario '${DB_USER}' o la base '${DB_NAME}' en MySQL."

# El driver JDBC se conecta por TCP a localhost, y según la versión puede
# resolver el nombre a ::1 en vez de a 127.0.0.1. MySQL registra la conexión
# con el host que ve en el momento de abrirla, así que hace falta también la
# cuenta para 127.0.0.1 o la conexión falla con "Access denied" sin explicación
# clara.
admin_mysql -e "
CREATE USER IF NOT EXISTS '${DB_USER_SEGURO}'@'127.0.0.1' IDENTIFIED BY '${PASS_SQL}';
ALTER USER '${DB_USER_SEGURO}'@'127.0.0.1' IDENTIFIED BY '${PASS_SQL}';
GRANT ALL PRIVILEGES ON \`${DB_NAME_SEGURA}\`.* TO '${DB_USER_SEGURO}'@'127.0.0.1';
" 2>/dev/null || aviso "No se ha podido crear la cuenta para 127.0.0.1; si la aplicación no conecta, probablemente es esto."

ok "Usuario '${DB_USER}' con permisos solo sobre '${DB_NAME}'"

# ─── Esquema ─────────────────────────────────────────────────────────────────

TABLAS=$(admin_mysql -N -B -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${DB_NAME_SEGURA}';" 2>/dev/null || echo "")

if [ "${TABLAS:-0}" -gt 0 ] 2>/dev/null; then
	ok "La base ya tiene ${TABLAS} tablas; no se toca el esquema"
elif [ -f "$ESQUEMA_SQL" ]; then
	info "La base está vacía; se carga el esquema ${ESQUEMA_SQL}"
	admin_mysql "$DB_NAME_SEGURA" < "$ESQUEMA_SQL" \
		|| die "Falló la carga del esquema ${ESQUEMA_SQL}.
     Si la base ya tenía datos a medias, míralo con:
       sudo mysql ${DB_NAME_SEGURA} -e 'SHOW TABLES;'"
	ok "Esquema cargado"
	aviso "El esquema mete las cuentas de ejemplo admin y datos con contraseña"
	echo  "       'CambiarYa.2026'. Cámbialas antes de exponer esto a internet."
else
	aviso "No encuentro ${ESQUEMA_SQL}; la base queda vacía y la aplicación no"
	echo  "       tendrá tablas. Créala a mano o pon el fichero en su sitio."
fi

# ─── Comprobación de que la aplicación podrá conectar ─────────────────────────

if MYSQL_PWD="$DB_PASS" mysql -u"$DB_USER_SEGURO" -h127.0.0.1 -P"$MYSQL_PUERTO" \
		-e "USE \`${DB_NAME_SEGURA}\`; SELECT 1;" >/dev/null 2>&1; then
	ok "Conexión comprobada: ${DB_USER}@127.0.0.1:${MYSQL_PUERTO}/${DB_NAME}"
else
	aviso "El usuario '${DB_USER}' no ha podido conectar por TCP a 127.0.0.1."
	echo  "       Suele ser que MySQL escucha solo por el socket; compruébalo con:"
	echo "         sudo mysql -e \"SHOW VARIABLES LIKE 'bind_address';\""
fi

fi   # fin del "if MYSQL_LOCAL"



# ─── Fichero de configuración con permisos 600 ───────────────────────────────
#
# El nombre de las variables NO es libre: tienen que llamarse
# SPRING_DATASOURCE_* porque es como Spring Boot traduce una variable de
# entorno a su propiedad interna (SPRING_DATASOURCE_URL ->
# spring.datasource.url). Con otros nombres, tipo DB_PASS, Tomcat las cargaría
# bien pero Spring las ignoraría en silencio y se conectaría con el root/root de
# application.properties. Al ser variables de entorno, además, tienen prioridad
# sobre ese fichero, que es justo lo que se quiere: cambiar la contraseña aquí
# y reiniciar Tomcat es más rápido que volver a compilar.
#
# La contraseña va entre comillas dobles porque el formato de EnvironmentFile de
# systemd parte la línea por espacios: sin comillas, una contraseña con espacios
# se cortaría en dos.

if [ -z "$KEYSTORE_PASS" ]; then
	# Hay keystore pero no sabemos de dónde salió la contraseña: sin ella,
	# Tomcat no abre el TLS y el síntoma es un 404 en el puerto HTTPS. Se
	# pregunta, y se comprueba con keytool antes de darla por buena.
	if [ -f "$KEYSTORE_FILE" ]; then
		aviso "Hay un keystore en ${KEYSTORE_FILE} pero su contraseña no está"
		echo  "       guardada. Con un keystore puesto a mano no se puede generar"
		echo  "       otro: hay que conocer la clave del que ya está."
		KEYSTORE_OK=0
		intentos=0
		while [ "$KEYSTORE_OK" -eq 0 ] && [ "$intentos" -lt 3 ]; do
			pedir_password "  Contraseña de ${KEYSTORE_FILE}"
			if keytool -list -keystore "$KEYSTORE_FILE" -storepass "$PASSWORD_ESCOGIDA" >/dev/null 2>&1; then
				KEYSTORE_PASS="$PASSWORD_ESCOGIDA"
				KEYSTORE_OK=1
			else
				aviso "Esa contraseña no abre el keystore."
				intentos=$((intentos + 1))
			fi
		done
		[ "$KEYSTORE_OK" -eq 1 ] || die "No he podido abrir ${KEYSTORE_FILE}. Sin esa contraseña el
     HTTPS no arranca. Opciones: dejar el keystore donde está y anotar su
     contraseña a mano en ${CONFIG_FILE}
     (TOMCAT_HTTPS_KEYSTORE_PASSWORD=...), o borrarlo y dejar que este
     script genere uno nuevo:
       sudo rm ${KEYSTORE_FILE}"
	else
		KEYSTORE_PASS="$(aleatorio 32)"
	fi
fi
if [ -z "$DOMINIO_KEYSTORE" ]; then
	DOMINIO_KEYSTORE="$DOMINIO"
fi

cat > "$CONFIG_FILE" <<EOF
# Configuración de Facturacion360 - generada por desplegar.sh
#
# Permisos 600: este fichero contiene la contraseña de la base de datos y la
# del keystore HTTPS. Lo carga Tomcat al arrancar como variables de entorno
# (EnvironmentFile en tomcat.service), y Spring las aplica por encima de
# application.properties.
#
# Editarlo a mano está bien; lo que NO se puede es renombrar las variables:
# tienen que conservar el prefijo SPRING_DATASOURCE_.

SPRING_DATASOURCE_URL=${DB_URL}
SPRING_DATASOURCE_USERNAME=${DB_USER}
SPRING_DATASOURCE_PASSWORD="${DB_PASS}"
SPRING_DATASOURCE_DRIVER_CLASS_NAME=com.mysql.cj.jdbc.Driver

# Contraseña y nombre del certificado TLS. Tomcat los recibe como propiedades
# del sistema (-D) desde tomcat.service.d/https.conf y los usa para sustituir
# los \${...} de server.xml. Cambiarlos aquí exige reiniciar Tomcat.
TOMCAT_HTTPS_KEYSTORE_PASSWORD="${KEYSTORE_PASS}"
TOMCAT_HTTPS_DOMINIO="${DOMINIO_KEYSTORE}"
EOF
chmod 600 "$CONFIG_FILE"
# root:tomcat para que el usuario de servicio pueda leerlo, pero sin poder
# escribirlo. En realidad lo lee systemd como root, no Tomcat; se deja el grupo
# por si alguien quiere inspeccionarlo con sudo -u tomcat.
chown root:"$TOMCAT_GROUP" "$CONFIG_FILE" 2>/dev/null || true
ok "Configuración guardada en ${CONFIG_FILE} (permisos 600)"

# ─────────────────────────────────────────────────────────────────────────────
# application.properties
# ─────────────────────────────────────────────────────────────────────────────

paso "Escribiendo las credenciales en application.properties"

# El WAR se compila desde este fichero, así que la contraseña tiene que estar
# aquí también. Eso lo mete en el repositorio, que no es lo ideal, pero es lo
# que pide el encargo: si el properties y la base no coinciden, la aplicación
# arranca y falla al primer acceso con un error de autenticación de MySQL que
# no señala el origen.
#
# Mitigaciones: copia del original con permisos 600 y aviso al final para que
# nadie lo suba a git por descuido.
[ -f "$PROPERTIES" ] || die "No encuentro ${PROPERTIES}. Ejecuta el script desde la raíz del proyecto."

if [ ! -e "${PROPERTIES}.orig" ]; then
	cp "$PROPERTIES" "${PROPERTIES}.orig"
	chmod 600 "${PROPERTIES}.orig"
	ok "Copia del original guardada en ${PROPERTIES}.orig"

	# .git/info/exclude es el sitio para esto: ignora el fichero solo en esta
	# copia del repositorio, sin tocar el .gitignore que se sube. El
	# properties en sí está versionado, así que de él hay que ocuparse con
	# git update-index --skip-worktree (se recuerda al final).
	RAIZ_GIT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
	if [ -n "$RAIZ_GIT" ] && [ -d "${RAIZ_GIT}/.git" ] \
			&& [ -w "${RAIZ_GIT}/.git/info" ]; then
		if ! grep -qxF "$(basename "$PROPERTIES").orig" "${RAIZ_GIT}/.git/info/exclude" 2>/dev/null; then
			echo "$(basename "$PROPERTIES").orig" >> "${RAIZ_GIT}/.git/info/exclude"
			ok "Añadido a .git/info/exclude para que no salga en 'git status'"
		fi
	fi
fi

# Se sustituye línea a línea. awk y no sed porque los valores llevan & (en la
# URL JDBC) y en el lado derecho de un sed ese carácter significa "todo el
# texto encontrado": la URL se escribiría corrupta.
#
# La clave se compara partida por el primer '=', sin expresiones regulares: con
# regex, los puntos de 'spring.datasource.url' son comodines y hay que
# escaparlos, y escaparlos con gsub() además devuelve el número de
# sustituciones (no la cadena), que es un bug silencioso que deja las claves
# escritas como 'spring\.datasource\.url'.
setear_propiedad() {
	local fichero="$1" clave="$2" valor="$3"
	awk -v clave="$clave" -v valor="$valor" '
		{
			n = split($0, parte, "=")
			izquierda = parte[1]
			gsub(/^[[:space:]]+|[[:space:]]+$/, "", izquierda)
			if (n >= 2 && izquierda == clave) {
				if (!puesta) { print clave "=" valor; puesta = 1 }
				next
			}
			print
		}
		END { if (!puesta) print clave "=" valor }
	' "$fichero" > "${fichero}.tmp" && mv "${fichero}.tmp" "$fichero"
}

setear_propiedad "$PROPERTIES" "spring.datasource.url"           "$DB_URL"
setear_propiedad "$PROPERTIES" "spring.datasource.username"       "$DB_USER"
setear_propiedad "$PROPERTIES" "spring.datasource.password"       "$DB_PASS"
setear_propiedad "$PROPERTIES" "spring.datasource.driver-class-name" "com.mysql.cj.jdbc.Driver"

# Con HTTPS activo la cookie de sesión tiene que ir solo por HTTPS: si se deja
# en false, viaja en claro y cualquier red intermedia la lee.
if [ "$SIN_HTTPS" -eq 0 ]; then
	setear_propiedad "$PROPERTIES" "server.servlet.session.cookie.secure" "true"
else
	setear_propiedad "$PROPERTIES" "server.servlet.session.cookie.secure" "false"
fi

ok "Credenciales escritas en ${PROPERTIES}"

# ─────────────────────────────────────────────────────────────────────────────
# MAVEN
# ─────────────────────────────────────────────────────────────────────────────

paso "Maven"

MVN_CMD=""
MVN_DESCARTADOS=()

# Cada candidato se PRUEBA antes de aceptarlo: no basta con que el fichero
# exista. El ./mvnw del repositorio, por ejemplo, es ejecutable pero está
# roto (le falta el directorio .mvn/wrapper/), así que si solo se mirase
# "existe y tiene permiso x" el script lo elegiría y el build fallaría con un
# error que no tiene nada que ver con Maven.
probar_maven() {
	local candidato="$1"
	"$candidato" -v >/dev/null 2>&1
}

buscar_maven() {
	MVN_CMD=""
	MVN_DESCARTADOS=()
	local candidato
	for candidato in mvn /opt/maven/bin/mvn ./mvnw \
	                 "$HOME"/.m2/wrapper/dists/apache-maven-*/*/bin/mvn; do
		# Descarta el literal del glob si no expandió a nada.
		[ -e "$candidato" ] || continue
		command -v "$candidato" >/dev/null 2>&1 || [ -x "$candidato" ] || continue

		if probar_maven "$candidato"; then
			MVN_CMD="$candidato"
			return 0
		fi
		MVN_DESCARTADOS+=("$candidato")
	done
	return 1
}

buscar_maven

if [ -z "$MVN_CMD" ]; then
	aviso "No hay ningún Maven en la máquina."

	# 1) El paquete de la distribución. Es lo normal y lo más rápido.
	if instalar_paquetes maven; then
		hash -r 2>/dev/null || true
		buscar_maven || true
	fi

	# 2) Descarga del binario oficial, para sistemas sin apt o sin paquete.
	if [ -z "$MVN_CMD" ]; then
		aviso "apt no ha servido; se descarga Maven de Apache."
		instalar_maven_descargando
		buscar_maven || true
	fi
fi

if [ -n "$MVN_CMD" ]; then
	for descartado in ${MVN_DESCARTADOS[@]+"${MVN_DESCARTADOS[@]}"}; do
		aviso "Descartado ${descartado}: existe pero no arranca (falta .mvn/wrapper/)"
	done
fi

[ -n "$MVN_CMD" ] || die "No encuentro un Maven que funcione, ni instalado ni
     descargado. Instálalo a mano con  sudo apt install maven
     y vuelve a ejecutar el script. Si lo instalas en otro sitio, ejecútalo
     con la ruta puesta en el PATH."

info "Usando: ${MVN_CMD} ($("$MVN_CMD" -v 2>/dev/null | head -1))"

# ─────────────────────────────────────────────────────────────────────────────
# COMPILACIÓN
# ─────────────────────────────────────────────────────────────────────────────

paso "Compilando la aplicación (WAR)"

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

# El puerto ya está elegido desde el principio del script, pero se vuelve a
# comprobar aquí: entre la pregunta y ahora ha podido aparecer alguien en ese
# puerto (el Tomcat de una ejecución anterior, otro servicio...). Esta es la
# última comprobación antes de escribir server.xml.
if puerto_ocupado_por_otro "$PUERTO_HTTP"; then
	quien=$(nombre_proceso_en_puerto "$PUERTO_HTTP")
	die "El puerto HTTP ${PUERTO_HTTP} ha pasado a estar ocupado${quien:+ por ${quien}}
     entre la pregunta y ahora. Vuelve a ejecutar el script y elige otro."
fi
ok "Puerto HTTP: ${PUERTO_HTTP}"

# ─── Puerto en server.xml ────────────────────────────────────────────────────

# Puerto que hay PUESTO ahora mismo en el conector HTTP de server.xml. En una
# instalación recién descomprimida es 8080; en una reejecución del script, el
# que se eligió la vez pasada.
#
# Se localiza primero la LÍNEA del conector HTTP y luego el atributo port de
# esa línea, en vez de un único regex que buscara 'protocol' y 'port' a la vez:
# el orden de los atributos no está garantizado (en Tomcat 11 el port va
# antes que protocol) y una barra de 'HTTP/1.1' rompe el delimitador de sed.
PUERTO_ACTUAL=$(grep -m1 'protocol="HTTP/1.1"' "$SERVER_XML" \
	| grep -oE 'port="[0-9]+"' | head -1 | grep -oE '[0-9]+')
[ -z "$PUERTO_ACTUAL" ] && PUERTO_ACTUAL="$PUERTO_POR_DEFECTO"

if [ "$PUERTO_HTTP" != "$PUERTO_ACTUAL" ]; then
	# El puerto se cambia SOLO dentro del conector HTTP, no con un
	# s|port="8080"|port="9090"|g sobre el fichero entero: ese "g" también
	# se llevaría por delante el conector HTTPS que dejó la ejecución
	# anterior, si por casualidad compartían número. Aquí se reescribe el
	# elemento <Connector ... protocol="HTTP/1.1"> entero y nada más.
	export PUERTO_HTTP
	perl_multilinea "$SERVER_XML" '
		s{(<Connector\b[^>]*?protocol="HTTP/1\.1"[^>]*?)\bport="[0-9]+"}{$1port="$ENV{PUERTO_HTTP}"}g;
	'
	ok "server.xml actualizado (${PUERTO_ACTUAL} -> ${PUERTO_HTTP})"
fi

# El puerto de apagado (8005) es el que le dice a Tomcat que pare. No se
# pregunta porque casi nunca estorba, pero si está ocupado Tomcat no arranca
# y el error del log ("Port 8005 already in use") no señala al culpable.
PUERTO_SHUTDOWN=$(sed -nE 's|.*<Server port="([0-9]+)".*|\1|p' "$SERVER_XML" | head -1)
if [ -n "$PUERTO_SHUTDOWN" ] && puerto_ocupado_por_otro "$PUERTO_SHUTDOWN"; then
	PUERTO_SHUTDOWN_NUEVO=8005
	while puerto_ocupado_por_otro "$PUERTO_SHUTDOWN_NUEVO"; do
		PUERTO_SHUTDOWN_NUEVO=$((PUERTO_SHUTDOWN_NUEVO + 1))
	done
	sed -i "s|<Server port=\"${PUERTO_SHUTDOWN}\"|<Server port=\"${PUERTO_SHUTDOWN_NUEVO}\"|" "$SERVER_XML"
	aviso "El puerto de apagado ${PUERTO_SHUTDOWN} estaba ocupado; ahora es ${PUERTO_SHUTDOWN_NUEVO}."
fi

# El manager y el host-manager traen credenciales por defecto publicadas
# (tomcat/tomcat). Se borran: no aportan nada aquí y son una puerta abierta.
TOMCAT_USERS="${TOMCAT_DIR}/conf/tomcat-users.xml"
if [ -f "$TOMCAT_USERS" ]; then
	[ -e "${TOMCAT_USERS}.orig" ] || cp "$TOMCAT_USERS" "${TOMCAT_USERS}.orig"
	cat > "$TOMCAT_USERS" <<'XML'
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

# ─────────────────────────────────────────────────────────────────────────────
# HTTPS
# ─────────────────────────────────────────────────────────────────────────────

paso "Configurando HTTPS"

if [ "$SIN_HTTPS" -eq 1 ]; then
	aviso "--sin-https: no se toca el conector HTTPS ni el certificado."
	ok "La aplicación queda solo en HTTP, en el puerto ${PUERTO_HTTP}"
else
	# ─── Puerto ──────────────────────────────────────────────────────────────
	#
	# También se vuelve a comprobar, por lo mismo que el HTTP.
	if puerto_ocupado_por_otro "$PUERTO_HTTPS"; then
		quien=$(nombre_proceso_en_puerto "$PUERTO_HTTPS")
		die "El puerto HTTPS ${PUERTO_HTTPS} ha pasado a estar ocupado${quien:+ por ${quien}}
     entre la pregunta y ahora. Vuelve a ejecutar el script y elige otro."
	fi
	ok "Puerto HTTPS: ${PUERTO_HTTPS}"

	# ─── Certificado ─────────────────────────────────────────────────────────
	#
	# Si ya hay un keystore no se toca: es el que ha traído el usuario, y
	# regenerarlo invalidaría el que le haya emitido su CA.
	if [ -f "$KEYSTORE_FILE" ]; then
		ok "Certificado existente: ${KEYSTORE_FILE}"
		aviso "Para usar el tuyo, ponlo en ${KEYSTORE_FILE} y su contraseña en"
		echo  "       ${CONFIG_FILE} (TOMCAT_HTTPS_KEYSTORE_PASSWORD)."
	else
		info "Generando un certificado autofirmado para '${DOMINIO_KEYSTORE}'"

		# SAN es obligatorio desde Chrome 58: un certificado con solo el CN ya
		# no se acepta y el navegador dice NET::ERR_CERT_COMMON_NAME_INVALID
		# aunque el resto esté bien. Se incluyen localhost y 127.0.0.1 para
		# poder probar en la propia máquina.
		keytool -genkeypair \
			-alias "$KEYSTORE_ALIAS" \
			-keyalg RSA \
			-keysize 2048 \
			-validity 825 \
			-dname "CN=${DOMINIO_KEYSTORE}, OU=Facturacion360, O=Facturacion360, C=ES" \
			-ext "SAN=dns:${DOMINIO_KEYSTORE},dns:localhost,ip:127.0.0.1" \
			-keystore "$KEYSTORE_FILE" \
			-storetype PKCS12 \
			-storepass "$KEYSTORE_PASS" \
			|| die "keytool no ha podido generar el keystore ${KEYSTORE_FILE}."

		# 640 root:tomcat. Tomcat lo lee como el usuario de servicio (que no
		# es root), pero nobody tiene que poder escribirlo: cualquiera que
		# pueda escribir un keystore puede suplantar el servidor.
		chown root:"$TOMCAT_GROUP" "$KEYSTORE_FILE"
		chmod 640 "$KEYSTORE_FILE"
		ok "Keystore creado: ${KEYSTORE_FILE} (válido 825 días, CN=${DOMINIO_KEYSTORE})"
		aviso "Es autofirmado: el navegador avisará la primera vez. Para que no"
		echo  "       avise, sustitúyelo por el de tu CA en el mismo fichero."
	fi

	# ─── server.xml ──────────────────────────────────────────────────────────
	#
	# Copia de seguridad: lo que viene a continuación reescribe server.xml y,
	# si el fichero venía editado a mano, es la única forma de volver atrás.
	[ -e "${SERVER_XML}.orig" ] || {
		cp "$SERVER_XML" "${SERVER_XML}.orig"
		ok "Copia del server.xml original en ${SERVER_XML}.orig"
	}

	# 1) Se borra el bloque HTTPS que hubiera puesto una ejecución anterior, y
	#    el ejemplo comentado que trae Tomcat con un keystore de contraseña
	#    'changeit' publicada. Insertar sin borrar dejaría dos conectores en el
	#    mismo puerto y Tomcat se negaría a arrancar.
	perl_multilinea "$SERVER_XML" '
		s{\n[ \t]*<!--[ \t]*BEGIN HTTPS desplegar\.sh.*?-->[ \t]*\n?}{\n}gs;
		s{\n[ \t]*<!--[ \t]*Define an SSL/TLS.*?-->[ \t]*\n?}{\n}gs;
	'

	# 2) El conector HTTP pasa a redirigir al HTTPS: con redirectPort y
	#    secure="true", Tomcat contesta 302 a http://... con Location:
	#    https://host:8443/... Quien entre por http acaba en https sin tocar
	#    nada. Sin secure="true" el atributo redirectPort se ignora.
	#
	#    El recuento de comentarios del principio decide si el conector
	#    encontrado está comentado: server.xml trae un segundo conector
	#    HTTP de ejemplo dentro de un comentario, y tocarlo sería perder el
	#    original sin querer.
	export PUERTO_HTTPS
	perl_multilinea "$SERVER_XML" '
		s{(<Connector\b[^>]*?protocol="HTTP/1\.1"[^>]*?)(\s*/>)}{
			my ($ini, $fin, $pre) = ($1, $2, $`);
			my $abiertos = () = $pre =~ /<!--/g;
			my $cerrados = () = $pre =~ /-->/g;
			if ($abiertos > $cerrados) {
				# El conector está dentro de un comentario: se deja intacto.
				$ini . $fin
			}
			else {
				my $nuevo = $ini;
				$nuevo =~ s/\s+redirectPort="[^"]*"//g;
				$nuevo =~ s/\s+secure="[^"]*"//g;
				$nuevo . qq{ redirectPort="$ENV{PUERTO_HTTPS}"} . qq{ secure="true"} . $fin
			}
		}ges;
	'

	# 3) El conector HTTPS se inserta justo antes de </Service>. Los marcadores
	#    BEGIN/END son los que el punto 1 usa para poder reescribirlo.
	#
	#    El fichero intermedio va con mktemp y no con un nombre fijo en /tmp:
	#    como el script corre como root, un /tmp/conector_https.xml puesto ahí
	#    por otro usuario (un enlace simbólico) haría que se escribiera donde
	#    ese usuario quiera.
	TMP_XML="$(mktemp)"
	cat > "$TMP_XML" <<'XML'
    <!-- BEGIN HTTPS desplegar.sh: no editar a mano, se regenera en cada ejecución -->
    <Connector port="__PUERTO_HTTPS__" protocol="org.apache.coyote.http11.Http11NioProtocol"
               connectionTimeout="20000" URIEncoding="UTF-8"
               maxThreads="150" SSLEnabled="true"
               scheme="https" secure="true">
        <!--
          La contraseña NO está aquí. Tomcat sustituye los ${...} por las
          propiedades del sistema, que llegan como -D desde
          /etc/systemd/system/tomcat.service.d/https.conf, y de ahí salen de
          un fichero con permisos 600.
        -->
        <SSLHostConfig certificateKeystoreFile="__KEYSTORE__"
                       certificateKeystoreType="PKCS12"
                       certificateKeystorePassword="${tomcat.https.password}"
                       certificateKeyAlias="${tomcat.https.alias}">
        </SSLHostConfig>
    </Connector>
    <!-- END HTTPS desplegar.sh -->
XML
	sed -i "s|__PUERTO_HTTPS__|${PUERTO_HTTPS}|g; s|__KEYSTORE__|${KEYSTORE_FILE}|g" "$TMP_XML"
	BLOQUE_HTTPS="$(cat "$TMP_XML")"
	export BLOQUE_HTTPS
	rm -f "$TMP_XML"

	perl_multilinea "$SERVER_XML" '
		s{\n([ \t]*)</Service>}{\n$ENV{BLOQUE_HTTPS}\n$1</Service>};
	'

	# Comprobación de que el XML sigue siendo válido: un server.xml con un
	# error de sintaxis hace que Tomcat arranque y se pare de inmediato, sin
	# dejar rastro útil más allá de una línea en el log.
	if command -v xmllint >/dev/null 2>&1; then
		xmllint --noout "$SERVER_XML" \
			|| die "El server.xml que he generado no es XML válido. Se ha guardado
     el original en ${SERVER_XML}.orig; con 'xmllint --noout ${SERVER_XML}'
     se ve el error."
		ok "server.xml validado con xmllint"
	else
		aviso "xmllint no está instalado; no he podido validar el server.xml."
	fi

	ok "Conector HTTPS en el puerto ${PUERTO_HTTPS}"
fi

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
Environment="JAVA_HOME=${JAVA_HOME}"
Environment="CATALINA_OPTS=-Xms256m -Xmx768m -Dfile.encoding=UTF-8"
Environment="JAVA_OPTS=-Djava.awt.headless=true"

# Las credenciales van en un fichero aparte con permisos 600, para que no
# estén ni en el repositorio ni en el 'ps' de todo el mundo. Spring las lee
# como variables de entorno y por eso ganan a application.properties.
EnvironmentFile=-${CONFIG_FILE}

# Si hay HTTPS, la contraseña del keystore se pasa al proceso como propiedad
# del sistema desde un drop-in aparte (abajo). Aquí solo van los valores que no
# son secretos.

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

if [ "$SIN_HTTPS" -eq 0 ]; then
	# La contraseña del keystore llega al proceso como propiedad del sistema
	# (-D), y de ahí la usa Tomcat para resolver los ${...} del server.xml.
	#
	# Va en un drop-in y no en la unidad principal porque una unit con la
	# contraseña dentro es legible por cualquiera que pueda ver
	# /etc/systemd/system, que son más de los que uno cree.
	#
	# OJO: las líneas Environment= NO se acumulan; la última gana entera. Por
	# eso aquí se repite CATALINA_OPTS con sus valores de memoria: si el
	# drop-in definiera solo los -D de HTTPS, se perdería el -Xmx de arriba.
	#
	# 600 root:root: systemd lo lee como root antes de arrancar el servicio,
	# así que el usuario tomcat no necesita verlo (de hecho no puede).
	mkdir -p /etc/systemd/system/tomcat.service.d
	cat > /etc/systemd/system/tomcat.service.d/https.conf <<DROPIN
# Generado por desplegar.sh - contiene la contraseña del keystore TLS.
# Permisos 600 a propósito.
[Service]
Environment="CATALINA_OPTS=-Xms256m -Xmx768m -Dfile.encoding=UTF-8 -Dtomcat.https.password=${KEYSTORE_PASS} -Dtomcat.https.alias=${KEYSTORE_ALIAS}"
DROPIN
	chmod 600 /etc/systemd/system/tomcat.service.d/https.conf
	ok "Contraseña del keystore pasada como propiedad del sistema (drop-in https.conf)"
fi

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
	echo "  Base:         ${DB_USER}@${DB_HOST}:${MYSQL_PUERTO}/${DB_NAME}"
	echo "  Puertos:      HTTP ${PUERTO_HTTP}"
	[ "$SIN_HTTPS" -eq 0 ] && echo "                HTTPS ${PUERTO_HTTPS} (certificado ${KEYSTORE_FILE})"
	echo "  Properties:   ${PROPERTIES}  ${GRIS}(original en ${PROPERTIES}.orig)${FIN}"
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

# Espera a que una URL conteste algo que signifique "la aplicación está viva".
# Se usa para HTTP y para HTTPS, que arrancan en paralelo y pueden no estar
# los dos listos a la vez.
#
#   curl_extra: "-k" para HTTPS, porque el certificado es autofirmado y sin -k
#   el propio curl lo rechaza antes de llegar al servidor. Eso no dice nada
#   malo del servidor: es exactamente lo que hará el navegador.
esperar_url() {
	local url="$1" etiqueta="$2" limite="$3" inseguro="${4:-}"
	local espera=0 codigo="000"

	# Array y no palabra suelta: lo que hace falta es que curl reciba el '-k'
	# o exactamente nada, y no una cadena vacía que rompería el comando.
	local extra=()
	[ "$inseguro" = "-k" ] && extra=(-k)

	while [ "$espera" -lt "$limite" ]; do
		codigo=$(curl ${extra[@]+"${extra[@]}"} -s -o /dev/null -w '%{http_code}' \
			-L --max-time 5 "$url" 2>/dev/null || echo "000")

		case "$codigo" in
			# 200: la pantalla pedida se sirve.
			# 302: redirige (por ejemplo al login, o del HTTP al HTTPS).
			# 401/403: LA APLICACIÓN ESTÁ VIVA. La cadena de seguridad rechaza
			#   cualquier petición sin sesión, así que un 401 no es un fallo de
			#   arranque sino la respuesta correcta. Sin este caso, el script
			#   se quedaría esperando y acabaría diciendo que la aplicación no
			#   arranca aunque esté perfectamente desplegada.
			200|301|302|303|401|403)
				printf '  %s\n' "${GRIS}${codigo}${FIN}"
				return 0
				;;
		esac

		# Si Tomcat se ha caído del todo, no tiene sentido seguir esperando.
		if ! systemctl is-active --quiet tomcat; then
			printf '\n'
			error "Tomcat se ha parado durante el arranque. Últimas líneas del log:"
			# Con 'catalina.sh run' la salida va al journal, no a catalina.out.
			journalctl -u tomcat -n 40 --no-pager 2>/dev/null || echo "(no se pudo leer el journal)"
			exit 1
		fi

		sleep 2
		espera=$((espera + 2))
		printf "\r  ${GRIS}${etiqueta} ... %ss (código %s)${FIN}" "$espera" "$codigo"
	done

	printf '\n'
	return 1
}

info "Esperando a que la aplicación responda por HTTP..."

URL="http://localhost:${PUERTO_HTTP}/${CONTEXTO}"

if esperar_url "$URL" "HTTP" 90; then
	ok "La aplicación responde en ${URL}"
else
	error "La aplicación no ha respondido en 90 segundos por HTTP."
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

# ─── HTTPS ───────────────────────────────────────────────────────────────────

if [ "$SIN_HTTPS" -eq 0 ]; then
	info "Esperando a que la aplicación responda por HTTPS..."
	URL_HTTPS="https://localhost:${PUERTO_HTTPS}/${CONTEXTO}"

	if esperar_url "$URL_HTTPS" "HTTPS" 60 -k; then
		ok "La aplicación responde en ${URL_HTTPS}"
	else
		error "El puerto ${PUERTO_HTTPS} no responde. Lo más probable es el certificado."
		echo
		echo "  Comprueba que el conector arrancó:"
		echo "    sudo systemctl status tomcat"
		echo "    sudo journalctl -u tomcat -n 100 --no-pager | grep -i -E 'ssl|keystore|${PUERTO_HTTPS}'"
		echo
		echo "  Y que la contraseña del keystore es la de ${CONFIG_FILE}:"
		echo "    sudo cat ${CONFIG_FILE}"
		echo "    sudo cat /etc/systemd/system/tomcat.service.d/https.conf"
		echo
		exit 1
	fi

	# El puerto HTTP queda abierto a propósito: con redirectPort, Tomcat
	# redirige a HTTPS. Si prefieres cerrarlo del todo, quita el conector
	# HTTP de server.xml y el puerto ${PUERTO_HTTP} deja de estar en escucha.
	info "El puerto ${PUERTO_HTTP} redirige a https://<tu-servidor>:${PUERTO_HTTPS}/${CONTEXTO}"
fi

# ─────────────────────────────────────────────────────────────────────────────
# RESUMEN
# ─────────────────────────────────────────────────────────────────────────────

paso "Despliegue terminado"

echo
if [ "$SIN_HTTPS" -eq 0 ]; then
	echo "  ${NEGRITA}URL${FIN}         https://${DOMINIO}:${PUERTO_HTTPS}/${CONTEXTO}   ${GRIS}(usa esta)${FIN}"
	echo "                 http://${DOMINIO}:${PUERTO_HTTP}/${CONTEXTO}   ${GRIS}(redirige a HTTPS)${FIN}"
else
	echo "  ${NEGRITA}URL${FIN}         http://${DOMINIO}:${PUERTO_HTTP}/${CONTEXTO}"
fi
echo "  ${NEGRITA}Contexto${FIN}    /${CONTEXTO}"
echo "  ${NEGRITA}WAR${FIN}         ${WAR_DEST}"
echo "  ${NEGRITA}Servicio${FIN}    tomcat  (systemctl status tomcat)"
echo "  ${NEGRITA}Base de datos${FIN} ${DB_USER}@${DB_HOST}:${MYSQL_PUERTO}/${DB_NAME}"
echo "  ${NEGRITA}Certificado${FIN}  ${KEYSTORE_FILE}"
echo "  ${NEGRITA}Logs${FIN}        journalctl -u tomcat -f   (arranque de Tomcat)"
echo "                        ${TOMCAT_HOME}/logs/f.log"
echo
echo "  ${GRIS}Reiniciar:      sudo systemctl restart tomcat${FIN}"
echo "  ${GRIS}Parar:          sudo systemctl stop tomcat${FIN}"
echo "  ${GRIS}Actualizar:     ./desplegar.sh de nuevo${FIN}"
echo
echo "  ${AMARILLO}Pendiente antes de abrirlo a internet:${FIN}"
echo "    - Cambiar las contraseñas de admin y datos (vienen en 'CambiarYa.2026')."
echo "    - ${PROPERTIES} contiene la contraseña de la base de datos. No lo subas a git:"
echo "        el original está en ${PROPERTIES}.orig, y en .gitignore no está."
echo "        Ejecuta:  git update-index --skip-worktree ${PROPERTIES}"
echo "    - El certificado es autofirmado: el navegador avisará. Sustitúyelo"
echo "      por el de tu CA en ${KEYSTORE_FILE} y reinicia Tomcat."
echo "    - Si el ${PUERTO_HTTPS} no es lo que quieres desde fuera, pon un nginx delante"
echo "      y cierra los puertos ${PUERTO_HTTP} y ${PUERTO_HTTPS} al exterior."
echo

