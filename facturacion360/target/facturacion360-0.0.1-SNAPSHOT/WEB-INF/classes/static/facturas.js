import { crearAlerta, crearAvisos } from "./js/notificaciones.js";
import { motivoDe } from "./js/problema.js";
// Toda escritura necesita el token de CSRF: sin esta cabecera, Spring rechaza el POST
// con un 403 antes de que la petición llegue al controlador.
import { cabecerasConSeguridad } from "./js/seguridad.js";
import { limpiarCampo, limpiarValidacion, marcarCampo, validar } from "./js/validacion.js";

const RUTA_FACTURAS = "/factura/buscar";
const RUTA_CREAR_FACTURA = "/factura";
const RUTA_FACTURAS_TRIMESTRE = "/factura/trimestral";
const RUTA_CLIENTES = "/cliente/listar-pagina";
const RUTA_SUGERENCIAS_CONCEPTOS = "/factura/conceptos/sugerencias";

const tablaFacturas = document.getElementById("tablaFacturas");
const inputBusqueda = document.getElementById("busquedaFactura");
const contenedorBuscador = document.getElementById("buscadorFacturas");
const mensajeFacturas = document.getElementById("mensaje-facturas");
const formularioFactura = document.getElementById("formularioFactura");
const busquedaCliente = document.getElementById("clienteFactura");
const resultadosClientes = document.getElementById("resultadosClientes");
const mensajeBusquedaCliente = document.getElementById("mensajeBusquedaCliente");
const clienteSeleccionado = document.getElementById("clienteSeleccionado");
const formularioClienteFactura = document.getElementById("formularioClienteFactura");
const mensajeAltaCliente = document.getElementById("mensajeAltaCliente");
const camposNuevoCliente = document.getElementById("camposNuevoCliente");
const botonGuardarCliente = document.getElementById("botonGuardarCliente");
let idClienteSeleccionado = null;
let esperaBusquedaCliente;
let ultimaBusquedaCliente = 0;
let altaClienteAbierta = false;
let guardandoCliente = false;
const inputSubtotal = document.getElementById("subtotalFactura");
const inputIva = document.getElementById("ivaFactura");
const inputTotal = document.getElementById("totalFactura");
const inputAnio = document.getElementById("anioTrimestre");
const selectTrimestre = document.getElementById("trimestreFactura");
const resumenTrimestral = document.getElementById("resumenTrimestral");
const subtotalTrimestre = document.getElementById("subtotalTrimestre");
const ivaTrimestre = document.getElementById("ivaTrimestre");
const totalTrimestre = document.getElementById("totalTrimestre");
const campoObservaciones = document.getElementById("observacionesFactura");
const contadorObservaciones = document.getElementById("contadorObservacionesFactura");
const botonGuardarFactura = document.getElementById("botonGuardarFactura");
const camposFactura = document.getElementById("camposFactura");
const modalFactura = document.getElementById("facturaModal");
const mensajeFormularioFactura = document.getElementById("mensaje-formulario-factura");
const botonesCerrarFactura = modalFactura.querySelectorAll('[data-bs-dismiss="modal"]');
const contenedorConceptos = document.getElementById("conceptosFactura");
const plantillaConcepto = document.getElementById("plantillaConceptoFactura");
const botonAnadirConcepto = document.getElementById("botonAnadirConcepto");
const sinConceptos = document.getElementById("sinConceptosFactura");
const campoEstado = document.getElementById("estadoFactura");

// Los avisos de esta pantalla. El comportamiento —cuándo se borra uno, cómo se lee en alto,
// por qué se vacía en vez de esconderse— vive en js/notificaciones.js, el mismo módulo que
// usan clientes, el perfil y el visor. Aquí solo se dice CUÁLES son los dos contenedores.
const { anunciar, fijar, limpiar } = crearAvisos({
    franja: mensajeFacturas,
    region: document.getElementById("anuncios"),
});

// Y la alerta de dentro del formulario, que es otra cosa: la franja de arriba cuenta lo que
// pasa en la PANTALLA, y esta cuenta por qué no se ha podido guardar ESTA factura. Misma
// función y mismo aspecto que la del panel de un cliente.
const alertaFactura = crearAlerta(mensajeFormularioFactura);

let guardandoFactura = false;
let siguienteListaSugerencias = 0;
let siguienteAyudaTotal = 0;
let idFacturaEnEdicion = null;
let ultimaCargaBorrador = 0;
let formularioDisponible = true;
let volverAlDetalle = false;
let listadoTrimestralActivo = false;


// Ambas búsquedas comparten la tabla: una respuesta anterior no debe reemplazar la última consulta.
let ultimaConsultaFacturas = 0;


/** Carga las facturas que coinciden con el texto buscado. */
async function cargarFacturas() {
    listadoTrimestralActivo = false;
    let actualizada = false;
    ultimaConsultaFacturas++;
    const numeroConsulta = ultimaConsultaFacturas;
    const textoBuscado = inputBusqueda.value.trim();
    const parametros = new URLSearchParams({ busqueda: textoBuscado });

    try {
        const respuesta = await fetch(`${RUTA_FACTURAS}?${parametros}`);
        if (respuesta.ok) {
            const facturas = await respuesta.json();
            if (numeroConsulta == ultimaConsultaFacturas) {
                mostrarFacturas(facturas);
                resumenTrimestral.classList.add("d-none");
                limpiar();
                actualizada = true;
            }
        } else if (numeroConsulta == ultimaConsultaFacturas) {
            fijar("No se pudieron consultar las facturas.", { esError: true });
        }
    } catch (error) {
        if (numeroConsulta == ultimaConsultaFacturas) {
            console.error("Error al buscar facturas", error);
            fijar("No se pudo conectar con el servidor.", { esError: true });
        }
    }
    return actualizada;
}

