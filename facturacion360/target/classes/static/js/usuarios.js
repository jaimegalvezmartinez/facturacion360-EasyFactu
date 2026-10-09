/**
 * @file El panel de administración de cuentas: quién entra, con qué rol y con qué contraseña.
 *
 * No importa api.js (sí seguridad.js y problema.js) por el motivo que ya salió en sesion.js:
 * api.js arrastra dom.js, que al cargarse busca "#tabla-clientes" y aquí no hay ninguna tabla
 * de clientes. Esta pantalla trae la suya (#cuerpo-usuarios) y los dos archivos nunca se
 * cargan a la vez.
 *
 * <h2>Lo que NO decide esta pantalla</h2>
 * <p>Si quien está dentro puede usar el panel. Eso lo ha comprobado el servidor antes de que
 * existiera este archivo: la ruta está en la regla {@code /usuarios/**} → {@code ROLE_ADMIN}
 * de la cadena de seguridad. Aquí, como mucho, se comprueba para poder avisar y no dejar a
 * alguien mirando una lista vacía sin saber por qué —que es comodidad, no protección.</p>
 *
 * <p>Tampoco valida contraseñas de verdad: lo que se comprueba en el navegador es lo que se
 * puede comprobar (que las dos casillas sean iguales y las reglas de ./clave.js) y el cambio
 * se manda igualmente al servidor. Es para no gastar una petición en un 400 previsible, no una
 * comprobación de seguridad: el hash solo existe en el servidor, y las reglas que de verdad
 * cuentan están en validacion/ClaveSegura.</p>
 *
 * <h2>Nombres de los campos</h2>
 * <p>Van con guion bajo ({@code altaUsuario}, no {@code alta-usuario}) por una razón concreta:
 * se leen como {@code formulario.elements.altaUsuario}, y con un guion el acceso por punto
 * dejaría de funcionar y habría que escribir {@code formulario.elements["alta-usuario"]} en
 * las seis cosas que los tocan.</p>
 *
 * @author AngelDanielC0des
 */

import { cabecerasConSeguridad, irAlLogin } from "./seguridad.js";
import { motivoDe } from "./problema.js";
import { MINIMO_CLAVE, claveValida, motivoDeClave, pintarRequisitos } from "./clave.js";
import { conectarOjos } from "./ver-clave.js";

const cuerpo = document.getElementById("cuerpo-usuarios");
const sinUsuarios = document.getElementById("sin-usuarios");
const botonAlta = document.getElementById("abrir-alta");

const avisoError = document.getElementById("aviso-error");
const avisoOk = document.getElementById("aviso-ok");

/**
 * Las cuentas que hay en pantalla, tal y como las devolvió el servidor.
 *
 * @type {Array<Object>}
 */
let cuentas = [];

/** El identificador de la cuenta de quien está dentro; 0 si no se ha podido saber. */
let idPropio = 0;

/** El <tr> del panel abierto ahora mismo, o null si no hay ninguno. */
let panelAbierto = null;

/** Los dos perfiles que conoce la aplicación, con el texto que se enseña en pantalla. */
const PERFILES = [
    { valor: "USUARIO", texto: "Usuario" },
    { valor: "ADMIN", texto: "Administrador" },
];

/**
 * Cuántas columnas tiene la tabla, para el colspan de los paneles.
 *
 * <p>Se cuentan de verdad en vez de escribir un 5 a mano: si mañana se le añade una columna a
 * la tabla y no a este número, los paneles se quedan más cortos que la tabla y se ve un hueco
 * raro a la derecha. Es el mismo truco que usa clientes.js con columnasVisibles().</p>
 *
 * <p>Se puede leer aquí arriba porque los módulos se ejecutan DESPUÉS de que el documento esté
 * construido (eso es lo que significa diferido, y un módulo lo es aunque no se diga), a
 * diferencia de un script normal en el &lt;head&gt;.</p>
 */
const COLUMNAS = document.querySelectorAll(".usuarios-tabla thead th").length;

/**
 * Escribe un error y esconde el aviso bueno.
 *
 * @param {string} texto el motivo que se lee
 */
function mostrarError(texto) {
    avisoError.textContent = texto;
    avisoError.hidden = false;
    avisoOk.hidden = true;
}

/**
 * Escribe un aviso de que la operación ha ido bien.
 *
 * @param {string} texto el mensaje que se lee
 */
function mostrarOk(texto) {
    avisoOk.textContent = texto;
    avisoOk.hidden = false;
    avisoError.hidden = true;
}

/** Esconde los dos avisos. */
function limpiarAvisos() {
    avisoError.hidden = true;
    avisoOk.hidden = true;
}

