/**
 * @file Abrir, cerrar y cambiar de modo el panel de una fila.
 *
 * Capa 4. El corazon de la pantalla: detalle, edicion y borrado son el mismo mecanismo con distinto contenido.
 *
 * @author AngelDanielC0des
 */

import { API_CLIENTE, CAMPOS_CLIENTE, CAMPOS_EDITABLES, DURACION_PLEGADO_MS } from "./config.js";
import { columnasVisibles, cuerpoTabla, plantillaDespliegue } from "./dom.js";
import { clientesEnPagina, filasDesplegadas } from "./estado.js";
import { esCancelacion, pedirJson, peticionesEnVuelo } from "./api.js";
import { anunciar, escribirPista, fijar, limpiarPistas } from "./avisos.js";
import { crearAlerta } from "./notificaciones.js";
import { filaViva, modoDe, panelDe, pintarCeldasFila } from "./fila.js";
import { etiquetaDe, valoresDe } from "./formulario.js";
import { confirmarDescarte } from "./dialogo.js";
import {
    pintarCargando,
    pintarContenidoPanel,
    pintarErrorPanel,
} from "./paneles.js";

/**
 * Abre el panel de una fila en el modo indicado (o le cambia el modo si ya estaba abierto).
 *
 * Se pinta **al momento** con el cliente que trajo el listado, que tiene los mismos campos que
 * `GET /cliente/{id}`, y solo después se comprueba contra el servidor que sigue siendo lo que
 * hay en la base de datos. Esperar a esa comprobación para enseñar algo era medio segundo de
 * "cargando" para dibujar, casi siempre, lo que ya estaba en memoria.
 *
 * La comprobación no sobra: la tabla puede llevar cargada un buen rato, y abrir un cliente
 * —sobre todo para editarlo— es el momento en que sus datos tienen que estar al día. El
 * formulario manda de vuelta los ocho campos, así que trabajar sobre una foto vieja revierte
 * sin querer lo que haya cambiado otro.
 *
 * @param {HTMLTableRowElement} fila la fila del cliente
 * @param {string} modo "detalle", "edicion" o "borrado"
 * @param {Object} opciones
 * @param {boolean} opciones.animar false al reabrir tras repintar la tabla: el panel ya
 *        estaba desplegado y volver a animarlo se vería como un parpadeo
 * @param {boolean} opciones.enfocar false al reabrir por lo mismo: llevarse el foco mientras
 *        el usuario escribe en el buscador le sacaría el cursor de donde está
 * @param {Object|null} opciones.cliente los datos con los que pintar. Si no vienen, se cogen
 *        del listado y, si tampoco estuvieran, se piden al backend
 * @param {boolean} opciones.revalidar false al reabrir tras repintar: los datos acaban de
 *        llegar con el listado y volver a pedirlos uno por uno es la ráfaga de peticiones que
 *        se quitó en su día
 */
export async function abrirDespliegue(fila, modo,
    { animar = true, enfocar = true, cliente = null, revalidar = true } = {}) {

    const idCliente = Number(fila.dataset.clienteId);

    // El borrador se conserva al cambiar de modo: si vuelves de detalle a edición, sigue lo
    // que habías escrito.
    const borrador = filasDesplegadas.get(idCliente)?.borrador ?? null;
    filasDesplegadas.set(idCliente, { modo, borrador });

    const panel = obtenerPanel(fila, animar);
    const contenido = panel.querySelector(".despliegue-contenido");
    marcarFila(fila, modo);

    const conocido = cliente ?? clientesEnPagina.get(idCliente) ?? null;

    if (conocido) {
        pintarContenidoPanel(contenido, modo, conocido, borrador, enfocar);

        if (!revalidar) {
            // Si quedaba una petición en el aire de una apertura anterior, se cancela: su
            // respuesta ya no aporta nada y llegaría a pintar por encima de esto.
            peticionesEnVuelo[`detalle-${idCliente}`]?.abort();
            return;
        }
    } else if (contenido.childElementCount === 0) {
        // Sin nada que enseñar todavía. Es un caso de reserva: la fila viene del listado, así
        // que su cliente está en el mapa salvo que algo haya ido muy mal.
        pintarCargando(contenido);
    } else {
        // Al cambiar de modo sí hay contenido, y sustituirlo por un "cargando" encogería el
        // panel para volver a estirarlo un instante después: se deja atenuado.
        contenido.classList.add("cargando");
    }

    try {
        const recibido = await pedirJson(`detalle-${idCliente}`, `${API_CLIENTE}/${idCliente}`);

        // Mientras llegaba la respuesta la fila ha podido cerrarse, o la tabla repintarse.
        const estado = filasDesplegadas.get(idCliente);
        if (!estado || !panel.isConnected) return;

        if (conocido) {
            conciliar(fila, contenido, estado.modo, recibido);
        } else {
            pintarContenidoPanel(contenido, estado.modo, recibido, estado.borrador, enfocar);
        }
    } catch (error) {
        // Cancelada por nosotros (se cerró o se cambió de modo deprisa): ya viene otra.
        if (esCancelacion(error)) return;

        if (conocido) {
            fallaComprobacion(idCliente, error);
        } else {
            pintarErrorPanel(contenido, error);
        }
    } finally {
        contenido.classList.remove("cargando");
    }
}

