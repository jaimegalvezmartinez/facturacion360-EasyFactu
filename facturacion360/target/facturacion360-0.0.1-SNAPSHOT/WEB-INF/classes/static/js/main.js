/**
 * @file Punto de entrada: enlaza los controles y arranca la pantalla.
 *
 * Capa 9. Es el unico que no exporta nada.
 *
 * <h2>Mapa de modulos</h2>
 *
 * <pre>
 *   capa 0   config   dom   estado   seguridad          sin dependencias
 *   capa 1   api   avisos   foco   fila   notificaciones   problema   validacion
 *   capa 2   formulario
 *   capa 3   dialogo   paneles
 *   capa 4   despliegue
 *   capa 5   edicion   borrado
 *   capa 6   tabla
 *   capa 7   listado
 *   capa 8   alta   filtros
 *   capa 9   main
 * </pre>
 *
 * <p>Un modulo solo importa de las capas de ARRIBA. La regla no es decorativa: es lo que
 * garantiza que no haya ciclos. <strong>Se mantiene a mano</strong>: no hay ninguna
 * comprobacion automatica que la verifique, asi que quien anada un import es quien tiene
 * que mirar el mapa.</p>
 *
 * <p>La capa 0 tiene un miembro nuevo, <code>seguridad</code>, y no es por una cuestion de
 * estilo: <code>api.js</code> (capa 1) lo necesita para el token de CSRF, pero
 * <code>sesion.js</code> —que se carga en facturas, perfil, index y ayuda, donde no hay
 * tabla de clientes— tambien. Si viviera en api.js, se arrastraría dom.js, que al cargarse
 * busca "#tabla-clientes" y reventaría la página entera en esas cuatro pantallas.</p>
 *
 * <p>Queda una excepcion conocida: <code>avisos</code> importa de <code>notificaciones</code>
 * y las dos estan en la capa 1. No sube a <code>notificaciones</code> a capa 0 porque tiene
 * su propia dependencia de <code>config</code>, ni baja <code>avisos</code> a 2 porque eso
 * arrastraria a los siete modulos que la importan. Se documenta en vez de taparla, que es lo
 * unico peor que tenerla.</p>
 *
 *
 * @author AngelDanielC0des
 */

import { DIRECCION_POR_DEFECTO, ESPERA_TECLEO_MS } from "./config.js";
import {
    btnAnadirCliente,
    btnAnterior,
    btnDireccion,
    btnLimpiar,
    btnSiguiente,
    cabecerasOrdenables,
    columnasVisibles,
    contenedorBuscador,
    contenedorTabla,
    cuerpoTabla,
    inputBuscador,
    MENSAJES_BASE,
    selectOrdenarPor,
    selectPoblacion,
    selectProvincia,
} from "./dom.js";
import { criterios } from "./estado.js";
import { filaViva, modoDe } from "./fila.js";
import { limpiarCampo } from "./validacion.js";
import { confirmarDescarte } from "./dialogo.js";
import { abrirDespliegue, alternarDespliegue, cerrarDespliegue } from "./despliegue.js";
import { guardarEdicion } from "./edicion.js";
import { borrarCliente } from "./borrado.js";
import { cargarClientes, cargarPoblaciones, cargarProvincias, paginaActual } from "./listado.js";
import { abrirAlta, cerrarAlta, confirmarDescarteAlta, guardarCliente } from "./alta.js";
import {
    aplicarCriterios,
    buscar,
    limpiarCriterios,
    pintarControlesOrden,
    pintarEstadoFiltros,
} from "./filtros.js";

// Buscador con espera: reiniciamos el temporizador en cada tecla y solo consultamos
// cuando el usuario lleva ESPERA_TECLEO_MS sin escribir.
let temporizadorBusqueda = null;

inputBuscador.addEventListener("input", () => {
    clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda = setTimeout(buscar, ESPERA_TECLEO_MS);
});