/**
 * Habla con el servidor y devuelve el JSON.
 *
 * <p>Va aquí y no en api.js porque api.js arrastra la pantalla de clientes. Lo que sí se copia
 * de allí, y es lo importante, es el 401: un 401 aquí no es un fallo de la operación, es que la
 * sesión ha caducado, y en ese caso lo único que sirve es llevar a la persona al login.</p>
 *
 * @param {string} metodo "GET", "POST" o "PUT"
 * @param {string} url la dirección
 * @param {Object} [datos] lo que viaja como JSON, si hay algo
 * @return {Promise<Object>} el JSON de la respuesta, o null si no lo hay
 * @throws {Error} con la respuesta en `respuesta` y el código en `estado`
 */
async function pedir(metodo, url, datos = null) {

    const cabeceras = { Accept: "application/json" };

    if (datos !== null) {
        cabeceras["Content-Type"] = "application/json";
    }

    // El token se pide ANTES del fetch, nunca dentro: si se pidiera en la misma llamada, el
    // propio POST saldría sin él y Spring lo rechazaría con un 403.
    if (metodo !== "GET") {
        Object.assign(cabeceras, await cabecerasConSeguridad());
    }

    const respuesta = await fetch(url, {
        method: metodo,
        headers: cabeceras,
        body: datos === null ? undefined : JSON.stringify(datos),
    });

    if (respuesta.status === 401) {
        irAlLogin();
    }

    if (!respuesta.ok) {
        const error = new Error("El servidor ha contestado " + respuesta.status);
        error.estado = respuesta.status;
        error.respuesta = respuesta;
        throw error;
    }

    // Un 204 no trae cuerpo, y respuesta.json() sobre un cuerpo vacío revienta con un
    // SyntaxError que no es el Error de arriba: se colaba en el catch de quien llama y
    // hacía falta que un borrado bien hecho acabara enseñando un fallo. Si no hay JSON que
    // leer, no se lee y se devuelve null.
    if (respuesta.status === 204) {
        return null;
    }

    try {
        return await respuesta.json();
    } catch {
        return null;
    }
}

/**
 * El motivo de un fallo que viene dentro del propio error.
 *
 * <p>Un envoltorio de motivoDe() para no tener que pasar la respuesta por todas partes: los
 * cuatro manejadores de este archivo hacen exactamente lo mismo y, de paso, aquí ya se sabe
 * que el cuerpo de un error es un ProblemDetail con el motivo en `detail`.</p>
 *
 * @param {Error} error el fallo que ha lanzado pedir()
 * @param {string} reserva qué decir si el servidor no explica nada
 * @return {Promise<string>} el motivo, listo para enseñar
 */
async function motivoDelError(error, reserva) {
    return error.respuesta ? motivoDe(error.respuesta, reserva) : reserva;
}

/**
 * Cómo se lee una fecha que viene del servidor.
 *
 * <p>El servidor manda un <code>LocalDateTime</code> sin zona horaria ("2026-10-02T14:47:53"),
 * que es una hora de reloj, no un instante. Convertirlo con new Date() lo interpretaría en la
 * zona del navegador y lo desplazaría: en un sitio con dos horas de diferencia, la columna
 * enseñaría un día distinto del que se guardó.</p>
 *
 * <p>La solución es partirla a mano y escribir los números tal cual. Es la hora que el
 * servidor escribió, sin que el navegador la mueva por el camino.</p>
 *
 * @param {string} valor la fecha en formato ISO, o null
 * @param {string} [vacio] qué poner cuando no hay fecha
 * @return {string} la fecha tal cual, o el texto de reserva
 */
function fechaLegible(valor, vacio = "Nunca") {

    if (!valor) return vacio;

    const [dia, mes, anio] = valor.slice(0, 10).split("-");

    return `${dia}/${mes}/${anio.slice(2)}`;
}

/** Si esta cuenta es la de quien está dentro. */
function esPropia(cuenta) {
    return cuenta.idUsuario === idPropio;
}

/** El texto que se enseña para un perfil. */
function textoPerfil(rol) {
    return rol === "ADMIN" ? "Administrador" : "Usuario";
}

/**
 * Una celda de texto.
 *
 * @param {string} texto lo que va dentro
 * @param {string} [clase] clase extra para la celda
 * @return {HTMLTableCellElement} la celda, ya con su texto
 */
function celda(texto, clase = "") {

    const td = document.createElement("td");

    if (clase) td.className = clase;

    td.textContent = texto;

    return td;
}

/**
 * La celda del perfil, con un desplegable que manda el cambio en cuanto se elige.
 *
 * <p>Un desplegable y no un botón de "cambiar a ADMIN": cambiar el rol es una operación
 * frecuente de este panel —es de lo que sirve—, y un desplegable ahorra el paso intermedio de
 * abrir un formulario para confirmar algo que ya se ha dicho con la elección.</p>
 *
 * <p>El desplegable de la cuenta propia va desactivado, y con un title que lo explica. Sin el
 * title, un desplegable que no responde parece un fallo de la página, y el motivo (es tu propia
 * cuenta) no se adivina.</p>
 *
 * @param {Object} cuenta la cuenta de la fila
 * @return {HTMLTableCellElement} la celda con el desplegable
 */
