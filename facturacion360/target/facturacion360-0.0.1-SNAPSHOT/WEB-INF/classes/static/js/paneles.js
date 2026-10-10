/**
 * @file Lo que se pinta DENTRO del panel de una fila.
 *
 * Capa 3. Cuatro modos: detalle, edicion, alta y borrado.
 *
 * @author AngelDanielC0des
 */

import { CAMPOS_EDITABLES, SUFIJO_ALTA } from "./config.js";
import { plantillaPanelBorrado, plantillaPanelDetalle, plantillaPanelEdicion } from "./dom.js";
import { anunciar } from "./avisos.js";
import { textoOGuion, valoresDe } from "./formulario.js";
import { mensajeDe } from "./validacion.js";

/**
 * Mete en el panel lo que toca según el modo. Está aparte porque los dos caminos de
 * abrirDespliegue (con los datos ya en la mano y esperando al backend) terminan aquí.
 *
 * @param {Element} contenido el hueco del panel
 * @param {string} modo "detalle", "edicion" o "borrado"
 * @param {Object} cliente los datos del cliente
 * @param {Object|null} borrador lo que hubiera escrito sin guardar
 * @param {boolean} enfocar si se lleva el cursor al primer control del panel
 */
export function pintarContenidoPanel(contenido, modo, cliente, borrador, enfocar) {
    if (modo === "edicion") {
        pintarPanelEdicion(contenido, cliente, borrador, enfocar);
    } else if (modo === "borrado") {
        pintarPanelBorrado(contenido, cliente, enfocar);
    } else {
        pintarPanelDetalle(contenido, cliente);
    }
}

/** Pinta el panel de solo lectura con los campos que la tabla no muestra. */
export function pintarPanelDetalle(contenido, cliente) {
    const panel = plantillaPanelDetalle.content.cloneNode(true);

    // textContent, igual que en la tabla: un dato con < o & se ve tal cual y no puede
    // inyectar HTML.
    panel.querySelector(".detalle-id").textContent = cliente.idCliente;
    panel.querySelector(".detalle-direccion").textContent = textoOGuion(cliente.direccion);
    panel.querySelector(".detalle-cp").textContent = textoOGuion(cliente.codigoPostal);
    panel.querySelector(".detalle-poblacion").textContent = textoOGuion(cliente.poblacion);
    panel.querySelector(".detalle-provincia").textContent = textoOGuion(cliente.provincia);

    nombrarPanel(panel.querySelector(".panel-cliente"), "Viendo detalles de", cliente);

    contenido.replaceChildren(panel);
}

/**
 * Pinta la confirmación de borrado dentro del panel de la fila.
 *
 * El nombre y el NIF se escriben en la pregunta a propósito: quien llega hasta aquí ha pulsado
 * una papelera de una tabla con diez filas iguales, y leer a quién va a borrar antes de
 * confirmarlo es la mitad de la protección. La otra mitad es el borde rojo de la fila.
 *
 * @param {Element} contenido el hueco del panel
 * @param {Object} cliente el cliente que se va a eliminar
 * @param {boolean} enfocar si se lleva el foco al panel (false al reabrirlo tras repintar)
 */
function pintarPanelBorrado(contenido, cliente, enfocar) {
    const panel = plantillaPanelBorrado.content.cloneNode(true);

    // textContent, igual que en el resto: un nombre con < o & se ve tal cual y no inyecta HTML.
    panel.querySelector(".borrado-nombre").textContent = cliente.nombre;
    panel.querySelector(".borrado-nif").textContent = cliente.nifCif;

    nombrarPanel(panel.querySelector(".panel-cliente"), "Eliminar", cliente);

    contenido.replaceChildren(panel);

    // El foco va a Cancelar, NUNCA a Eliminar. En un diálogo que destruye algo, dejar el foco
    // sobre el botón que destruye convierte un Intro de más en un borrado que nadie quería.
    if (enfocar) {
        contenido.querySelector(".btn-cancelar-borrado").focus();
    }
}

