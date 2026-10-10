/**
 * @file Pintar una fila y encontrarla despues.
 *
 * Capa 1. Las consultas viven aqui porque la fila puede haber sido sustituida por un repintado.
 *
 * @author AngelDanielC0des
 */

import { cuerpoTabla } from "./dom.js";
import { filasDesplegadas } from "./estado.js";

/**
 * Escribe los datos del cliente en las celdas de su fila.
 *
 * Está aparte de pintarFilas porque también se usa al comprobar que un cliente no ha cambiado
 * mientras se miraba: si ha cambiado, la fila tiene que enseñar lo nuevo igual que el panel, o
 * quedaría un nombre en la tabla y otro distinto justo debajo.
 *
 * @param {DocumentFragment|Element} fila la fila (o el clon del template) que se rellena
 * @param {Object} cliente el ClienteResponse que se pinta
 */
export function pintarCeldasFila(fila, cliente) {
    // textContent escapa el texto: seguro frente a nombres con < o &.
    fila.querySelector(".cliente-nombre").textContent = cliente.nombre;
    fila.querySelector(".cliente-cif").textContent = cliente.nifCif;
    pintarEnlace(fila.querySelector(".cliente-email"), cliente.email,
        // Se codifican SOLO '?', '&' y '#', que son los tres caracteres que en un mailto
        // dejan de formar parte de la dirección y pasan a añadir cabeceras: un correo
        // guardado como "a@b.com?bcc=otro@c.com" mandaría una copia oculta que nadie ha
        // escrito. La arroba y el punto se dejan tal cual a propósito: codificarlo todo
        // funciona, pero deja una dirección ilegible en la barra de estado del navegador.
        (valor) => `mailto:${valor.replace(/[?&#]/g, encodeURIComponent)}`,
        "Escribir a este correo");
    pintarEnlace(fila.querySelector(".cliente-telefono"), cliente.telefono,
        // Solo dígitos y el '+' del prefijo internacional: es lo único que se puede marcar.
        // Antes se quitaban únicamente los espacios, así que cualquier otro carácter que
        // hubiera en la columna acababa dentro del tel: sin que se supiera qué iba a hacer
        // el marcador con él.
        (valor) => `tel:${valor.replace(/[^\d+]/g, "")}`,
        "Llamar a este número");
    fila.querySelector(".cliente-alta").textContent = formatearFecha(cliente.fechaAlta);
}

/**
 * Pinta una celda como enlace útil (escribir un correo, llamar por teléfono), o con un guion
 * si no hay dato.
 *
 * El esquema (mailto:, tel:) lo construye SIEMPRE el código, nunca el valor que llega del
 * servidor: así un dato manipulado no puede colar un href de tipo javascript:.
 *
 * @param {Element} celda la celda de la tabla
 * @param {string|null} valor el dato del cliente
 * @param {Function} construirHref función que arma el href a partir del valor
 * @param {string} pista qué dice el aviso emergente al pasar el ratón. Es el único que hay en
 *        esta celda —el de la fila vive en la del nombre— y explica lo que hace el enlace, que
 *        no es desplegar el detalle sino escribir un correo o llamar por teléfono
 */
function pintarEnlace(celda, valor, construirHref, pista) {
    const texto = (valor ?? "").trim();
    if (!texto) {
        celda.textContent = "—";
        return;
    }

    const enlace = document.createElement("a");
    enlace.className = "enlace-celda";
    enlace.href = construirHref(texto);
    enlace.textContent = texto;
    enlace.dataset.bsTitle = pista;
    celda.replaceChildren(enlace);
}

/**
 * Pasa la fecha ISO que manda el backend (2026-01-10) al formato español (10/1/2026).
 *
 * Se formatea en UTC a propósito. El backend manda un día suelto, sin hora, y el navegador lo
 * entiende como medianoche UTC: al pasarlo a la hora local de un huso negativo, esa medianoche
 * cae en el día anterior y la fecha de alta se vería con un día menos.
 *
 * @param {string|null} fechaIso fecha en formato ISO, o null si el cliente no la tiene
 * @return {string} la fecha formateada, o un guion si no hay fecha
 */
function formatearFecha(fechaIso) {
    if (!fechaIso) {
        return "—";   // fecha_alta admite NULL en base de datos
    }
    return new Date(fechaIso).toLocaleDateString("es-ES", { timeZone: "UTC" });
}

/**
 * La fila de un cliente tal y como está AHORA en el documento.
 *
 * @param {number} idCliente el cliente que se busca
 * @return {HTMLTableRowElement|null} su fila, o null si ya no está en la página (se ha ido a
 *         otra por la ordenación, ya no cumple el filtro, o lo han borrado)
 */
export function filaViva(idCliente) {
    return cuerpoTabla.querySelector(`tr.fila-cliente[data-cliente-id="${idCliente}"]`);
}

/**
 * El formulario de edición de un cliente tal y como está AHORA en el documento.
 *
 * @param {number} idCliente el cliente que se busca
 * @return {HTMLFormElement|null} su formulario, o null si su panel ya no está abierto
 */
export function formularioVivo(idCliente) {
    return cuerpoTabla.querySelector(`.formulario-edicion[data-cliente-id="${idCliente}"]`);
}

/** ¿Qué panel tiene abierto esta fila? "detalle", "edicion", "borrado" o null si cerrada. */
export function modoDe(fila) {
    return filasDesplegadas.get(Number(fila.dataset.clienteId))?.modo ?? null;
}

/**
 * El panel desplegado de una fila.
 *
 * @param {HTMLTableRowElement} fila la fila del cliente
 * @return {HTMLElement|null} el panel, o null si la fila está cerrada
 */
export function panelDe(fila) {
    const hermana = fila.nextElementSibling;
    return hermana?.classList.contains("fila-despliegue") ? hermana : null;
}

/**
 * La fila de cliente de al lado: la siguiente, o la anterior si era la última.
 *
 * No vale `nextElementSibling`: la hermana de una fila de cliente desplegada es SU PANEL, no la
 * fila siguiente, así que el foco acabaría en un `<tr>` que está a punto de desaparecer.
 *
 * @param {HTMLTableRowElement} fila la fila que se va a quitar de la tabla
 * @return {HTMLTableRowElement|null} la vecina, o null si era la única de la página
 */
export function filaVecina(fila) {
    const filas = [...cuerpoTabla.querySelectorAll("tr.fila-cliente")];
    const posicion = filas.indexOf(fila);

    return filas[posicion + 1] ?? filas[posicion - 1] ?? null;
}