function celdaRol(cuenta) {

    const td = document.createElement("td");

    const select = document.createElement("select");

    select.className = "celda-cambiar";
    select.setAttribute("aria-label", `Perfil de ${cuenta.usuario}`);

    for (const perfil of PERFILES) {

        const opcion = document.createElement("option");

        opcion.value = perfil.valor;
        opcion.textContent = perfil.texto;
        opcion.selected = perfil.valor === cuenta.rol;

        select.append(opcion);
    }

    if (esPropia(cuenta)) {
        select.disabled = true;
        select.title = "Es tu propia cuenta: no puedes cambiarte el rol a ti mismo";
    }

    select.addEventListener("change", () => cambiarRol(cuenta, select.value));

    td.append(select);

    return td;
}

/**
 * La celda de las tres acciones: editar, cambiar la contraseña y borrar.
 *
 * <p>El botón de borrar va con su propia clase y no con la de los otros dos: un botón que
 * borra no puede verse igual que uno que guarda, porque entre «cambiar un nombre» y «que esta
 * cuenta deje de existir» hay una distancia que se nota en el color.</p>
 *
 * <p>En la fila de la cuenta propia, el botón no aparece. El servidor lo rechaza con un 409,
 * pero un botón que va a fallar siempre es un botón que no debería estar: quien no puede
 * borrarse a sí mismo no necesita que se lo recuerden cada vez que abre la pantalla.</p>
 *
 * @param {Object} cuenta la cuenta de la fila
 * @return {HTMLTableCellElement} la celda con los botones
 */
function celdaAcciones(cuenta) {

    const td = document.createElement("td");

    // El contenedor con display:flex va DENTRO de la celda y no es la celda. Poner el flex
    // en el <td> convierte la celda en una caja flex y la fila deja de comportarse como una
    // fila de tabla: las demás columnas pierden la alineación con sus cabeceras.
    const botones = document.createElement("div");
    botones.className = "celda-acciones-panel";

    const editar = boton("fa-solid fa-pen", `Editar la cuenta de ${cuenta.usuario}`);
    const clave = boton("fa-solid fa-key", `Cambiar la contraseña de ${cuenta.usuario}`);

    editar.addEventListener("click", () => abrirEdicion(cuenta));
    clave.addEventListener("click", () => abrirClave(cuenta));

    botones.append(editar, clave);

    if (!esPropia(cuenta)) {
        const borrar = boton("fa-solid fa-trash", `Borrar la cuenta de ${cuenta.usuario}`);
        borrar.classList.add("boton-peligro");
        borrar.addEventListener("click", () => abrirBorrado(cuenta));
        botones.append(borrar);
    }

    td.append(botones);

    return td;
}

/**
 * Un botón pequeño de la celda de acciones.
 *
 * <p>El texto va en el title y no dentro del botón: con dos iconos y dos palabras en una celda
 * de ancho fijo, la tabla crece hasta ser ilegible en un portátil. El title es lo que sale al
 * pasar por encima y lo que lee el lector de pantalla, porque es también el aria-label.</p>
 *
 * @param {string} icono la clase del icono de Font Awesome
 * @param {string} descripcion lo que hace, para el title y para el lector de pantalla
 * @return {HTMLButtonElement} el botón, ya con su icono
 */
function boton(icono, descripcion) {

    const button = document.createElement("button");

    button.type = "button";
    button.className = "boton-panel";
    button.title = descripcion;
    button.setAttribute("aria-label", descripcion);

    const glifo = document.createElement("i");
    glifo.className = icono;
    glifo.setAttribute("aria-hidden", "true");

    button.append(glifo);

    return button;
}

/**
 * Pinta la tabla con las cuentas que hay en memoria.
 *
 * <p>Se pinta desde el array y no desde el DOM, y con textContent en todas partes. Motivo
 * doble: el texto del servidor pasa por textContent (nunca por innerHTML), que es lo que
 * impide que un nombre de usuario con un &lt;script&gt; dentro se ejecute, y las celdas se
 * reconstruyen siempre desde el mismo sitio, así que no hace falta ir a buscar "la fila que
 * estaba editando" después de un repintado.</p>
 */
function pintar() {

    cuerpo.textContent = "";

    sinUsuarios.hidden = cuentas.length > 0;

    for (const cuenta of cuentas) {

        const fila = document.createElement("tr");

        fila.dataset.usuarioId = cuenta.idUsuario;

        if (!cuenta.activo) fila.classList.add("inactiva");

        fila.append(
            celda(cuenta.usuario, "usuarios-usuario"),
            celda(cuenta.nombre),
            celdaRol(cuenta),
            celda(fechaLegible(cuenta.ultimoAcceso), "usuarios-vacio"),
            celdaAcciones(cuenta)
        );

        cuerpo.append(fila);
    }
}

/** Cierra el panel que esté abierto, si hay alguno. */
function cerrarPanel() {

    panelAbierto?.remove();
    panelAbierto = null;
}

/**
 * Crea la fila de panel que se despliega dentro de la tabla, con el formulario dentro.
 *
 * @param {string} clase la clase del formulario
 * @return {Object} la fila y la celda donde va el formulario
 */
