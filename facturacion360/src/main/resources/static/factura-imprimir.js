import { crearAvisos } from "./js/notificaciones.js";
import { motivoDe } from "./js/problema.js";

const estadoVisor = document.getElementById("estadoVisor");
const contenidoFactura = document.getElementById("contenidoFactura");
const documentoFactura = document.getElementById("documentoFactura");
const botonImprimir = document.getElementById("botonImprimir");
const tablaConceptos = document.getElementById("tablaConceptos");
const tablaDesglose = document.getElementById("tablaDesglose");
const bloqueDesglose = document.getElementById("bloqueDesglose");
const seccionConceptos = document.getElementById("bloqueConceptos");

const marcaAgua     = document.getElementById("marcaAgua");
const selectFormato = document.getElementById("selectFormatoPapel");
const estiloHoja    = document.getElementById("estiloFormatoPapel");

// Los avisos de esta pantalla. Aquí la franja es el propio rótulo de estado del visor: el
// "Cargando factura..." que ya viene escrito en el HTML es un estado, no un evento, así que
// se queda hasta que la factura carga (limpiar) o hasta que falla (fijar).
const { anunciar, fijar, limpiar } = crearAvisos({
    franja: estadoVisor,
    region: document.getElementById("anuncios"),
});

/** Carga la factura indicada en la dirección de la página o por argumento explícito. */
async function cargarDetalleFactura(idExplicito) {
    const parametros = new URLSearchParams(window.location.search);
    const idFactura = idExplicito ?? Number(parametros.get("idFactura"));

    if (Number.isInteger(idFactura) && idFactura > 0) {
        try {
            const respuesta = await fetch("/factura/" + idFactura + "/detalle");
            if (respuesta.ok) {
                const detalle = await respuesta.json();
                mostrarDetalle(detalle);
            } else {
                mostrarError(await motivoDe(respuesta, "No se pudo cargar la factura."));
            }
        } catch (error) {
            console.error("Error al cargar el detalle de la factura", error);
            mostrarError("No se pudo conectar con el servidor.");
        }
    } else {
        mostrarError("El identificador de factura no es válido.");
    }
}

/** Muestra la cabecera, el cliente, los conceptos y los totales. */
function mostrarDetalle(detalle) {
    const factura = detalle.factura;
    const cliente = detalle.cliente;
    const editar = document.getElementById("botonEditarBorrador");
    editar.classList.toggle("d-none", factura.estado != "BORRADOR");
    if (factura.estado == "BORRADOR") {
        editar.href = "facturas.html?editar=" + factura.idFactura;
    }

    document.getElementById("numeroFactura").textContent = factura.numeroFactura;
    document.getElementById("fechaFactura").textContent = "Fecha: " + formatearFecha(factura.fechaEmision);
    document.getElementById("estadoFactura").textContent = "Estado: " + factura.estado;
    document.getElementById("nombreCliente").textContent = cliente.nombre;
    document.getElementById("nifCliente").textContent = "NIF/CIF: " + cliente.nifCif;
    document.getElementById("direccionCliente").textContent = formarDireccion(cliente);
    document.getElementById("contactoCliente").textContent = formarContacto(cliente);
    document.getElementById("subtotalFactura").textContent = formatearImporte(factura.subtotal);
    document.getElementById("ivaFactura").textContent = formatearImporte(factura.importeIva);
    document.getElementById("totalFactura").textContent = formatearImporte(factura.total);

    mostrarConceptos(detalle.conceptos);
    mostrarDesglose(detalle.desglose);

    if (factura.observaciones != null && factura.observaciones.trim() != "") {
        document.getElementById("observacionesFactura").textContent = factura.observaciones;
        document.getElementById("bloqueObservaciones").classList.remove("d-none");
    }

    limpiar();
    contenidoFactura.classList.remove("d-none");
    documentoFactura.setAttribute("aria-busy", "false");
    botonImprimir.disabled = false;
    prepararCompartir(detalle);

    const esBorrador = factura.estado === "BORRADOR";
    marcaAgua.classList.toggle("d-none", !esBorrador);

    // El contenido acaba de entrar: se recalculan los cortes de página del
    // borrador para que enseñe los mismos que saldrán impresos.
    programarPaginar();
}

/**
 * Pinta el cuadro del IVA agrupado por tipo.
 *
 * El desglose lo calcula el SERVIDOR y aqui solo se pinta. No es pereza: la regla de
 * redondeo -redondear la cuota de cada linea y luego sumar- es la que espera la
 * declaracion, y tenerla escrita en dos idiomas es tenerla escrita dos veces para que
 * se desalineen.
 *
 * Si no hay desglose -una factura sin conceptos- el cuadro no se ensena en vez de salir
 * vacio: un recuadro con cabeceras y nada debajo parece un fallo de carga.
 *
 * @param {Array} desglose una linea por tipo impositivo, o nada
 */
function mostrarDesglose(desglose) {
    tablaDesglose.replaceChildren();

    if (!desglose || desglose.length == 0) {
        bloqueDesglose.classList.add("d-none");
        return;
    }

    for (const linea of desglose) {
        const fila = document.createElement("tr");
        agregarCelda(fila, formatearImporte(linea.baseImponible), "text-end");
        agregarCelda(fila, formatearPorcentaje(linea.tipoImpositivo), "text-end");
        agregarCelda(fila, formatearImporte(linea.cuotaRepercutida), "text-end");
        tablaDesglose.appendChild(fila);
    }

    bloqueDesglose.classList.remove("d-none");
}

/** Rellena la tabla o muestra una fila informativa si la factura no tiene conceptos. */
function mostrarConceptos(conceptos) {
    tablaConceptos.replaceChildren();

    if (conceptos.length == 0) {
        const fila = document.createElement("tr");
        const celda = document.createElement("td");
        celda.colSpan = 7;
        celda.className = "text-center text-muted";
        celda.textContent = "Esta factura no tiene conceptos registrados.";
        fila.appendChild(celda);
        tablaConceptos.appendChild(fila);
    } else {
        for (const concepto of conceptos) {
            const fila = document.createElement("tr");
            agregarCelda(fila, concepto.descripcion || "—");
            agregarCelda(fila, concepto.cantidad ?? "—", "text-end");
            agregarCelda(fila, formatearImporte(concepto.precioUnitario), "text-end");
            agregarCelda(fila, formatearPorcentaje(concepto.descuento), "text-end");
            agregarCelda(fila, formatearImporte(concepto.baseImponible), "text-end");
            agregarCelda(fila, formatearImporte(concepto.importeIva), "text-end");
            agregarCelda(fila, formatearImporte(concepto.total), "text-end");
            tablaConceptos.appendChild(fila);
        }
    }
}

/**
 * Los datos del emisor, que son los mismos para todas las facturas.
 *
 * Se guarda la PROMESA y no el resultado para que la impresión en lote pueda
 * esperarla en vez de pintar los clones con lo que hubiera cargado. Antes esto
 * era un `window.__datosEmisor` que nadie asignaba nunca, así que todas las
 * facturas impresas en lote salían con el emisor a "—".
 *
 * @type {Promise<object|null>}
 */
