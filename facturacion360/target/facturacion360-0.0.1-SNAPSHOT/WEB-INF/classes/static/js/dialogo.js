/**
 * @file El dialogo de descartar cambios sin guardar.
 *
 * Capa 3. Envuelve el modal de Bootstrap en una promesa, para poder esperarlo con await.
 *
 * @author AngelDanielC0des
 */

import { btnDescartar, dialogoDescartar } from "./dom.js";
import { panelDe } from "./fila.js";
import { hayCambios } from "./formulario.js";

// El diálogo de descartar: se construye la primera vez que hace falta y se reutiliza.
let modalDescartar = null;

// Cómo se contesta a quien está esperando la respuesta del diálogo, y qué se le va a
// contestar. Solo puede haber una pregunta a la vez: mientras está abierto, su fondo impide
// pulsar cualquier otra cosa de la página.
let responderDescarte = null;

let descarteAceptado = false;

// Qué control tenía el foco cuando se abrió el diálogo, para devolvérselo al cerrarlo.
let focoPrevioDialogo = null;

/**
 * Pregunta antes de tirar unos cambios sin guardar.
 *
 * @param {HTMLTableRowElement} fila la fila que se va a cerrar o cambiar de modo
 * @return {Promise<boolean>} si se puede seguir adelante
 */
export async function confirmarDescarte(fila) {
    const formulario = panelDe(fila)?.querySelector(".formulario-edicion");

    // Sin formulario o sin nada tocado no hay nada que descartar, así que no se pregunta:
    // un diálogo para decir "sí" siempre es un diálogo que sobra.
    if (!formulario || !hayCambios(formulario)) return true;

    return preguntarDescarte();
}

/**
 * Abre el diálogo de descartar y espera la respuesta.
 *
 * La promesa se resuelve en 'hidden.bs.modal', cuando el diálogo ya se ha cerrado del todo y
 * el foco ha vuelto a su sitio, y no al pulsar el botón: respondiendo antes, quien nos llama
 * colocaría el foco (en el lápiz de la fila) y la vuelta se lo llevaría de allí.
 *
 * @return {Promise<boolean>} true si se descartan los cambios
 */
export function preguntarDescarte() {
    // Si Bootstrap no ha cargado (su CDN caído, por ejemplo), se pregunta con el diálogo del
    // navegador: es feo, pero sin él la fila se cerraría llevándose lo escrito sin avisar.
    if (!window.bootstrap) {
        return Promise.resolve(confirm("Hay cambios sin guardar en este cliente. ¿Quieres descartarlos?"));
    }

    modalDescartar ??= new bootstrap.Modal(dialogoDescartar);

    // De dónde venimos, para devolver el foco al cerrar. Bootstrap solo lo hace con los
    // diálogos que se abren con data-bs-toggle, y este se abre desde el código: sin esto,
    // quien contesta "Seguir editando" se encuentra el foco en el <body>, al principio de la
    // página, justo después de haber dicho que quería seguir donde estaba.
    focoPrevioDialogo = document.activeElement;

    return new Promise((resolver) => {
        responderDescarte = resolver;
        modalDescartar.show();
    });
}

// Pulsar "Descartar" solo deja anotada la respuesta y manda cerrar; quien resuelve la promesa
// es el cierre, que ocurre igual si se pulsa "Seguir editando", la X, Escape o el fondo.
btnDescartar.addEventListener("click", () => {
    descarteAceptado = true;
    modalDescartar.hide();
});

dialogoDescartar.addEventListener("hidden.bs.modal", () => {
    const aceptado = descarteAceptado;
    const resolver = responderDescarte;

    descarteAceptado = false;
    responderDescarte = null;

    // El foco, de vuelta a donde estaba antes de preguntar. Puede que ese control ya no exista
    // (la tabla se ha repintado mientras el diálogo estaba abierto), y entonces no se toca.
    // Se hace ANTES de responder: si la respuesta fue "descartar", quien nos llama va a
    // colocarlo en otro sitio y su decisión es la que debe quedar.
    if (focoPrevioDialogo?.isConnected) {
        focoPrevioDialogo.focus();
    }
    focoPrevioDialogo = null;

    resolver?.(aceptado);
});