function crearPanel(clase) {

    const fila = document.createElement("tr");
    fila.className = "panel-fila";

    const td = document.createElement("td");
    td.colSpan = COLUMNAS;

    const formulario = document.createElement("form");
    formulario.className = clase;
    formulario.noValidate = true;

    td.append(formulario);
    fila.append(td);

    return { fila, formulario };
}

/**
 * Abre un panel dentro de la tabla.
 *
 * <p>Debajo de la fila de la cuenta a la que pertenece, o en la primera posición si es el alta
 * (que no pertenece a ninguna). La comparación es por atributo y no por posición porque entre
 * la fila y su panel se ha podido abrir y cerrar otro panel.</p>
 *
 * @param {Object} [cuenta] la cuenta a la que pertenece el panel; sin ella, panel de alta
 */
function abrirPanel(cuenta) {

    cerrarPanel();

    if (!cuenta) return crearPanel("usuarios-formulario");

    const { fila, formulario } = crearPanel("usuarios-formulario");

    panelAbierto = fila;

    cuerpo.querySelector(`tr[data-usuario-id="${cuenta.idUsuario}"]`)?.after(fila);

    return { fila, formulario };
}

/**
 * Un campo de texto con su etiqueta, para los formularios del panel.
 *
 * @param {Object} opciones
 * @param {string} opciones.id el id del input, que es también el name y el del <label for>
 * @param {string} opciones.texto lo que pone la etiqueta
 * @param {string} [opciones.tipo] el type del input
 * @param {string} [opciones.icono] la clase del icono de la derecha
 * @param {boolean} [opciones.anchoCompleto] si ocupa las dos columnas de la rejilla
 * @param {Object} [opciones.limites] atributos sueltos (minlength, maxlength, autocomplete...)
 * @return {HTMLDivElement} el div con la etiqueta y el campo
 */
function campo({ id, texto, tipo = "text", icono, anchoCompleto = false, limites = {} }) {

    const div = document.createElement("div");

    div.className = icono ? "acceso-campo con-icono" : "acceso-campo";

    if (anchoCompleto) div.classList.add("ancho-completo");

    const label = document.createElement("label");
    label.htmlFor = id;
    label.textContent = texto;

    const input = document.createElement("input");
    input.type = tipo;
    input.id = id;
    input.name = id;

    for (const [atributo, valor] of Object.entries(limites)) {
        input.setAttribute(atributo, valor);
    }

    div.append(label, input);

    if (icono) {
        const glifo = document.createElement("i");
        glifo.className = icono;
        glifo.setAttribute("aria-hidden", "true");
        div.append(glifo);
    }

    // El ojo de mostrar contraseña. Va aquí dentro de la fábrica y no en las llamadas que
    // abren los paneles, porque depende solo de que el campo sea de contraseña: puesto a
    // mano habría que acordarse de añadirlo en el alta y en el cambio de clave, y
    // olvidarlo en el siguiente panel que se añada. conectarOjos no hace nada con los
    // campos que no son de contraseña.
    conectarOjos(div);

    return div;
}

/**
 * La lista de requisitos de la contraseña que va bajo los campos, marcando en vivo lo que
 * falta.
 *
 * Es la misma lista que pinta la pantalla de "Mi cuenta", hecha con la misma función
 * (pintarRequisitos, en clave.js) y con el mismo estilo: aquí también hay cinco reglas que
 * adivinar, y un administrador que pone una contraseña a un cliente no tiene por qué saberlas
 * de memoria. Sin esta lista, lo único que se veía era el aviso de arriba de la página, que
 * queda fuera del panel y además se lee después de haber enviado.
 *
 * @param {HTMLInputElement} nuevo el campo de la contraseña nueva
 * @param {HTMLInputElement} repetida el campo donde se repite
 * @return {HTMLUListElement} el <ul>, para colgarlo en el formulario
 */
function bloqueDeClaves(nuevo, repetida) {
    const lista = document.createElement("ul");

    lista.className = "requisitos ancho-completo";
    lista.id = `requisitos-${nuevo.id}`;
    lista.setAttribute("aria-label", "Requisitos de la contraseña");

    // La lista es lo que le explica al lector de pantalla qué se le pide a la casilla nueva.
    nuevo.setAttribute("aria-describedby", lista.id);

    pintarRequisitos(lista, "");

    // Se repinta desde los dos campos, pero mirando siempre el de la nueva: quien escribe en
    // la repetida solo está confirmando lo que ya está en la otra, y si se mirara la repetida
    // la lista saltaría a rojo en cuanto se corrigiera un tecleo.
    //
    // De paso se quita el error que se había pintado al enviar en cuanto la contraseña pasa a
    // estar bien: dejarlo ahí mientras se corrige sería tener el campo y la lista diciendo
    // cosas distintas.
    const refrescar = () => {
        pintarRequisitos(lista, nuevo.value);

        if (claveValida(nuevo.value)) {
            marcarClave(nuevo, null);
            marcarClave(repetida, null);
        }
    };

    nuevo.addEventListener("input", refrescar);
    repetida.addEventListener("input", refrescar);

    return lista;
}