let emisorCargado = Promise.resolve(null);

/** Pide los datos del emisor, los pinta en el visor y los devuelve. */
async function pedirEmisor() {
    try {
        const respuesta = await fetch("/emisor");
        if (!respuesta.ok) return null;

        const emisor = await respuesta.json();
        mostrarEmisor(emisor);
        return emisor;
    } catch (error) {
        console.error("Error al cargar los datos del emisor", error);
        return null;
    }
}
/** Muestra los datos de la informacion del emisor */
function mostrarEmisor(emisor) {
    if (!emisor) return;
    
    // Asignamos los datos únicamente a la sección del recuadro "Emisor"
    document.getElementById("nombreEmisor").textContent = emisor.nombre || "—";
    document.getElementById("cifEmisor").textContent = "NIF/CIF: " + (emisor.cif || emisor.nifCif || "—");
    document.getElementById("direccionEmisor").textContent = emisor.direccion || "—";
    
    const tel = emisor.telefono || "";
    const email = emisor.email || "";
    document.getElementById("contactoEmisor").textContent = [tel, email].filter(Boolean).join(" · ") || "Sin contacto";
}

function agregarCelda(fila, texto, clases) {
    const celda = document.createElement("td");
    celda.textContent = texto;
    if (clases != null) {
        celda.className = clases;
    }
    fila.appendChild(celda);
}

function formarDireccion(cliente) {
    const codigoPostal = cliente.codigoPostal || "";
    return cliente.direccion + ", " + codigoPostal + " " + cliente.poblacion + " (" + cliente.provincia + ")";
}

function formarContacto(cliente) {
    const telefono = cliente.telefono || "Sin teléfono";
    const email = cliente.email || "Sin email";
    return telefono + " · " + email;
}

function formatearFecha(fecha) {
    const partes = fecha.split("-");
    return partes[2] + "/" + partes[1] + "/" + partes[0];
}

function formatearImporte(importe) {
    const valor = importe == null ? 0 : importe;
    return Number(valor).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

function formatearPorcentaje(porcentaje) {
    const valor = porcentaje == null ? 0 : porcentaje;
    return Number(valor).toLocaleString("es-ES") + " %";
}

const ESCAPES_HTML = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
};

/**
 * Escapa un dato del servidor antes de interpolarlo en una plantilla HTML.
 *
 * El visor pinta con textContent y no necesita nada de esto, pero la plantilla
 * de la impresión en lote se construye como cadena de texto: sin escapar, un
 * cliente llamado `<img src=x onerror=...>` ejecutaría su código en cuanto se
 * añadiera a la cola. Los importes y las fechas pasan igual por aquí: cuesta lo
 * mismo y así no hay que acordarse de qué campo es de fiar.
 *
 * @param {*} valor lo que se va a interpolar
 * @return {string} el mismo texto, sin caracteres que abran una etiqueta
 */
function escaparHtml(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, caracter => ESCAPES_HTML[caracter]);
}

function mostrarError(mensaje) {
    fijar(mensaje, { esError: true });
    documentoFactura.setAttribute("aria-busy", "false");
}

botonImprimir.addEventListener("click", function () {
    window.print();
});

/**
 * Dimensiones de la hoja del borrador en pantalla, por formato.
 * "" (por defecto) no puede saber el papel de la impresora, así que el
 * borrador se queda como referencia en A4.
 * "estrecha" marca la hoja que necesita la maquetación de columna
 * (la misma que la impresión aplica con @media contra el papel).
 */
const HOJAS = {
    "":     { ancho: "210mm",   alto: "297mm" },
    A4:     { ancho: "210mm",   alto: "297mm" },
    A5:     { ancho: "148mm",   alto: "210mm", estrecha: true },
    letter: { ancho: "215.9mm", alto: "279.4mm" },
};

/**
 * Paginación del borrador.
 *
 * El objetivo es que la hoja que se ve en pantalla enseñe exactamente los
 * mismos cortes que saldrán impresos: el contenido se parte en varias hojas
 * .documento-factura (una por página) en el mismo sitio en que el navegador
 * partiría el papel, y en impresión cada hoja arranca con break-before: page.
 * Si todo cabe en una sola hoja no se crea ninguna y la vista queda como
 * siempre, así que A4 y Carta cortos no cambian ni un píxel.
 */
let nodosOriginales = null;   // hijos de #contenidoFactura, capturados una vez
let paginando = false;        // guarda contra reentrada (ResizeObserver)
let pedidoPaginar = 0;

/** Convierte una medida CSS (mm) a píxeles con la conversión que usa el navegador. */
function medirCss(valor) {
    const sonda = document.createElement("div");
    sonda.style.cssText = "position:absolute;visibility:hidden;height:" + valor;
    document.body.appendChild(sonda);
    const px = sonda.offsetHeight;
    sonda.remove();
    return px;
}

function hojasExtra() {
    return Array.from(document.querySelectorAll(".documento-factura.hoja-extra"));
}

/**
 * Altura que ocupa la hoja sin el min-height, es decir, su contenido real más
 * su padding. Sin quitar el min-height la medición se quedaría en el alto del
 * papel aunque el contenido se desbordara, y nunca se paginaría.
 */
function altoUsado(hoja) {
    const minimo = hoja.style.minHeight;
    hoja.style.minHeight = "0";
    const alto = hoja.offsetHeight;
    hoja.style.minHeight = minimo;
    return alto;
}

/** Los bloques de la hoja principal viven en #contenidoFactura; los de las
 *  hojas extra, directamente en la hoja. */
function contenedorDe(hoja) {
    return hoja === documentoFactura ? contenidoFactura : hoja;
}

function crearHojaDespues(despues) {
    const hoja = document.createElement("div");
    hoja.className = "documento-factura hoja-extra";
    hoja.classList.toggle("hoja-estrecha", documentoFactura.classList.contains("hoja-estrecha"));
    despues.after(hoja);
    return hoja;
}

/**
 * Deshace la paginación: cada nodo original vuelve a #contenidoFactura en su
 * orden y las hojas extra se borran. Es el primer paso de cada paginación,
 * para partir siempre del mismo estado.
 */
function fusionar() {
    if (!nodosOriginales) return;

    // Las filas de las tablas de continuación son nodos originales movidos:
    // vuelven a #tablaConceptos (en orden de hoja) antes de que desaparezcan
    // las hojas que las contienen.
    document.querySelectorAll(".tabla-continuacion tbody").forEach(cuerpo => {
        tablaConceptos.append(...cuerpo.children);
    });

    contenidoFactura.append(...nodosOriginales);
    hojasExtra().forEach(hoja => hoja.remove());
}

/**
 * Crea la sección de conceptos de una hoja de continuación: mismo aspecto y
 * mismo thead que la original, con las filas que lleguen después.
 */