// Enter es "ya he terminado de escribir": esperar los 300 ms de rigor después de eso se siente
// como que la tecla no ha hecho nada. No hay submit que evitar, el buscador no está en un
// <form>, pero sí hay que cancelar la espera o la búsqueda se lanzaría dos veces.
inputBuscador.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") {
        clearTimeout(temporizadorBusqueda);
        buscar();
    }
});

selectProvincia.addEventListener("change", async () => {
    criterios.provincia = selectProvincia.value;

    // Al cambiar de provincia, la población elegida deja de tener sentido: se limpia
    // (si no, quedaría un filtro "Valencia + Madrid" que no devuelve nada).
    criterios.poblacion = "";
    selectPoblacion.value = "";
    await cargarPoblaciones(criterios.provincia);

    aplicarCriterios();
});

selectPoblacion.addEventListener("change", () => {
    criterios.poblacion = selectPoblacion.value;
    aplicarCriterios();
});

selectOrdenarPor.addEventListener("change", () => {
    criterios.ordenarPor = selectOrdenarPor.value;
    // Al cambiar de columna estrenamos su sentido natural (fechas: nuevas primero;
    // nombres: A → Z), que es lo que se espera la primera vez.
    criterios.direccion = DIRECCION_POR_DEFECTO[criterios.ordenarPor];
    aplicarCriterios();
});

// El botón invierte el sentido sin tocar la columna.
btnDireccion.addEventListener("click", () => {
    criterios.direccion = criterios.direccion === "asc" ? "desc" : "asc";
    aplicarCriterios();
});

// Cabeceras de la tabla: mismo comportamiento que en cualquier tabla ordenable.
cabecerasOrdenables.forEach((cabecera) => {
    cabecera.addEventListener("click", () => {
        const columna = cabecera.dataset.columna;

        if (criterios.ordenarPor === columna) {
            // Ya ordenamos por ella: el segundo clic invierte el sentido.
            criterios.direccion = criterios.direccion === "asc" ? "desc" : "asc";
        } else {
            criterios.ordenarPor = columna;
            criterios.direccion = DIRECCION_POR_DEFECTO[columna];
        }

        aplicarCriterios();
    });
});

btnLimpiar.addEventListener("click", limpiarCriterios);

// --- Paginación ---
btnAnterior.addEventListener("click", () => cargarClientes(paginaActual - 1));

btnSiguiente.addEventListener("click", () => cargarClientes(paginaActual + 1));

// --- Refresco automático tras crear/editar/eliminar ---
// Cuando otro compañero cambie un cliente, avisa disparando este evento y recargamos la
// página actual (así la tabla siempre refleja la BD, sin que su código conozca el nuestro).
// Ellos solo hacen: document.dispatchEvent(new CustomEvent('clientes:cambiaron'));
document.addEventListener("clientes:cambiaron", () => cargarClientes(paginaActual));

// Un solo listener en el <tbody>, y no uno por botón: los botones se crean y se destruyen en
// cada repintado, así que los suyos habría que volver a enlazarlos cada vez (y los que había
// antes en este archivo ni siquiera llegaban a enlazarse, porque se registraban al cargar la
// página, cuando los botones aún vivían dentro del <template>).
cuerpoTabla.addEventListener("click", async (evento) => {
    // El alta, la primera: comparte clases con el panel de una fila (fila-despliegue, el
    // botón de cancelar) pero no tiene fila de cliente ni id, así que manejarClicPanel se
    // saldría sin hacer nada al buscarla con filaViva.
    if (evento.target.closest("tr.fila-alta")) {
        if (evento.target.closest(".btn-cancelar") && await confirmarDescarteAlta()) {
            cerrarAlta();
        }
        return;
    }

    // Después los controles del panel de una fila: viven en la fila hermana, no en la del
    // cliente.
    const panel = evento.target.closest("tr.fila-despliegue");
    if (panel) {
        manejarClicPanel(evento, panel);
        return;
    }

    const fila = evento.target.closest("tr.fila-cliente");
    if (!fila) return;

    const boton = evento.target.closest(".celda-acciones .btn");
    if (boton) {
        if (boton.classList.contains("btn-ver")) alternarDespliegue(fila, "detalle");
        else if (boton.classList.contains("btn-editar")) alternarDespliegue(fila, "edicion");
        else if (boton.classList.contains("btn-eliminar")) alternarDespliegue(fila, "borrado");
        return;
    }

    // Un enlace de email o de teléfono hace lo suyo y nada más: desplegar además la fila
    // sería un segundo efecto que nadie ha pedido al pulsarlo.
    if (evento.target.closest("a")) return;

    // Si estaba seleccionando texto de la fila, no quería desplegar nada.
    if (window.getSelection()?.toString()) return;

    alternarDespliegue(fila, "detalle");
});

