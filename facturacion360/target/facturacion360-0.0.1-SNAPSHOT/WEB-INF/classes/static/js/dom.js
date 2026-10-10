/**
 * @file Referencias a los elementos del documento.
 *
 * Capa 0. Se resuelven una vez al cargar, en vez de buscarlos en cada uso.
 *
 * @author AngelDanielC0des
 */

// Referencias del DOM que usamos.
export const cuerpoTabla = document.getElementById("tabla-clientes");

export const plantillaFila = document.getElementById("fila-cliente-template");

export const plantillaDespliegue = document.getElementById("fila-despliegue-template");

export const plantillaPanelDetalle = document.getElementById("panel-detalle-template");

export const plantillaPanelEdicion = document.getElementById("panel-edicion-template");

export const plantillaPanelBorrado = document.getElementById("panel-borrado-template");

export const btnAnterior = document.getElementById("btn-anterior");

export const btnSiguiente = document.getElementById("btn-siguiente");

export const infoPagina = document.getElementById("info-pagina");

export const inputBuscador = document.getElementById("buscador-clientes");

export const contenedorBuscador = document.querySelector(".buscador-clientes");

export const barraFiltros = document.querySelector(".barra-filtros");

export const contadorFiltros = document.getElementById("contador-filtros");

export const selectProvincia = document.getElementById("filtro-provincia");

export const selectPoblacion = document.getElementById("filtro-poblacion");

export const selectOrdenarPor = document.getElementById("filtro-ordenar-por");

export const btnDireccion = document.getElementById("btn-direccion");

export const iconoDireccion = document.getElementById("icono-direccion");

export const etiquetaDireccion = document.getElementById("etiqueta-direccion");

export const btnLimpiar = document.getElementById("btn-limpiar");

export const cabecerasOrdenables = document.querySelectorAll(".cabecera-ordenable");

export const regionAnuncios = document.getElementById("anuncios");

export const avisoClientes = document.getElementById("aviso-clientes");

export const contenedorTabla = cuerpoTabla.closest(".table-responsive");

export const dialogoDescartar = document.getElementById("modal-descartar");

export const btnDescartar = document.getElementById("btn-descartar");

export const pantallaCarga = document.getElementById("pantalla-carga");

export const btnAnadirCliente = document.getElementById("btn-anadir-cliente");

// Las cabeceras de la tabla. Se cuentan para saber cuántas columnas tiene que ocupar la fila
// de mensajes y la del despliegue, en vez de escribir un 6 que habría que acordarse de cambiar
// aquí y en el HTML al añadir una columna. El ":scope >" deja fuera las cabeceras de las
// tablas de los paneles, que se insertan dentro de esta.
const CABECERAS_TABLA = cuerpoTabla.closest("table")
    .querySelectorAll(":scope > thead > tr > th");

// El texto de fábrica del error de CADA campo, sacado del propio <template> donde está
// escrito. Se guardan al arrancar porque los mensajes del servidor los pisan y al reintentar
// hay que devolverlos: copiarlos aquí a mano serían dos textos que acabarían divergiendo.
//
// Son todos y no solo el del NIF/CIF porque desde que la API devuelve el mapa de errores por
// campo, un 400 puede marcar varios a la vez.
export const MENSAJES_BASE = Object.fromEntries(
    [...plantillaPanelEdicion.content.querySelectorAll("[name]")].map((control) => [
        control.name,
        plantillaPanelEdicion.content
            .querySelector(`[name="${control.name}"] ~ .invalid-feedback`)?.textContent ?? "",
    ])
);

/**
 * Cuántas columnas se están viendo ahora mismo.
 *
 * Se cuentan en vez de usar el total porque en móvil hay dos que se ocultan con las clases
 * d-none de Bootstrap: con el número entero, la fila de mensajes y la del panel se extienden
 * sobre dos columnas que no existen y su contenido se centra respecto a un ancho mayor que el
 * de la tabla, saliéndose por la derecha.
 *
 * @return {number} el número de cabeceras visibles; el total si no hubiera ninguna, que es lo
 *         que pasa si la tabla entera está oculta y un colspan de 0 no es válido
 */
export function columnasVisibles() {
    // offsetParent es null en un elemento con display:none (y en toda su descendencia), que es
    // justo lo que hace la clase d-none.
    const visibles = [...CABECERAS_TABLA].filter((cabecera) => cabecera.offsetParent !== null);
    return visibles.length || CABECERAS_TABLA.length;
}
