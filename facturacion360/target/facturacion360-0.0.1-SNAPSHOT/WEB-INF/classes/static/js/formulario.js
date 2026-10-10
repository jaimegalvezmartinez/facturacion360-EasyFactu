/**
 * @file Leer y escribir los campos de un formulario de cliente.
 *
 * Capa 2. Lo comparten la edicion y el alta, que usan el mismo molde.
 *
 * @author AngelDanielC0des
 */

import { CAMPOS_EDITABLES, CAMPOS_OPCIONALES } from "./config.js";
import { MENSAJES_BASE } from "./dom.js";
import { filasDesplegadas } from "./estado.js";
import { fijar } from "./avisos.js";
import { crearAlerta } from "./notificaciones.js";
import { limpiarCampo, marcarCampo } from "./validacion.js";

/**
 * El nombre visible de un campo del formulario, para poder nombrarlo en un aviso.
 *
 * Se lee de la etiqueta asociada al propio control (la propiedad `labels` da las que le
 * apuntan con `for`) en vez de tener aquí una lista de nombres: son los mismos textos y una
 * copia acabaría diciendo algo distinto del formulario que describe.
 *
 * Solo el texto, no la etiqueta entera: dentro lleva también el lápiz y el asterisco de
 * obligatorio, que son decorativos y no forman parte del nombre del campo. El `name` queda
 * de red de seguridad por si algún campo se quedara sin etiqueta.
 *
 * @param {HTMLInputElement} control el campo del formulario
 * @return {string} su nombre visible ("Código postal"), o su atributo name si no tiene
 */
export function etiquetaDe(control) {
    const nombreVisible = control.labels?.[0]
        ?.querySelector(".texto-etiqueta")?.textContent.trim();

    return nombreVisible || control.name;
}

/**
 * Los campos vacíos se ven mejor como un guion que como una celda en blanco.
 *
 * @param {string|null|undefined} valor el dato tal cual viene del backend
 * @return {string} el valor, o un guion largo si no había nada que enseñar
 */
export function textoOGuion(valor) {
    return valor && valor.trim() ? valor : "—";
}

/**
 * Los datos del cliente en la forma que entiende el formulario: solo los campos editables,
 * sin nulos y sin espacios sobrantes. Un input al que se le asigna null escribe la palabra
 * "null" dentro, así que la conversión no es opcional.
 *
 * @param {Object} cliente el cliente tal cual llega del backend
 * @return {Object.<string, string>} un valor por cada campo de CAMPOS_EDITABLES
 */
export function valoresDe(cliente) {
    const valores = {};
    for (const campo of CAMPOS_EDITABLES) {
        valores[campo] = (cliente[campo] ?? "").trim();
    }
    return valores;
}

/**
 * Lo que hay escrito ahora mismo en el formulario. Devuelve la MISMA forma que
 * {@link valoresDe} para que las dos se puedan comparar campo a campo (ver hayCambios).
 *
 * @param {HTMLFormElement} formulario el formulario de edición
 * @return {Object.<string, string>} un valor por cada campo de CAMPOS_EDITABLES
 */
export function leerFormulario(formulario) {
    const valores = {};
    for (const campo of CAMPOS_EDITABLES) {
        valores[campo] = formulario.elements[campo].value.trim();
    }
    return valores;
}

/** ¿Se ha tocado algo respecto a lo que hay en la base de datos? */
export function hayCambios(formulario) {
    return JSON.stringify(leerFormulario(formulario)) !== formulario.dataset.valoresOriginales;
}

/**
 * Los datos que viajan al servidor, con la forma que espera ClienteRequest. No lleva ni el
 * id (viaja
 * en la URL) ni la fecha de alta (no es editable y el service conserva la que hay en la BD).
 *
 * @param {HTMLFormElement} formulario el formulario, de alta o de edición
 * @return {Object.<string, string|null>} los campos listos para enviar. Quien los convierte
 *         en JSON es enviarJson, que hace el JSON.stringify: aquí sale un objeto
 */