/** Muestra las facturas recibidas dentro de la tabla. */
function mostrarFacturas(facturas) {
    tablaFacturas.replaceChildren();

    if (facturas.length == 0) {
        const fila = document.createElement("tr");
        const celda = document.createElement("td");
        celda.colSpan = 8;
        celda.className = "text-center text-muted py-4";
        celda.textContent = "No se han encontrado facturas.";
        fila.appendChild(celda);
        tablaFacturas.appendChild(fila);
    } else {
        for (const factura of facturas) {
            const fila = document.createElement("tr");
            agregarCelda(fila, factura.numeroFactura);
            agregarCelda(fila, factura.nombreCliente);
            agregarCelda(fila, formatearFecha(factura.fechaEmision));
            agregarCelda(fila, factura.estado);
            agregarCelda(fila, formatearImporte(factura.subtotal), "text-end");
            agregarCelda(fila, formatearImporte(factura.importeIva), "text-end");
            agregarCelda(fila, formatearImporte(factura.total), "text-end fw-bold");
            agregarAccionVisor(fila, factura);
            tablaFacturas.appendChild(fila);
        }
    }
}

/** Añade a la fila el botón que abre la factura preparada para imprimir. */
function agregarAccionVisor(fila, factura) {
    const celda = document.createElement("td");
    celda.className = "text-center";
    const acciones = document.createElement("div");
    acciones.className = "acciones-factura";

    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "btn btn-sm btn-primary-custom-table btn-ver";
    boton.title = "Ver e imprimir factura (PDF)";
    boton.setAttribute("aria-label", "Ver e imprimir factura");
    const iconoVer = document.createElement("i");
    iconoVer.className = "fa-solid fa-eye";
    iconoVer.setAttribute("aria-hidden", "true");
    boton.appendChild(iconoVer);
    boton.addEventListener("click", function () {
        window.open("factura-imprimir.html?idFactura=" + factura.idFactura, "_blank");
    });

    acciones.appendChild(boton);
    if (factura.estado == "BORRADOR") {
        const editar = document.createElement("button");
        editar.type = "button";
        editar.className = "btn btn-sm btn-primary-custom-table btn-editar";
        editar.title = "Editar borrador " + factura.numeroFactura;
        const iconoEditar = document.createElement("i");
        iconoEditar.className = "fa-solid fa-pencil";
        iconoEditar.setAttribute("aria-hidden", "true");
        editar.appendChild(iconoEditar);
        editar.setAttribute("aria-label", "Editar borrador " + factura.numeroFactura);
        editar.addEventListener("click", () => abrirBorrador(factura.idFactura));
        acciones.appendChild(editar);
    }
    celda.appendChild(acciones);
    fila.appendChild(celda);
}

/** Consulta las facturas del año y trimestre elegidos y muestra sus totales. */
async function cargarListadoTrimestral() {
    let actualizada = false;

    // A mano y no con validar(): este campo vive en la barra de filtros, fuera de todo
    // formulario, así que no hay nada a lo que ponerle was-validated.
    if (!inputAnio.checkValidity()) {
        marcarCampo(inputAnio, "Indica un año entre 2000 y 2100.", { enfocar: true });
        return actualizada;
    }
    limpiarCampo(inputAnio);

    listadoTrimestralActivo = true;
    ultimaConsultaFacturas++;
    const numeroConsulta = ultimaConsultaFacturas;
    const parametros = new URLSearchParams({
        anio: inputAnio.value,
        trimestre: selectTrimestre.value
    });

    try {
        const respuesta = await fetch(RUTA_FACTURAS_TRIMESTRE + "?" + parametros);
        if (respuesta.ok) {
            const resumen = await respuesta.json();
            if (numeroConsulta == ultimaConsultaFacturas) {
                mostrarFacturas(resumen.facturas);
                subtotalTrimestre.textContent = formatearImporte(resumen.subtotal);
                ivaTrimestre.textContent = formatearImporte(resumen.importeIva);
                totalTrimestre.textContent = formatearImporte(resumen.total);
                resumenTrimestral.classList.remove("d-none");
                fijar("Mostrando el " + resumen.trimestre + "º trimestre de " + resumen.anio + ".");
                actualizada = true;
            }
        } else {
            const mensajeError = await motivoDe(respuesta, "No se pudo cargar el listado trimestral.");
            if (numeroConsulta == ultimaConsultaFacturas) {
                fijar(mensajeError, { esError: true });
            }
        }
    } catch (error) {
        if (numeroConsulta == ultimaConsultaFacturas) {
            console.error("Error al cargar el listado trimestral", error);
            fijar("No se pudo conectar con el servidor.", { esError: true });
        }
    }
    return actualizada;
}

/** Añade una celda de texto a una fila. */
function agregarCelda(fila, texto, clases) {
    const celda = document.createElement("td");
    celda.textContent = texto;
    if (clases != null) {
        celda.className = clases;
    }
    fila.appendChild(celda);
}

function cerrarBusquedaClientes() {
    clearTimeout(esperaBusquedaCliente);
    // Una respuesta anterior ya no puede cambiar los resultados actuales.
    ultimaBusquedaCliente++;
    resultadosClientes.replaceChildren();
    mensajeBusquedaCliente.textContent = "";
}

async function buscarClientes() {
    const consulta = ++ultimaBusquedaCliente;
    const parametros = new URLSearchParams({ pagina: 0, tamano: 10, busqueda: busquedaCliente.value.trim() });
    mensajeBusquedaCliente.textContent = "Buscando…";
    try {
        const respuesta = await fetch(RUTA_CLIENTES + "?" + parametros);
        if (!respuesta.ok) {
            throw new Error("No se pudieron consultar los clientes");
        }
        const pagina = await respuesta.json();
        if (consulta == ultimaBusquedaCliente) {
            mostrarResultadosClientes(pagina);
        }
    } catch (error) {
        if (consulta == ultimaBusquedaCliente) {
            mensajeBusquedaCliente.textContent = "No se pudieron consultar los clientes. Modifica la búsqueda para reintentar.";
        }
    }
}

