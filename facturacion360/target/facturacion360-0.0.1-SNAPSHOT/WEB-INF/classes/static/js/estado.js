/**
 * @file El estado que la pantalla conserva entre repintados.
 *
 * Capa 0. Los criterios de busqueda, que filas estan desplegadas y que clientes hay en la pagina.
 *
 * @author AngelDanielC0des
 */

/*
 * ÚNICO estado de la pantalla. Que todo viva en un solo objeto es lo que impide que
 * el botón de dirección y las cabeceras de la tabla se contradigan: los dos leen y
 * escriben aquí, y luego se repinta todo desde este objeto.
 */
/**
 * Con que criterios arranca la pantalla.
 *
 * Esta aparte y congelado porque hay DOS sitios que necesitan saberlo: el arranque y el
 * boton de limpiar. Estaba escrito en los dos, asi que cambiar el orden inicial en uno
 * dejaba al otro llevando a un estado distinto, y el boton pasaba a mentir sobre lo que
 * hace sin que nada avisara.
 */
export const CRITERIOS_INICIALES = Object.freeze({
    busqueda: "",
    provincia: "",
    poblacion: "",
    ordenarPor: "fecha_alta",
    direccion: "desc",
});

export const criterios = { ...CRITERIOS_INICIALES };

/*
 * Filas con el panel desplegado: id del cliente -> { modo, borrador }.
 *
 * Es un Map y no un id suelto porque se pueden tener varias abiertas a la vez, y vive fuera
 * del DOM porque la tabla se repinta entera cada vez que se pagina, se busca o se refresca:
 * de aquí se saca qué paneles hay que volver a abrir después.
 *
 *   modo     -> "detalle" (solo lectura), "edicion" (formulario) o "borrado"
 *               (confirmacion)
 *   borrador -> lo que el usuario tuviera escrito sin guardar cuando se repintó la tabla,
 *               o null. Sin esto, buscar algo con un formulario abierto le borraría lo
 *               tecleado sin avisar.
 */
export const filasDesplegadas = new Map();

/*
 * Los clientes de la página que se está viendo: id -> ClienteResponse, tal cual llegó.
 *
 * El listado ya trae TODOS los campos del cliente, los mismos que devuelve GET /cliente/{id},
 * así que al volver a abrir un panel tras repintar la tabla los datos ya están aquí. Sin esto,
 * cada tecla del buscador con tres paneles abiertos lanzaba cuatro peticiones: la del listado
 * y una por panel, todas para pintar lo que la primera acababa de traer.
 *
 * No es una caché: se tira y se rehace en cada repintado, así que nunca contiene nada más
 * viejo que la tabla que se está viendo. Al abrir un panel a mano se pinta desde aquí para no
 * hacer esperar a nadie, pero se pregunta igualmente al servidor y se pone al día si difiere
 * (ver abrirDespliegue).
 */
export const clientesEnPagina = new Map();

/*
 * El alta abierta, o null si no hay ninguna: { borrador } con lo que se lleve tecleado.
 *
 * Va en su propia variable y NO en filasDesplegadas, aunque sea otro panel desplegado, por dos
 * motivos que no tienen vuelta: ese mapa se indexa por id de cliente y un cliente que todavía
 * no existe no tiene id; y el alta tampoco tiene fila de cliente encima, así que filaViva,
 * panelDe, modoDe y marcarFila —que buscan una tr.fila-cliente— no le sirven de nada.
 *
 * Meter un id falso (un 0 centinela) parecía más corto y es peor: se colaría en esas cuatro
 * funciones, que lo darían por un cliente de verdad y fallarían en silencio.
 */
export let altaAbierta = null;

/**
 * Apunta si hay un alta abierta y con qué borrador, o la da por cerrada con `null`.
 *
 * Método y no asignación por lo mismo que `anotarFoco`: este dato lo escribe el alta y lo lee
 * el guardado de borradores, y en módulos ES no se puede asignar a un import.
 *
 * @param {{borrador: Object|null}|null} estadoAlta el alta abierta, o null si no la hay
 */
export function marcarAltaAbierta(estadoAlta) {
    altaAbierta = estadoAlta;
}

/**
 * ¿Hay algún filtro o búsqueda puesto? La ordenación no cuenta: siempre hay una, así que
 * si contase, el botón de limpiar y el contador estarían activos desde que se abre la página.
 *
 * @return {boolean} true si hay búsqueda, provincia o población
 */
export function hayCriteriosActivos() {
    return Boolean(criterios.busqueda || criterios.provincia || criterios.poblacion);
}
