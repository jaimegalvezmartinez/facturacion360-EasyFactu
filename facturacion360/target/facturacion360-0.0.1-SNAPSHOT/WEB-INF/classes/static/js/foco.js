/**
 * @file A quien hay que devolverle el foco despues de repintar la tabla.
 *
 * Capa 1. Es el unico estado que se escribe desde un modulo y se lee desde otro.
 *
 * @author AngelDanielC0des
 */

import { cuerpoTabla } from "./dom.js";

// Id del cliente al que hay que devolver el foco en cuanto se repinte la tabla, o null.
// Guardar destruye la fila que contenía el botón pulsado y, sin esto, el foco se iría al
// <body> y quien navegue con teclado volvería al principio de la página.
let focoPendiente = null;

/**
 * Apunta a qué cliente hay que devolverle el foco cuando la tabla se vuelva a pintar.
 *
 * Es un método y no una asignación directa porque `focoPendiente` acabará siendo privado de su
 * módulo: en módulos ES lo que se importa es de solo lectura, y `focoPendiente = x` desde fuera
 * lanzaría un TypeError.
 *
 * @param {number} idCliente el cliente cuyo botón recuperará el foco
 */
export function anotarFoco(idCliente) {
    focoPendiente = idCliente;
}

/**
 * Devuelve el foco al botón de editar del cliente que se acaba de guardar.
 *
 * Al repintar, la fila que tenía el foco deja de existir y el navegador lo manda al <body>:
 * quien navegue con teclado se encontraría de vuelta al principio de la página después de
 * cada guardado. Se llama tras repintar porque hasta ese momento el botón nuevo no existe.
 */
export function devolverFoco() {
    if (focoPendiente === null) return;

    const fila = cuerpoTabla.querySelector(`tr[data-cliente-id="${focoPendiente}"]`);
    focoPendiente = null;

    // Puede no estar: el cliente se ha quedado en otra página, o ya no cumple el filtro. En
    // ese caso no forzamos el foco a ningún sitio raro; el aviso de "Cliente guardado" ya se
    // ha anunciado por su cuenta.
    fila?.querySelector(".btn-editar")?.focus();
}