function mostrarResultadosClientes(pagina) {
    resultadosClientes.replaceChildren();
    for (const cliente of pagina.contenido) {
        const boton = document.createElement("button");
        boton.type = "button";
        boton.className = "list-group-item list-group-item-action";
        boton.textContent = cliente.nombre + " · " + cliente.nifCif;
        boton.addEventListener("click", () => seleccionarCliente(cliente));
        resultadosClientes.appendChild(boton);
    }
    if (pagina.contenido.length == 0) {
        mensajeBusquedaCliente.textContent = "Sin coincidencias.";
    } else if (pagina.haySiguiente) {
        mensajeBusquedaCliente.textContent = "Hay más resultados. Escribe más para concretar la búsqueda.";
    } else {
        mensajeBusquedaCliente.textContent = "Selecciona un cliente de los resultados.";
    }
}

function presentarAccionesCliente(seleccionado) {
    const boton = document.getElementById("botonAltaCliente");
    const acciones = document.getElementById("accionesClienteSeleccionado");
    const destino = seleccionado ? acciones : document.getElementById("zonaBusquedaCliente");
    if (boton.parentElement != destino) destino.appendChild(boton);
    acciones.classList.toggle("d-none", !seleccionado);
}

function seleccionarCliente(cliente) {
    cerrarBusquedaClientes();
    idClienteSeleccionado = cliente.idCliente;
    busquedaCliente.value = cliente.nombre;
    clienteSeleccionado.replaceChildren();
    for (const [indice, texto] of [cliente.nombre, cliente.nifCif, cliente.direccion,
        [cliente.codigoPostal, cliente.poblacion, cliente.provincia].filter(Boolean).join(" · "),
        [cliente.telefono, cliente.email].filter(Boolean).join(" · ")].entries()) {
        if (texto) {
            const linea = document.createElement("div");
            linea.className = indice == 0 ? "fw-semibold" : "small";
            linea.textContent = texto;
            clienteSeleccionado.appendChild(linea);
        }
    }
    presentarAccionesCliente(true);
    document.getElementById("zonaBusquedaCliente").classList.add("d-none");
    document.getElementById("botonCambiarCliente").classList.remove("d-none");
    mensajeBusquedaCliente.textContent = "";
    alertaFactura.limpiar();
    document.getElementById("botonCambiarCliente").focus();
}

function cambiarCliente() {
    cerrarBusquedaClientes();
    idClienteSeleccionado = null;
    clienteSeleccionado.textContent = "";
    busquedaCliente.value = "";
    presentarAccionesCliente(false);
    document.getElementById("zonaBusquedaCliente").classList.remove("d-none");
    document.getElementById("botonCambiarCliente").classList.add("d-none");
    mensajeBusquedaCliente.textContent = "Escribe al menos dos caracteres.";
    busquedaCliente.focus();
}

function mostrarAltaCliente() {
    cerrarBusquedaClientes();
    cerrarSugerenciasConceptos();
    altaClienteAbierta = true;
    // Ocultar conserva todos los campos y conceptos de la factura en el DOM.
    formularioFactura.classList.add("d-none");
    document.getElementById("pieFactura").classList.add("d-none");
    alertaFactura.limpiar();
    formularioClienteFactura.classList.remove("d-none");
    cambiarEstadoGuardado(false);
    formularioClienteFactura.elements.nombre.focus();
}

function volverAFactura() {
    if (!guardandoCliente) {
        altaClienteAbierta = false;
        formularioClienteFactura.classList.add("d-none");
        formularioFactura.classList.remove("d-none");
        document.getElementById("pieFactura").classList.remove("d-none");
        cambiarEstadoGuardado(false);
        if (idClienteSeleccionado != null) {
            document.getElementById("botonCambiarCliente").focus();
        } else {
            busquedaCliente.focus();
        }
    }
}

function validarClienteFactura() {
    for (const campo of formularioClienteFactura.querySelectorAll("input")) {
        campo.value = campo.value.trim();
    }
    const valido = validar(formularioClienteFactura);
    if (!valido) formularioClienteFactura.querySelector("input:invalid")?.focus();
    return valido;
}

async function guardarCliente() {
    if (!guardandoCliente && altaClienteAbierta && validarClienteFactura()) {
        const datos = {};
        for (const campo of ["nombre", "nifCif", "direccion", "codigoPostal", "poblacion", "provincia", "telefono", "email"]) {
            datos[campo] = formularioClienteFactura.elements[campo].value.trim();
        }
        for (const campo of ["codigoPostal", "telefono", "email"]) {
            if (!datos[campo]) datos[campo] = null;
        }
        guardandoCliente = true;
        camposNuevoCliente.disabled = true;
        botonGuardarCliente.textContent = "Guardando…";
        formularioClienteFactura.setAttribute("aria-busy", "true");
        mensajeAltaCliente.classList.add("d-none");
        for (const boton of botonesCerrarFactura) boton.disabled = true;
        let nuevoCliente = null;
        try {
            const respuesta = await fetch("/cliente", {
                method: "POST",
                headers: await cabecerasConSeguridad({ "Content-Type": "application/json" }),
                body: JSON.stringify(datos)
            });
            if (respuesta.status == 201) {
                const cliente = await respuesta.json();
                if (!Number.isInteger(cliente.idCliente) || cliente.idCliente <= 0) {
                    throw new Error("El servidor no devolvió un identificador válido");
                }
                nuevoCliente = cliente;
            } else if (respuesta.status == 400) {
                const problema = await respuesta.json().catch(() => ({}));
                const errores = problema.errores || {};
                const mensaje = "Revisa los datos del cliente.";
                for (const campo of Object.keys(datos)) {
                    if (errores && typeof errores[campo] == "string") {
                        marcarCampo(formularioClienteFactura.elements[campo], errores[campo]);
                    }
                }
                mostrarErrorAltaCliente(mensaje);
            } else if (respuesta.status == 409) {
                marcarCampo(formularioClienteFactura.elements.nifCif, "Ya existe un cliente con ese NIF/CIF.");
                mostrarErrorAltaCliente("Ya existe un cliente con ese NIF/CIF. Vuelve a la factura y búscalo.");
            } else {
                mostrarErrorAltaCliente("No se pudo confirmar el alta. Conservamos los datos; comprueba si el cliente se creó antes de reintentar.");
            }
        } catch (error) {
            mostrarErrorAltaCliente("No se pudo confirmar el alta con el servidor. Conservamos los datos; comprueba si el cliente se creó antes de reintentar.");
        } finally {
            guardandoCliente = false;
            camposNuevoCliente.disabled = false;
            botonGuardarCliente.textContent = "Guardar cliente";
            formularioClienteFactura.setAttribute("aria-busy", "false");
            for (const boton of botonesCerrarFactura) boton.disabled = false;
            formularioClienteFactura.querySelector(".is-invalid")?.focus();
        }
        if (nuevoCliente) {
            volverAFactura();
            seleccionarCliente(nuevoCliente);
            formularioClienteFactura.reset();
        }
    }
}