function crearContinuacion(origen) {
    const seccion = document.createElement("section");
    const titulo = document.createElement("h2");
    titulo.className = "h5 visually-hidden";
    titulo.textContent = "Conceptos (continuación)";
    const contenedor = document.createElement("div");
    contenedor.className = "table-responsive";
    const tabla = origen.querySelector("table").cloneNode(false);
    tabla.classList.add("tabla-continuacion");
    tabla.append(origen.querySelector("thead").cloneNode(true));
    const cuerpo = document.createElement("tbody");
    tabla.append(cuerpo);
    contenedor.append(tabla);
    seccion.append(titulo, contenedor);
    return seccion;
}

/**
 * Reparte las filas de los conceptos entre la sección original (que rellena
 * lo que queda de la hoja en la que está) y tantas continuaciones como
 * hagan falta. Es el equivalente en pantalla de lo que el navegador hace solo
 * al imprimir (tr { break-inside: avoid }): el corte siempre cae entre filas
 * y la página no se queda con un hueco sin rellenar.
 *
 * @param {number} limite alto máximo en píxeles de una hoja con contenido
 * @return {{hoja: Element, filas: number}} última hoja usada y filas en ella
 */
function partirConceptos(limite) {
    const filas = Array.from(tablaConceptos.children);
    tablaConceptos.replaceChildren();

    let hojaActual = seccionConceptos.closest(".documento-factura");

    // Ni la sección sin filas cabe en lo que queda: se va sola a una hoja
    // nueva (el papel empujaría la tabla entera igual).
    if (altoUsado(hojaActual) > limite) {
        seccionConceptos.remove();
        hojaActual = crearHojaDespues(hojaActual);
        hojaActual.append(seccionConceptos);
    }

    let tablaActual = tablaConceptos;
    let filasEnPagina = 0;

    for (const fila of filas) {
        tablaActual.append(fila);
        filasEnPagina += 1;

        if (altoUsado(hojaActual) <= limite) continue;

        // Ni quitando esta fila cabe la hoja: la fila no se puede partir y
        // se queda donde está (la impresión se encontraría el mismo muro).
        if (altoUsado(hojaActual) - fila.offsetHeight > limite) continue;

        fila.remove();
        filasEnPagina -= 1;

        hojaActual = crearHojaDespues(hojaActual);
        const continuacion = crearContinuacion(seccionConceptos);
        hojaActual.append(continuacion);
        tablaActual = continuacion.querySelector("tbody");
        tablaActual.append(fila);
        filasEnPagina = 1;
    }

    return { hoja: hojaActual, filas: filasEnPagina };
}

/**
 * Parte el contenido en tantas hojas como necesite el papel elegido para que
 * el borrador muestre los mismos cortes que la impresión.
 */
function partirEnHojas() {
    const formato = HOJAS[selectFormato.value];
    if (!formato) return;

    if (!nodosOriginales) nodosOriginales = Array.from(contenidoFactura.children);

    // 2px de margen: absorben la diferencia de redondeo mm→px entre la
    // maquetación en pantalla y la caja de la página impresa.
    const limite = medirCss(formato.alto) - 2;

    // Se empieza con la hoja principal casi vacía: la marca de agua se queda
    // (está fijada al viewport y no ocupa sitio en el flujo).
    nodosOriginales.forEach(nodo => {
        if (nodo !== marcaAgua) nodo.remove();
    });

    let hojaActual = documentoFactura;
    let enPagina = 0;

    for (const nodo of nodosOriginales) {
        if (nodo === marcaAgua) continue;

        contenedorDe(hojaActual).append(nodo);

        if (altoUsado(hojaActual) <= limite) {
            enPagina += 1;
            continue;
        }

        if (enPagina === 0) {
            // No cabe ni solo: no hay otra hoja a la que moverlo.
            enPagina = 1;
            continue;
        }

        if (nodo === seccionConceptos) {
            // La tabla no cabe entera en lo que queda de la página: se
            // rellena con las filas que quepan (como haría el papel, que no
            // deja un hueco sin rellenar) y el resto sigue en hojas de
            // continuación.
            const reparto = partirConceptos(limite);
            hojaActual = reparto.hoja;
            enPagina = Math.max(reparto.filas, 1);
            continue;
        }

        nodo.remove();
        hojaActual = crearHojaDespues(hojaActual);
        contenedorDe(hojaActual).append(nodo);
        enPagina = 1;
    }

    hojasExtra().forEach((hoja, i) => { hoja.dataset.pagina = String(i + 2); });
}

/** Recalcula los cortes de página en el siguiente fotograma. */
function programarPaginar() {
    cancelAnimationFrame(pedidoPaginar);
    pedidoPaginar = requestAnimationFrame(paginar);
}

function paginar() {
    if (paginando) return;
    paginando = true;
    try {
        fusionar();
        if (!contenidoFactura.classList.contains("d-none")) {
            partirEnHojas();
        }
    } finally {
        paginando = false;
    }
}

/**
 * Inyecta o elimina la regla @page dinámicamente en el documento y
 * redimensiona la hoja del borrador para que la vista en pantalla
 * coincida con el formato que se imprimirá.
 * Si el usuario no elige formato, se deja vacío para respetar la configuración
 * por defecto del cuadro de diálogo de impresión del navegador.
 */
function actualizarFormatoPapel() {
    estiloHoja.textContent = selectFormato.value
        ? `@page { size: ${selectFormato.value}; margin: 14mm; }`
        : "";

    const hoja = HOJAS[selectFormato.value];
    if (hoja) {
        document.documentElement.style.setProperty("--hoja-ancho", hoja.ancho);
        document.documentElement.style.setProperty("--hoja-alto", hoja.alto);
        // Todas las hojas (principal y las que haya creado la paginación)
        // comparten la maquetación de columna del A5.
        document.querySelectorAll(".documento-factura").forEach(hojaDom =>
            hojaDom.classList.toggle("hoja-estrecha", Boolean(hoja.estrecha)));
        // El límite de página cambia con el formato: se vuelve a partir.
        programarPaginar();
    }
}

selectFormato.addEventListener("change", actualizarFormatoPapel);
actualizarFormatoPapel();

// El PDF que hubiera pedido el menú de compartir es del formato anterior. Hoy
// no se puede dar —el menú se cierra en cuanto se toca el selector— pero la
// invariante «el PDF pedido es el de lo que se está viendo» se mantiene aquí y
// no se confía a que el popover siga comportándose igual.
selectFormato.addEventListener("change", () => { pdfPedido = null; });

// Cualquier cambio de tamaño (texto largo, logo que no carga, cambio de
// formato) vuelve a partir el contenido en hojas.
new ResizeObserver(programarPaginar).observe(document.body);

cargarDetalleFactura();
// Se guarda la promesa: la impresión en lote la espera antes de pintar los clones.
emisorCargado = pedirEmisor();


// ── Selección múltiple ──────────────────────────────────────────────

