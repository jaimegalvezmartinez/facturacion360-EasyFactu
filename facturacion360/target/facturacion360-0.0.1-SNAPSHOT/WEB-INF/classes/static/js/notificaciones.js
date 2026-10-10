/**
 * @file El comportamiento común de los avisos de toda la aplicación.
 *
 * Capa 1. Este módulo NO sabe de clientes ni de facturas: recibe los dos contenedores de
 * una pantalla y devuelve las funciones que escriben en ellos. Así las cuatro páginas
 * avisan igual sin que ninguna tenga que conocer a las otras.
 *
 * Son dos verbos y no un booleano porque son dos cosas distintas, y el nombre lo dice:
 *
 *   anunciar()  cuenta algo que ACABA DE PASAR ("Factura creada").  Se borra solo.
 *   fijar()     describe algo que SIGUE SIENDO VERDAD ("Mostrando el 3º trimestre",
 *               "No se pudo conectar con el servidor").  Se queda.
 *
 * La regla de cuál usar no es la gravedad del mensaje: es si el mensaje caduca por sí
 * mismo. Un "Cliente guardado" de hace diez minutos engaña, porque parece de la última
 * acción. Un "Mostrando el 3º trimestre" que desaparece deja la tabla sin rótulo y ya no
 * se sabe qué se está viendo.
 *
 * @author AngelDanielC0des
 */

import { DURACION_AVISO_MS } from "./config.js";

/**
 * Monta el juego de avisos de una pantalla.
 *
 * @param {Object} opciones
 * @param {Element} [opciones.franja] el elemento visible donde se escribe el aviso. La hoja
 *        de estilos se encarga de que vacío no ocupe, por eso se vacía en vez de esconderse
 * @param {Element} [opciones.region] la región viva que lee el lector de pantalla. Va aparte
 *        de la franja porque resuelve otra cosa: está siempre en el documento, vacía e
 *        invisible, y al no verse puede repetir un texto que ya está escrito en su sitio
 *        (el mensaje de la tabla vacía, el del panel) sin que salga dos veces
 * @param {number} [opciones.duracionMs] lo que dura un aviso temporal
 * @return {{anunciar: Function, fijar: Function, limpiar: Function}}
 */
export function crearAvisos({ franja = null, region = null, duracionMs = DURACION_AVISO_MS } = {}) {

    // Temporizador que borra el aviso pasado un rato. Uno por pantalla: dos avisos seguidos
    // comparten franja, y sin cancelar el anterior el primero se llevaría por delante al
    // segundo a mitad de su tiempo.
    let temporizador = null;

    /**
     * Le cuenta a quien no ve la pantalla lo que acaba de pasar.
     *
     * Se vacía y se reescribe en el fotograma siguiente, en vez de asignar el texto sin más.
     * Lo que el lector de pantalla vigila es el CAMBIO de contenido, así que un mensaje
     * idéntico al anterior no se leería: guardar dos clientes seguidos anunciaba el primero
     * y callaba el segundo, que es justo cuando hace falta la confirmación.
     */
    function leerEnAltaVoz(texto) {
        if (!region) return;

        region.textContent = "";
        requestAnimationFrame(() => {
            region.textContent = texto;
        });
    }

    /**
     * Escribe en la franja visible con el tono que le toca.
     *
     * Los tres tonos salen solos de la diferencia entre anunciar() y fijar(), sin tener que
     * pasar ningún parámetro de más: un evento que sale bien es una confirmación (verde), un
     * estado que describe lo que se está viendo es información (neutro), y cualquiera de los
     * dos puede ir mal (rojo).
     *
     * El color nunca va solo (criterio 1.4.1 de WCAG): lo que distingue a los tres es la
     * barra de la izquierda, que se sigue viendo en escala de grises.
     *
     * @param {string} texto
     * @param {"exito"|"error"|"neutro"} tono
     */
    function escribirEnFranja(texto, tono) {
        if (!franja) return;

        franja.classList.toggle("aviso-exito", tono === "exito");
        franja.classList.toggle("aviso-error", tono === "error");
        franja.textContent = texto;
    }

    /**
     * Cuenta algo que acaba de ocurrir: siempre a quien no ve la pantalla, y además en la
     * franja cuando no haya otro sitio donde se vea.
     *
     * @param {string} texto lo que se cuenta
     * @param {Object} [opciones]
     * @param {boolean} [opciones.visible=false] si además se escribe en la franja. Para lo
     *        que no tiene otro sitio donde verse, como el "Cliente guardado" de una fila que
     *        el refresco se lleva por delante
     * @param {boolean} [opciones.esError=false] si es un problema y no una confirmación
     */
    function anunciar(texto, { visible = false, esError = false } = {}) {
        leerEnAltaVoz(texto);

        if (!visible) return;

        clearTimeout(temporizador);
        escribirEnFranja(texto, esError ? "error" : "exito");

        // Se borra solo: es información de "ha pasado esto ahora", y dejarla fija acaba
        // confundiendo. Se vacía en vez de esconderse: la hoja de estilos ya oculta la
        // franja vacía.
        temporizador = setTimeout(() => {
            escribirEnFranja("", "neutro");
        }, duracionMs);
    }

    /**
     * Deja escrito algo que sigue siendo verdad hasta que cambie la situación.
     *
     * No lleva la opción visible de anunciar(): un estado que no se ve no es un estado, es
     * un secreto. Y cancela el temporizador que hubiera en vuelo, porque si no, el aviso
     * temporal anterior borraría este a mitad de su vida.
     *
     * No hace falta llamar a limpiar() antes: la franja guarda un solo mensaje, así que el
     * siguiente aviso releva al que hubiera, sea del tipo que sea.
     *
     * @param {string} texto lo que se queda escrito
     * @param {Object} [opciones]
     * @param {boolean} [opciones.esError=false] si es un problema y no información
     */
    function fijar(texto, { esError = false } = {}) {
        clearTimeout(temporizador);
        temporizador = null;

        leerEnAltaVoz(texto);
        escribirEnFranja(texto, esError ? "error" : "neutro");
    }

    /**
     * Vacía la franja ahora mismo.
     *
     * Para cuando la situación que describía un aviso fijo ya no existe y no hay ningún
     * mensaje nuevo con el que relevarlo: por ejemplo, una búsqueda que vuelve a funcionar
     * después de un error de conexión.
     */
    function limpiar() {
        clearTimeout(temporizador);
        temporizador = null;

        escribirEnFranja("", "neutro");
    }

    return { anunciar, fijar, limpiar };
}