function mostrarErrorAltaCliente(texto) {
    mensajeAltaCliente.textContent = texto;
    mensajeAltaCliente.classList.remove("d-none");
    mensajeAltaCliente.focus();
}

function prepararAlta() {
    ultimaCargaBorrador++;
    // Sin esto, un intento fallido dejaría el modal en rojo la próxima vez que se abra. Va
    // aquí y no solo en el reset porque el reset de abajo solo se dispara al venir de editar.
    limpiarValidacion(formularioFactura);
    if (idFacturaEnEdicion != null) {
        formularioFactura.reset();
    }
    idFacturaEnEdicion = null;
    volverAlDetalle = false;
    formularioDisponible = true;
    campoEstado.disabled = false;
    document.getElementById("facturaModalLabel").textContent = "Dar de alta una factura";
    document.getElementById("ayudaNumeroFactura").textContent = "Pendiente de asignación";
    document.getElementById("fechaEmision").min = "1000-01-01";
    document.getElementById("fechaEmision").max = "9999-12-31";
    const fecha = document.getElementById("fechaEmision");
    if (!fecha.value) {
        const hoy = new Date();
        fecha.value = hoy.getFullYear() + "-" + String(hoy.getMonth() + 1).padStart(2, "0")
            + "-" + String(hoy.getDate()).padStart(2, "0");
    }
    cambiarEstadoGuardado(false);
}

/** Reutiliza el alta; una respuesta tardía no puede rellenar otro formulario. */
async function abrirBorrador(idFactura, desdeDetalle = false) {
    if (!guardandoFactura && !guardandoCliente) {
        const consulta = ++ultimaCargaBorrador;
        formularioFactura.reset();
        idFacturaEnEdicion = idFactura;
        volverAlDetalle = desdeDetalle;
        formularioDisponible = false;
        document.getElementById("facturaModalLabel").textContent = "Editar borrador";
        document.getElementById("ayudaNumeroFactura").textContent = "Cargando borrador…";
        cambiarEstadoGuardado(false);
        bootstrap.Modal.getOrCreateInstance(modalFactura).show();
        try {
            const respuesta = await fetch("/factura/" + idFactura + "/detalle");
            if (consulta == ultimaCargaBorrador) {
                if (respuesta.ok) {
                    const detalle = await respuesta.json();
                    if (consulta == ultimaCargaBorrador) {
                        const factura = detalle.factura;
                        if (factura.estado == "BORRADOR") {
                            seleccionarCliente({ ...detalle.cliente, idCliente: factura.idCliente });
                            const fecha = document.getElementById("fechaEmision");
                            const anio = /^[fF]-[0-9]{4}-[0-9]{4}$/.test(factura.numeroFactura)
                                ? factura.numeroFactura.substring(2, 6) : factura.fechaEmision.substring(0, 4);
                            fecha.min = anio + "-01-01";
                            fecha.max = anio + "-12-31";
                            fecha.value = factura.fechaEmision;
                            campoEstado.value = "BORRADOR";
                            campoEstado.disabled = false;
                            campoObservaciones.value = factura.observaciones ?? "";
                            for (const concepto of detalle.conceptos) {
                                anadirConcepto(concepto);
                            }
                            actualizarContadorObservaciones();
                            document.getElementById("ayudaNumeroFactura").textContent = factura.numeroFactura;
                            formularioDisponible = true;
                        } else {
                            mostrarErrorFormularioFactura("La factura ya no está en BORRADOR y no se puede editar.");
                        }
                    }
                } else {
                    mostrarErrorFormularioFactura(respuesta.status == 404 ? "No se encontró la factura." : "No se pudo cargar el borrador. Cierra y vuelve a intentarlo.");
                }
            }
        } catch (error) {
            if (consulta == ultimaCargaBorrador) {
                mostrarErrorFormularioFactura("No se pudo conectar con el servidor para cargar el borrador.");
            }
        } finally {
            if (consulta == ultimaCargaBorrador) {
                cambiarEstadoGuardado(false);
            }
        }
    }
}