/**
 * Pinta el motivo de un error junto a un campo, o lo quita si el texto es null.
 *
 * <p>El panel no usa `was-validated` como los formularios de las otras pantallas, y no por
 * descuido: estos se rehacen desde cero cada vez que se abren, así que no les hace falta
 * limpiar la validación al cerrarlos. Lo que sí hace falta es poder señalar UN campo, que es
 * lo que no conseguía el aviso de error de la página, encima de la tabla y fuera de la vista
 * de quien está mirando el panel.</p>
 *
 * @param {HTMLInputElement} campo el control que no vale
 * @param {string|null} texto el motivo, o null si ya está bien
 */
function marcarClave(campo, texto) {
    const contenedor = campo.parentElement;

    let mensaje = contenedor.querySelector(".invalid-feedback");

    if (!mensaje) {
        mensaje = document.createElement("div");
        mensaje.className = "invalid-feedback";
        contenedor.append(mensaje);
    }

    if (texto === null) {
        campo.classList.remove("is-invalid");
        campo.removeAttribute("aria-invalid");
        return;
    }

    mensaje.textContent = texto;
    campo.classList.add("is-invalid");
    campo.setAttribute("aria-invalid", "true");
}

/**
 * Un desplegable con su etiqueta.
 *
 * @param {Object} opciones
 * @param {string} opciones.id el id del select, que es también el name
 * @param {string} opciones.texto lo que pone la etiqueta
 * @param {Array<{valor: string, texto: string}>} opciones.opciones lo que se puede elegir
 * @param {string} [opciones.elegido] el valor que viene puesto
 * @param {boolean} [opciones.anchoCompleto] si ocupa las dos columnas de la rejilla
 * @return {HTMLDivElement} el div con la etiqueta y el desplegable
 */
function selector({ id, texto, opciones, elegido, anchoCompleto = false }) {

    const div = document.createElement("div");
    div.className = "acceso-campo";

    if (anchoCompleto) div.classList.add("ancho-completo");

    const label = document.createElement("label");
    label.htmlFor = id;
    label.textContent = texto;

    const select = document.createElement("select");
    select.id = id;
    select.name = id;

    for (const opcion of opciones) {

        const elemento = document.createElement("option");

        elemento.value = opcion.valor;
        elemento.textContent = opcion.texto;
        elemento.selected = opcion.valor === elegido;

        select.append(elemento);
    }

    div.append(label, select);

    return div;
}

/**
 * Los dos botones de abajo de un formulario del panel: guardar y cancelar.
 *
 * @return {Object} los dos botones, ya con su manejador de cancelar
 */
function botonesDelFormulario() {

    const contenedor = document.createElement("div");
    contenedor.className = "d-flex gap-2 ancho-completo mt-3";

    const guardar = document.createElement("button");
    guardar.type = "submit";
    guardar.className = "boton-panel";

    const cancelar = document.createElement("button");
    cancelar.type = "button";
    cancelar.className = "boton-panel";
    cancelar.textContent = "Cancelar";
    cancelar.addEventListener("click", cerrarPanel);

    contenedor.append(guardar, cancelar);

    return { contenedor, guardar };
}

/**
 * El panel del alta de una cuenta.
 *
 * <p>Va como primera fila de la tabla, que es justo donde está el botón que lo abre: si
 * saliera al final, habría que bajar hasta él después de haber pulsado el botón.</p>
 */
function abrirAlta() {

    const { fila, formulario } = abrirPanel();

    formulario.append(
        campo({
            id: "altaUsuario",
            texto: "Usuario (con el que entrará)",
            icono: "fa-solid fa-user",
            anchoCompleto: true,
            limites: { minlength: "3", maxlength: "50", autocomplete: "off" },
        }),
        campo({
            id: "altaNombre",
            texto: "Nombre y apellidos",
            icono: "fa-solid fa-id-card",
            anchoCompleto: true,
            limites: { minlength: "2", maxlength: "100", autocomplete: "off" },
        }),
        campo({
            id: "altaClave",
            texto: "Contraseña",
            tipo: "password",
            icono: "fa-solid fa-lock",
            limites: {
                minlength: String(MINIMO_CLAVE),
                maxlength: "200",
                autocomplete: "new-password",
            },
        }),
        selector({ id: "altaRol", texto: "Perfil", opciones: PERFILES, elegido: "USUARIO" }),
        campo({
            id: "altaClaveRepetida",
            texto: "Repite la contraseña",
            tipo: "password",
            icono: "fa-solid fa-lock",
            limites: {
                minlength: String(MINIMO_CLAVE),
                maxlength: "200",
                autocomplete: "new-password",
            },
        })
    );

    // La lista de requisitos va después de los dos campos de contraseña, que es donde se
    // está mirando mientras se teclea.
    formulario.append(bloqueDeClaves(formulario.elements.altaClave, formulario.elements.altaClaveRepetida));

    const { contenedor, guardar } = botonesDelFormulario();

    guardar.textContent = "Crear la cuenta";
    formulario.append(contenedor);

    formulario.addEventListener("submit", (evento) => {
        evento.preventDefault();
        crearCuenta(formulario, guardar);
    });

    panelAbierto = fila;
    cuerpo.prepend(fila);

    formulario.elements.altaUsuario.focus();
}

