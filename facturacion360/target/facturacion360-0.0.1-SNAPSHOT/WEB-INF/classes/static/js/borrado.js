/**
 * @file Eliminar un cliente, con la confirmacion en su propia fila.
 *
 * Capa 5. El 404 cuenta como exito -alguien se adelanto, pero el cliente ya no esta- y el 409 deja el panel abierto con el motivo.
 *
 * @author AngelDanielC0des
 */

import { API_CLIENTE } from "./config.js";
import { filasDesplegadas } from "./estado.js";
import { enviarJson, esCancelacion } from "./api.js";
import { anunciar } from "./avisos.js";
import { crearAlerta } from "./notificaciones.js";
import { anotarFoco } from "./foco.js";
import { filaVecina, filaViva, panelDe } from "./fila.js";
import { cerrarDespliegue } from "./despliegue.js";

/**
 * Manda el DELETE y cuenta lo que ha pasado.
 *
 * El canal lleva el id del cliente dentro, así que una segunda confirmación de la MISMA fila
 * cancela la anterior, pero no interfiere con el borrado de otra. Y el botón se desactiva
 * mientras va la petición: el canal ya evitaría el duplicado, pero esto además lo enseña.
 *
 * @param {HTMLTableRowElement} fila la fila del cliente
 * @param {number} idCliente el cliente que se va a eliminar
 */
export async function borrarCliente(fila, idCliente) {
    const panel = panelDe(fila);
    const alerta = crearAlerta(panel?.querySelector(".alerta-borrado"));
    const botonConfirmar = panel?.querySelector(".btn-confirmar-borrado");

    if (botonConfirmar) botonConfirmar.disabled = true;
    alerta.limpiar();

    let estado;
    try {
        // Solo el codigo: un DELETE no tiene campos que puedan venir marcados.
        estado = (await enviarJson(`borrar-${idCliente}`, "DELETE", `${API_CLIENTE}/${idCliente}`)).estado;
    } catch (error) {
        // La hemos cancelado nosotros (otra confirmación de la misma fila): ya viene otra.
        if (esCancelacion(error)) return;
        estado = 0;
    }

    // El 404 se trata como un éxito. Significa que alguien se ha adelantado, pero el cliente ya
    // no está, que es exactamente lo que se pedía: contarlo como error sería darle un fallo a
    // quien ha obtenido lo que quería.
    if (estado === 204 || estado === 404) {
        const filaActual = filaViva(idCliente);

        if (filaActual) {
            // Quien acaba de confirmar tiene el foco en un botón que desaparece con la fila. Se
            // apunta la vecina para que devolverFoco() la recoja al terminar de repintar: sin
            // esto el foco cae al <body> y quien navega con teclado vuelve al principio de la
            // página. Es lo mismo que ya se hace al guardar una edición.
            const vecina = filaVecina(filaActual);
            if (vecina) anotarFoco(Number(vecina.dataset.clienteId));

            cerrarDespliegue(filaActual);
        } else {
            // La tabla se repintó mientras iba la petición y esta fila ya no está. Basta con
            // olvidar su estado para que reabrirDespliegues no la vuelva a desplegar.
            filasDesplegadas.delete(idCliente);
        }

        anunciar("Cliente eliminado.", { visible: true });
        document.dispatchEvent(new CustomEvent("clientes:cambiaron"));
        return;
    }

    // No se ha borrado: el panel se queda abierto con el motivo escrito dentro, y no se cierra
    // para que quien lo pidió vea por qué no ha pasado nada sin perder el sitio.
    if (botonConfirmar) botonConfirmar.disabled = false;
    alerta.mostrarError(motivoDeNoBorrar(estado));
}

/**
 * Traduce el código de la respuesta al motivo que se escribe en el panel.
 *
 * @param {number} estado el código HTTP, o 0 si la petición ni siquiera llegó
 * @return {string} el texto que ve quien intentó borrar
 */
function motivoDeNoBorrar(estado) {
    if (estado === 409) {
        return "No se puede eliminar: este cliente tiene facturas asociadas.";
    }

    return "No se ha podido eliminar el cliente. Inténtalo de nuevo.";
}