/** Envía cabecera y conceptos en una sola petición, tanto al crear como al editar. */
async function guardarFactura() {
    if (!guardandoFactura && !altaClienteAbierta && formularioDisponible && validarFormularioFactura()) {
        const editando = idFacturaEnEdicion != null;
        const regresar = volverAlDetalle;
        const datosFactura = {
            idCliente: idClienteSeleccionado,
            fechaEmision: document.getElementById("fechaEmision").value,
            estado: campoEstado.value,
            observaciones: campoObservaciones.value.trim(),
            conceptos: recogerConceptos()
        };

        cambiarEstadoGuardado(true);
        alertaFactura.limpiar();
        let facturaGuardada = null;
        try {
            const ruta = editando ? "/factura/" + idFacturaEnEdicion + "/borrador" : RUTA_CREAR_FACTURA;
            const respuesta = await fetch(ruta, {
                method: editando ? "PUT" : "POST",
                headers: await cabecerasConSeguridad({ "Content-Type": "application/json" }),
                body: JSON.stringify(datosFactura)
            });

            if (respuesta.ok) {
                facturaGuardada = await respuesta.json();
                formularioFactura.reset();
            } else {
                // No mostramos cuerpos de error que puedan contener SQL o trazas del servidor.
                if (respuesta.status == 400) {
                    mostrarErrorFormularioFactura(editando
                        ? "Revisa los conceptos y la fecha: debe conservar el año del número y el estado debe ser BORRADOR o EMITIDA."
                        : "El servidor ha rechazado los datos. Revisa los campos y los importes de los conceptos.");
                } else if (respuesta.status == 404 && editando) {
                    mostrarErrorFormularioFactura("No se encontró la factura. Conservamos los datos del formulario.");
                } else if (respuesta.status == 409) {
                    mostrarErrorFormularioFactura(editando
                        ? "No se pudo guardar: la factura puede haber dejado de ser BORRADOR o el cliente ya no estar disponible. Conservamos tus cambios."
                        : "No se pudo asignar un número de factura. Puede haberse alcanzado el límite anual o coincidir con otras altas. Revisa antes de reintentar.");
                } else {
                    mostrarErrorFormularioFactura("El servidor no pudo completar el guardado. Conservamos tus datos; comprueba si la factura se guardó antes de reintentar.");
                }
            }
        } catch (error) {
            console.error("Error al guardar la factura", error);
            mostrarErrorFormularioFactura("No se pudo conectar con el servidor. Comprueba si la factura se guardó antes de volver a intentarlo.");
        } finally {
            cambiarEstadoGuardado(false);
        }
        if (facturaGuardada) {
            bootstrap.Modal.getOrCreateInstance(modalFactura).hide();
            if (regresar) {
                window.location.href = "factura-imprimir.html?idFactura=" + facturaGuardada.idFactura;
            } else {
                const consulta = ultimaConsultaFacturas + 1;
                const actualizada = await (listadoTrimestralActivo ? cargarListadoTrimestral() : cargarFacturas());
                if (consulta == ultimaConsultaFacturas) {
                    // La confirmación de la factura es un evento y se borra sola. Pero si el
                    // listado no ha podido refrescarse, lo que se está viendo ya no es lo que
                    // hay en la base de datos, y eso SIGUE siendo verdad hasta que se vuelva a
                    // consultar: ese caso se fija en vez de anunciarse, o el aviso se iría a
                    // los cinco segundos llevándose la instrucción con él.
                    const confirmacion = "Factura " + facturaGuardada.numeroFactura
                        + (editando ? " actualizada. Total confirmado: " : " creada. Total confirmado: ")
                        + formatearImporte(facturaGuardada.total);

                    if (actualizada) {
                        anunciar(confirmacion + ".", { visible: true });
                    } else {
                        fijar(confirmacion + ". No se pudo actualizar el listado; vuelve a consultarlo.",
                            { esError: true });
                    }
                }
            }
        }
    }
}

function cambiarEstadoGuardado(guardando) {
    guardandoFactura = guardando;
    if (guardando) {
        cerrarBusquedaClientes();
        cerrarSugerenciasConceptos();
    }
    botonGuardarFactura.disabled = guardando || !formularioDisponible || altaClienteAbierta;
    botonGuardarFactura.textContent = guardando ? "Guardando…" : (idFacturaEnEdicion == null ? "Guardar factura" : "Guardar cambios");
    camposFactura.disabled = guardando || !formularioDisponible || altaClienteAbierta;
    formularioFactura.setAttribute("aria-busy", String(guardando));
    for (const boton of botonesCerrarFactura) {
        boton.disabled = guardando;
    }
}

function mostrarErrorFormularioFactura(texto) {
    alertaFactura.mostrarError(texto);
}

function actualizarContadorObservaciones() {
    contadorObservaciones.textContent = campoObservaciones.value.length + " / " + campoObservaciones.maxLength + " caracteres";
}

function establecerIvaConcepto(concepto, porcentaje) {
    const selector = concepto.querySelector('[name="porcentajeIva"]');
    const anterior = selector.querySelector("[data-historico]");
    if (anterior) anterior.remove();
    const valor = porcentaje == null ? "" : String(porcentaje);
    // Mantiene los porcentajes históricos sin convertirlos a uno de los cuatro tipos nuevos.
    if (valor != "" && !Array.from(selector.options).some(opcion => opcion.value == valor)) {
        const opcion = document.createElement("option");
        opcion.value = valor;
        opcion.textContent = valor + " % (guardado)";
        opcion.dataset.historico = "true";
        selector.appendChild(opcion);
    }
    selector.value = valor;
}