/**
 * Hace que el panel se anuncie con el nombre del cliente al que pertenece.
 *
 * Con varios paneles abiertos a la vez, y con la fila del cliente ya por encima, quien no ve
 * la pantalla oía "Editando" sin saber de quién. Ahora oye "Editando García S.L.".
 *
 * El nombre se escribe en la etiqueta de estado, que es texto que YA se ve, y el panel la
 * apunta con aria-labelledby en vez de repetir la cadena en un aria-label: dos textos que
 * dicen lo mismo acaban diciendo cosas distintas en cuanto alguien cambia uno.
 *
 * @param {Element} panel el contenedor del panel (el div del detalle o el form de edición)
 * @param {string} accion con qué empieza la frase ("Viendo detalles de", "Editando")
 * @param {Object} cliente el cliente que se está mostrando
 */
function nombrarPanel(panel, accion, cliente) {
    const etiquetaEstado = panel.querySelector(".etiqueta-estado");

    etiquetaEstado.querySelector(".texto-estado").textContent = `${accion} ${cliente.nombre}`;

    // El id lleva dentro el del cliente porque puede haber varios paneles en la página y dos
    // elementos no pueden compartir id.
    etiquetaEstado.id = `estado-panel-${cliente.idCliente}`;
    panel.setAttribute("aria-labelledby", etiquetaEstado.id);
}

/**
 * Clona el formulario del <template> y lo deja listo. Lo comparten la EDICIÓN y el ALTA, que
 * usan la misma plantilla y solo se diferencian en tres cosas: el sufijo de los id, el cartel
 * de estado y con qué valores se rellenan los campos.
 *
 * @param {Element} contenido el hueco del panel donde va el formulario
 * @param {Object} opciones
 * @param {string|number} opciones.sufijo lo que distingue los id de ESTE formulario de los de
 *        los demás que puedan estar abiertos a la vez
 * @param {Object} opciones.valoresBase contra qué se compara para saber si hay cambios sin
 *        guardar: lo que hay en la BD al editar, y todo en blanco al dar de alta
 * @param {Object|null} opciones.borrador lo que el usuario tenía escrito antes de un repintado
 * @param {string} opciones.etiqueta el texto del cartel ("Editando", "Nuevo cliente")
 * @param {string} opciones.clase la clase del cartel, que es la que le da su color
 * @param {boolean} opciones.enfocar si se lleva el cursor al primer campo
 * @return {HTMLFormElement} el formulario ya insertado, para que quien llame lo remate
 */
function pintarFormularioCliente(contenido,
    { sufijo, valoresBase, borrador, etiqueta, clase, enfocar }) {

    const panel = plantillaPanelEdicion.content.cloneNode(true);
    const formulario = panel.querySelector(".formulario-edicion");

    // Se rellena con el borrador si lo hay, para no perder lo tecleado.
    const valores = borrador ?? valoresBase;

    for (const campo of CAMPOS_EDITABLES) {
        const control = formulario.elements[campo];

        // Cada campo necesita su propio id para que el <label for> lo apunte, y con varios
        // formularios abiertos a la vez no pueden repetirse: se les pega el sufijo. El
        // template los trae con el sufijo PLANTILLA, que además hace que cante a la vista en
        // el inspector si alguno se quedara sin sustituir.
        const idControl = `campo-${campo}-${sufijo}`;
        formulario.querySelector(`label[for="campo-${campo}-PLANTILLA"]`).htmlFor = idControl;
        control.id = idControl;

        control.value = valores[campo];
    }

    // El cartel de estado: el <template> viene con el de edición, que es el caso más común.
    const cartel = formulario.querySelector(".etiqueta-estado");
    cartel.classList.remove("etiqueta-edicion");
    cartel.classList.add(clase);
    cartel.querySelector(".texto-estado").textContent = etiqueta;

    // Contra qué se compara al cerrar para saber si hay algo sin guardar. Al editar es lo que
    // hay en la BD y NO el borrador: si el usuario lo deja como estaba, no hay nada que
    // descartar y no tiene sentido preguntarle.
    formulario.dataset.valoresOriginales = JSON.stringify(valoresBase);

    // El hueco del error del NIF/CIF necesita id propio para que el campo pueda apuntarle con
    // aria-describedby cuando el servidor rechace el guardado. Lleva el sufijo por lo mismo
    // que los campos: puede haber varios formularios abiertos y dos elementos no pueden
    // compartir id.
    mensajeDe(formulario, "nifCif").id = `error-nifcif-${sufijo}`;

    contenido.replaceChildren(panel);

    if (enfocar) {
        formulario.elements.nombre.focus();
    }

    return formulario;
}