const panelBuscador        = document.getElementById("panelBuscador");
const botonSeleccionarVarias = document.getElementById("botonSeleccionarVarias");
const botonCerrarPanel     = document.getElementById("botonCerrarPanel");
const campoBusqueda        = document.getElementById("campoBusquedaFacturas");
const filtroEstado         = document.getElementById("filtroEstado");
const listaResultados      = document.getElementById("listaResultados");
const contadorResultados   = document.getElementById("contadorResultados");
const botonAgregarSeleccion = document.getElementById("botonAgregarSeleccion");

const sidebarCola          = document.getElementById("sidebarCola");
const listaCola            = document.getElementById("listaCola");
const contadorCola         = document.getElementById("contadorCola");
const botonLimpiarCola     = document.getElementById("botonLimpiarCola");
const botonImprimirTodas   = document.getElementById("botonImprimirTodas");

/**
 * Facturas marcadas con el checkbox en el panel de búsqueda, por id.
 *
 * Es un Map y no un Set porque al pasarlas a la cola hace falta la factura
 * entera, no solo su id. Con un Set había que recorrer otra vez el DOM leyendo
 * los checkboxes y sacar la factura de un WeakMap auxiliar: dos fuentes de
 * verdad para el mismo dato, y la de verdad era el DOM.
 *
 * @type {Map<number, object>}
 */
const marcadas = new Map();

/**
 * Cola de impresión: facturas completas (cabecera) listas para imprimir.
 * Se usa un Map id→Factura para mantener el orden de inserción y
 * permitir eliminación por clave en O(1) sin recorrer un array.
 * @type {Map<number, object>}
 */
const colaImpresion = new Map();

/** Abre el panel de búsqueda con transición CSS. */
function abrirPanelBuscador() {
    marcadas.clear();
    panelBuscador.classList.add("abierto");
    panelBuscador.setAttribute("aria-hidden", "false");
    campoBusqueda.value = "";
    campoBusqueda.focus();
    buscarFacturasConRetardo();
}

/** Cierra el panel de búsqueda con transición CSS. */
function cerrarPanelBuscador() {
    panelBuscador.classList.remove("abierto");
    panelBuscador.setAttribute("aria-hidden", "true");
}

botonSeleccionarVarias.addEventListener("click", abrirPanelBuscador);
botonCerrarPanel.addEventListener("click", cerrarPanelBuscador);

// Cerrar al hacer clic en el fondo oscuro (no en el contenido).
panelBuscador.addEventListener("click", function (evento) {
    if (evento.target === panelBuscador) {
        cerrarPanelBuscador();
    }
});

let temporizadorBusqueda = 0;

/**
 * Programa una búsqueda tras 300 ms de inactividad del teclado.
 * El temporizador anterior se cancela para que solo se ejecute la
 * última pulsación: sin esto, teclear «FAC» lanzaría tres peticiones.
 */
function buscarFacturasConRetardo() {
    clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda = setTimeout(ejecutarBusqueda, 300);
}

/** Llama al endpoint con el texto y el filtro de estado actuales. */
async function ejecutarBusqueda() {
    const texto = campoBusqueda.value.trim();
    const estado = filtroEstado.value;

    const parametros = new URLSearchParams();
    parametros.set("busqueda", texto);
    if (estado) {
        parametros.set("estado", estado);
    }

    try {
        const respuesta = await fetch("/factura/buscar?" + parametros);
        if (!respuesta.ok) {
            avisarEnElPanel(await motivoDe(respuesta, "No se pudieron buscar las facturas."));
            return;
        }
        const facturas = await respuesta.json();
        mostrarResultadosBusqueda(facturas);

    } catch (error) {
        // Se registra la excepción en vez de tragársela: por aquí pasan tanto
        // los cortes de red como cualquier fallo al pintar los resultados, y
        // sin rastro en la consola los segundos se confunden con los primeros.
        console.error("Error al buscar facturas", error);
        avisarEnElPanel("No se pudo conectar con el servidor.");
    }
}

/**
 * Cuenta un problema dentro del panel de búsqueda.
 *
 * No se usa la franja de avisos de la pantalla porque el panel la tapa: ocupa
 * toda la ventana, así que un mensaje detrás no lo ve nadie. Se escribe en el
 * mismo sitio donde va el recuento, pero marcado como error —antes salía en
 * gris pequeño, igual que un «3 factura(s) encontrada(s)», y un error que
 * parece un recuento no se lee— y se repite en la región viva para quien
 * navega con lector de pantalla.
 *
 * @param {string} mensaje el problema, ya en español
 */
function avisarEnElPanel(mensaje) {
    contadorResultados.textContent = mensaje;
    contadorResultados.classList.add("contador-error");
    anunciar(mensaje);
}

campoBusqueda.addEventListener("input", buscarFacturasConRetardo);
filtroEstado.addEventListener("change", buscarFacturasConRetardo);

/**
 * Pinta la lista de facturas devueltas por el buscador.
 * Cada tarjeta lleva un checkbox que se sincroniza con el Set `marcadas`.
 *
 * @param {Array<object>} facturas — lista de facturas del backend
 */
function mostrarResultadosBusqueda(facturas) {
    // Las que ya están en la cola no se ofrecen: no tiene sentido seleccionar
    // algo que ya va a imprimirse.
    const seleccionables = facturas.filter(factura => !colaImpresion.has(factura.idFactura));
    const yaEnCola = facturas.length - seleccionables.length;

    listaResultados.replaceChildren(
            ...seleccionables.map(factura => crearTarjetaResultado(factura)));

    contadorResultados.textContent = facturas.length + " factura(s) encontrada(s)"
        + (yaEnCola > 0 ? ` (${yaEnCola} ya en cola)` : "");
    // Si la búsqueda anterior había fallado, el recuento vuelve a ser un
    // recuento: sin esto se quedaría en rojo para siempre.
    contadorResultados.classList.remove("contador-error");
    actualizarBotonAgregar();
}

/**
 * Construye el nodo DOM de una tarjeta de resultado con su checkbox.
 *
 * @param {object} factura — cabecera de la factura
 * @return {HTMLElement} la tarjeta lista para insertar
 */
function crearTarjetaResultado(factura) {
    const tarjeta = document.createElement("label");
    tarjeta.className = "tarjeta-resultado";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "form-check-input flex-shrink-0";
    checkbox.checked = marcadas.has(factura.idFactura);

    /** El estado de la marca vive en el Map; la clase solo lo refleja. */
    function sincronizarMarca() {
        if (checkbox.checked) {
            marcadas.set(factura.idFactura, factura);
        } else {
            marcadas.delete(factura.idFactura);
        }
        tarjeta.classList.toggle("seleccionada", checkbox.checked);
    }

    checkbox.addEventListener("change", () => {
        sincronizarMarca();
        actualizarBotonAgregar();
    });

    const info = crearBloque("tarjeta-resultado-info", [
        ["tarjeta-resultado-numero", factura.numeroFactura],
        ["tarjeta-resultado-cliente", factura.nombreCliente || "—"],
    ]);

    // El estado admite nulo en la base de datos. Sin el resguardo, una factura
    // sin estado rompía el .map() entero y el panel contaba un error de
    // conexión que no había ocurrido.
    const estado = factura.estado || "SIN ESTADO";
    const badge = document.createElement("span");
    badge.className = "badge-estado badge-estado-" + estado.toLowerCase();
    badge.textContent = estado;

    const importe = document.createElement("span");
    importe.className = "tarjeta-resultado-importe";
    importe.textContent = formatearImporte(factura.total);

    tarjeta.append(checkbox, info, badge, importe);
    tarjeta.classList.toggle("seleccionada", checkbox.checked);

    return tarjeta;
}