function anadirConcepto(datos = null) {
    const concepto = plantillaConcepto.content.firstElementChild.cloneNode(true);
    const campoTotal = concepto.querySelector('[name="totalConcepto"]');
    const campoPrecio = concepto.querySelector('[name="precioUnitario"]');
    const ayudaTotal = concepto.querySelector(".ayuda-total-concepto");
    ayudaTotal.id = "ayuda-total-concepto-" + ++siguienteAyudaTotal;
    campoTotal.setAttribute("aria-describedby", ayudaTotal.id);
    concepto.dataset.entradaPrincipal = "precioUnitario";
    if (datos) {
        for (const campo of ["descripcion", "cantidad", "precioUnitario", "descuento"]) {
            concepto.querySelector('[name="' + campo + '"]').value = datos[campo] ?? "";
        }
        establecerIvaConcepto(concepto, datos.porcentajeIva);
    }
    prepararSugerenciasConcepto(concepto);

    function actualizarPrecioDesdeTotal() {
        campoTotal.setCustomValidity("");
        ayudaTotal.textContent = "";
        const cantidad = concepto.querySelector('[name="cantidad"]');
        const descuento = concepto.querySelector('[name="descuento"]');
        const iva = concepto.querySelector('[name="porcentajeIva"]');
        if (campoTotal.value == "") {
            campoPrecio.value = "";
        } else if (campoTotal.checkValidity() && cantidad.checkValidity()
                && descuento.checkValidity() && iva.checkValidity()) {
            const totalSolicitado = Math.round(Number(campoTotal.value) * 100);
            const divisor = Number(cantidad.value) * (1 - Number(descuento.value) / 100)
                * (1 + Number(iva.value) / 100);
            if (divisor == 0 && totalSolicitado > 0) {
                campoTotal.setCustomValidity("Con un descuento del 100 %, el total debe ser 0 €.");
                campoPrecio.value = "";
            } else {
                const precioCentimos = divisor == 0 ? 0 : Math.round(totalSolicitado / divisor);
                if (precioCentimos > 9999999999) {
                    campoTotal.setCustomValidity("El precio unitario necesario supera el máximo permitido.");
                    campoPrecio.value = "";
                } else {
                    campoPrecio.value = (precioCentimos / 100).toFixed(2);
                    const importes = calcularImportesConcepto(Number(cantidad.value), precioCentimos,
                        Number(descuento.value), Number(iva.value));
                    const totalReal = importes.baseCentimos + importes.impuestoCentimos;
                    if (totalReal > 9999999999) {
                        campoTotal.setCustomValidity("El total calculado supera el máximo permitido.");
                    } else if (totalReal != totalSolicitado) {
                        ayudaTotal.textContent = "Con el precio unitario calculado, el total será "
                            + formatearImporte(totalReal / 100) + ".";
                    }
                }
            }
        }
        if (campoTotal.validity.customError) {
            ayudaTotal.textContent = campoTotal.validationMessage;
        }
        ayudaTotal.classList.toggle("text-danger", campoTotal.validity.customError);
        actualizarConceptos(concepto);
    }

    concepto.querySelector(".eliminar-concepto").addEventListener("click", function () {
        concepto.dispatchEvent(new Event("cerrar-sugerencias"));
        concepto.remove();
        actualizarConceptos();
        botonAnadirConcepto.focus();
    });
    concepto.addEventListener("input", function (evento) {
        concepto.querySelector('[name="descripcion"]').setCustomValidity("");
        if (evento.target == campoTotal) {
            concepto.dataset.entradaPrincipal = "totalConcepto";
            actualizarPrecioDesdeTotal();
        } else if (evento.target == campoPrecio) {
            concepto.dataset.entradaPrincipal = "precioUnitario";
            campoTotal.setCustomValidity("");
            ayudaTotal.textContent = "";
            ayudaTotal.classList.remove("text-danger");
            actualizarConceptos();
        } else if (concepto.dataset.entradaPrincipal == "totalConcepto" &&
                ["cantidad", "descuento", "porcentajeIva"].includes(evento.target.name)) {
            actualizarPrecioDesdeTotal();
        } else {
            actualizarConceptos(concepto.dataset.entradaPrincipal == "totalConcepto" ? concepto : null);
        }
    });
    campoTotal.addEventListener("change", function () {
        if (campoTotal.validity.valid && campoTotal.value != "" && campoPrecio.value != "") {
            const totalSolicitado = Math.round(Number(campoTotal.value) * 100);
            const precioCentimos = Math.round(Number(campoPrecio.value) * 100);
            const importes = calcularImportesConcepto(
                Number(concepto.querySelector('[name="cantidad"]').value), precioCentimos,
                Number(concepto.querySelector('[name="descuento"]').value),
                Number(concepto.querySelector('[name="porcentajeIva"]').value));
            const totalReal = importes.baseCentimos + importes.impuestoCentimos;
            campoTotal.value = (totalReal / 100).toFixed(2);
            ayudaTotal.textContent = totalReal == totalSolicitado ? ""
                : "Total ajustado por el redondeo del precio unitario.";
        }
    });
    contenedorConceptos.appendChild(concepto);
    actualizarConceptos();
    if (!datos) concepto.querySelector('[name="descripcion"]').focus();
}

function cerrarSugerenciasConceptos() {
    for (const concepto of contenedorConceptos.children) {
        concepto.dispatchEvent(new Event("cerrar-sugerencias"));
    }
}

