/**
 * @file Todo lo que habla con el servidor.
 *
 * Capa 1. Cancelacion por canales y contador de peticiones para el velo de carga.
 *
 * @author AngelDanielC0des
 */

import { pantallaCarga } from "./dom.js";
// El token de CSRF y el salto al login viven en seguridad.js y no aquí: sesion.js y
// login.js los necesitan también, y api.js arrastra dom.js, que reventaría en las
// páginas sin tabla de clientes.
import { irAlLogin, tokenDeSeguridad } from "./seguridad.js";

// Y este cuenta TODAS las peticiones, no solo los listados: es el del velo de carga.
// Son dos contadores a propósito y no hay que unificarlos: listadosEnVuelo marca el aria-busy
// de la tabla, así que solo puede contar lo que de verdad la deja a medias; peticionesActivas
// tapa la pantalla entera, así que cuenta también las de los desplegables y las de los paneles.
// Con uno solo, rellenar un desplegable dejaría la tabla anunciada como ocupada sin serlo.
let peticionesActivas = 0;

/*
 * Petición en vuelo de cada "canal" (listado, provincias, poblaciones). Al lanzar una
 * nueva petición de un canal se cancela la anterior DEL MISMO canal.
 *
 * Hacen falta canales separados y no un único controlador compartido: al cambiar de
 * provincia se piden a la vez las poblaciones y el listado, y con un solo controlador
 * cada una abortaría a la otra.
 */
export const peticionesEnVuelo = {};

/**
 * Pide un JSON al backend cancelando la petición anterior del mismo canal.
 *
 * El debounce reduce las peticiones, pero no evita que dos respuestas se crucen: si
 * escribes "gar", sale la petición, sigues hasta "garcia" y la respuesta de "gar" llega
 * la última, pintaría la tabla con resultados que no son los del texto del buscador.
 * Cancelando la anterior, esa respuesta tardía nunca llega a usarse.
 *
 * @param {string} canal nombre del flujo de peticiones ("listado", "provincias"...)
 * @param {string} url la URL a pedir
 * @return {Promise<Object>} el JSON de la respuesta
 * @throws {Error} si el servidor responde con un código que no es 2xx; el error lleva ese
 *         código en la propiedad `estado`
 */
export async function pedirJson(canal, url) {
    peticionesEnVuelo[canal]?.abort();
    const controlador = new AbortController();
    peticionesEnVuelo[canal] = controlador;

    mostrarCarga();

    try {
        const respuesta = await fetch(url, { signal: controlador.signal });

        // fetch NO lanza error con códigos 4xx/5xx: hay que comprobarlo a mano.
        if (!respuesta.ok) {

            // Un 401 aquí solo puede significar una cosa, y no es un fallo de esta
            // petición: la sesión ha caducado o alguien la cerró en otra pestaña.
            if (respuesta.status === 401) {
                irAlLogin();
            }

            const error = new Error(`El servidor respondió ${respuesta.status}`);

            // El código va aparte del mensaje porque hay quien necesita distinguirlos: un 404
            // al comprobar un detalle significa "lo han borrado" y se trata distinto del
            // resto. Leerlo del texto del mensaje sería frágil.
            error.estado = respuesta.status;
            throw error;
        }
        return await respuesta.json();
    } finally {
        cerrarCanal(canal, controlador);
        ocultarCarga();
    }
}

/**
 * ¿Este error es de una petición que hemos cancelado nosotros?
 *
 * Cancelar es algo que provocamos a propósito, no un fallo: si lo tratáramos como tal,
 * el usuario vería el mensaje de error justo mientras escribe en el buscador.
 *
 * @param {Error} error el error capturado
 * @return {boolean} true si lo canceló el AbortController de su canal, no el servidor
 */
export function esCancelacion(error) {
    return error.name === "AbortError";
}

