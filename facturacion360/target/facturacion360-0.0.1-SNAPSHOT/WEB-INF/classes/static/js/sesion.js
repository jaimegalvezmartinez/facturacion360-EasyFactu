/**
 * @file Lo que la aplicación hace con la sesión: quién está dentro y cerrar sesión.
 *
 * Se carga en las cinco pantallas de la aplicación (index, clientes, facturas, perfil y
 * ayuda). No protege nada por sí mismo: eso lo hace el filtro de seguridad del servidor,
 * que ya no deja abrir ninguna de estas páginas sin sesión. Lo que hace aquí es la parte
 * bonita de la seguridad, que es la parte pequeña pero es la que se nota:
 *
 *   - Si el que ha entrado no es administrador, esconde lo que no puede usar (el enlace a
 *     "Mi Perfil" y el botón de la papelera). Es comodidad, no protección: el botón seguiría
 *     dando un 403 si alguien lo quitase del DOM, y eso es lo que importa. Lo contrario
 *     tampoco: esconderlo sin comprobar el rol dejaría a un administrador sin poder
 *     borrar.
 *
 *   - Enlaza el botón "Salir", que no es un enlace sino un <button>: si fuera un <a> y
 *     el JavaScript no llegara a cargarse, al pulsarlo se vería el login y se pensaría
 *     que la sesión se había cerrado. Con un botón, o lo cierra o no hace nada.
 *
 *   - Antes de salir, pregunta con un modal (#modal-salir). Es una de las pocas acciones de
 *     la aplicación que se pueden deshacer sin más: cerrar sesión no borra nada, pero deja a
 *     alguien fuera de una factura que estaba a medias. La pregunta la hace este archivo,
 *     envolviendo el modal de Bootstrap en una promesa igual que hace dialogo.js con el de
 *     descartar cambios, y con el mismo motivo: el marcado está en el HTML de cada página y
 *     este archivo es el único que lo necesita.
 *
 * @author AngelDanielC0des
 */

import { cerrarSesion, irAlLogin } from "./seguridad.js";

const botonSalir = document.getElementById("salir");

// El modal de "¿salir?". Vive en el HTML de cada página, como el de descartar cambios.
const dialogoSalir = document.getElementById("modal-salir");
const botonConfirmarSalida = document.getElementById("btn-salir-confirmar");

let modalSalir = null;

/** Quién está esperando la respuesta del modal, y qué se le va a contestar. */
let responderSalida = null;

/** Si la respuesta va a ser "sí, salgo". */
let salidaConfirmada = false;

/** Qué control tenía el foco cuando se abrió el modal, para devolvérselo al cerrarlo. */
let focoPrevioSalida = null;

/**
 * Quién está dentro.
 *
 * La página ya se ha servido solo si hay sesión, así que un 401 aquí significa que la
 * sesión ha caducado entre que se pidió la página y que se ha ejecutado este archivo.
 *
 * @return {Promise<Object|null>} los datos del usuario, o null si no se ha podido saber
 */
async function usuarioDeLaSesion() {
    try {
        const respuesta = await fetch("/auth/yo", { headers: { Accept: "application/json" } });

        if (!respuesta.ok) return null;

        return await respuesta.json();
    } catch {
        return null;
    }
}

/**
 * Esconde lo que necesita ser administrador.
 *
 * Se hace añadiendo una clase al <body> en vez de quitar los elementos: el CSS de acceso.css
 * esconde lo que lleva `data-solo-admin` cuando el body tiene esa clase. Así funciona con
 * los elementos que se crean después, que es el caso del botón de la papelera: cada fila de
 * la tabla se repinta al hacer scroll y al guardar, y si el JavaScript las borrara una a
 * una, la siguiente pintada volvería a traer el botón.
 *
 * Cuando no se ha podido saber quién está dentro (la llamada a /auth/yo ha fallado), el
 * criterio es esconder también. Es lo contrario de lo cómodo y es lo que toca: sin saber si
 * la persona es ADMIN, lo que se enseña por defecto es lo de menos.
 */
function ajustarPermisos(usuario) {
    if (!usuario || usuario.rol === "ADMIN") return;

    document.body.classList.add("sin-permiso");
}

/**
 * Abre el "¿salir?" y espera la respuesta.
 *
 * La promesa se resuelve en 'hidden.bs.modal', no al pulsar el botón, por el mismo motivo que en
 * dialogo.js: al resolver antes, quien nos llama devolvería el foco a "Salir" y la vuelta del
 * modal se lo llevaría por delante.
 *
 * @return {Promise<boolean>} true si se quiere salir
 */
function preguntarSalida() {
    // Sin Bootstrap (su CDN caído, por ejemplo) o sin el modal en el HTML, se pregunta con el
    // diálogo del navegador: es feo, pero peor es cerrar la sesión de alguien sin avisar.
    if (!window.bootstrap || !dialogoSalir) {
        return Promise.resolve(confirm("¿Quieres salir de la sesión?"));
    }

    modalSalir ??= new bootstrap.Modal(dialogoSalir);

    // De dónde venimos, para devolver el foco al cerrar: sin esto, quien contesta "Seguir
    // dentro" se encuentra el foco perdido en algún punto de la página.
    focoPrevioSalida = document.activeElement;

    return new Promise((resolver) => {
        responderSalida = resolver;
        modalSalir.show();
    });
}

/**
 * Cierra la sesión y vuelve al login.
 *
 * Es un POST y lleva token de CSRF como cualquier otra escritura: aunque solo invalide una
 * sesión, es una operación que cambia el estado del servidor y no puede venir de un
 * formulario suelto de otra página.
 */
async function salir() {
    if (!await preguntarSalida()) return;

    botonSalir.disabled = true;

    try {
        await cerrarSesion();
    } catch {
        // Si la petición falla, se vuelve al login igualmente. Peor es dejar a alguien
        // dentro de la aplicación creyendo que ha salido, y la sesión, en ese caso,
        // sigue viva en el servidor.
    }

    irAlLogin();
}

botonSalir?.addEventListener("click", salir);

// Pulsar "Salir" en el modal solo deja anotada la respuesta y manda cerrar; quien resuelve la
// promesa es el cierre, que ocurre igual si se pulsa "Seguir dentro", la X, Escape o el fondo.
//
// El ?. del hide() no es desconfianza: el botón está en el HTML aunque Bootstrap no haya
// cargado (su CDN caído, por ejemplo), y en ese caso preguntarSalida() ni siquiera ha llegado
// a abrir el modal. Con el hide() a pelo, ese clic sería un error por consola.
botonConfirmarSalida?.addEventListener("click", () => {
    salidaConfirmada = true;
    modalSalir?.hide();
});

dialogoSalir?.addEventListener("hidden.bs.modal", () => {
    const confirmada = salidaConfirmada;
    const resolver = responderSalida;

    salidaConfirmada = false;
    responderSalida = null;

    // El foco, de vuelta al botón de Salir, que puede haber desaparecido (quién sabe) y en
    // ese caso no se toca. Se hace ANTES de responder, que después quien sale ya se va.
    if (focoPrevioSalida?.isConnected) {
        focoPrevioSalida.focus();
    }
    focoPrevioSalida = null;

    resolver?.(confirmada);
});

await usuarioDeLaSesion().then(ajustarPermisos);