/**
 * Comprueba lo que se puede comprobar en el navegador y manda el alta al servidor.
 *
 * @param {HTMLFormElement} formulario el formulario abierto
 * @param {HTMLButtonElement} guardar el botón, para desactivarlo mientras espera
 */
async function crearCuenta(formulario, guardar) {

    limpiarAvisos();

    const clave = formulario.elements.altaClave.value;
    const repetida = formulario.elements.altaClaveRepetida.value;

    if (clave !== repetida) {
        mostrarError("Las dos contraseñas no son iguales.");
        marcarClave(formulario.elements.altaClaveRepetida, "No es igual a la contraseña de arriba.");
        formulario.elements.altaClaveRepetida.focus();
        return;
    }

    if (!claveValida(clave)) {
        mostrarError(motivoDeClave(clave));
        marcarClave(formulario.elements.altaClave, motivoDeClave(clave));
        formulario.elements.altaClave.focus();
        return;
    }

    marcarClave(formulario.elements.altaClave, null);
    marcarClave(formulario.elements.altaClaveRepetida, null);

    guardar.disabled = true;

    try {
        const creado = await pedir("POST", "/usuarios", {
            usuario: formulario.elements.altaUsuario.value.trim(),
            nombre: formulario.elements.altaNombre.value.trim(),
            clave,
            rol: formulario.elements.altaRol.value,
        });

        // Se vacía el formulario antes de cerrarlo, aunque ya no se vea: dejar la contraseña
        // escrita en un input es dejarla a la vista de cualquiera que se acerque a la
        // pantalla después.
        formulario.reset();

        cerrarPanel();
        await cargar();

        mostrarOk(`Cuenta creada. ${creado.usuario} ya puede entrar con esa contraseña.`);
    } catch (error) {
        if (error.estado === 401) return;

        mostrarError(await motivoDelError(error, "No se ha podido crear la cuenta."));
    } finally {
        guardar.disabled = false;
    }
}

/**
 * Manda el cambio de rol y recarga la tabla.
 *
 * <p>Si el servidor lo rechaza, la tabla se vuelve a pintar: el desplegable que se había
 * tocado queda otra vez en su posición, porque es el servidor quien tiene razón y no el
 * elemento que está en pantalla.</p>
 *
 * @param {Object} cuenta la cuenta de la fila
 * @param {string} rol el perfil que se ha elegido
 */
async function cambiarRol(cuenta, rol) {

    limpiarAvisos();

    try {
        await pedir("PUT", `/usuarios/${cuenta.idUsuario}`, {
            nombre: cuenta.nombre, rol, activo: cuenta.activo,
        });

        await cargar();

        mostrarOk(`${cuenta.usuario} ahora es ${textoPerfil(rol).toLowerCase()}.`);
    } catch (error) {
        await cargar();

        if (error.estado === 401) return;

        mostrarError(await motivoDelError(error, "No se ha podido cambiar el perfil."));
    }
}

/**
 * El panel de edición de una cuenta.
 *
 * @param {Object} cuenta la cuenta de la fila
 */
function abrirEdicion(cuenta) {

    const { fila, formulario } = abrirPanel(cuenta);

    formulario.append(
        campo({
            id: "editaNombre",
            texto: "Nombre y apellidos",
            icono: "fa-solid fa-id-card",
            anchoCompleto: true,
            limites: { minlength: "2", maxlength: "100", autocomplete: "off" },
        }),
        selector({ id: "editaRol", texto: "Perfil", opciones: PERFILES, elegido: cuenta.rol }),
        selector({
            id: "editaActivo",
            texto: "¿Puede entrar?",
            opciones: [
                { valor: "true", texto: "Sí, la cuenta está activa" },
                { valor: "false", texto: "No, desactivar la cuenta" },
            ],
            elegido: String(cuenta.activo),
        })
    );

    formulario.elements.editaNombre.value = cuenta.nombre;

    const { contenedor, guardar } = botonesDelFormulario();

    guardar.textContent = "Guardar cambios";
    formulario.append(contenedor);

    formulario.addEventListener("submit", (evento) => {
        evento.preventDefault();
        editarCuenta(formulario, guardar, cuenta);
    });

    formulario.elements.editaNombre.focus();
}

/**
 * Manda la edición y, si va bien, recarga la tabla.
 *
 * @param {HTMLFormElement} formulario el formulario abierto
 * @param {HTMLButtonElement} guardar el botón
 * @param {Object} cuenta la cuenta que se está editando
 */
