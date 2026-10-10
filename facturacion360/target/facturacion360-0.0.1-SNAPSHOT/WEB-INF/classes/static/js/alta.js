/**
 * @file Dar de alta un cliente en la propia tabla.
 *
 * Capa 8. No pasa por el despliegue: ese camino gira alrededor de una fila con id, y aqui no hay ni fila ni id.
 *
 * @author AngelDanielC0des
 */

import { API_CLIENTE, DURACION_PLEGADO_MS, EVENTO_TABLA_REPINTADA } from "./config.js";
import { btnAnadirCliente, columnasVisibles, cuerpoTabla, plantillaDespliegue } from "./dom.js";
import {
    altaAbierta,
    clientesEnPagina,
    hayCriteriosActivos,
    marcarAltaAbierta,
} from "./estado.js";
import { enviarJson, esCancelacion } from "./api.js";
import { anunciar, fijar } from "./avisos.js";
import { filaViva } from "./fila.js";
import {
    cuerpoPeticion,
    hayCambios,
    limpiarErrores,
    mostrarErrorGuardado,
} from "./formulario.js";
import { validar } from "./validacion.js";
import { preguntarDescarte } from "./dialogo.js";
import { pintarPanelAlta } from "./paneles.js";
import { cargarClientes } from "./listado.js";

/**
 * Pregunta antes de cerrar un alta con algo escrito.
 *
 * Comparte el diálogo con la edición, y también su regla: si el formulario está como nació
 * —todo en blanco— no hay nada que descartar y no se molesta al usuario.
 *
 * @return {Promise<boolean>} si se puede cerrar
 */
export async function confirmarDescarteAlta() {
    const formulario = formularioAlta();
    if (!formulario || !hayCambios(formulario)) return true;

    return preguntarDescarte();
}

/** La fila del alta si está en el documento ahora mismo, o null. */
function filaAlta() {
    return cuerpoTabla.querySelector("tr.fila-alta");
}

/** El formulario del alta si está en el documento ahora mismo, o null. */
function formularioAlta() {
    return cuerpoTabla.querySelector(".formulario-alta");
}

/**
 * Abre el alta arriba del todo de la tabla, o lleva el foco a la que ya hubiera.
 *
 * No lleva fila de cliente encima, a diferencia del detalle y de la edición: un cliente que
 * todavía no existe no tiene nombre ni CIF que enseñar, y los tres botones de acción no
 * tendrían a qué apuntar.
 */
export function abrirAlta() {
    // Pulsar dos veces no puede dejar dos formularios: el segundo se llevaría el sufijo de los
    // id del primero y los <label for> apuntarían al que no es.
    //
    // Se pregunta por el ESTADO y no por si el formulario está en el documento, y esa es la
    // diferencia que importa: al cerrar, la fila se queda 250 ms plegándose, así que hay una
    // ventana en la que el formulario sigue ahí pero el alta ya no está abierta. Mirando el
    // documento, ese caso se confundía con "ya hay una abierta", el botón llevaba el foco a un
    // formulario que estaba desapareciendo y el usuario se quedaba sin nada.
    if (altaAbierta) {
        formularioAlta()?.elements.nombre.focus();
        return;
    }

    // Y si quedaba una plegándose, se retira YA: dos filas de alta a la vez repetirían los id
    // de los campos durante ese cuarto de segundo.
    retirarFilaAlta();

    marcarAltaAbierta({ borrador: null });
    insertarFilaAlta(null, { animar: true, enfocar: true });
}

/**
 * Monta la fila del alta con el formulario dentro y la pone arriba del todo.
 *
 * Inserta ella misma en vez de devolver la fila para que quien llame la coloque, y no es un
 * detalle: focus() sobre un elemento que todavía no está en el documento no hace nada, así que
 * el orden "pintar, insertar, enfocar" tiene que estar garantizado en un solo sitio. En la
 * edición no se plantea el problema porque allí el panel se inserta antes de pintarlo.
 *
 * @param {Object|null} borrador lo que se llevara tecleado, al reabrirla tras un repintado
 * @param {Object} opciones
 * @param {boolean} opciones.animar si se despliega con transición
 * @param {boolean} opciones.enfocar si se lleva el cursor al primer campo
 */