/** Clic dentro de un panel abierto: cancelar la edición o reintentar la carga. */
async function manejarClicPanel(evento, panel) {
    // Por el id que el propio panel lleva, y no por previousElementSibling: fiarse de la
    // posición en el documento obliga a que el panel esté siempre justo debajo de su fila, y
    // eso es una suposición que nadie ve al leer el código de al lado.
    const fila = filaViva(Number(panel.dataset.clienteId));
    if (!fila) return;

    // Los dos del panel de borrado van primero por legibilidad; no chocan con el .btn-cancelar
    // de abajo porque "btn-cancelar-borrado" es otra clase distinta, no una variante de aquella.
    if (evento.target.closest(".btn-cancelar-borrado")) {
        // Aquí no se pregunta nada antes de cerrar: en el borrado no hay nada escrito que
        // perder, al contrario que en la edición.
        cerrarDespliegue(fila);

        // El foco vuelve a la papelera que abrió el panel: si no, se quedaría en un botón que
        // acaba de desaparecer y saltaría al principio de la página.
        fila.querySelector(".btn-eliminar").focus();
        return;
    }

    if (evento.target.closest(".btn-confirmar-borrado")) {
        borrarCliente(fila, Number(fila.dataset.clienteId));
        return;
    }

    if (evento.target.closest(".btn-cancelar")) {
        if (!await confirmarDescarte(fila)) return;

        // Igual que al alternar: mientras se preguntaba, la tabla ha podido repintarse y esta
        // fila ya no ser la que está en pantalla. Se cierra la que lo esté ahora.
        const filaActual = filaViva(Number(fila.dataset.clienteId));
        if (!filaActual) return;

        cerrarDespliegue(filaActual);
        // El foco vuelve al lápiz que abrió el formulario: si no, se quedaría en un botón que
        // acaba de desaparecer y saltaría al principio de la página.
        filaActual.querySelector(".btn-editar").focus();
        return;
    }

    if (evento.target.closest(".btn-reintentar")) {
        abrirDespliegue(fila, modoDe(fila) ?? "detalle", { animar: false });
    }
}

// El aviso de NIF repetido lo pone el servidor: en cuanto se toca ese campo deja de tener
// sentido seguir viéndolo en rojo.
cuerpoTabla.addEventListener("input", (evento) => {
    if (evento.target.name === "nifCif") {
        // limpiarCampo y no quitar la clase a mano: ademas de la marca roja hay que
        // DEVOLVER EL MENSAJE DE FABRICA. Quitar is-invalid no oculta el hueco mientras
        // el formulario lleve was-validated -que validar() pone y aqui no se quita nunca-,
        // asi que el texto del servidor sigue ahi: corriges un NIF repetido y en cuanto lo
        // tecleado incumple el patron vuelve a salir "ya existe otro cliente con este NIF"
        // en vez de la explicacion del formato.
        limpiarCampo(evento.target, MENSAJES_BASE.nifCif);
    }
});

// El envío se atiende también aquí arriba, por lo mismo: el formulario aparece y desaparece.
cuerpoTabla.addEventListener("submit", (evento) => {
    evento.preventDefault();

    const formulario = evento.target.closest(".formulario-edicion");
    if (!formulario) return;

    // Los dos formularios salen de la misma plantilla y comparten .formulario-edicion, así que
    // este listener los recoge a los dos. Los distingue la clase que solo lleva el del alta.
    if (formulario.classList.contains("formulario-alta")) {
        guardarCliente(formulario);
    } else {
        guardarEdicion(formulario);
    }
});