/**
 * Pone al día la fila y su panel cuando el servidor devuelve algo distinto de lo que se pintó.
 *
 * Lo normal es que no haya cambiado nada y esto no haga absolutamente nada, que es justo lo
 * que se busca: la comprobación tiene que ser invisible salvo cuando aporta.
 *
 * @param {HTMLTableRowElement} fila la fila del cliente
 * @param {Element} contenido el hueco del panel
 * @param {string} modo "detalle", "edicion" o "borrado"
 * @param {Object} recibido el cliente tal y como está ahora en la base de datos
 */
function conciliar(fila, contenido, modo, recibido) {
    const anterior = clientesEnPagina.get(recibido.idCliente);
    if (anterior && mismosDatos(anterior, recibido)) return;

    clientesEnPagina.set(recibido.idCliente, recibido);

    // Los avisos emergentes de las celdas que se van a reemplazar, fuera: si no, Bootstrap se
    // queda con una instancia apuntando a un elemento que ya no está en el documento.
    limpiarPistas(fila);
    pintarCeldasFila(fila, recibido);

    // Los nombres accesibles de los botones llevan dentro el del cliente ("Editar cliente
    // García S.L."), así que si el nombre ha cambiado hay que volver a escribirlos.
    marcarFila(fila, modo);

    if (modo !== "edicion") {
        // Se despacha por modo en vez de pintar detalle a secas: "borrado" tambien entra
        // por aqui -modoDe() lo devuelve, y el boton Reintentar de main.js llama sin la
        // guarda revalidar:false que si llevan los otros llamantes-, y pintarlo como
        // detalle convertiria una confirmacion de borrado en una ficha.
        pintarContenidoPanel(contenido, modo, recibido, null, false);
        anunciar("Los datos de este cliente han cambiado y se han actualizado.");
        return;
    }

    conciliarFormulario(contenido.querySelector(".formulario-edicion"), recibido);
}

/**
 * Mete los datos nuevos en el formulario abierto **sin pisar lo que el usuario esté
 * escribiendo**, y le cuenta lo que ha pasado.
 *
 * Un campo se considera intacto si su contenido sigue siendo el que se pintó desde la base de
 * datos; en ese caso se actualiza sin más. Si lo ha tocado, mandan sus letras: perder lo
 * escrito por un refresco que nadie ha pedido es de las cosas que más molestan de una pantalla.
 *
 * @param {HTMLFormElement} formulario el formulario de edición abierto
 * @param {Object} recibido el cliente tal y como está ahora en la base de datos
 */