/** Cada línea mantiene su consulta y selección, sin compartir resultados con otras. */
function prepararSugerenciasConcepto(concepto) {
    const descripcion = concepto.querySelector('[name="descripcion"]');
    const lista = concepto.querySelector(".sugerencias-concepto");
    lista.id = "sugerencias-concepto-" + ++siguienteListaSugerencias;
    descripcion.setAttribute("aria-controls", lista.id);
    let consultaActual = 0;
    let espera = null;
    let controlador = null;
    let sugerencias = [];
    let seleccion = -1;

    function cerrar() {
        consultaActual++;
        clearTimeout(espera);
        espera = null;
        if (controlador) {
            controlador.abort();
            controlador = null;
        }
        sugerencias = [];
        seleccion = -1;
        lista.replaceChildren();
        lista.classList.add("d-none");
        descripcion.setAttribute("aria-expanded", "false");
        descripcion.removeAttribute("aria-activedescendant");
    }

    function elegir(sugerencia) {
        if (!guardandoFactura) {
            descripcion.value = sugerencia.descripcion;
            descripcion.setCustomValidity("");
            for (const campo of ["precioUnitario", "descuento"]) {
                // Un valor histórico ausente queda pendiente de completar, no se inventa un cero.
                concepto.querySelector('[name="' + campo + '"]').value = sugerencia[campo] ?? "";
            }
            establecerIvaConcepto(concepto, sugerencia.porcentajeIva);
            cerrar();
            concepto.dataset.entradaPrincipal = "precioUnitario";
            concepto.querySelector('[name="totalConcepto"]').setCustomValidity("");
            concepto.querySelector(".ayuda-total-concepto").textContent = "";
            concepto.querySelector(".ayuda-total-concepto").classList.remove("text-danger");
            actualizarConceptos();
            descripcion.focus();
        }
    }

    function mostrar() {
        for (const [indice, sugerencia] of sugerencias.entries()) {
            const opcion = document.createElement("div");
            opcion.id = lista.id + "-" + indice;
            opcion.setAttribute("role", "option");
            opcion.setAttribute("aria-selected", "false");
            opcion.textContent = sugerencia.descripcion;
            const detalle = document.createElement("small");
            detalle.className = "d-block";
            detalle.textContent = (sugerencia.precioUnitario == null ? "Precio pendiente" : formatearImporte(sugerencia.precioUnitario))
                + " · IVA " + (sugerencia.porcentajeIva == null ? "pendiente" : sugerencia.porcentajeIva + " %");
            opcion.appendChild(detalle);
            opcion.addEventListener("pointerdown", evento => evento.preventDefault());
            opcion.addEventListener("click", () => elegir(sugerencia));
            lista.appendChild(opcion);
        }
        lista.classList.toggle("d-none", sugerencias.length == 0);
        descripcion.setAttribute("aria-expanded", String(sugerencias.length > 0));
    }

    descripcion.addEventListener("input", function () {
        cerrar();
        const texto = descripcion.value.trim();
        const numeroConsulta = consultaActual;
        if (texto.length >= 2 && !guardandoFactura) {
            espera = setTimeout(async function () {
                espera = null;
                controlador = new AbortController();
                try {
                    const parametros = new URLSearchParams({ texto, limite: 8 });
                    const respuesta = await fetch(RUTA_SUGERENCIAS_CONCEPTOS + "?" + parametros, { signal: controlador.signal });
                    const resultados = respuesta.ok ? await respuesta.json() : [];
                    if (numeroConsulta == consultaActual && concepto.isConnected
                        && document.activeElement == descripcion && !guardandoFactura) {
                        sugerencias = Array.isArray(resultados) ? resultados.slice(0, 8) : [];
                        mostrar();
                    }
                } catch (error) {
                    // Las sugerencias son opcionales: un fallo no impide el alta manual.
                    if (numeroConsulta == consultaActual) {
                        cerrar();
                    }
                }
            }, 250);
        }
    });
    descripcion.addEventListener("keydown", function (evento) {
        if (evento.key == "Escape" && (sugerencias.length > 0 || espera != null || controlador != null)) {
            evento.preventDefault();
            evento.stopPropagation();
            cerrar();
        } else if (sugerencias.length > 0) {
            if (evento.key == "ArrowDown" || evento.key == "ArrowUp") {
                evento.preventDefault();
                seleccion = evento.key == "ArrowDown" ? (seleccion + 1) % sugerencias.length
                    : (seleccion <= 0 ? sugerencias.length : seleccion) - 1;
                for (const [indice, opcion] of Array.from(lista.children).entries()) {
                    opcion.setAttribute("aria-selected", String(indice == seleccion));
                }
                descripcion.setAttribute("aria-activedescendant", lista.children[seleccion].id);
                lista.children[seleccion].scrollIntoView({ block: "nearest" });
            } else if (evento.key == "Enter") {
                evento.preventDefault();
                if (seleccion >= 0) {
                    elegir(sugerencias[seleccion]);
                }
            }
        }
    });
    descripcion.addEventListener("blur", cerrar);
    concepto.addEventListener("cerrar-sugerencias", cerrar);
}

function recogerConceptos() {
    const conceptos = [];
    for (const concepto of contenedorConceptos.children) {
        conceptos.push({
            descripcion: concepto.querySelector('[name="descripcion"]').value.trim(),
            cantidad: Number(concepto.querySelector('[name="cantidad"]').value),
            precioUnitario: Number(concepto.querySelector('[name="precioUnitario"]').value),
            descuento: Number(concepto.querySelector('[name="descuento"]').value),
            porcentajeIva: Number(concepto.querySelector('[name="porcentajeIva"]').value)
        });
    }
    return conceptos;
}

function validarFormularioFactura() {
    if (!Number.isInteger(idClienteSeleccionado) || idClienteSeleccionado <= 0) {
        mostrarErrorFormularioFactura("Selecciona un cliente de los resultados.");
        busquedaCliente.focus();
        return false;
    }
    for (const concepto of contenedorConceptos.children) {
        const descripcion = concepto.querySelector('[name="descripcion"]');
        descripcion.setCustomValidity(descripcion.value.trim() ? "" : "Escribe una descripción.");
    }
    let valido = validar(formularioFactura);
    if (valido && campoEstado.value == "EMITIDA" && contenedorConceptos.children.length == 0) {
        mostrarErrorFormularioFactura("Para emitir la factura, añade al menos un concepto.");
        valido = false;
    }
    return valido;
}

function calcularImportesConcepto(cantidad, precioCentimos, descuento, iva) {
    const descuentoCentesimas = Math.round(descuento * 100);
    const ivaCentesimas = Math.round(iva * 100);
    const baseCentimos = Math.round(cantidad * precioCentimos * (10000 - descuentoCentesimas) / 10000);
    const impuestoCentimos = Math.round(baseCentimos * ivaCentesimas / 10000);
    return { baseCentimos, impuestoCentimos };
}

