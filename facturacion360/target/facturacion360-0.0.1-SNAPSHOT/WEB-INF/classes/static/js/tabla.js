/**
 * @file Pintar el cuerpo de la tabla y su paginacion.
 *
 * Capa 6. Repinta entero: es lo que hace que no haya dos verdades sobre la misma fila.
 *
 * @author AngelDanielC0des
 */

import { EVENTO_TABLA_REPINTADA } from "./config.js";
import {
    btnAnterior,
    btnSiguiente,
    columnasVisibles,
    cuerpoTabla,
    infoPagina,
    plantillaFila,
} from "./dom.js";
import { clientesEnPagina, hayCriteriosActivos } from "./estado.js";
import { anunciar, limpiarPistas } from "./avisos.js";
import { devolverFoco } from "./foco.js";
import { pintarCeldasFila } from "./fila.js";
import { marcarFila, reabrirDespliegues } from "./despliegue.js";
import { guardarBorradores } from "./edicion.js";

/**
 * Vacía el <tbody> y lo rellena clonando el <template> por cada cliente.
 * @param {Array<Object>} clientes lista de ClienteResponse
 */
export function pintarFilas(clientes) {
    // Antes de vaciar la tabla: guardar lo que hubiera a medio escribir en un formulario
    // abierto y destruir los avisos emergentes de las filas que van a desaparecer (si no,
    // se quedan flotando sobre la pantalla y además Bootstrap sigue guardando una
    // referencia a cada fila borrada).
    guardarBorradores();
    limpiarPistas();

    cuerpoTabla.replaceChildren(); // limpia la tabla sin usar innerHTML

    // Los datos de esta página, para que los paneles que se reabran no vuelvan a pedirlos.
    // Se vacía aquí, antes de rellenarlo: si no, iría acumulando los clientes de todas las
    // páginas que se hayan visitado y acabaría sirviendo datos de hace diez búsquedas.
    clientesEnPagina.clear();

    if (!Array.isArray(clientes) || clientes.length === 0) {
        // El mensaje cambia según el motivo: "no hay clientes" y "tu búsqueda no
        // encuentra nada" son cosas distintas y el usuario reacciona distinto a cada una.
        // En el segundo caso, la salida se ofrece ahí mismo.
        const filtrando = hayCriteriosActivos();
        const mensaje = filtrando
            ? "No hay clientes que coincidan con la búsqueda."
            : "No hay clientes que mostrar.";

        mostrarMensaje(mensaje, { conLimpiar: filtrando });

        // Y se anuncia, por el mismo motivo que el error de carga: escrito dentro del <tbody>
        // no lo lee nadie, porque no es una región viva. Quien no ve la pantalla solo oía el
        // "Sin resultados" del pie, que no distingue una tabla vacía de una búsqueda sin
        // coincidencias ni deja pista de que hay un botón para quitar los filtros.
        anunciar(filtrando ? `${mensaje} Puedes quitar los filtros.` : mensaje);

        // Aunque no haya a quién devolvérselo, hay que descartar la marca: si no, el foco
        // daría un salto inesperado en el siguiente repintado, que no tiene nada que ver.
        devolverFoco();
        return;
    }

    for (const [indice, cliente] of clientes.entries()) {
        clientesEnPagina.set(cliente.idCliente, cliente);

        // Clonamos el contenido del template (un <tr> completo con sus celdas).
        const fila = plantillaFila.content.cloneNode(true);

        pintarCeldasFila(fila, cliente);

        // Guardamos el id en la fila por si los botones de acción lo necesitan.
        const filaCliente = fila.querySelector("tr");
        filaCliente.dataset.clienteId = cliente.idCliente;

        // El rayado lo marcamos aquí, por CLIENTE. Con el table-striped de Bootstrap
        // (nth-of-type) cada panel de detalle insertado invierte la alternancia de todo lo
        // que viene detrás, y la tabla acaba con dos filas blancas seguidas.
        filaCliente.classList.toggle("fila-par", indice % 2 === 1);

        // Deja la fila en estado "cerrada": aria-expanded a false, y el nombre y el aviso de
        // cada botón con el cliente dentro ("Editar cliente García S.L.").
        marcarFila(filaCliente, null);

        cuerpoTabla.appendChild(fila);
    }

    reabrirDespliegues();
    document.dispatchEvent(new CustomEvent(EVENTO_TABLA_REPINTADA));
    devolverFoco();
}