function conciliarFormulario(formulario, recibido) {
    if (!formulario) return;

    const valoresNuevos = valoresDe(recibido);
    const valoresPintados = JSON.parse(formulario.dataset.valoresOriginales);
    const actualizados = [];
    const respetados = [];

    for (const campo of CAMPOS_EDITABLES) {
        if (valoresNuevos[campo] === valoresPintados[campo]) continue;

        const control = formulario.elements[campo];

        // El usuario ha escrito justo lo mismo que acaba de aparecer en la base de datos: no
        // hay nada que actualizar ni nada que contarle.
        if (control.value.trim() === valoresNuevos[campo]) continue;

        if (control.value.trim() === valoresPintados[campo]) {
            control.value = valoresNuevos[campo];
            actualizados.push(etiquetaDe(control));
        } else {
            respetados.push(etiquetaDe(control));
        }
    }

    // La referencia para saber si queda algo sin guardar pasa a ser lo que hay AHORA en la
    // base de datos. Sin esto, al cerrar se preguntaría por unos cambios que ya no existen.
    formulario.dataset.valoresOriginales = JSON.stringify(valoresNuevos);

    if (actualizados.length === 0 && respetados.length === 0) return;

    const partes = ["Otra persona ha cambiado este cliente mientras lo editabas."];
    if (actualizados.length > 0) {
        partes.push(`Se ha actualizado: ${actualizados.join(", ")}.`);
    }
    if (respetados.length > 0) {
        partes.push(`Se ha conservado lo que escribiste en: ${respetados.join(", ")}.`);
    }

    // En la alerta del propio formulario, que es donde está mirando: es role="alert" y estaba
    // en el documento desde que se pintó, así que escribir dentro basta para que se anuncie.
    // Con informar() y no con mostrarError(): decir qué campos se han refrescado no es un
    // fallo de nadie, y en rojo parecería que algo ha ido mal.
    crearAlerta(formulario.querySelector(".alerta-formulario")).informar(partes.join(" "));
}

/**
 * Qué hacer cuando la comprobación no llega a buen puerto.
 *
 * @param {number} idCliente el cliente que se estaba comprobando
 * @param {Error} error lo que devolvió pedirJson, con su código en `estado`
 */
function fallaComprobacion(idCliente, error) {
    if (error.estado === 404) {
        // Lo han borrado. Se avisa fuera de la tabla, que es lo único que sobrevive al
        // refresco, y se olvida el panel para que no se reabra sobre una fila que ya no viene.
        fijar("Este cliente ya no existe: alguien lo ha eliminado.",
            { esError: true });
        filasDesplegadas.delete(idCliente);
        document.dispatchEvent(new CustomEvent("clientes:cambiaron"));
        return;
    }

    // Cualquier otro fallo se calla: en pantalla hay datos buenos, los que acaba de traer el
    // listado, y cambiarlos por un mensaje de error sería empeorar lo que el usuario ya ve.
    console.warn(`No se pudo comprobar si el cliente ${idCliente} había cambiado:`, error);
}

/**
 * ¿Los dos clientes dicen exactamente lo mismo? Es lo que decide si el panel recién pintado
 * con los datos del listado hay que repintarlo con los que acaba de traer el servidor.
 *
 * @param {Object} uno un cliente
 * @param {Object} otro el otro
 * @return {boolean} true si coinciden en los CAMPOS_CLIENTE (null y "" cuentan como iguales)
 */
function mismosDatos(uno, otro) {
    return CAMPOS_CLIENTE.every((campo) => (uno[campo] ?? "") === (otro[campo] ?? ""));
}

/** Cierra el panel de una fila y olvida su estado. */
export function cerrarDespliegue(fila) {
    const idCliente = Number(fila.dataset.clienteId);

    filasDesplegadas.delete(idCliente);
    marcarFila(fila, null);

    // Si quedaba una petición de detalle en el aire, su respuesta ya no interesa.
    peticionesEnVuelo[`detalle-${idCliente}`]?.abort();

    const panel = panelDe(fila);
    if (!panel) return;

    panel.classList.remove("abierto");

    // Se quita del DOM cuando termina de plegarse. Se hace con un temporizador y no
    // escuchando 'transitionend' porque ese evento burbujea desde los hijos (un input del
    // formulario con su propia transición lo dispararía antes de tiempo) y porque con las
    // animaciones desactivadas en el sistema no llegaría a dispararse nunca.
    panel.dataset.temporizadorCierre = setTimeout(() => panel.remove(), DURACION_PLEGADO_MS);
}

