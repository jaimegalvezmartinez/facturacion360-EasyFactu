/**
 * @file La pantalla de acceso: iniciar sesión y darse de alta.
 *
 * Está aparte de la carpeta de capas que usa el resto de la aplicación porque no comparte
 * nada con ellas: no hay tabla, ni filtros, ni dialogues. Lo único que hace es hablar con
 * /auth/login y /auth/registro, y por eso no importa en qué capa esté.
 *
 * Dos detalles de seguridad que no son negociables:
 *
 *   1. La contraseña viaja en el cuerpo de la petición en claro, como tiene que viajar. Por
 *      eso la pantalla solo sirve por HTTPS fuera del desarrollo: con HTTP, cualquiera que
 *      esté en la red la lee tal cual. Es la contrapartida de no usar tokens.
 *
 *   2. El token de CSRF se pide antes de enviar nada, también antes de iniciar sesión. Sin
 *      él, Spring rechaza el POST con un 403 aunque el usuario y la contraseña sean
 *      correctos, y el mensaje que aparecería en pantalla sería un error sin sentido.
 *
 * Y una decisión de la pantalla de alta, que es la de este archivo: la cuenta que se crea ahí
 * nace DESACTIVADA y la tiene que activar un administrador, así que el alta no acaba entrando.
 * El mensaje de éxito tiene que decirlo, porque quien acaba de crear la cuenta se queda
 * delante del formulario de acceso con el dedo en el botón, y si no se le dice que espere se
 * va a pensar que ha fallado algo. Al final hay dos repulsos más: la contraseña se escribe dos
 * veces para no guardarse una mal escrita, y se vacía el formulario para no dejarla escrita en
 * una página abierta.
 *
 * @author AngelDanielC0des
 */

import { tokenDeSeguridad } from "./seguridad.js";
import { conectarOjos } from "./ver-clave.js";

const RUTA_INICIO = "index.html";

const formularioAcceso = document.getElementById("formulario-acceso");
const formularioRegistro = document.getElementById("formulario-registro");
const botonAlternar = document.getElementById("alternar-registro");

const avisoError = document.getElementById("aviso-error");
const avisoOk = document.getElementById("aviso-ok");

const botonEntrar = document.getElementById("boton-entrar");
const botonRegistro = document.getElementById("boton-registro");

/** Los dos formularios empiezan a la vista: el alta es lo raro, no el acceso. */
let mostrandoAlta = false;

/**
 * Enseña un error y esconde el aviso bueno.
 *
 * @param {string} texto el motivo que se lee
 */
function mostrarError(texto) {
    avisoError.textContent = texto;
    avisoError.hidden = false;
    avisoOk.hidden = true;
}

/**
 * Enseña un aviso de que la operación sí ha ido bien.
 *
 * @param {string} texto el mensaje que se lee
 */
function mostrarOk(texto) {
    avisoOk.textContent = texto;
    avisoOk.hidden = false;
    avisoError.hidden = true;
}

/** Esconde los dos avisos. */
function limpiarAvisos() {
    avisoError.hidden = true;
    avisoOk.hidden = true;
}

/**
 * De los errores que devuelve el servidor, saca el motivo que se puede enseñar.
 *
 * El manejador global responde siempre con un ProblemDetail, cuyo texto legible está en
 * `detail`, y además con un mapa `errores` con el motivo de cada campo que ha fallado. Se
 * enseñan los dos: el detail explica el problema y los errores dicen cuál de los tres campos
 * es el que hay que corregir.
 *
 * No es la función `motivoDe` de problema.js, y a propósito: esa devuelve solo el `detail`,
 * que aquí dejaría sin decir cuál de los campos es el que hay que arreglar. Copiar tres
 * líneas por no tocar un módulo compartido es mejor que cambiar el comportamiento de las
 * otras tres pantallas por esto.
 *
 * @param {Response} respuesta la respuesta que ha fallado
 * @return {Promise<string>} el motivo, listo para pintar
 */
async function motivoDelFormulario(respuesta) {
    try {
        const problema = await respuesta.json();

        if (!problema) return `El servidor ha respondido ${respuesta.status}`;

        const campos = Object.entries(problema.errores ?? {})
            .map(([campo, motivo]) => `${campo}: ${motivo}`)
            .join(" ");

        return [problema.detail, campos].filter(Boolean).join(" ")
            || `El servidor ha respondido ${respuesta.status}`;
    } catch {
        // Si el cuerpo no es JSON (una página de error del contenedor, por ejemplo) se
        // enseña el código, que es menos pero no miente.
        return `El servidor ha respondido ${respuesta.status}`;
    }
}

/**
 * Manda el formulario de acceso al servidor.
 *
 * @param {Event} evento el submit
 */
async function entrar(evento) {
    evento.preventDefault();
    limpiarAvisos();

    const usuario = formularioAcceso.elements.usuario;
    const clave = formularioAcceso.elements.clave;

    botonEntrar.disabled = true;
    botonEntrar.textContent = "Comprobando...";

    try {
        const csrf = await tokenDeSeguridad();

        const respuesta = await fetch("/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json", [csrf.cabecera]: csrf.token },
            body: JSON.stringify({ usuario: usuario.value, clave: clave.value }),
        });

        if (respuesta.ok) {
            // replace y no assign: replace borra la pantalla de acceso del historial, así
            // que el botón "atrás" del navegador no vuelve a un login ya usado.
            window.location.replace(RUTA_INICIO);
            return;
        }

        mostrarError(await motivoDelFormulario(respuesta));

        // La contraseña se borra tras el intento fallido. Evitaría que quien la escribió mal
        // pulse "Entrar" otra vez sin corregirla y no entienda por qué sigue sin entrar: el
        // campo vacío se ve mucho más rápido que una contraseña equivocada.
        clave.value = "";
        clave.focus();
    } catch {
        mostrarError("No se ha podido contactar con el servidor. Inténtalo de nuevo en unos segundos.");
    } finally {
        botonEntrar.disabled = false;
        botonEntrar.innerHTML = '<i class="fa-solid fa-right-to-bracket" aria-hidden="true"></i> Entrar';
    }
}