/**
 * Arma el bloque de dos líneas que comparten las tarjetas del panel y de la
 * cola. Se pinta con textContent y no con innerHTML: el número de factura y el
 * nombre del cliente vienen del servidor, y por ahí entraba HTML ajeno.
 *
 * @param {string} clase clase del contenedor
 * @param {Array<[string, string]>} lineas pares clase/texto, en orden
 * @return {HTMLElement}
 */
function crearBloque(clase, lineas) {
    const contenedor = document.createElement("div");
    contenedor.className = clase;

    for (const [claseLinea, texto] of lineas) {
        const linea = document.createElement("div");
        linea.className = claseLinea;
        linea.textContent = texto;
        contenedor.append(linea);
    }

    return contenedor;
}

/** Habilita o deshabilita el botón "Añadir" según haya marcadas. */
function actualizarBotonAgregar() {
    botonAgregarSeleccion.disabled = marcadas.size === 0;
}

/**
 * Mueve las facturas marcadas a la cola de impresión, cierra el panel
 * y muestra la sidebar.
 */
function agregarMarcadasACola() {
    for (const [id, factura] of marcadas) {
        colaImpresion.set(id, factura);
    }

    marcadas.clear();
    cerrarPanelBuscador();
    mostrarSidebar();
}

botonAgregarSeleccion.addEventListener("click", agregarMarcadasACola);

/** Muestra la sidebar y actualiza el cuerpo para dejar hueco. */
function mostrarSidebar() {
    sidebarCola.classList.remove("d-none");
    document.body.classList.add("con-sidebar");
    actualizarSidebar();
}

/** Oculta la sidebar y restaura el cuerpo. */
function ocultarSidebar() {
    sidebarCola.classList.add("d-none");
    document.body.classList.remove("con-sidebar");
}

/** Redibuja el contenido de la sidebar según el estado de la cola. */
function actualizarSidebar() {
    contadorCola.textContent = String(colaImpresion.size);
    botonImprimirTodas.disabled = colaImpresion.size === 0;

    if (colaImpresion.size === 0) {
        listaCola.replaceChildren();
        ocultarSidebar();
        return;
    }

    listaCola.replaceChildren(
            ...Array.from(colaImpresion.values(), factura => crearTarjetaCola(factura)));

    // La factura que el visor está enseñando se resalta en la cola.
    const idActual = Number(new URLSearchParams(window.location.search).get("idFactura"));
    if (idActual) {
        resaltarTarjetaActiva(idActual);
    }
}

/**
 * Crea una tarjeta de la cola con botón de quitar y clic para previsualizar.
 *
 * @param {object} factura — cabecera de la factura
 * @return {HTMLElement} la tarjeta
 */
function crearTarjetaCola(factura) {
    const tarjeta = document.createElement("div");
    tarjeta.className = "tarjeta-cola";
    tarjeta.dataset.id = factura.idFactura;

    /*
     * La previsualización se dispara desde un <button> y no desde el <div> con
     * un onclick que había antes: así se llega a ella con el tabulador y
     * responde a Intro y a la barra espaciadora, cosa que un div no hace por
     * mucho cursor de mano que se le ponga. El CSS le quita el aspecto de
     * botón, no su semántica.
     */
    const previsualizar = document.createElement("button");
    previsualizar.type = "button";
    previsualizar.className = "tarjeta-cola-previsualizar";
    previsualizar.title = "Previsualizar esta factura";
    previsualizar.append(crearBloque("tarjeta-cola-info", [
        ["tarjeta-cola-numero", factura.numeroFactura],
        ["tarjeta-cola-importe", formatearImporte(factura.total)],
    ]));

    previsualizar.addEventListener("click", () => {
        window.history.replaceState(null, "", "?idFactura=" + factura.idFactura);
        cargarDetalleFactura(factura.idFactura);
        resaltarTarjetaActiva(factura.idFactura);
    });

    const quitar = document.createElement("button");
    quitar.type = "button";
    quitar.className = "btn btn-sm btn-outline-danger flex-shrink-0";
    quitar.innerHTML = '<i class="bi bi-x-lg"></i>';
    quitar.title = "Quitar de la cola";

    // Sin stopPropagation: los dos botones son hermanos, así que el clic en el
    // aspa nunca pasó por el de previsualizar. Era una defensa contra un
    // burbujeo que no existe.
    quitar.addEventListener("click", () => {
        colaImpresion.delete(factura.idFactura);
        actualizarSidebar();
    });

    tarjeta.append(previsualizar, quitar);
    return tarjeta;
}

/** Marca visualmente la tarjeta de la factura que se está previsualizando. */
function resaltarTarjetaActiva(idFactura) {
    for (const tarjeta of listaCola.children) {
        tarjeta.classList.toggle("activa",
                tarjeta.dataset.id === String(idFactura));
    }
}

botonLimpiarCola.addEventListener("click", function () {
    colaImpresion.clear();
    actualizarSidebar();
});


/**
 * Construye el HTML de una factura para imprimirla en lote.
 *
 * Es la misma maquetación que el visor, pero como cadena de texto en vez de
 * como DOM: los clones se crean de golpe y no pasan por mostrarDetalle(). Por
 * eso todo lo que venga del servidor se interpola con escaparHtml().
 *
 * El emisor llega por parámetro y no se lee de una variable global: así la
 * función depende solo de lo que se le pasa y quien la llama es responsable de
 * haber esperado su carga.
 *
 * @param {object} detalle factura, cliente, conceptos y desglose
 * @param {object} emisor  datos del emisor, o {} si no se pudieron cargar
 * @return {string} el HTML del documento
 */