/**
 * Pinta el formulario de edición con los datos del cliente.
 * @param {Element} contenido el hueco del panel donde va el formulario
 * @param {Object} cliente lo que hay ahora mismo en la base de datos
 * @param {Object|null} borrador lo que el usuario tenía escrito antes de un repintado
 * @param {boolean} enfocar si se lleva el cursor al primer campo
 */
function pintarPanelEdicion(contenido, cliente, borrador, enfocar) {
    const formulario = pintarFormularioCliente(contenido, {
        sufijo: cliente.idCliente,
        valoresBase: valoresDe(cliente),
        borrador,
        etiqueta: "Editando",
        clase: "etiqueta-edicion",
        enfocar,
    });

    formulario.dataset.clienteId = cliente.idCliente;
    nombrarPanel(formulario, "Editando", cliente);
}

/**
 * Pinta el formulario del alta: la misma plantilla, en blanco y con el cartel en verde.
 *
 * NO lleva dataset.clienteId, y eso es lo que lo distingue del de edición en todas partes:
 * formularioVivo() busca por ese atributo y aquí nunca lo va a encontrar, que es justo lo que
 * se quiere. Quien tenga que distinguirlos a propósito usa la clase .formulario-alta.
 *
 * @param {Element} contenido el hueco del panel donde va el formulario
 * @param {Object|null} borrador lo que se llevara tecleado antes de un repintado
 * @param {boolean} enfocar si se lleva el cursor al primer campo
 */
export function pintarPanelAlta(contenido, borrador, enfocar) {
    // Todo en blanco. Se construye con valoresDe({}) y no con un objeto escrito a mano para
    // que siga a CAMPOS_EDITABLES: añadir un campo a esa lista no puede obligar a acordarse
    // de venir aquí a añadirlo también.
    const formulario = pintarFormularioCliente(contenido, {
        sufijo: SUFIJO_ALTA,
        valoresBase: valoresDe({}),
        borrador,
        etiqueta: "Nuevo cliente",
        clase: "etiqueta-alta",
        enfocar,
    });

    formulario.classList.add("formulario-alta");
    formulario.setAttribute("aria-label", "Nuevo cliente");

    // El icono del cartel viene siendo el lápiz de "Editando"; aquí lo que se hace es añadir.
    const icono = formulario.querySelector(".etiqueta-estado i");
    icono.classList.remove("fa-pencil");
    icono.classList.add("fa-plus");
}

/**
 * Aviso de "cargando" mientras llega la respuesta del backend.
 *
 * No lleva role: un elemento que nace con el texto dentro no se anuncia, y tampoco se manda a
 * la región de anuncios a propósito. Es un mensaje de paso, que se sustituye en cuanto llega
 * la respuesta, y anunciarlo dejaría al lector de pantalla leyendo algo que ya no está. Que el
 * panel se ha abierto ya lo dice el aria-expanded del botón que se acaba de pulsar.
 *
 * @param {HTMLElement} contenido el hueco del panel, cuyo contenido se sustituye entero
 */
export function pintarCargando(contenido) {
    const aviso = document.createElement("p");
    aviso.className = "panel-aviso";
    aviso.textContent = "Cargando los datos del cliente…";
    contenido.replaceChildren(aviso);
}

/**
 * Aviso de error con un botón para volver a intentarlo, sin cerrar el panel: cerrarlo
 * obligaría a buscar otra vez la fila para reabrirla.
 *
 * @param {HTMLElement} contenido el hueco del panel, cuyo contenido se sustituye entero
 * @param {Error} error el fallo que se va a explicar
 */
export function pintarErrorPanel(contenido, error) {
    console.error("No se pudieron cargar los datos del cliente:", error);

    const aviso = document.createElement("p");
    aviso.className = "panel-aviso panel-aviso-error";
    aviso.textContent = "No se pudieron cargar los datos del cliente. ";

    // Este sí se anuncia: es el final del camino, y sin avisar el panel se queda en silencio
    // como si siguiera cargando. El texto se ve aquí dentro, así que va solo a la región
    // invisible y no a la franja de avisos.
    anunciar("No se pudieron cargar los datos del cliente.");

    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "btn btn-sm btn-link btn-reintentar";
    boton.textContent = "Reintentar";
    aviso.appendChild(boton);

    contenido.replaceChildren(aviso);
}