/**
 * Activa/desactiva los botones y actualiza el texto según los metadatos de la página.
 * @param {Object} datos PaginaClienteResponse
 */
export function pintarPaginacion(datos) {
    // El backend nos dice si cada página existe, así el usuario no se sale del rango.
    btnAnterior.disabled = !datos.hayAnterior;
    btnSiguiente.disabled = !datos.haySiguiente;

    infoPagina.textContent = datos.totalElementos === 0
        ? "Sin resultados"
        : `Página ${datos.paginaActual + 1} de ${datos.totalPaginas} · ${datos.totalElementos} clientes`;
}

/**
 * Pinta una fila que ocupa toda la tabla con un mensaje informativo.
 * @param {string} texto el mensaje
 * @param {Object} opciones
 * @param {boolean} opciones.conLimpiar añade el botón de quitar filtros: cuando la tabla
 *        sale vacía por un filtro, la salida tiene que estar donde se ve el problema
 */
function mostrarMensaje(texto, { conLimpiar = false } = {}) {

    // Vaciar la tabla deja sin destino al foco anotado: si no se descarta aqui, el
    // siguiente repintado que SI traiga filas se lo llevaria de donde este el cursor
    // -el buscador, por ejemplo- hasta el boton de un cliente, a media palabra. Pasan
    // por aqui los dos caminos que vacian la tabla, el de sin resultados y el de error.
    devolverFoco();

    // Este es el OTRO sitio que vacía la tabla, además de pintarFilas, así que lo que hay que
    // rescatar antes de vaciarla hay que rescatarlo también aquí. Cuando se llega desde
    // pintarFilas las dos llamadas se repiten, y no pasa nada porque son idempotentes; cuando
    // se llega desde mostrarError, este es el ÚNICO sitio donde se hacen.
    //
    // Los avisos emergentes, porque el globo que hubiera abierto se queda flotando sobre el
    // mensaje: con container "body" cuelga del <body>, y como detrás no queda ninguna fila que
    // pulsar, no hay forma de provocar la limpieza hasta la siguiente búsqueda.
    //
    // Y los borradores, porque el alta va a volver a pintarse abajo y lo haría con lo que
    // tuviera guardado de antes, perdiendo lo tecleado desde entonces.
    limpiarPistas();
    guardarBorradores();
    cuerpoTabla.replaceChildren();
    const fila = document.createElement("tr");
    const celda = document.createElement("td");
    celda.colSpan = columnasVisibles();
    celda.className = "text-center text-muted py-4";
    celda.textContent = texto;

    if (conLimpiar) {
        const boton = document.createElement("button");
        boton.type = "button";
        boton.className = "btn btn-sm btn-link btn-quitar-filtros";
        boton.textContent = "Quitar los filtros";
        celda.append(" ", boton);
    }

    fila.appendChild(celda);
    cuerpoTabla.appendChild(fila);

    // Y el alta vuelve arriba: sin esto, buscar algo que no existe se llevaba por delante el
    // formulario a medio rellenar. reabrirAlta hace prepend, así que queda por encima del
    // mensaje, que es donde tiene sentido: el formulario es lo que el usuario está usando y
    // el "no hay coincidencias" habla de la tabla que tiene debajo.
    document.dispatchEvent(new CustomEvent(EVENTO_TABLA_REPINTADA));
}

/** Muestra el error al usuario y lo deja en consola para depurar. */
export function mostrarError(error) {
    console.error("No se pudieron cargar los clientes:", error);

    const mensaje = "No se pudieron cargar los clientes. Inténtalo de nuevo.";

    // El texto va donde se estaría mirando, dentro de la tabla, y se anuncia por la región
    // invisible: escrito ahí dentro no lo lee nadie, porque el <tbody> no es una región viva
    // y quien no ve la pantalla se quedaría esperando unos datos que no van a llegar.
    mostrarMensaje(mensaje);
    anunciar(mensaje);

    btnAnterior.disabled = true;
    btnSiguiente.disabled = true;
}