function construirHtmlFactura(detalle, emisor) {
    const f = detalle.factura;
    const c = detalle.cliente;
    const conceptos = detalle.conceptos || [];
    const desglose = detalle.desglose || [];

    const esBorrador = f.estado === "BORRADOR";
    const marcaAgua = esBorrador ? `<p class="marca-agua" aria-hidden="true">BORRADOR</p>` : '';

    const conceptosHtml = conceptos.length === 0
        ? `<tr><td colspan="7" class="text-center text-muted">Esta factura no tiene conceptos registrados.</td></tr>`
        : conceptos.map(co => `
            <tr>
                <td>${escaparHtml(co.descripcion || "—")}</td>
                <td class="text-end">${escaparHtml(co.cantidad ?? "—")}</td>
                <td class="text-end">${escaparHtml(formatearImporte(co.precioUnitario))}</td>
                <td class="text-end">${escaparHtml(formatearPorcentaje(co.descuento))}</td>
                <td class="text-end">${escaparHtml(formatearImporte(co.baseImponible))}</td>
                <td class="text-end">${escaparHtml(formatearImporte(co.importeIva))}</td>
                <td class="text-end">${escaparHtml(formatearImporte(co.total))}</td>
            </tr>
        `).join('');

    const desgloseHtml = desglose.map(d => `
            <tr>
                <td class="text-end">${escaparHtml(formatearImporte(d.baseImponible))}</td>
                <td class="text-end">${escaparHtml(formatearPorcentaje(d.tipoImpositivo))}</td>
                <td class="text-end">${escaparHtml(formatearImporte(d.cuotaRepercutida))}</td>
            </tr>
        `).join('');

    return `
        ${marcaAgua}
        <header class="cabecera-factura d-flex justify-content-between align-items-start">
            <div class="d-flex align-items-center gap-3">
                <img src="/emisor/logo" alt="Logo emisor" class="logo-emisor" onerror="this.style.display='none'">
                <div>
                    <h1 class="h4 mb-0 text-primary">Facturacion360 - EasyFactu</h1>
                    <p class="mb-0 text-muted small">Documento de factura</p>
                </div>
            </div>
            <div class="cabecera-identificacion d-flex align-items-start ms-auto">
                <div class="datos-identificacion">
                    <h2 class="h5 mb-1">${escaparHtml(f.numeroFactura)}</h2>
                    <p class="mb-0 small">Fecha: ${escaparHtml(formatearFecha(f.fechaEmision))}</p>
                    <p class="mb-0 small text-muted">Estado: ${escaparHtml(f.estado)}</p>
                </div>
            </div>
        </header>

        <div class="datos-partes">
            <div class="row">
                <div class="col-6 border-end">
                    <section>
                        <h2 class="h6 fw-bold border-bottom pb-2 mb-2">Emisor</h2>
                        <p class="fw-bold mb-1">${escaparHtml(emisor.nombre || "—")}</p>
                        <p class="mb-1">NIF/CIF: ${escaparHtml(emisor.cif || emisor.nifCif || "—")}</p>
                        <p class="mb-1">${escaparHtml(emisor.direccion || "—")}</p>
                        <p class="mb-0">${escaparHtml([emisor.telefono, emisor.email].filter(Boolean).join(" · ") || "Sin contacto")}</p>
                    </section>
                </div>
                <div class="col-6">
                    <section class="ps-2">
                        <h2 class="h6 fw-bold border-bottom pb-2 mb-2">Cliente</h2>
                        <p class="fw-bold mb-1">${escaparHtml(c.nombre)}</p>
                        <p class="mb-1">NIF/CIF: ${escaparHtml(c.nifCif)}</p>
                        <p class="mb-1">${escaparHtml(formarDireccion(c))}</p>
                        <p class="mb-0">${escaparHtml(formarContacto(c))}</p>
                    </section>
                </div>
            </div>
        </div>

        <section>
            <h2 class="h5">Conceptos</h2>
            <div class="table-responsive">
                <table class="table table-bordered align-middle">
                    <thead>
                        <tr>
                            <th scope="col">Descripción</th>
                            <th scope="col" class="text-end">Cantidad</th>
                            <th scope="col" class="text-end">Precio</th>
                            <th scope="col" class="text-end">Dto.</th>
                            <th scope="col" class="text-end">Base</th>
                            <th scope="col" class="text-end">IVA</th>
                            <th scope="col" class="text-end">Total</th>
                        </tr>
                    </thead>
                    <tbody>${conceptosHtml}</tbody>
                </table>
            </div>
        </section>

        <div class="d-flex justify-content-between align-items-start flex-wrap fila-desglose-totales">
            <section class="desglose-factura flex-grow-1 ${desglose.length > 0 ? '' : 'd-none'}">
                <h2 class="h6">Desglose del IVA</h2>
                <table class="table table-sm tabla-desglose">
                    <thead>
                        <tr>
                            <th scope="col" class="text-end">Base imponible</th>
                            <th scope="col" class="text-end">Tipo</th>
                            <th scope="col" class="text-end">Cuota</th>
                        </tr>
                    </thead>
                    <tbody>${desgloseHtml}</tbody>
                </table>
            </section>
            <div class="totales-factura flex-shrink-0">
                <div><span>Subtotal</span><strong>${escaparHtml(formatearImporte(f.subtotal))}</strong></div>
                <div><span>IVA</span><strong>${escaparHtml(formatearImporte(f.importeIva))}</strong></div>
                <div class="total-final"><span>Total</span><strong>${escaparHtml(formatearImporte(f.total))}</strong></div>
            </div>
        </div>

        ${f.observaciones && f.observaciones.trim() ? `
        <section class="observaciones-factura">
            <h2 class="h5">Observaciones</h2>
            <p class="mb-0">${escaparHtml(f.observaciones)}</p>
        </section>` : ''}
    `;
}

/**
 * Crea un <div> con la misma estructura que el visor pero con los datos
 * de una factura concreta, listo para imprimir.
 *
 * @param {object} detalle factura, cliente, conceptos y desglose
 * @param {object} emisor  datos del emisor
 * @return {HTMLElement} la hoja clonada
 */
function crearClonParaImpresion(detalle, emisor) {
    const contenedor = document.createElement("div");
    contenedor.className = "documento-factura factura-lote";
    // El clon hereda el formato de hoja que haya elegido el selector.
    contenedor.classList.toggle("hoja-estrecha",
            documentoFactura.classList.contains("hoja-estrecha"));
    contenedor.innerHTML = construirHtmlFactura(detalle, emisor);
    return contenedor;
}

/**
 * Pide el detalle de cada factura de la cola y devuelve los que hayan llegado.
 *
 * Las que fallen se descartan en silencio en vez de abortar el lote: con diez
 * facturas seleccionadas, que una dé error no es razón para no imprimir las
 * otras nueve.
 *
 * @return {Promise<Array<object>>}
 */
async function pedirDetallesDeLaCola() {
    const peticiones = Array.from(colaImpresion.keys(), async id => {
        const respuesta = await fetch("/factura/" + id + "/detalle");
        return respuesta.ok ? respuesta.json() : null;
    });

    const resultados = await Promise.allSettled(peticiones);
    return resultados
        .filter(resultado => resultado.status === "fulfilled" && resultado.value !== null)
        .map(resultado => resultado.value);
}

/**
 * Esconde el borrador, imprime los clones y devuelve la pantalla a su estado.
 *
 * El borrador se esconde ENTERO: la hoja principal y también las hojas que el
 * paginador le haya creado. Antes solo se ocultaba la principal, así que un
 * borrador de varias páginas colaba sus hojas extra delante de los clones.
 *
 * La sidebar recupera el estado que tenía y no uno fijo: antes se la mostraba
 * siempre al terminar, incluso si estaba oculta al empezar.
 *
 * @param {Array<object>} detalles facturas a imprimir, en orden de cola
 * @param {object} emisor datos del emisor
 */