async function editarCuenta(formulario, guardar, cuenta) {

    limpiarAvisos();

    guardar.disabled = true;

    try {
        const guardado = await pedir("PUT", `/usuarios/${cuenta.idUsuario}`, {
            nombre: formulario.elements.editaNombre.value.trim(),
            rol: formulario.elements.editaRol.value,
            activo: formulario.elements.editaActivo.value === "true",
        });

        cerrarPanel();
        await cargar();

        mostrarOk(`Cuenta de ${guardado.usuario} guardada.`);
    } catch (error) {
        if (error.estado === 401) return;

        mostrarError(await motivoDelError(error, "No se ha podido guardar la cuenta."));
    } finally {
        guardar.disabled = false;
    }
}

/**
 * El panel de cambio de contraseña de una cuenta.
 *
 * @param {Object} cuenta la cuenta de la fila
 */
function abrirClave(cuenta) {

    const { formulario } = abrirPanel(cuenta);

    formulario.append(
        campo({
            id: "claveNueva",
            texto: "Contraseña nueva",
            tipo: "password",
            icono: "fa-solid fa-lock",
            anchoCompleto: true,
            limites: {
                minlength: String(MINIMO_CLAVE),
                maxlength: "200",
                autocomplete: "new-password",
            },
        }),
        campo({
            id: "claveRepetida",
            texto: "Repite la contraseña",
            tipo: "password",
            icono: "fa-solid fa-lock",
            anchoCompleto: true,
            limites: {
                minlength: String(MINIMO_CLAVE),
                maxlength: "200",
                autocomplete: "new-password",
            },
        })
    );

    const nota = document.createElement("p");
    nota.className = "cuenta-nota ancho-completo";
    nota.textContent = esPropia(cuenta)
        ? "Estás poniendo la contraseña de tu propia cuenta desde el panel. Si la has "
          + "olvidado, esto es lo que hay; si solo quieres cambiarla, Mi cuenta es más corto "
          + "porque te pide la actual."
        : `Se le pone a ${cuenta.usuario} la contraseña que escribas. No se le pide la anterior.`;

    // Los requisitos, y luego la nota que explica de quién es la cuenta. Va en ese orden
    // porque la lista se lee mientras se teclea y la nota, después.
    formulario.append(bloqueDeClaves(formulario.elements.claveNueva, formulario.elements.claveRepetida), nota);

    const { contenedor, guardar } = botonesDelFormulario();

    guardar.textContent = "Guardar la contraseña";
    formulario.append(contenedor);

    formulario.addEventListener("submit", (evento) => {
        evento.preventDefault();
        guardarClave(formulario, guardar, cuenta);
    });

    formulario.elements.claveNueva.focus();
}

/**
 * Manda la contraseña nueva y, si va bien, recarga la tabla.
 *
 * @param {HTMLFormElement} formulario el formulario abierto
 * @param {HTMLButtonElement} guardar el botón
 * @param {Object} cuenta la cuenta a la que se la van a poner
 */
async function guardarClave(formulario, guardar, cuenta) {

    limpiarAvisos();

    const nueva = formulario.elements.claveNueva.value;
    const repetida = formulario.elements.claveRepetida.value;

    if (nueva !== repetida) {
        mostrarError("Las dos contraseñas no son iguales.");
        marcarClave(formulario.elements.claveRepetida, "No es igual a la contraseña de arriba.");
        formulario.elements.claveRepetida.focus();
        return;
    }

    if (!claveValida(nueva)) {
        mostrarError(motivoDeClave(nueva));
        marcarClave(formulario.elements.claveNueva, motivoDeClave(nueva));
        formulario.elements.claveNueva.focus();
        return;
    }

    marcarClave(formulario.elements.claveNueva, null);
    marcarClave(formulario.elements.claveRepetida, null);

    guardar.disabled = true;

    try {
        await pedir("PUT", `/usuarios/${cuenta.idUsuario}/clave`, { nueva });

        formulario.reset();

        cerrarPanel();
        await cargar();

        mostrarOk(`Contraseña de ${cuenta.usuario} guardada. Dile cuál es para que pueda entrar.`);
    } catch (error) {
        if (error.estado === 401) return;

        mostrarError(await motivoDelError(error, "No se ha podido cambiar la contraseña."));
    } finally {
        guardar.disabled = false;
    }
}

/**
 * El panel de borrado de una cuenta.
 *
 * <p>No es una ventana de "¿Seguro?" con dos botones de Sí y No: pide la contraseña de quien
 * está dentro. Es una forma distinta de preguntar, y mejor para esta operación en concreto.
 * Un "¿Seguro?" se contesta con un clic, y el que hace un clic a destiempo es justo el caso que
 * sale mal; una casilla de contraseña no se rellena sin querer, y quien está mirando cómo
 * reventar la aplicación tiene que conocer además la contraseña de la cuenta.</p>
 *
 * <p>Lo que se pide es <em>la contraseña del administrador</em>, no la de la cuenta que se va a
 * borrar: nadie tiene por qué saber la de otra persona. La sesión ya ha dicho que está
 * autorizado; lo que esta casilla añade es que está delante del teclado. Son dos preguntas
 * distintas y una sesión contesta solo a la primera.</p>
 *
 * @param {Object} cuenta la cuenta de la fila
 */