/**
 * Traduce un clic en la acción que toca: abrir, cerrar o cambiar de modo.
 * @param {HTMLTableRowElement} fila la fila del cliente
 * @param {string} modo el modo que pide el control que se ha pulsado
 */
export async function alternarDespliegue(fila, modo) {
    const modoActual = modoDe(fila);

    // El aviso emergente se queda flotando con el texto de antes si no se derriba al pulsar.
    limpiarPistas(fila);

    if (modoActual === null) {
        abrirDespliegue(fila, modo, { revalidar: modo !== "borrado" });
        return;
    }

    if (modoActual === "edicion" && !await confirmarDescarte(fila)) return;

    // Preguntar lleva su tiempo, y en ese rato la tabla ha podido repintarse (un refresco de
    // otra pestaña, o la búsqueda que quedara pendiente). La fila que teníamos ya no está en
    // el documento, pero la que la sustituye sí, con el mismo panel reabierto: se sigue con
    // ella. Antes se salía sin hacer nada, y quien acababa de decir "descartar" veía que su
    // decisión no surtía efecto.
    const filaActual = filaViva(Number(fila.dataset.clienteId));
    if (!filaActual) return;   // el cliente ya no está en esta página

    if (modoActual === modo) {
        cerrarDespliegue(filaActual);
    } else {
        // Ya está desplegado: solo cambia lo de dentro, sin volver a animar la apertura.
        abrirDespliegue(filaActual, modo, { animar: false, revalidar: modo !== "borrado" });
    }
}

/**
 * Devuelve el panel de la fila, creándolo si aún no existe.
 *
 * @param {HTMLTableRowElement} fila la fila del cliente
 * @param {boolean} animar si se despliega con transición
 * @return {HTMLElement} el panel, nuevo o el que ya estaba abierto
 */
function obtenerPanel(fila, animar) {
    const existente = panelDe(fila);
    if (existente) {
        // Puede estar plegándose de un cierre reciente: se cancela su borrado o desaparecería
        // a media apertura.
        clearTimeout(Number(existente.dataset.temporizadorCierre));
        existente.classList.add("abierto");
        return existente;
    }

    const panel = plantillaDespliegue.content.firstElementChild.cloneNode(true);
    panel.id = `despliegue-${fila.dataset.clienteId}`;
    panel.dataset.clienteId = fila.dataset.clienteId;

    // La celda del panel ocupa el ancho entero de la tabla, sean las columnas que sean.
    panel.querySelector("td").colSpan = columnasVisibles();

    fila.after(panel);

    // La clase que lo abre se pone en el frame siguiente: puesta a la vez que se inserta, el
    // navegador no llega a ver dos estados distintos y no habría transición que animar.
    if (animar) {
        requestAnimationFrame(() => panel.classList.add("abierto"));
    } else {
        panel.classList.add("abierto");
    }

    return panel;
}

/**
 * Deja la fila coherente con su estado: resaltado, aria-expanded de cada botón, y el nombre y
 * el aviso emergente de cada acción.
 *
 * El nombre accesible y el aviso se escriben en el mismo sitio a propósito. Son dos textos que
 * tienen que decir lo mismo (criterio 2.5.3: quien dicta "editar cliente" a un control por voz
 * necesita que ese sea de verdad el nombre del botón), y repartidos en dos funciones acabarían
 * desincronizados en cuanto uno de los dos cambiase.
 *
 * @param {HTMLTableRowElement} fila la fila del cliente
 * @param {string|null} modo el modo abierto, o null si está cerrada
 */