/**
 * Monta la alerta de un formulario: el hueco donde se cuenta por qué no se ha podido
 * guardar, dentro del propio formulario y no en la franja de la página.
 *
 * Va aparte de crearAvisos porque resuelve otra cosa. La franja cuenta lo que pasa en la
 * PANTALLA, y por eso necesita su gemela invisible para el lector de pantalla. Esto cuenta
 * lo que le pasa a UN formulario, vive dentro de él y ya lleva su propio role="alert"
 * puesto desde que se pintó, así que basta con escribirle el texto para que se anuncie.
 *
 * Y no mueve el foco a propósito, aunque el modal de facturas lo hiciera antes: un
 * role="alert" se anuncia solo, y llevar ADEMÁS el foco al elemento hace que varios
 * lectores lo lean dos veces. Para que no se quede fuera de la pantalla en un formulario
 * largo está el scrollIntoView, que acerca sin quitarle el foco a nadie.
 *
 * @param {Element} elemento el <p role="alert"> del formulario
 * @return {{mostrarError: Function, informar: Function, limpiar: Function}}
 */
export function crearAlerta(elemento) {

    /** Vaciarla es esconderla: la hoja de estilos oculta la alerta sin texto, y así el
     *  elemento no se va nunca del documento, que es lo que necesita su role="alert" para
     *  poder anunciar. */
    function escribir(texto, esError) {
        if (!elemento) return;

        elemento.classList.toggle("alerta-error", esError);
        elemento.textContent = texto;

        // Solo si hay algo que leer: vacía está oculta (:empty), y acercarse a un elemento
        // que no se ve no hace nada. "nearest" tampoco da tirones si ya estaba a la vista,
        // que es el caso del panel de una fila de cliente.
        if (texto) elemento.scrollIntoView({ block: "nearest" });
    }

    /** Algo ha fallado y hay que arreglarlo: sale en rojo. */
    function mostrarError(texto) {
        escribir(texto, true);
    }

    /** Algo que conviene saber pero que no es un problema, como qué campos se acaban de
     *  refrescar al reabrir un panel. Sale en tono neutro.
     *
     *  Son dos verbos y no un booleano a propósito: con `mostrar(texto, { esError })` el
     *  descuido se paga en silencio, porque el que se olvida del segundo argumento no ve
     *  ningún fallo, solo un error pintado como si fuera información. */
    function informar(texto) {
        escribir(texto, false);
    }

    function limpiar() {
        escribir("", false);
    }

    return { mostrarError, informar, limpiar };
}