/**
 * Manda el formulario de alta al servidor.
 *
 * @param {Event} evento el submit
 */
async function registrar(evento) {
    evento.preventDefault();
    limpiarAvisos();

    const usuario = formularioRegistro.elements.usuario;
    const nombre = formularioRegistro.elements.nombre;
    const clave = formularioRegistro.elements.clave;
    const claveRepetida = formularioRegistro.elements.claveRepetida;

    // Las dos casillas se comparan aquí, en el navegador, y no en el servidor: la repetición
    // no es un dato, es una comprobación contra lo que ya está escrito en el campo de al lado.
    // Mandarla al servidor sería mandar la contraseña dos veces para que la compare con la
    // primera, que es una copia de sí misma y no comprueba nada. Es la misma comodidad que
    // usa "Mi cuenta" al cambiar la contraseña, y por el mismo motivo: no gastar una
    // petición en un error que ya se sabe.
    if (clave.value !== claveRepetida.value) {
        mostrarError("Las dos contraseñas no son iguales. Vuelve a escribirla.");
        claveRepetida.value = "";
        claveRepetida.focus();
        return;
    }

    botonRegistro.disabled = true;

    try {
        const csrf = await tokenDeSeguridad();

        const respuesta = await fetch("/auth/registro", {
            method: "POST",
            headers: { "Content-Type": "application/json", [csrf.cabecera]: csrf.token },
            body: JSON.stringify({
                usuario: usuario.value,
                nombre: nombre.value,
                clave: clave.value,
            }),
        });

        if (respuesta.ok) {
            // El nombre se copia ANTES de reset(): reset() vacía los campos, y el elemento
            // que tenemos aquí es el input de la propia pantalla, así que después ya no
            // tendría valor que poner.
            const nombreUsuario = usuario.value.trim();

            // No se entra automáticamente, y ahora ya no podría: la cuenta nace desactivada
            // (UsuarioServiceImpl.registrar la guarda con activo = false) y hasta que un
            // administrador no la active el login devuelve un 401. El formulario se vacía y
            // se vuelve al de acceso para que el mensaje se lea donde lo está mirando quien
            // se ha quedado con las manos encima del teclado.
            formularioRegistro.reset();
            mostrarAlta(false);
            mostrarOk(
                "Cuenta creada, pero está desactivada: un administrador tiene que activarla "
                + "antes de que puedas entrar con ese usuario. En cuanto lo haga, vuelve aquí."
            );
            formularioAcceso.elements.usuario.value = nombreUsuario;
            formularioAcceso.elements.clave.focus();
            return;
        }

        mostrarError(await motivoDelFormulario(respuesta));
    } catch {
        mostrarError("No se ha podido contactar con el servidor. Inténtalo de nuevo en unos segundos.");
    } finally {
        botonRegistro.disabled = false;
    }
}

/**
 * Cambia entre el formulario de acceso y el de alta.
 *
 * @param {boolean} mostrar true para enseñar el alta, false para volver al acceso
 */
function mostrarAlta(mostrar) {
    mostrandoAlta = mostrar;

    formularioAcceso.hidden = mostrar;
    formularioRegistro.hidden = !mostrar;
    botonAlternar.textContent = mostrar
        ? "Ya tengo cuenta, entrar"
        : "¿No tienes cuenta? Crear una";

    limpiarAvisos();

    // El foco salta al primer campo del formulario que acaba de aparecer, que es donde
    // quien está leyendo espera estar. Sin esto, el tabulador seguiría por donde se quedó.
    const primero = (mostrar ? formularioRegistro : formularioAcceso).querySelector("input");
    primero?.focus();
}

formularioAcceso.addEventListener("submit", entrar);
formularioRegistro.addEventListener("submit", registrar);

botonAlternar.addEventListener("click", () => mostrarAlta(!mostrandoAlta));

// El ojo de mostrar contraseña en los tres campos que se escriben: la del acceso, la del
// alta y la del repetido. Se conectan los dos formularios juntos y una sola vez al
// cargar, y no dentro de mostrarAlta(), porque alternar no vuelve a construir nada:
// solo se le pone y se le quita el atributo hidden. Conectarlos al cambiar de pestaña
// significaría recorrer los dos formularios cada vez que se alterna, sin ganar nada.
conectarOjos(formularioAcceso);
conectarOjos(formularioRegistro);

/**
 * Si ya hay sesión abierta, esta pantalla no sirve para nada: se salta a la de dentro.
 *
 * Es el caso de quien pulses F5 en el login con la sesión todavía viva, o de quien entre en
 * la dirección del login a propósito. Sin esta comprobación, el login se leería como una
 * pantalla normal y el usuario acabaría creyendo que su cuenta no funciona.
 */
async function saltarSiYaHaySesion() {
    try {
        const respuesta = await fetch("/auth/yo", { headers: { Accept: "application/json" } });

        if (respuesta.ok) {
            window.location.replace(RUTA_INICIO);
        }
    } catch {
        // Si no se puede comprobar, se deja el formulario: mejor un login que nadie ve
        // que una pantalla en blanco.
    }
}

saltarSiYaHaySesion();