function insertarFilaAlta(borrador, { animar, enfocar }) {
    const fila = plantillaDespliegue.content.firstElementChild.cloneNode(true);

    // Comparte plantilla y clases con el despliegue de una fila —el envoltorio que anima el
    // alto y el recuadro de color son los mismos—, y añade fila-alta, que es por donde la
    // reconocen el manejador de clics y el repintado.
    fila.classList.add("fila-alta", "modo-alta");
    fila.querySelector("td").colSpan = columnasVisibles();

    // Se pinta SIN foco y se pide después de insertar, por lo dicho arriba.
    pintarPanelAlta(fila.querySelector(".despliegue-contenido"), borrador, false);
    cuerpoTabla.prepend(fila);

    if (enfocar) {
        fila.querySelector(".formulario-alta").elements.nombre.focus();
    }

    // Igual que en obtenerPanel: la clase que lo abre va en el frame siguiente, porque puesta
    // a la vez que se inserta el navegador no llega a ver dos estados y no hay transición.
    if (animar) {
        requestAnimationFrame(() => fila.classList.add("abierto"));
    } else {
        fila.classList.add("abierto");
    }
}

/**
 * Cierra el alta y olvida lo escrito.
 *
 * @param {boolean} devolverElFoco si el foco vuelve al botón de "Añadir Cliente". Al cancelar
 *        sí: el botón que se acaba de pulsar desaparece y el foco se iría al principio de la
 *        página. Tras guardar no, porque de eso se encarga el repintado.
 */
export function cerrarAlta({ devolverElFoco = true } = {}) {
    marcarAltaAbierta(null);

    const fila = filaAlta();
    if (!fila) return;

    fila.classList.remove("abierto");

    // El identificador se guarda en la propia fila para poder cancelarlo: si se vuelve a pulsar
    // "Añadir Cliente" antes de que termine el plegado, hay que retirarla en ese momento y no
    // dejar que el temporizador la borre después, cuando ya habría otra en su sitio. Es lo
    // mismo que hace obtenerPanel con el panel de una fila.
    fila.dataset.temporizadorCierre = setTimeout(() => fila.remove(), DURACION_PLEGADO_MS);

    if (devolverElFoco) {
        btnAnadirCliente.focus();
    }
}

/**
 * Retira del documento la fila del alta que estuviera plegándose, cancelando su borrado
 * programado.
 *
 * Sin cancelar el temporizador no basta con quitarla: el que quedó pendiente se dispararía
 * 250 ms después sobre un nodo que ya no está, y aunque eso no da error, deja el código
 * dependiendo de que ese remove() no encuentre nada.
 */
function retirarFilaAlta() {
    const fila = filaAlta();
    if (!fila) return;

    clearTimeout(Number(fila.dataset.temporizadorCierre));
    fila.remove();
}

/**
 * Vuelve a poner el alta arriba después de que la tabla se repinte.
 *
 * Se llama desde los DOS sitios que vacían el <tbody>, pintarFilas y mostrarMensaje: buscar
 * algo que no existe también borra la tabla, y sin esto el alta desaparecía justo ahí.
 *
 * Sin animar y sin robar el foco, por lo mismo que reabrirDespliegues: el repintado suele
 * venir de que el usuario está escribiendo en el buscador, y llevarle el cursor al formulario
 * lo sacaría de donde está.
 */
function reabrirAlta() {
    if (!altaAbierta) return;

    insertarFilaAlta(altaAbierta.borrador, { animar: false, enfocar: false });
}

/**
 * Manda el cliente nuevo al backend y actúa según lo que responda.
 *
 * Es la hermana de guardarEdicion: mismo guion —validar en el navegador, desactivar el botón,
 * enviar y contar el resultado— con POST en vez de PUT y sin id en la URL, porque lo asigna
 * la base de datos.
 *
 * @param {HTMLFormElement} formulario el formulario del alta
 */
