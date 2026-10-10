/**
 * @file Guardar los cambios de una fila que se estaba editando.
 *
 * Capa 5. Comparte el molde del formulario con el alta; lo que cambia es que aqui hay un cliente al que volver.
 *
 * @author AngelDanielC0des
 */

import { API_CLIENTE } from "./config.js";
import { cuerpoTabla } from "./dom.js";
import { altaAbierta, filasDesplegadas } from "./estado.js";
import { enviarJson, esCancelacion } from "./api.js";
import { anunciar, fijar } from "./avisos.js";
import { anotarFoco } from "./foco.js";
import { filaViva, formularioVivo } from "./fila.js";
import {
    cuerpoPeticion,
    leerFormulario,
    limpiarErrores,
    mostrarErrorGuardado,
} from "./formulario.js";
import { validar } from "./validacion.js";
import { cerrarDespliegue } from "./despliegue.js";

/** Guarda lo escrito en los formularios abiertos antes de que la tabla se repinte. */
export function guardarBorradores() {
    for (const formulario of cuerpoTabla.querySelectorAll(".formulario-edicion")) {
        // El del alta no está en filasDesplegadas —no tiene id de cliente— y se guarda aparte.
        if (formulario.classList.contains("formulario-alta")) {
            if (altaAbierta) altaAbierta.borrador = leerFormulario(formulario);
            continue;
        }

        const estado = filasDesplegadas.get(Number(formulario.dataset.clienteId));
        if (estado) {
            estado.borrador = leerFormulario(formulario);
        }
    }
}

/**
 * Manda los cambios al backend y actúa según lo que responda.
 *
 * No se llama guardarCliente a propósito: ese es el nombre que le corresponde al alta de
 * clientes, que es otra feature. Ocupándolo, el día que alguien la implemente se encontraría
 * el nombre cogido por una función que espera un formulario de edición.
 *
 * @param {HTMLFormElement} formulario el formulario de la fila que se está editando
 */
export async function guardarEdicion(formulario) {
    const idCliente = Number(formulario.dataset.clienteId);

    limpiarErrores(formulario);

    // Las restricciones del HTML (required, maxlength, type=email) son las mismas que valida
    // el backend, así que el navegador corta aquí lo que el servidor rechazaría con un 400 y
    // nos ahorramos la petición. De pintar en rojo el campo que falla, enseñar su mensaje y
    // llevar el cursor hasta él se encarga validar().
    if (!validar(formulario)) return;

    const boton = formulario.querySelector(".btn-guardar");
    boton.disabled = true;   // sin esto, dos clics seguidos mandan dos PUT

    try {
        const { estado, errores } = await enviarJson(`guardar-${idCliente}`, "PUT",
            `${API_CLIENTE}/${idCliente}`, cuerpoPeticion(formulario));

        if (estado === 200) {
            // Se olvida el panel por el id y no por la fila: si la tabla se ha repintado
            // mientras viajaba la petición, el <tr> que teníamos ya no está en el documento y
            // cerrarDespliegue no llegaría a borrar la entrada del Map. Quedaría un panel
            // abierto de un cliente que el usuario ya había terminado de editar.
            filasDesplegadas.delete(idCliente);

            const fila = filaViva(idCliente);
            if (fila) cerrarDespliegue(fila);

            // Y que la tabla, al repintarse, devuelva el foco al botón de editar de esta fila:
            // el que estaba pulsado deja de existir y el foco se iría al principio de la página.
            anotarFoco(idCliente);

            // Visible: la fila que se estaba editando desaparece con el refresco y no quedaría
            // ninguna señal de que el guardado ha ido bien.
            anunciar("Cliente guardado.", { visible: true });

            // El contrato del proyecto para avisar de un cambio. La tabla se recarga sola, así
            // que la fila enseña lo guardado y se recoloca si el orden la ha movido de sitio.
            document.dispatchEvent(new CustomEvent("clientes:cambiaron"));
            return;
        }

        contarErrorGuardado(idCliente, estado, errores);
    } catch (error) {
        if (esCancelacion(error)) return;
        console.error("No se pudo guardar el cliente:", error);
        contarErrorGuardado(idCliente, 0);
    } finally {
        // El botón, el vivo: si la tabla se repintó, el que teníamos ya no está y el nuevo nace
        // habilitado de todos modos, así que sin esta búsqueda no pasaría nada malo. Se hace
        // igual para que no parezca un olvido y para que la regla de arriba no tenga excepciones.
        const botonVivo = formularioVivo(idCliente)?.querySelector(".btn-guardar");
        if (botonVivo) botonVivo.disabled = false;
    }
}

/**
 * Cuenta un guardado que no ha salido bien, en el formulario que esté en pantalla AHORA.
 *
 * Es la parte que faltaba de la regla del `await`: el formulario desde el que se pulsó Guardar
 * puede haber desaparecido mientras viajaba la petición (basta con teclear en el buscador, o
 * con que otra parte de la aplicación dispare `clientes:cambiaron`). Escribir el error en él no
 * falla, simplemente no lo lee nadie, y el usuario se queda creyendo que ha guardado.
 *
 * Si el panel ya no está abierto no hay dónde poner el detalle del error, así que el aviso va a
 * la franja de fuera, que es lo único que sobrevive a un repintado.
 *
 * @param {number} idCliente el cliente que se intentaba guardar
 * @param {number} estado el código HTTP (0 si ni siquiera hubo respuesta)
 */
function contarErrorGuardado(idCliente, estado, errores) {
    const formulario = formularioVivo(idCliente);

    if (formulario) {
        mostrarErrorGuardado(formulario, estado, errores);
        return;
    }

    fijar("No se pudo guardar el cliente. Vuelve a abrirlo e inténtalo de nuevo.",
        { esError: true });
}
