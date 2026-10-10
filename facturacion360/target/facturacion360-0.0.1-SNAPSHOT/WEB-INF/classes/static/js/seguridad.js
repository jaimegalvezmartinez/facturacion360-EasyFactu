/**
 * @file Hablar con el servidor sin que te rechace por no haber iniciado sesión.
 *
 * Capa 0: no importa nada. Y esa ausencia es lo que hace que este archivo sea el único
 * módulo del que dependan TODOS los demás, incluidas las pantallas que no usan la tabla de
 * clientes (facturas, perfil, index, ayuda).
 *
 * Antes de existir esto, api.js era quien llevaba el token de CSRF, y sesion.js lo importaba.
 * Eso estaba mal por una razón concreta: api.js importa dom.js, y dom.js hace
 * `document.getElementById("tabla-clientes").closest(...)` al cargarse. En facturas.html y en
 * perfil.html no hay ninguna tabla con ese id, así que ese import reventaba la página entera
 * con un TypeError antes de que se dibujara nada. Un módulo de bajo nivel no puede depender
 * de otro que se supone por el mero hecho de que ese toque el documento.
 *
 * Tres cosas y ninguna más:
 *
 *   1. El token de CSRF que Spring exige en todo POST, PUT y DELETE.
 *   2. Mandar al login cuando la sesión ya no está (401).
 *   3. Cerrar la sesión.
 *
 * @author AngelDanielC0des
 */

/** A dónde se lleva a quien ya no tiene sesión. */
export const RUTA_LOGIN = "/login.html";

/**
 * El token de CSRF ya pedido, o null si todavía no se ha pedido ninguno.
 *
 * <p>Se guarda en memoria y no en `sessionStorage` a propósito: el token no caduca por
 * tiempo, pero sí queda invalidado al cerrar sesión (el servidor rota el contexto), y una
 * copia guardada en el navegador sobrevive a un cierre de sesión. Volver a pedirlo tras
 * iniciar sesión cuesta una petición y evita tener que acordarse de vaciar nada.</p>
 *
 * @type {Object|null}
 */
let tokenCsrf = null;

/**
 * Pide el token de CSRF al servidor, o devuelve el que ya se tenía.
 *
 * <p>La copia en la cookie XSRF-TOKEN que deja Spring no se lee: leer cookies desde el
 * JavaScript es.parsearla a mano cada vez, y el endpoint devuelve el valor limpio junto con
 * el nombre de la cabecera en la que hay que ponerlo.</p>
 *
 * @return {Promise<Object>} el token, con `cabecera` y `token`
 */
export async function tokenDeSeguridad() {
    if (tokenCsrf) return tokenCsrf;

    const respuesta = await fetch("/auth/csrf");

    if (!respuesta.ok) {
        throw new Error(`No se ha podido obtener el token de seguridad (${respuesta.status})`);
    }

    tokenCsrf = await respuesta.json();

    return tokenCsrf;
}

/**
 * Las cabeceras que hay que mandar en una petición que escribe.
 *
 * <p>Se llama antes de la petición y no dentro: si el token se pidiera a la vez, el propio
 * POST saldría sin él y Spring lo rechazaría con un 403.</p>
 *
 * @param {Object} [extra] cabeceras que ya lleva la petición (por ejemplo el Content-Type)
 * @return {Promise<Object>} las cabeceras de la petición, con la del token ya puesta
 */
export async function cabecerasConSeguridad(extra = {}) {
    const csrf = await tokenDeSeguridad();

    return { ...extra, [csrf.cabecera]: csrf.token };
}

/**
 * El navegador se va al login.
 *
 * <p>Con `replace` y no con `assign`: replace no deja la pantalla en la historia del
 * navegador, así que el botón "atrás" no vuelve a una pantalla a la que ya no se pertenece.</p>
 */
export function irAlLogin() {
    window.location.replace(RUTA_LOGIN);
}

/**
 * Cierra la sesión en el servidor.
 *
 * @return {Promise<void>} cuando el servidor ha contestado
 */
export async function cerrarSesion() {
    const cabeceras = await cabecerasConSeguridad();

    await fetch("/auth/logout", { method: "POST", headers: cabeceras });
}