async function imprimirClones(detalles, emisor) {
    const hojasBorrador = [documentoFactura, ...hojasExtra()];
    const sidebarEstabaOculta = sidebarCola.classList.contains("d-none");
    const clones = detalles.map(detalle => crearClonParaImpresion(detalle, emisor));

    hojasBorrador.forEach(hoja => hoja.classList.add("d-none"));
    sidebarCola.classList.add("d-none");
    document.body.append(...clones);

    try {
        // Un fotograma para que el navegador maquete los clones antes de medirlos.
        await new Promise(requestAnimationFrame);
        window.print();
    } finally {
        clones.forEach(clon => clon.remove());
        hojasBorrador.forEach(hoja => hoja.classList.remove("d-none"));
        sidebarCola.classList.toggle("d-none", sidebarEstabaOculta);
        // El borrador vuelve a estar a la vista: se recalculan sus cortes.
        programarPaginar();
    }
}

/**
 * Imprime de una vez todas las facturas de la cola.
 *
 * El try/finally es lo que garantiza que el botón se recupere: sin él, un error
 * de red a mitad de la carga dejaba el botón deshabilitado y con el spinner
 * puesto para siempre.
 */
async function imprimirEnLote() {
    const textoOriginal = botonImprimirTodas.innerHTML;
    botonImprimirTodas.disabled = true;
    botonImprimirTodas.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Preparando…';

    try {
        // El emisor se espera: es el mismo para todas y sin él los clones
        // saldrían con los datos de la empresa a "—".
        const [detalles, emisor] = await Promise.all([
            pedirDetallesDeLaCola(),
            emisorCargado,
        ]);

        if (detalles.length === 0) {
            fijar("No se pudieron cargar los datos para imprimir.", { esError: true });
            return;
        }

        await imprimirClones(detalles, emisor ?? {});
    } catch (error) {
        console.error("Error al preparar la impresión en lote", error);
        fijar("No se pudieron cargar los datos para imprimir.", { esError: true });
    } finally {
        botonImprimirTodas.innerHTML = textoOriginal;
        botonImprimirTodas.disabled = false;
    }
}

botonImprimirTodas.addEventListener("click", imprimirEnLote);


// ── Compartir ───────────────────────────────────────────────────────

const botonCompartir  = document.getElementById("botonCompartir");
const menuCompartir   = document.getElementById("menuCompartir");
const avisoBorrador   = document.getElementById("avisoCompartirBorrador");
const opcionWhatsapp  = document.getElementById("compartirWhatsapp");
const opcionTelegram  = document.getElementById("compartirTelegram");
const opcionCorreo    = document.getElementById("compartirCorreo");
const opcionDescargar = document.getElementById("compartirDescargar");

/**
 * La factura que el visor está enseñando ahora mismo.
 *
 * Hace falta entera —y no solo su identificador— porque el mensaje lleva el
 * número, la fecha y el importe, y el destinatario sale del cliente. Todo eso
 * ya está en memoria desde que se pintó la factura, así que compartir no le
 * vuelve a pedir nada al servidor salvo el propio PDF.
 */
let facturaCompartible = null;

/**
 * El PDF de la factura visible, pedido por adelantado.
 *
 * navigator.share() exige un gesto de usuario VIGENTE, y el viaje al servidor
 * para generar el PDF se lo come: cuando la respuesta llega, el clic ya ha
 * caducado y el navegador responde «Must be handling a user gesture». Por eso
 * el PDF se pide al ABRIR el menú y no al elegir el canal: para cuando el
 * usuario pulsa WhatsApp el fichero ya está, y share() se llama con el gesto
 * todavía vivo.
 *
 * @type {Promise<File>|null}
 */
let pdfPedido = null;

/**
 * Deja el menú de compartir listo para la factura recién cargada.
 *
 * @param {object} detalle el mismo DetalleFactura que acaba de pintarse
 */
function prepararCompartir(detalle) {
    facturaCompartible = detalle;
    botonCompartir.disabled = false;

    // El PDF que hubiera pedido es de la factura anterior: desde la cola se
    // salta de una a otra sin recargar la página, y compartir el documento de
    // otra factura es peor que tardar un segundo en pedir el correcto.
    pdfPedido = null;

    const esBorrador = detalle.factura.estado === "BORRADOR";
    avisoBorrador.classList.toggle("d-none", !esBorrador);

    // WhatsApp necesita un móvil. Un fijo (8xx o 9xx) no tiene cuenta, así que
    // conviene avisar en vez de abrir un chat con un número que no existe.
    const movil = movilParaWhatsapp(detalle.cliente.telefono);
    opcionWhatsapp.title = movil
        ? "Enviar a " + detalle.cliente.telefono
        : "Este cliente no tiene un móvil guardado: WhatsApp se abrirá sin destinatario";
}

/**
 * Pasa un teléfono guardado al formato que exige wa.me: dígitos y sin el «+».
 *
 * En la base de datos conviven «612345678», «+34612345678» y «+34 612345678»,
 * porque la validación deja el prefijo opcional. Los tres se normalizan a la
 * misma forma internacional suponiendo España, que es lo único que esa
 * validación admite.
 *
 * @param {string|null} telefono el teléfono tal cual está guardado
 * @return {string|null} el número en formato internacional, o null si no sirve
 */
function movilParaWhatsapp(telefono) {
    const digitos = (telefono ?? "").replace(/\D/g, "");
    if (digitos.length === 0) {
        return null;
    }

    const nacional = digitos.startsWith("34") ? digitos.slice(2) : digitos;

    // Solo los móviles españoles (6 y 7) tienen WhatsApp; 8 y 9 son fijos.
    if (!/^[67]\d{8}$/.test(nacional)) {
        return null;
    }

    return "34" + nacional;
}

/** El texto que acompaña al PDF en cualquiera de los tres canales. */
function mensajeDeLaFactura() {
    const f = facturaCompartible.factura;
    const cabecera = f.estado === "BORRADOR"
        ? "⚠ BORRADOR — NO VÁLIDO COMO FACTURA\n\n"
        : "";

    return cabecera
        + "Factura " + f.numeroFactura + "\n"
        + "Fecha: " + formatearFecha(f.fechaEmision) + "\n"
        + "Total: " + formatearImporte(f.total);
}

/**
 * Construye el enlace del canal.
 *
 * El esquema lo arma SIEMPRE el código y nunca el dato que llega del servidor,
 * que es la regla que ya sigue el listado de clientes en js/fila.js: así un
 * valor manipulado no puede colar un href de tipo «javascript:».
 *
 * @param {"whatsapp"|"telegram"|"correo"} canal a dónde se envía
 * @param {string} texto el mensaje ya compuesto
 * @return {string} la URL que hay que abrir
 */