/** Solo ayuda visual: estos importes no se incluyen en la petición de alta. */
function actualizarConceptos(conceptoSinSincronizar = null) {
    let subtotalCentimos = 0;
    let ivaCentimos = 0;
    const conceptos = recogerConceptos();
    for (let indice = 0; indice < conceptos.length; indice++) {
        const concepto = conceptos[indice];
        // Céntimos y centésimas de porcentaje evitan restas decimales como 2.30 - 5 %.
        const precioCentimos = Math.round(concepto.precioUnitario * 100);
        const { baseCentimos, impuestoCentimos } = calcularImportesConcepto(
            concepto.cantidad, precioCentimos, concepto.descuento, concepto.porcentajeIva);
        subtotalCentimos += baseCentimos;
        ivaCentimos += impuestoCentimos;
        const ficha = contenedorConceptos.children[indice];
        if (ficha != conceptoSinSincronizar) {
            ficha.querySelector('[name="totalConcepto"]').value = ((baseCentimos + impuestoCentimos) / 100).toFixed(2);
        }
        ficha.querySelector("legend").textContent = "Concepto " + (indice + 1);
        ficha.querySelector(".eliminar-concepto").setAttribute("aria-label", "Eliminar concepto " + (indice + 1));
        ficha.querySelector(".base-concepto").textContent = formatearImporte(baseCentimos / 100);
        ficha.querySelector(".iva-concepto").textContent = formatearImporte(impuestoCentimos / 100);
    }
    const destinoAnadir = document.getElementById(conceptos.length > 0 ? "accionesTrasConceptos" : "cabeceraConceptos");
    if (botonAnadirConcepto.parentElement != destinoAnadir) destinoAnadir.appendChild(botonAnadirConcepto);
    sinConceptos.classList.toggle("d-none", conceptos.length > 0);
    inputSubtotal.textContent = formatearImporte(subtotalCentimos / 100);
    inputIva.textContent = formatearImporte(ivaCentimos / 100);
    inputTotal.textContent = formatearImporte((subtotalCentimos + ivaCentimos) / 100);
}

function formatearFecha(fecha) {
    const partes = fecha.split("-");
    return partes[2] + "/" + partes[1] + "/" + partes[0];
}

function formatearImporte(importe) {
    return Number(importe).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

document.getElementById("botonBuscar").addEventListener("click", cargarFacturas);
document.getElementById("botonLimpiar").addEventListener("click", function () {
    inputBusqueda.value = "";
    contenedorBuscador.classList.remove("expandido");
    cargarFacturas();
});
formularioFactura.addEventListener("submit", function (evento) {
    evento.preventDefault();
    guardarFactura();
});
campoObservaciones.addEventListener("input", actualizarContadorObservaciones);
formularioFactura.addEventListener("reset", function () {
    cerrarBusquedaClientes();
    cambiarCliente();
    formularioClienteFactura.reset();
    mensajeAltaCliente.classList.add("d-none");
    volverAFactura();
    limpiarValidacion(formularioFactura);
    cerrarSugerenciasConceptos();
    contenedorConceptos.replaceChildren();
    actualizarConceptos();
    alertaFactura.limpiar();
    // El evento reset se recibe antes de que el navegador vacíe los campos.
    setTimeout(actualizarContadorObservaciones, 0);
});
modalFactura.addEventListener("hide.bs.modal", function (evento) {
    if (guardandoFactura || guardandoCliente) {
        evento.preventDefault();
    } else {
        cerrarBusquedaClientes();
        volverAFactura();
        ultimaCargaBorrador++;
        cerrarSugerenciasConceptos();
    }
});
document.addEventListener("pointerdown", function (evento) {
    for (const concepto of contenedorConceptos.children) {
        if (!concepto.contains(evento.target)) {
            concepto.dispatchEvent(new Event("cerrar-sugerencias"));
        }
    }
});
document.getElementById("botonListarTrimestre").addEventListener("click", cargarListadoTrimestral);
botonAnadirConcepto.addEventListener("click", () => anadirConcepto());
document.getElementById("botonAltaFactura").addEventListener("click", prepararAlta);
inputBusqueda.addEventListener("focus", function () {
    contenedorBuscador.classList.add("expandido");
});
// Se recoge después del clic para no desplazar el botón antes de activarlo.
document.addEventListener("click", function (evento) {
    if (!contenedorBuscador.contains(evento.target) && inputBusqueda.value.trim() == "") {
        contenedorBuscador.classList.remove("expandido");
    }
});
inputBusqueda.addEventListener("keydown", function (evento) {
    if (evento.key == "Enter") {
        cargarFacturas();
    } else if (evento.key == "Tab" && inputBusqueda.value.trim() == "") {
        contenedorBuscador.classList.remove("expandido");
    }
});

inputAnio.value = new Date().getFullYear();
actualizarContadorObservaciones();
busquedaCliente.addEventListener("input", function () {
    cerrarBusquedaClientes();
    idClienteSeleccionado = null;
    clienteSeleccionado.textContent = "";
    presentarAccionesCliente(false);
    document.getElementById("zonaBusquedaCliente").classList.remove("d-none");
    document.getElementById("botonCambiarCliente").classList.add("d-none");
    mensajeBusquedaCliente.textContent = "Escribe al menos dos caracteres.";
    if (busquedaCliente.value.trim().length >= 2) {
        mensajeBusquedaCliente.textContent = "Buscando…";
        esperaBusquedaCliente = setTimeout(buscarClientes, 300);
    }
});
busquedaCliente.addEventListener("keydown", function (evento) {
    if (evento.key == "Enter") evento.preventDefault();
    if (evento.key == "Escape") {
        evento.stopPropagation();
        cerrarBusquedaClientes();
    }
});
document.getElementById("botonCambiarCliente").addEventListener("click", cambiarCliente);
document.getElementById("botonAltaCliente").addEventListener("click", mostrarAltaCliente);
document.getElementById("botonVolverFactura").addEventListener("click", volverAFactura);
for (const campo of formularioClienteFactura.querySelectorAll("input")) {
    const mensajeBase = campo.nextElementSibling.textContent;
    campo.addEventListener("input", function () {
        limpiarCampo(campo, mensajeBase);
    });
    formularioClienteFactura.addEventListener("reset", function () {
        limpiarCampo(campo, mensajeBase);
    });
}
formularioClienteFactura.addEventListener("reset", function () {
    limpiarValidacion(formularioClienteFactura);
});
formularioClienteFactura.addEventListener("submit", function (evento) {
    evento.preventDefault();
    guardarCliente();
});
cargarFacturas();
const identificadorEdicion = Number(new URLSearchParams(window.location.search).get("editar"));
if (Number.isInteger(identificadorEdicion) && identificadorEdicion > 0) {
    abrirBorrador(identificadorEdicion, true);
}