/**
 * Manda un JSON al backend y devuelve el código de la respuesta.
 *
 * Es la hermana de pedirJson para las peticiones que escriben, con dos diferencias. Aquí un
 * 4xx NO se trata como excepción: el 404 y el 409 son respuestas útiles que la pantalla tiene
 * que saber contar, cada una con su mensaje. Y del 200 solo interesa que haya ido bien, porque
 * los datos guardados se vuelven a leer al refrescar la tabla; el cuerpo ni se lee.
 *
 * @param {string} canal nombre del flujo de peticiones (una por fila que se guarda)
 * @param {string} metodo el método HTTP: "POST", "PUT" o "DELETE"
 * @param {string} url la URL a la que se manda
 * @param {Object} cuerpo el objeto que viaja como JSON
 * @return {Promise<{estado: number, errores: Object}>} el código HTTP y, si el servidor
 *         los ha contado, el motivo de cada campo que ha fallado
 */
export async function enviarJson(canal, metodo, url, cuerpo) {
    peticionesEnVuelo[canal]?.abort();
    const controlador = new AbortController();
    peticionesEnVuelo[canal] = controlador;

    try {
        // El token se pide ANTES del fetch y no en la misma llamada: si se pidiera dentro, el
        // propio POST se lanzaría sin él y Spring lo rechazaría con un 403.
        const csrf = await tokenDeSeguridad();

        const respuesta = await fetch(url, {
            method: metodo,
            headers: { "Content-Type": "application/json", [csrf.cabecera]: csrf.token },
            body: JSON.stringify(cuerpo),
            signal: controlador.signal,
        });

        // Igual que en pedirJson: el 401 aquí es la sesión, no la operación.
        if (respuesta.status === 401) {
            irAlLogin();
        }

        // El codigo Y los errores por campo. Antes se devolvia solo el codigo y el cuerpo
        // se tiraba, asi que un 400 solo podia contarse como "revisa los campos marcados",
        // sin poder decir cual ni por que. El manejador global ya manda ese mapa.
        return { estado: respuesta.status, errores: await erroresDe(respuesta) };
    } finally {
        cerrarCanal(canal, controlador);
    }
}

/**
 * Los errores por campo que venga contando el servidor, si los cuenta.
 *
 * No lanza nunca: si la respuesta fue bien, no trae cuerpo, no es JSON o no lleva el mapa,
 * devuelve uno vacio. Reventar mientras se maneja un error deja la pantalla muda, que es
 * peor que quedarse sin el detalle.
 *
 * @param {Response} respuesta
 * @return {Promise<Object>} de nombre de campo a motivo
 */
async function erroresDe(respuesta) {
    if (respuesta.ok) return {};

    try {
        const problema = await respuesta.json();

        return problema?.errores ?? {};
    } catch {
        return {};
    }
}

/**
 * Da por terminado un canal de peticiones.
 *
 * Los canales de guardado y de detalle llevan el id del cliente dentro del nombre, así que se
 * crea uno nuevo por cada fila que se abre o se guarda y se quedarían ahí para siempre. Se
 * comprueba que el controlador siga siendo el mismo antes de borrarlo: si mientras tanto ha
 * arrancado otra petición del canal, la entrada es SUYA y borrarla dejaría sin cancelar a la
 * que viene después.
 *
 * @param {string} canal nombre del flujo de peticiones
 * @param {AbortController} controlador el de la petición que acaba de terminar
 */
function cerrarCanal(canal, controlador) {
    if (peticionesEnVuelo[canal] === controlador) {
        delete peticionesEnVuelo[canal];
    }
}

/** Suma una petición en vuelo y destapa el velo si es la primera. */
function mostrarCarga() {
    peticionesActivas++;
    if (pantallaCarga) {
        pantallaCarga.classList.remove("d-none");
    }
}

/** Resta una petición y tapa el velo cuando ya no queda ninguna. */
function ocultarCarga() {
    peticionesActivas--;
    if (peticionesActivas <= 0) {
        peticionesActivas = 0; // Prevenir números negativos
        if (pantallaCarga) {
            pantallaCarga.classList.add("d-none");
        }
    }
}
