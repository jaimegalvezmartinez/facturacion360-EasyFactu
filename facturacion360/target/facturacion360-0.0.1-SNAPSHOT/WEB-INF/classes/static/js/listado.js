/**
 * @file Pedir los datos al servidor y encadenar los desplegables.
 *
 * Capa 7. Separa 'pedir' de 'pintar': aqui se pide, en tabla.js se pinta.
 *
 * @author AngelDanielC0des
 */

import { API_LISTAR_PAGINA, API_POBLACIONES, API_PROVINCIAS, TAMANO_PAGINA } from "./config.js";
import { contenedorTabla, selectPoblacion, selectProvincia } from "./dom.js";
import { criterios } from "./estado.js";
import { esCancelacion, pedirJson } from "./api.js";
import { mostrarError, pintarFilas, pintarPaginacion } from "./tabla.js";

export let paginaActual = 0;

// Peticiones de listado que hay ahora mismo en el aire. Es un contador y no un booleano
// porque una petición cancelada termina DESPUÉS de que arranque la que la sustituye: con un
// booleano, la que muere apagaría el "cargando" de la que sigue viva.
let listadosEnVuelo = 0;

/**
 * Pide una página de clientes al backend (con los criterios actuales) y repinta todo.
 * @param {number} pagina índice de la página a cargar (empieza en 0)
 */
export async function cargarClientes(pagina) {
    // Atenúa la tabla y avisa a los lectores de pantalla de que lo que hay no es definitivo:
    // sin esto se siguen viendo los datos de la página anterior como si fueran los nuevos.
    // El aria-busy va en el contenedor y no en el <tbody> porque es el contenedor el que ya
    // es una región anunciable (role="region" + aria-labelledby): en el cuerpo de la tabla,
    // el atributo no describe ninguna zona que el lector de pantalla reconozca como tal.
    listadosEnVuelo++;
    contenedorTabla.setAttribute("aria-busy", "true");

    try {
        // URLSearchParams se encarga de codificar los valores: un término con '&',
        // '%' o tildes viaja entero y no rompe la URL.
        const parametros = new URLSearchParams({
            pagina: pagina,
            tamano: TAMANO_PAGINA,
            ordenarPor: criterios.ordenarPor,
            direccion: criterios.direccion,
        });

        // Los criterios vacíos NO se mandan: el backend entiende "parámetro ausente"
        // como "no filtres por esto".
        if (criterios.busqueda) parametros.set("busqueda", criterios.busqueda);
        if (criterios.provincia) parametros.set("provincia", criterios.provincia);
        if (criterios.poblacion) parametros.set("poblacion", criterios.poblacion);

        const datos = await pedirJson("listado", `${API_LISTAR_PAGINA}?${parametros}`);

        // Página que ya no existe: se pedía la 4 y entre medias han borrado clientes hasta
        // dejar 3. El backend responde con la página vacía y el total real (no reencamina
        // solo, porque el paginado no puede adivinar si eso es un error o no), así que la
        // corrección la hacemos aquí: se pide la última que sí existe. Sin esto, la tabla se
        // queda vacía diciendo "Página 4 de 3" y sin manera obvia de salir de ahí.
        const hayQueRetroceder = !datos.contenido?.length
            && datos.totalPaginas > 0
            && pagina > datos.totalPaginas - 1;

        if (hayQueRetroceder) {
            await cargarClientes(datos.totalPaginas - 1);
            return;
        }

        paginaActual = datos.paginaActual;
        pintarFilas(datos.contenido);
        pintarPaginacion(datos);
    } catch (error) {
        // Si la hemos cancelado nosotros, ya viene otra petición en camino: salimos sin
        // tocar la tabla para no borrar lo que hay mientras llega la respuesta buena.
        if (esCancelacion(error)) return;
        mostrarError(error);
    } finally {
        listadosEnVuelo--;
        if (listadosEnVuelo === 0) {
            contenedorTabla.setAttribute("aria-busy", "false");
        }
    }
}

/**
 * Rellena un <select> con las opciones recibidas, conservando la primera (el "Todas...").
 * @param {HTMLSelectElement} select el desplegable a rellenar
 * @param {Array<string>} valores las opciones a añadir
 */
function rellenarSelect(select, valores) {
    // Quitamos todo menos la primera opción, que es la de "sin filtro".
    while (select.options.length > 1) {
        select.remove(1);
    }
    for (const valor of valores) {
        const opcion = document.createElement("option");
        opcion.value = valor;
        opcion.textContent = valor;   // textContent: nunca innerHTML
        select.appendChild(opcion);
    }
}

/** Carga las provincias del backend en su desplegable. */
export async function cargarProvincias() {
    try {
        rellenarSelect(selectProvincia, await pedirJson("provincias", API_PROVINCIAS));
    } catch (error) {
        if (esCancelacion(error)) return;
        console.error("No se pudieron cargar las provincias:", error);
    }
}

/**
 * Carga las poblaciones en su desplegable. Si hay provincia elegida, solo las de esa
 * provincia (por eso es "en cascada"): ofrecer poblaciones de otras provincias daría
 * combinaciones que no devuelven ningún cliente.
 * @param {string} provincia provincia elegida, o cadena vacía para todas
 */
export async function cargarPoblaciones(provincia) {
    try {
        const url = provincia
            ? `${API_POBLACIONES}?${new URLSearchParams({ provincia })}`
            : API_POBLACIONES;
        rellenarSelect(selectPoblacion, await pedirJson("poblaciones", url));
    } catch (error) {
        // Si el usuario cambia de provincia deprisa, la petición anterior se cancela:
        // sin esto, el desplegable podría quedarse con las poblaciones de la provincia
        // que ya no está seleccionada.
        if (esCancelacion(error)) return;
        console.error("No se pudieron cargar las poblaciones:", error);
    }
}
