/**
 * @file La barra de filtros, el buscador y la ordenacion.
 *
 * Capa 8. Buscar, filtrar y ordenar son el MISMO endpoint: para el backend, buscar es listar con un filtro de texto mas.
 *
 * @author AngelDanielC0des
 */

import { ETIQUETAS_ORDEN } from "./config.js";
import {
    btnLimpiar,
    cabecerasOrdenables,
    contadorFiltros,
    contenedorBuscador,
    cuerpoTabla,
    etiquetaDireccion,
    iconoDireccion,
    inputBuscador,
    selectOrdenarPor,
    selectPoblacion,
    selectProvincia,
} from "./dom.js";
import { CRITERIOS_INICIALES, criterios } from "./estado.js";
import { cargarClientes, cargarPoblaciones } from "./listado.js";

/**
 * Repinta TODOS los controles de ordenación (el selector, el botón y las flechas de las
 * cabeceras) leyendo del estado.
 *
 * Es una sola función a propósito: el usuario puede cambiar el orden desde el botón o
 * desde la cabecera de la tabla, y si cada camino actualizara su propio control, uno de
 * los dos acabaría mostrando algo distinto de lo que realmente se está viendo.
 */
export function pintarControlesOrden() {
    const { ordenarPor, direccion } = criterios;
    const etiqueta = ETIQUETAS_ORDEN[`${ordenarPor}|${direccion}`];

    selectOrdenarPor.value = ordenarPor;
    etiquetaDireccion.textContent = etiqueta.texto;
    iconoDireccion.className = `fa-solid ${etiqueta.icono}`;

    // Cada cabecera muestra si es la columna activa y en qué sentido.
    cabecerasOrdenables.forEach((cabecera) => {
        const esColumnaActiva = cabecera.dataset.columna === ordenarPor;
        const flecha = cabecera.querySelector(".flecha-orden");

        cabecera.classList.toggle("activa", esColumnaActiva);

        if (esColumnaActiva) {
            flecha.className = `fa-solid flecha-orden ${direccion === "asc" ? "fa-arrow-up-long" : "fa-arrow-down-long"}`;
        } else {
            flecha.className = "fa-solid fa-sort flecha-orden";
        }

        // aria-sort es lo que hace que un lector de pantalla anuncie por qué columna
        // está ordenada la tabla; va en el <th>, no en el botón.
        cabecera.closest("th").setAttribute("aria-sort",
            esColumnaActiva ? (direccion === "asc" ? "ascending" : "descending") : "none");
    });
}

/**
 * Aplica un cambio de criterios: repinta los controles y VUELVE A LA PÁGINA 1.
 *
 * El reinicio de página es imprescindible: si estás en la página 7 y filtras por una
 * provincia con 12 clientes, esa página ya no existe y verías una tabla vacía sin
 * entender por qué.
 */
export function aplicarCriterios() {
    pintarControlesOrden();
    pintarEstadoFiltros();
    cargarClientes(0);
}

/**
 * Marca qué controles tienen un filtro puesto y cuántos son en total.
 *
 * Es la única parte de la barra donde el color dice algo en vez de decorar: con tres
 * controles que por fuera son idénticos estén o no usados, la pregunta "¿por qué solo salen
 * 4 clientes?" obligaba a abrir los desplegables uno a uno.
 */
export function pintarEstadoFiltros() {
    const activos = [criterios.busqueda, criterios.provincia, criterios.poblacion]
        .filter(Boolean).length;

    contenedorBuscador.classList.toggle("activo", Boolean(criterios.busqueda));
    selectProvincia.closest(".control-filtro")
        .classList.toggle("activo", Boolean(criterios.provincia));
    selectPoblacion.closest(".control-filtro")
        .classList.toggle("activo", Boolean(criterios.poblacion));

    // La cuenta se ve en un globo junto a "Limpiar"; para quien no lo ve, va en el nombre
    // accesible del botón, porque el globo es aria-hidden y diría un número suelto.
    //
    // El nombre EMPIEZA por "Limpiar", que es lo que pone en el botón: si se sustituyera por
    // otra frase, quien maneja el ordenador por voz diría "pulsa Limpiar" y no pasaría nada
    // (criterio 2.5.3 de WCAG, el nombre tiene que contener el texto visible).
    contadorFiltros.textContent = String(activos);
    contadorFiltros.hidden = activos === 0;
    btnLimpiar.setAttribute("aria-label", activos === 0
        ? "Limpiar los filtros y la ordenación"
        : `Limpiar los ${activos} filtros activos y la ordenación`);
}

/** Lleva al estado lo que hay escrito en el buscador y recarga la tabla. */
export function buscar() {
    criterios.busqueda = inputBuscador.value.trim();
    aplicarCriterios();
}

/**
 * Deja la pantalla como recién cargada: sin búsqueda, sin filtros y con la ordenación por
 * defecto. Está aparte del botón porque también se ofrece desde la tabla vacía.
 */
export async function limpiarCriterios() {
    // Se copian los iniciales en vez de reescribir los cinco valores: son la definicion
    // de "recien cargada", y tenerlos aqui otra vez hacia que cambiar el arranque dejara
    // a este boton llevando a otro sitio, sin que nada avisara.
    Object.assign(criterios, CRITERIOS_INICIALES);

    inputBuscador.value = "";
    selectProvincia.value = "";
    selectPoblacion.value = "";
    await cargarPoblaciones("");

    aplicarCriterios();
}

// El botón "Quitar los filtros" que aparece DENTRO de la tabla cuando una búsqueda no
// encuentra nada. Va por delegación en el <tbody> y no enganchado al crearlo, porque ese
// botón lo pinta el repintado de la tabla: enlazarlo allí ataría la tabla a la barra de
// filtros, y como los filtros piden el listado y el listado repinta la tabla, el ciclo se
// cerraría sobre sí mismo.
cuerpoTabla.addEventListener("click", (evento) => {
    if (evento.target.closest(".btn-quitar-filtros")) limpiarCriterios();
});