function enlaceDelCanal(canal, texto) {
    const cliente = facturaCompartible.cliente;

    if (canal === "whatsapp") {
        // Sin número, wa.me abre igualmente y deja elegir el contacto.
        const movil = movilParaWhatsapp(cliente.telefono) ?? "";
        return "https://wa.me/" + movil + "?text=" + encodeURIComponent(texto);
    }

    if (canal === "telegram") {
        // Telegram no admite destinatario en el enlace: el chat se elige siempre.
        // El mensaje va en «text» y no en «url», que es para una dirección: aquí
        // no hay ninguna que compartir —la factura no es pública— y metiendo el
        // texto en «url» Telegram lo presentaba como si fuera un enlace.
        return "https://t.me/share/url?url=&text=" + encodeURIComponent(texto);
    }

    // Del destinatario se codifican SOLO '?', '&' y '#', que son los tres
    // caracteres que en un mailto dejan de formar parte de la dirección y pasan
    // a añadir cabeceras: un correo guardado como "a@b.com?bcc=otro@c.com"
    // mandaría una copia oculta que nadie ha escrito. Es la misma defensa que
    // aplica js/fila.js en la columna de email del listado de clientes.
    const destinatario = (cliente.email ?? "").replace(/[?&#]/g, encodeURIComponent);
    const asunto = "Factura " + facturaCompartible.factura.numeroFactura;

    return "mailto:" + destinatario
        + "?subject=" + encodeURIComponent(asunto)
        + "&body=" + encodeURIComponent(texto);
}

/**
 * Un fallo del que ya sabemos qué contarle al usuario, en español.
 *
 * Sirve para distinguirlo de las excepciones del navegador, cuyo mensaje viene
 * en inglés y no se le puede enseñar a nadie.
 */
class FalloConocido extends Error {}

/** Pide al servidor el PDF de la factura visible, en el formato elegido. */
async function pedirPdf() {
    const id = facturaCompartible.factura.idFactura;
    const formato = selectFormato.value || "A4";

    let respuesta;
    try {
        respuesta = await fetch("/factura/" + id + "/pdf?formato=" + encodeURIComponent(formato));
    } catch (error) {
        // fetch solo rechaza cuando ni siquiera hay conexión; un 500 llega como
        // respuesta normal y se trata justo debajo.
        console.error("No se pudo pedir el PDF de la factura", error);
        throw new FalloConocido("No se pudo conectar con el servidor.");
    }

    if (!respuesta.ok) {
        throw new FalloConocido(await motivoDe(respuesta, "No se pudo generar el PDF."));
    }

    const nombre = facturaCompartible.factura.numeroFactura.replace(/[^\w.-]/g, "_") + ".pdf";
    return new File([await respuesta.blob()], nombre, { type: "application/pdf" });
}

/** Guarda el fichero en el disco del usuario. */
function descargar(fichero) {
    const url = URL.createObjectURL(fichero);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = fichero.name;
    enlace.click();

    // Se revoca en el siguiente turno y no aquí mismo: hay navegadores que aún
    // no han empezado a leer el Blob cuando click() devuelve, y revocarlo en el
    // acto les aborta la descarga. Sin revocarlo, el Blob se quedaría en memoria
    // hasta recargar la página.
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Comparte la factura por el canal indicado.
 *
 * Hay dos caminos, y los separa lo único que importa: si el navegador sabe
 * entregar ficheros. En un móvil, navigator.share abre el selector del sistema
 * y WhatsApp, Telegram o el correo reciben el PDF como adjunto de verdad. En un
 * escritorio no existe ese selector, así que se descarga el PDF y se abre el
 * canal con el texto ya escrito para que el usuario lo adjunte: ningún esquema
 * de URL —ni mailto:, ni wa.me, ni t.me— puede llevar un fichero.
 *
 * @param {"whatsapp"|"telegram"|"correo"|"descargar"} canal
 */
async function compartir(canal) {
    if (!facturaCompartible) {
        return;
    }

    menuCompartir.hidePopover();

    const textoOriginal = botonCompartir.innerHTML;
    botonCompartir.disabled = true;
    botonCompartir.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Preparando…';

    try {
        // Normalmente ya está pedido desde que se abrió el menú; el ?? es para
        // cuando alguien llama sin pasar por él.
        const fichero = await (pdfPedido ?? pedirPdf());
        const texto = mensajeDeLaFactura();

        if (canal !== "descargar" && await seHaCompartidoElFichero(fichero, texto)) {
            return;
        }

        descargar(fichero);

        if (canal === "descargar") {
            fijar("PDF descargado.");
            return;
        }

        window.open(enlaceDelCanal(canal, texto), "_blank", "noopener");
        fijar("PDF descargado. Adjúntalo al mensaje que se acaba de abrir.");

    } catch (error) {
        // Nunca se enseña el mensaje de una excepción del navegador: vienen en
        // inglés. Solo los nuestros, que ya están escritos para leerse.
        const mensaje = error instanceof FalloConocido
            ? error.message
            : "No se pudo compartir la factura. Prueba a descargar el PDF.";

        console.error("Error al compartir la factura", error);
        fijar(mensaje, { esError: true });

    } finally {
        botonCompartir.innerHTML = textoOriginal;
        botonCompartir.disabled = false;
    }
}

/**
 * Intenta entregar el PDF al selector del sistema.
 *
 * @return {Promise<boolean>} true si el fichero ya está en manos del sistema o
 *         el usuario decidió cancelar; false si hay que seguir por el camino de
 *         escritorio (descargar y abrir el canal)
 */
async function seHaCompartidoElFichero(fichero, texto) {
    if (!navigator.canShare || !navigator.canShare({ files: [fichero] })) {
        return false;
    }

    try {
        await navigator.share({
            files: [fichero],
            title: "Factura " + facturaCompartible.factura.numeroFactura,
            text: texto,
        });
        return true;

    } catch (error) {
        // El usuario ha cerrado el selector. No es un fallo y no hay que
        // ofrecerle nada más: ya ha dicho que no.
        if (error && error.name === "AbortError") {
            return true;
        }

        // Cualquier otra cosa —el gesto caducado, un permiso denegado— NO es el
        // final: queda el camino de escritorio, que funciona igual. Se registra
        // para poder diagnosticarlo, pero el usuario no se entera de nada.
        console.warn("El selector del sistema no se pudo abrir; se descarga el PDF", error);
        return false;
    }
}

botonCompartir.addEventListener("click", () => {
    if (!facturaCompartible) {
        return;
    }
    // El fallo no se trata aquí: lo recoge compartir(), que es quien sabe
    // contárselo al usuario. El catch vacío solo evita que la promesa quede
    // rechazada sin escuchar si al final no se comparte nada.
    pdfPedido = pedirPdf();
    pdfPedido.catch(() => {});
});

opcionWhatsapp.addEventListener("click", () => compartir("whatsapp"));
opcionTelegram.addEventListener("click", () => compartir("telegram"));
opcionCorreo.addEventListener("click", () => compartir("correo"));
opcionDescargar.addEventListener("click", () => compartir("descargar"));