export function cuerpoPeticion(formulario) {
    const valores = leerFormulario(formulario);

    // Los opcionales vacíos viajan como null y no como "": esas columnas admiten NULL y es lo
    // que hay en las filas que nunca se rellenaron. Mandar cadenas vacías dejaría dos formas
    // distintas de decir "no hay dato" conviviendo en la misma tabla.
    for (const campo of CAMPOS_OPCIONALES) {
        if (!valores[campo]) valores[campo] = null;
    }

    return valores;
}

/**
 * Cuenta qué ha pasado según el código que devolvió el servidor.
 * @param {HTMLFormElement} formulario el formulario que se intentó guardar
 * @param {number} estado el código HTTP (0 si ni siquiera hubo respuesta)
 */
export function mostrarErrorGuardado(formulario, estado, errores = {}) {
    // El NIF/CIF tiene un índice UNIQUE en la base de datos: es el único dato que puede chocar
    // con otro cliente, así que el 409 se señala en SU campo. Un aviso general obligaría al
    // usuario a adivinar cuál de los ocho campos es el del problema.
    if (estado === 409) {
        // Con enfocar: esto llega de una respuesta del servidor, no de lo que se está
        // tecleando, así que llevar el cursor al campo es justo lo que hace falta para poder
        // corregirlo. marcarCampo pone el rojo, el aria-invalid y el aria-describedby.
        marcarCampo(formulario.elements.nifCif,
            "Ya existe otro cliente con este NIF/CIF.", { enfocar: true });
        return;
    }

    if (estado === 404) {
        // Alguien lo ha borrado mientras se editaba: no hay nada que guardar y la tabla que se
        // está viendo ya no es la que hay en la base de datos. Este es el único error que NO
        // se escribe en la alerta del formulario: el refresco que viene a continuación se
        // lleva por delante la fila y con ella la alerta, así que el aviso va a la franja de
        // fuera, que es la que sobrevive.
        fijar("Este cliente ya no existe: alguien lo ha eliminado mientras lo editabas.",
            { esError: true });
        filasDesplegadas.delete(Number(formulario.dataset.clienteId));
        document.dispatchEvent(new CustomEvent("clientes:cambiaron"));
        return;
    }

    // Los demás dejan el panel abierto para poder corregir, así que se cuentan ahí mismo. La
    // alerta es role="alert" y estaba en el documento desde que se pintó el formulario: basta
    // con escribirle el texto para que se anuncie.
    const alerta = crearAlerta(formulario.querySelector(".alerta-formulario"));

    if (estado === 400) {
        // El servidor dice QUE campo y POR QUE. Es lo que hace falta para un NIF con la letra
        // de control cambiada: la forma es correcta, asi que el navegador lo deja pasar, y sin
        // este mapa el usuario solo leeria "revisa los campos marcados" sin ninguno marcado.
        const marcados = Object.entries(errores);

        for (const [campo, motivo] of marcados) {
            if (formulario.elements[campo]) marcarCampo(formulario.elements[campo], motivo);
        }

        if (marcados.length > 0) {
            formulario.querySelector(".is-invalid")?.focus();
            return;
        }

        alerta.mostrarError("El servidor ha rechazado los datos. Revisa los campos marcados.");
    } else {
        alerta.mostrarError("No se pudo guardar. Inténtalo de nuevo en unos segundos.");
    }
}

/** Borra las marcas del intento anterior para no mezclar errores viejos con nuevos. */
export function limpiarErrores(formulario) {
    crearAlerta(formulario.querySelector(".alerta-formulario")).limpiar();

    // Todos los que estuvieran marcados y no solo el NIF/CIF: un 400 puede venir señalando
    // varios campos, y sin esto las marcas del intento anterior se quedarian puestas. A cada
    // uno se le devuelve el mensaje que el <template> trae de fabrica, que es el que le toca
    // enseñar si se queda vacio.
    for (const campo of formulario.querySelectorAll(".is-invalid")) {
        limpiarCampo(campo, MENSAJES_BASE[campo.name]);
    }
}