export async function guardarCliente(formulario) {
    limpiarErrores(formulario);

    // Las restricciones del HTML son las mismas que valida el backend, así que el navegador
    // corta aquí lo que el servidor rechazaría con un 400 y nos ahorramos la petición.
    if (!validar(formulario)) return;

    const boton = formulario.querySelector(".btn-guardar");
    boton.disabled = true;   // sin esto, dos clics seguidos crean dos clientes

    // Se lee ANTES de enviar: el formulario desaparece al cerrar el alta, y después del await
    // ya no habría de dónde sacarlo.
    const nifCreado = formulario.elements.nifCif.value.trim();

    try {
        const { estado, errores } = await enviarJson("alta", "POST", API_CLIENTE, cuerpoPeticion(formulario));

        if (estado === 201) {
            cerrarAlta({ devolverElFoco: false });
            avisarClienteCreado(nifCreado);
            return;
        }

        contarErrorAlta(estado, errores);
    } catch (error) {
        if (esCancelacion(error)) return;
        console.error("No se pudo crear el cliente:", error);
        contarErrorAlta(0);
    } finally {
        // El botón, el vivo: si la tabla se repintó mientras viajaba la petición, el que
        // teníamos ya no está y el nuevo nace habilitado de todos modos.
        const botonVivo = formularioAlta()?.querySelector(".btn-guardar");
        if (botonVivo) botonVivo.disabled = false;
    }
}

/**
 * Cuenta un alta que no ha salido bien, en el formulario que esté en pantalla AHORA.
 *
 * Misma regla que contarErrorGuardado: el formulario desde el que se pulsó Guardar puede haber
 * desaparecido mientras viajaba la petición, y escribir el error en él no falla, simplemente
 * no lo lee nadie. El 404 de mostrarErrorGuardado no puede darse aquí —no hay ningún cliente
 * que pueda haber sido borrado— y por eso no se contempla.
 *
 * @param {number} estado el código HTTP (0 si ni siquiera hubo respuesta)
 */
function contarErrorAlta(estado, errores) {
    const formulario = formularioAlta();

    if (formulario) {
        mostrarErrorGuardado(formulario, estado, errores);
        return;
    }

    fijar("No se pudo crear el cliente. Vuelve a intentarlo.",
        { esError: true });
}

/**
 * Refresca la tabla tras crear un cliente y cuenta si se puede ver o no.
 *
 * Es lo que resuelve la pregunta incómoda de "lo he creado, ¿dónde está?". Con el orden por
 * defecto sale el primero: fecha_alta es una fecha SIN hora, así que todos los de hoy empatan
 * y desempata el idcliente más alto, que es el recién creado. Pero con el orden invertido se
 * va a la última página, ordenando por nombre cae donde le toque, y con un filtro de provincia
 * que no cumpla no sale en ninguna.
 *
 * Por eso se pide la página 0 —donde estará si el orden es el de siempre— y después se mira si
 * de verdad ha salido. Si no, se dice por qué en vez de dejar al usuario buscándolo.
 *
 * Se busca por el NIF/CIF y no por el id porque enviarJson no devuelve el cuerpo de la
 * respuesta —solo el código y los errores por campo—, y ensancharlo para que a veces
 * devolviera también el cuerpo dejaría a la función con dos formas de retorno según un
 * parámetro. El NIF vale igual de bien: es único —por eso el backend contesta 409 cuando se
 * repite— y es un dato que el usuario acaba de escribir.
 *
 * @param {string} nifCreado el NIF/CIF con el que se ha creado el cliente
 */
async function avisarClienteCreado(nifCreado) {
    // La tabla se pide desde aquí y no con el evento clientes:cambiaron porque hay que esperar
    // a que termine para poder mirar si el cliente está: el evento no devuelve nada que esperar.
    await cargarClientes(0);

    const creado = [...clientesEnPagina.values()].find((c) => c.nifCif === nifCreado);

    if (creado) {
        anunciar("Cliente creado.", { visible: true });

        // El foco, a su fila. Es el mismo mecanismo que usa el guardado de la edición, salvo
        // que aquí la tabla ya está pintada, así que se coloca directamente.
        filaViva(creado.idCliente)?.querySelector(".btn-editar")?.focus();
        return;
    }

    // Está creado, pero no se ve. Decirlo importa: si no, parece que no se ha guardado.
    const porFiltros = hayCriteriosActivos();
    anunciar(porFiltros
        ? "Cliente creado, pero no se ve porque no cumple los filtros que tienes puestos."
        : "Cliente creado. Con este orden no aparece en la primera página.",
        { visible: true });
}

// El alta se rehace sola cada vez que la tabla se repinta: el repintado destruye su fila,
// porque vive dentro del <tbody> que se sustituye entero.
document.addEventListener(EVENTO_TABLA_REPINTADA, reabrirAlta);