/**
 * Deja el contenedor de la tabla en el recorrido del tabulador solo si de verdad hay algo que
 * desplazar.
 *
 * Una zona con scroll tiene que poder recorrerse con el teclado, pero una parada del tabulador
 * en un sitio donde no hay nada que hacer es una molestia para quien navega así, y en un
 * escritorio normal la tabla cabe entera y nunca se desplaza.
 */
function ajustarFocoTabla() {
    // 1px de margen: los anchos son decimales y un redondeo hace que scrollWidth salga un
    // pelín mayor que clientWidth en tablas que en realidad caben.
    const desborda = contenedorTabla.scrollWidth - contenedorTabla.clientWidth > 1;

    if (desborda) {
        contenedorTabla.setAttribute("tabindex", "0");
    } else {
        contenedorTabla.removeAttribute("tabindex");
    }
}

/**
 * Reajusta las filas que ocupan la tabla a lo ancho (los paneles y los mensajes) cuando el
 * número de columnas visibles cambia, que es lo que pasa al estrechar la ventana hasta el
 * ancho de móvil con un panel ya abierto.
 */
function ajustarColumnas() {
    const columnas = columnasVisibles();

    // El ":scope >" es importante: dentro de los paneles hay más tablas, y sus celdas no
    // tienen nada que ver con las columnas de esta.
    for (const celda of cuerpoTabla.querySelectorAll(":scope > tr > td[colspan]")) {
        celda.colSpan = columnas;
    }
}

// Se vigilan los dos: la ventana al cambiar de tamaño encoge el contenedor, y un nombre muy
// largo o un panel abierto ensanchan la tabla. Cualquiera de las dos cosas hace aparecer o
// desaparecer el desplazamiento.
//
// El requestAnimationFrame no es adorno: arrastrar el borde de la ventana dispara el
// observador decenas de veces por segundo, y cada medida de scrollWidth obliga al navegador a
// recalcular la disposición de la página. Así se mide una vez por fotograma como mucho.
let ajustePedido = false;

const observadorTabla = new ResizeObserver(() => {
    if (ajustePedido) return;
    ajustePedido = true;

    requestAnimationFrame(() => {
        ajustePedido = false;
        ajustarFocoTabla();
        ajustarColumnas();
    });
});

observadorTabla.observe(contenedorTabla);

observadorTabla.observe(cuerpoTabla.closest("table"));

// Este sí se enlaza directamente: vive en la cabecera de la página, fuera de la tabla, así que
// existe desde que se carga el documento y no lo destruye ningún repintado.
btnAnadirCliente.addEventListener("click", abrirAlta);

/*
 * Se despliega al ENFOCARLO y se recoge al salir, si está vacío.
 *
 * Antes esto era un listener de clic en todo el documento, y ahí estaba el fallo: quien
 * llegaba al buscador con el tabulador se quedaba dentro de una píldora de 9rem sin ver el
 * campo ni lo que escribía, porque nada lo abría. focusin/focusout cubren el ratón y el
 * teclado con el mismo código (el clic acaba enfocando el input igual), y de paso ya no hace
 * falta vigilar cada clic de la página para saber cuándo cerrarlo.
 */
contenedorBuscador.addEventListener("focusin", () => {
    contenedorBuscador.classList.add("expandido");
});

contenedorBuscador.addEventListener("focusout", () => {
    // Con texto escrito se queda abierto: es un filtro activo, y plegarlo escondería la
    // razón por la que la tabla enseña lo que enseña.
    if (!inputBuscador.value.trim()) {
        contenedorBuscador.classList.remove("expandido");
    }
});

// --- Carga inicial ---
//
// Va al FINAL del archivo a propósito: cuando estas cinco llamadas se ejecutan, todo lo que
// necesitan —las referencias del DOM, los manejadores de eventos y los avisos emergentes— ya
// está declarado y enlazado. Si se añade algo nuevo, va ANTES de este bloque.
pintarControlesOrden();

pintarEstadoFiltros();

cargarProvincias();

cargarPoblaciones("");

cargarClientes(0);