function abrirBorrado(cuenta) {

    const { formulario } = abrirPanel(cuenta);

    formulario.append(
        campo({
            id: "borradoClave",
            texto: "Tu contraseña, para confirmar",
            tipo: "password",
            icono: "fa-solid fa-user-lock",
            anchoCompleto: true,
            limites: { maxlength: "200", autocomplete: "current-password" },
        })
    );

    const aviso = document.createElement("p");
    aviso.className = "cuenta-nota ancho-completo aviso-peligro";

    aviso.textContent = `La cuenta de ${cuenta.usuario} va a desaparecer de la tabla de `
        + "usuarios y no hay forma de recuperarla. Además, su nombre de usuario queda libre y "
        + "alguien podría volver a usarlo. Si lo único que quieres es que no entre, desactívala "
        + "desde «Editar»: ocupa lo mismo, es reversible y guarda las fechas de alta y de "
        + "último acceso.";

    formulario.append(aviso);

    const { contenedor, guardar } = botonesDelFormulario();

    guardar.textContent = "Borrar la cuenta";
    guardar.classList.add("boton-peligro");

    formulario.append(contenedor);

    formulario.addEventListener("submit", (evento) => {
        evento.preventDefault();
        borrarCuenta(formulario, guardar, cuenta);
    });

    formulario.elements.borradoClave.focus();
}

/**
 * Manda el borrado con la contraseña de confirmación y, si va bien, recarga la tabla.
 *
 * <p>El formulario se vacía pase lo que pase, también cuando el servidor dice que la contraseña
 * no es la correcta. Es lo único que hay que hacer con lo tecleado pase lo que pase: una
 * contraseña que se ha escrito mal se queda en el campo mientras uno busca en qué se ha
 * equivocado, y es la contraseña de un administrador de la aplicación.</p>
 *
 * @param {HTMLFormElement} formulario el formulario abierto
 * @param {HTMLButtonElement} guardar el botón
 * @param {Object} cuenta la cuenta que se va a borrar
 */
async function borrarCuenta(formulario, guardar, cuenta) {

    limpiarAvisos();

    const clave = formulario.elements.borradoClave.value;

    formulario.reset();

    if (!clave) {
        mostrarError("Escribe tu contraseña para confirmar el borrado.");
        formulario.elements.borradoClave.focus();
        return;
    }

    guardar.disabled = true;

    try {
        await pedir("DELETE", `/usuarios/${cuenta.idUsuario}`, { clave });

        cerrarPanel();
        await cargar();

        mostrarOk(`Cuenta de ${cuenta.usuario} borrada. Su nombre de usuario vuelve a estar libre.`);
    } catch (error) {
        if (error.estado === 401) return;

        // El panel se queda abierto para poder volver a intentarlo, pero ya sin la contraseña
        // escrita dentro.
        mostrarError(await motivoDelError(error, "No se ha podido borrar la cuenta."));
    } finally {
        guardar.disabled = false;
    }
}

/**
 * Pide la lista de cuentas y la pinta.
 *
 * @return {Promise<void>} cuando la tabla está al día
 */
async function cargar() {

    try {
        cuentas = await pedir("GET", "/usuarios");

        pintar();
    } catch (error) {
        // Un 401 ya está llevando al login: avisar además sería poner un error encima de la
        // redirección, y quien lee la pantalla ya está saliendo de la aplicación.
        if (error.estado === 401) return;

        mostrarError(await motivoDelError(error, "No se ha podido cargar la lista de cuentas."));
    }
}

/**
 * Quién está dentro.
 *
 * @return {Promise<Object|null>} los datos de la sesión, o null si no se han podido pedir
 */
async function usuarioDeLaSesion() {

    try {
        const respuesta = await fetch("/auth/yo", { headers: { Accept: "application/json" } });

        if (!respuesta.ok) return null;

        return await respuesta.json();
    } catch {
        // Un fallo de red NO es una sesión caducada: si la red falla un segundo, no debe
        // echar a nadie al login. Lo que pase es que idPropio se queda en 0 y ningún
        // desplegable sale desactivado.
        return null;
    }
}

botonAlta.addEventListener("click", abrirAlta);

// El Escape cierra el panel abierto. Sin esto, un formulario abierto por error en una tabla
// de veinte filas obliga a ir hasta el botón "Cancelar" del final del panel.
document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape" && panelAbierto) {
        cerrarPanel();
    }
});

// Quién está dentro se pregunta ANTES de cargar la lista, y no en paralelo: el despliegue de
// una fila necesita saber cuál es la cuenta propia para poder desactivar su desplegable de
// perfil. Si se pidieran a la vez, la tabla se pintaría sin saberlo.
const propio = await usuarioDeLaSesion();

idPropio = propio?.idUsuario ?? 0;

await cargar();