export function marcarFila(fila, modo) {
    const botonVer = fila.querySelector(".btn-ver");
    const botonEditar = fila.querySelector(".btn-editar");
    const botonBorrar = fila.querySelector(".btn-eliminar");

    fila.classList.toggle("desplegada", modo !== null);

    // El color del recuadro que envuelve al bloque: verde para mirar, ámbar para editar. Va
    // en la fila Y en el panel porque cada uno pinta la mitad del recuadro, y se quita de los
    // dos a la vez al cerrar para que no quede medio borde dibujado mientras se pliega.
    for (const elemento of [fila, panelDe(fila)]) {
        if (!elemento) continue;
        elemento.classList.toggle("modo-detalle", modo === "detalle");
        elemento.classList.toggle("modo-edicion", modo === "edicion");
        elemento.classList.toggle("modo-borrado", modo === "borrado");
    }

    // aria-expanded es lo que hace que un lector de pantalla anuncie que ese botón despliega
    // algo y si está abierto o cerrado. Va en el botón, que es el control de verdad.
    botonVer.setAttribute("aria-expanded", String(modo === "detalle"));
    botonEditar.setAttribute("aria-expanded", String(modo === "edicion"));
    botonBorrar.setAttribute("aria-expanded", String(modo === "borrado"));

    if (modo === null) {
        botonVer.removeAttribute("aria-controls");
        botonEditar.removeAttribute("aria-controls");
        botonBorrar.removeAttribute("aria-controls");
    } else {
        const idPanel = `despliegue-${fila.dataset.clienteId}`;
        botonVer.setAttribute("aria-controls", idPanel);
        botonEditar.setAttribute("aria-controls", idPanel);
        botonBorrar.setAttribute("aria-controls", idPanel);
    }

    // Pulsar la fila o el ojo lleva SIEMPRE al detalle, así que en modo edición el aviso no
    // puede decir "Ocultar": lo que va a pasar es que se cambie al detalle.
    const accionDetalle = modo === "detalle" ? "Ocultar detalles" : "Ver detalles";
    const accionEditar = modo === "edicion" ? "Cancelar la edición" : "Editar cliente";
    const accionBorrar = modo === "borrado" ? "Cancelar la eliminación" : "Eliminar cliente";

    escribirPista([fila.querySelector("th.cliente-nombre")], accionDetalle);
    nombrarAccion(botonVer, accionDetalle, `${accionDetalle} de`);
    nombrarAccion(botonEditar, accionEditar,
        modo === "edicion" ? "Cancelar la edición de" : "Editar cliente");

    // Pasa por aquí, como los otros dos, para que use el mismo aviso: con el title del
    // navegador salía con otro aspecto y con otro retardo.
    nombrarAccion(botonBorrar, accionBorrar,
        modo === "borrado" ? "Cancelar la eliminación de" : "Eliminar cliente");
}

/**
 * Pone a un botón de icono su aviso emergente y su nombre accesible, con el cliente dentro.
 *
 * Sin el nombre del cliente, quien navega con lector de pantalla y pide la lista de botones de
 * la página oye diez veces "Editar cliente" sin saber a cuál pertenece cada uno. El nombre
 * empieza por el mismo texto que se ve en el aviso porque es lo que dicta quien usa control
 * por voz, y así lo que dice y lo que el navegador busca coinciden.
 *
 * @param {HTMLElement} boton el botón de la acción
 * @param {string} accion el texto del aviso emergente ("Editar cliente")
 * @param {string} comienzoNombre con qué empieza el nombre accesible, antes del cliente
 */
function nombrarAccion(boton, accion, comienzoNombre) {
    const nombreCliente = boton.closest("tr").querySelector(".cliente-nombre").textContent;

    escribirPista([boton], accion);
    boton.setAttribute("aria-label", `${comienzoNombre} ${nombreCliente}`);
}

/**
 * Vuelve a abrir los paneles que siguieran desplegados antes de repintar la tabla.
 *
 * Se pintan con el cliente que acaba de traer el listado y **no se comprueban** contra el
 * servidor: la respuesta acaba de llegar, así que preguntar otra vez por cada panel abierto
 * sería una ráfaga de peticiones para dibujar lo mismo. El cliente estará siempre en el mapa
 * (la fila existe porque venía en esa respuesta), pero si faltara se pasa null y
 * abrirDespliegue lo pide.
 */
export function reabrirDespliegues() {
    for (const fila of cuerpoTabla.querySelectorAll("tr.fila-cliente")) {
        const idCliente = Number(fila.dataset.clienteId);
        const estado = filasDesplegadas.get(idCliente);

        if (estado) {
            abrirDespliegue(fila, estado.modo, {
                animar: false,
                enfocar: false,
                cliente: clientesEnPagina.get(idCliente) ?? null,
                revalidar: false,
            });
        }
    }
}
