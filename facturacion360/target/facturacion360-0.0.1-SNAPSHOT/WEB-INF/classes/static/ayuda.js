/*
 * ayuda.js
 * ---------------------------------------------------------------------------
 * El comportamiento de la página de ayuda. Es UN archivo y no una carpeta de
 * módulos como la de clientes, porque aquí no hay nada que compartir entre
 * pantallas: es una maqueta de documento, no una gestión de datos.
 *
 * Lo que hace, por partes:
 *
 *   1. Plegar y desplegar los bloques de cada apartado (con aria-expanded).
 *   2. Desplegar o plegar todo de golpe.
 *   3. Filtrar la ayuda por texto, resaltando lo encontrado.
 *   4. Marcar en el índice el apartado que se está leyendo (scrollspy).
 *   5. El botón de volver arriba.
 *   6. El atajo "/" para saltar al buscador.
 *
 * Sigue el mismo criterio que el resto de la aplicación: los avisos van a una
 * región viva que ya está en el documento y nunca se inserta con el mensaje
 * puesto, y para pintar nunca se usa innerHTML sino textContent.
 *
 * @author AngelDanielC0des
 */

// ── Referencias ────────────────────────────────────────────────────────────

const buscador = document.getElementById("campo-busqueda-ayuda");
const contenedorBuscador = document.getElementById("buscador-ayuda");
const botonLimpiarBusqueda = document.getElementById("boton-limpiar-busqueda");
const resultados = document.getElementById("resultados-busqueda");
const sinResultados = document.getElementById("sin-resultados");
const indice = document.getElementById("indice-ayuda");
const listaIndice = document.getElementById("lista-indice");
const tituloIndice = document.getElementById("titulo-indice");
const botonVolver = document.getElementById("boton-volver-arriba");
const anuncios = document.getElementById("anuncios");
const tituloPortada = document.getElementById("titulo-ayuda");

// Secciones del documento, en el orden en que están.
const secciones = [...document.querySelectorAll(".ayuda-seccion")];

// Bloques plegables (los que llevan un botón con aria-expanded).
const bloques = [...document.querySelectorAll(".ayuda-bloque")];

// Enlaces del índice, emparejados con su sección. El emparejamiento es por
// id y no por posición: si mañana se inserta un apartado en medio del índice,
// seguirían apuntando al sitio correcto.
const enlacesIndice = [...listaIndice.querySelectorAll("a[href^='#']")].map((enlace) => ({
    enlace,
    seccion: document.querySelector(enlace.getAttribute("href")),
}));


/**
 * Le cuenta a quien no ve la pantalla lo que acaba de pasar.
 *
 * Se vacía y se reescribe en el fotograma siguiente, y no se asigna el texto
 * sin más: lo que el lector de pantalla vigila es el CAMBIO de contenido, así
 * que un mensaje idéntico al anterior no se leería.
 *
 * @param {string} texto lo que hay que anunciar
 */
function anunciar(texto) {
    if (!anuncios) return;

    anuncios.textContent = "";
    requestAnimationFrame(() => {
        anuncios.textContent = texto;
    });
}


// ═══════════════════════════════════════════════════════════════════════════
// 1 y 2. Plegar y desplegar
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Abre o cierra un bloque y deja el botón diciendo en qué estado está.
 *
 * @param {HTMLElement} bloque el .ayuda-bloque
 * @param {boolean} abierto si tiene que quedar abierto
 */
function plegarBloque(bloque, abierto) {
    const boton = bloque.querySelector(".ayuda-bloque-boton");

    bloque.classList.toggle("abierto", abierto);
    boton.setAttribute("aria-expanded", String(abierto));
}

// Un único listener para todos los bloques, en vez de uno por bloque: son once
// apartados y van a crecer con la aplicación. Va por delegación porque el botón
// vive dentro del <h3> y cambiar de estructura no puede romperlo.
document.addEventListener("click", (evento) => {
    const boton = evento.target.closest(".ayuda-bloque-boton");

    if (!boton) return;

    const bloque = boton.closest(".ayuda-bloque");
    const estabaAbierto = bloque.classList.contains("abierto");

    plegarBloque(bloque, !estabaAbierto);
});

/**
 * Pone el estado inicial de los bloques, tomándolo de aria-expanded.
 *
 * El HTML es quien dice cuáles empiezan abiertos, y la clase .abierto es lo
 * único que hace que se vean desplegados. Sin esta lectura, un bloque marcado
 * como abierto en el HTML se enseñaría cerrado: el atributo diría "abierto" y
 * el CSS no lo abriría, que es la peor manera de mentir.
 */
function sincronizarEstadoInicial() {
    for (const bloque of bloques) {
        const boton = bloque.querySelector(".ayuda-bloque-boton");
        plegarBloque(bloque, boton.getAttribute("aria-expanded") === "true");
    }
}

sincronizarEstadoInicial();

// Los dos botones de la barra de acciones: abren y cierran todos los bloques de
// golpe. Se localizan por su id y no por un data-atributo, que para dos botones
// sería una capa de más.
document.getElementById("boton-desplegar-todo").addEventListener("click", () => {
    for (const bloque of bloques) plegarBloque(bloque, true);
    anunciar("Todos los apartados de la ayuda están desplegados.");
});

document.getElementById("boton-plegar-todo").addEventListener("click", () => {
    for (const bloque of bloques) plegarBloque(bloque, false);
    anunciar("Todos los apartados de la ayuda están plegados.");
});

// El índice, en móvil, es un desplegable. En escritorio el CSS lo deja siempre
// abierto y este listener no llega a ejecutarse nunca, porque la lista se ve;
// pero el h2 sigue siendo un botón, y hay que decidir quién lo es.
function prepararIndice() {
    const estrecho = window.matchMedia("(max-width: 991.98px)").matches;

    tituloIndice.setAttribute("role", "button");
    tituloIndice.setAttribute("tabindex", "0");
    tituloIndice.setAttribute("aria-expanded", String(!estrecho));
    tituloIndice.setAttribute("aria-controls", "lista-indice");
}

function alternarIndice() {
    const abierto = indice.classList.toggle("abierto");
    tituloIndice.setAttribute("aria-expanded", String(abierto));
}

tituloIndice.addEventListener("click", () => {
    // En escritorio el índice no se pliega: lo decide el CSS por media query.
    if (window.matchMedia("(max-width: 991.98px)").matches) alternarIndice();
});

// El h2 del índice es un botón, así que tiene que responder también al teclado.
// Con role="button" el <h2> no lo hace solo: role no añade comportamiento.
tituloIndice.addEventListener("keydown", (evento) => {
    if (evento.key !== "Enter" && evento.key !== " ") return;

    evento.preventDefault();
    if (window.matchMedia("(max-width: 991.98px)").matches) alternarIndice();
});

prepararIndice();


// ═══════════════════════════════════════════════════════════════════════════
// 3. Buscar en la ayuda
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Quita tildes y baja las mayúsculas, para que "NIF" encuentre "nif" y
 * "facturación" encuentre "facturacion".
 *
 * No es un adorno: sin esto, la mitad de las búsquedas del menú (que llevan
 * tilde) no encontrarían nada, y quien escribe sin tilde —que es lo más
 * normal— tampoco.
 *
 * @param {string} texto
 * @return {string} el texto normalizado
 */
function normalizar(texto) {
    return texto
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

/**
 * El texto de un bloque, tal y para tal lo tiene el buscador.
 *
 * Se lee con textContent y no de innerHTML: si algún día se metiera algo
 * marcado en el HTML, el texto plano lo seguiría encontrar, que es lo
 * importante para el buscador.
 *
 * @param {Element} elemento
 * @return {string}
 */
function textoDe(elemento) {
    return normalizar(elemento.textContent);
}

/**
 * Envuelve en <mark> todas las apariciones de un término dentro de un nodo de
 * texto, sin tocar el resto del HTML del bloque.
 *
 * Se hace con un árbol de nodos de texto y no con innerHTML: el texto viene
 * de la propia página (es fijo, no lo introduce nadie), pero pasarlo por
 * innerHTML reescribiría etiquetas de los hijos que ya hubiera, y en un
 * documento con tablas y listas eso es pedir que se descuadre algo.
 *
 * @param {Element} elemento dónde buscar
 * @param {string} termino lo que hay que resaltar, ya normalizado
 */
function resaltar(elemento, termino) {
    // Los nodos de texto que contienen el término, guardados ANTES de tocar
    // nada: al partir un nodo, el árbol cambia y el recorrido se descoloca.
    const nodos = [];

    const recorrer = (nodo) => {
        for (const hijo of [...nodo.childNodes]) {
            if (hijo.nodeType === Node.TEXT_NODE) {
                if (normalizar(hijo.textContent).includes(termino)) nodos.push(hijo);
            } else if (hijo.nodeType === Node.ELEMENT_NODE && hijo.tagName !== "MARK") {
                recorrer(hijo);
            }
        }
    };

    recorrer(elemento);

    for (const nodo of nodos) {
        const partes = nodo.textContent.split(new RegExp(`(${escapar(termino)})`, "gi"));
        const fragmento = document.createDocumentFragment();

        for (const parte of partes) {
            if (!parte) continue;

            if (normalizar(parte) === termino) {
                const marca = document.createElement("mark");
                marca.textContent = parte;
                fragmento.appendChild(marca);
            } else {
                fragmento.appendChild(document.createTextNode(parte));
            }
        }

        nodo.replaceWith(fragmento);
    }
}

/**
 * Escapa lo que puede ser un comodín de una expresión regular.
 *
 * El usuario escribe "c++" o "factura (2024)" y eso, tal cual, en una RegExp,
 * no es el texto: es otra cosa. Con este escape, "c++" busca literalmente "c++".
 *
 * @param {string} texto
 * @return {string}
 */
function escapar(texto) {
    return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Quita todos los <mark> que hubiera, dejando el texto como estaba.
 *
 * @param {Element} elemento
 */
function quitarResaltados(elemento) {
    for (const marca of elemento.querySelectorAll("mark")) {
        marca.replaceWith(document.createTextNode(marca.textContent));
    }

    // Al partir los nodos, los espacios alrededor de un texto partido se
    // quedan como nodos sueltos: sin normalizar, "el  cliente" saldría con
    // doble espacio y las búsquedas siguientes no encontrarían la frase.
    elemento.normalize();
}

/**
 * Filtra la ayuda por lo que haya en el buscador.
 *
 * Se busca en la sección entera y, si coincide, se enseña la sección
 * completa; dentro de ella solo se resaltan las coincidencias. Ocultar bloques
 * sueltos dejaría un apartado con la mitad de sus temas y su título diciendo
 * cosas que ya no están: es peor que no filtrar.
 *
 * @param {string} texto lo que se ha escrito
 */
function filtrar(texto) {
    const termino = normalizar(texto.trim());
    const buscando = termino.length > 0;

    contenedorBuscador.classList.toggle("con-texto", buscando);

    // Primero se deshace el resaltado anterior de todo: si no, se acumularían
    // las marcas de la búsqueda anterior sobre las de la nueva.
    for (const seccion of secciones) {
        quitarResaltados(seccion);
    }

    let seccionesVisibles = 0;
    let coincidencias = 0;

    for (const seccion of secciones) {
        if (!buscando) {
            seccion.hidden = false;
            seccionesVisibles++;
            continue;
        }

        const apariciones = aparicionesDe(textoDe(seccion), termino);

        seccion.hidden = apariciones === 0;
        if (apariciones > 0) {
            seccionesVisibles++;
            coincidencias += apariciones;
            resaltar(seccion, termino);
        }
    }

    // Un enlace del índice a una sección que el filtro ha escondido llevaría a
    // un sitio que no existe, así que también se esconden.
    for (const { enlace, seccion } of enlacesIndice) {
        enlace.closest("li").hidden = seccion.hidden;
    }

    pintarResultados(buscando, seccionesVisibles, coincidencias);
}

/**
 * Cuántas veces aparece un término dentro de un texto ya normalizado.
 *
 * Se cuenta por palabras sueltas y no por la cadena entera: si alguien
 * escribe "iva factura" es razonable que encuentre las dos palabras, no solo
 * la frase exacta con ese orden.
 *
 * @param {string} texto contenido normalizado
 * @param {string} termino término normalizado
 * @return {number}
 */
function aparicionesDe(texto, termino) {
    const palabras = termino.split(/\s+/).filter(Boolean);
    if (palabras.length === 0) return 0;

    let total = 0;

    // "patron" y no "RegExp": una constante con ese nombre taparía el
    // constructor global dentro de la función y el new de la línea siguiente
    // se encontraría a sí mismo sin inicializar.
    for (const palabra of palabras) {
        const patron = new RegExp(escapar(palabra), "g");
        total += (texto.match(patron) ?? []).length;
    }

    // Y el término entero, por si el usuario lo escribió como una frase: se
    // cuenta como un extra, no como el doble.
    if (palabras.length > 1) {
        const frase = new RegExp(escapar(termino), "g");
        total += (texto.match(frase) ?? []).length;
    }

    return total;
}

/**
 * Escribe el contador y muestra o esconde el aviso de "no hay nada".
 *
 * @param {boolean} buscando si hay algo escrito
 * @param {number} seccionesVisibles cuántas secciones quedan a la vista
 * @param {number} coincidencias cuántas veces aparece lo buscado
 */
function pintarResultados(buscando, seccionesVisibles, coincidencias) {
    if (!buscando) {
        resultados.textContent = "";
        sinResultados.hidden = true;
        return;
    }

    sinResultados.hidden = seccionesVisibles > 0;

    if (seccionesVisibles === 0) {
        resultados.textContent = "";
        anunciar("No se ha encontrado nada con esa búsqueda.");
        return;
    }

    const apartados = seccionesVisibles === 1
        ? "1 apartado"
        : `${seccionesVisibles} apartados`;

    resultados.textContent = `${apartados} con «${resultadosTérmino()}» · ${coincidencias} coincidencia${coincidencias === 1 ? "" : "s"}`;

    anunciar(`${apartados} encontrados para la búsqueda.`);
}

// El texto que se está buscando, tal y como lo escribió quien escribe (con sus
// tildes y su mayúscula), y no el normalizado: en pantalla tiene que verse lo
// que se ha tecleado.
let terminoOriginal = "";

function resultadosTérmino() {
    return terminoOriginal.trim();
}

buscador.addEventListener("input", () => {
    terminoOriginal = buscador.value;
    filtrar(buscador.value);
});

// Enter y Escape en el buscador, como en el resto de la aplicación.
buscador.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") {
        evento.preventDefault();
        limpiarBusqueda();
    }
});

function limpiarBusqueda() {
    buscador.value = "";
    terminoOriginal = "";
    filtrar("");
    buscador.focus();
    anunciar("Búsqueda borrada.");
}

botonLimpiarBusqueda.addEventListener("click", limpiarBusqueda);


// ═══════════════════════════════════════════════════════════════════════════
// 4. El índice: marcar el apartado que se está leyendo
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Marca en el índice el apartado visible y quita la marca de los demás.
 *
 * En vez de un listener de scroll, que se dispara decenas de veces por
 * segundo, se usa un IntersectionObserver: el navegador avisa solo cuando una
 * sección entra o sale de la franja de lectura.
 *
 * @param {string} id el id de la sección que manda
 */
function marcarIndice(id) {
    for (const { enlace, seccion } of enlacesIndice) {
        const activo = seccion.id === id;

        if (activo) {
            enlace.setAttribute("aria-current", "true");
        } else {
            enlace.removeAttribute("aria-current");
        }
    }
}

const observador = new IntersectionObserver((entradas) => {
    // Con varias secciones visibles a la vez (una pantalla alta puede enseñar
    // el final de una y el principio de la siguiente), manda la primera que
    // esté intersecting: es la que está más arriba y, por tanto, la que se
    // está leyendo de verdad.
    const visible = entradas
        .filter((entrada) => entrada.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];

    if (visible) marcarIndice(visible.target.id);
}, {
    // La franja es una banda ancha pegada a la parte alta de la ventana: así
    // lo que se marca es lo que está en pantalla, y no lo que pasó por ella de
    // camino al hacer scroll.
    rootMargin: "-10% 0px -70% 0px",
    threshold: 0,
});

for (const seccion of secciones) {
    observador.observe(seccion);
}

// Con el filtro puesto, la sección que estaba marcada puede estar escondida:
// Entonces el índice se queda sin nada resaltado, que es mejor que resaltar
// un apartado que ya no se ve.
buscador.addEventListener("input", () => {
    const visible = secciones.find((seccion) => !seccion.hidden);

    if (visible && document.activeElement === buscador) {
        marcarIndice(visible.id);
    }
});


// ═══════════════════════════════════════════════════════════════════════════
// 5. Volver arriba
// ═══════════════════════════════════════════════════════════════════════════

function actualizarBotonVolver() {
    botonVolver.classList.toggle("visible", window.scrollY > 400);
}

// Se marca visible con una clase en vez de sacando y metiendo el botón del
// documento: sacarlo y devolverlo es justo lo que hace que se pierda el foco
// del control que se acaba de pulsar.
window.addEventListener("scroll", actualizarBotonVolver, { passive: true });
actualizarBotonVolver();

botonVolver.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });

    // El foco vuelve arriba del todo, no solo la vista: si quien pulsó navega
    // después con el tabulador, debe seguir estando dentro del documento y no
    // quedarse en un botón flotante al pie de la pantalla. El h1 lleva
    // tabindex="-1" en el HTML precisamente para poder recibirlo: sin él
    // focus() no hace nada, porque un h1 no es enfocable por tabulador.
    tituloPortada.focus();

    anunciar("Vuelta al principio de la ayuda.");
});


// ═══════════════════════════════════════════════════════════════════════════
// 6. Atajos de teclado de la página
// ═══════════════════════════════════════════════════════════════════════════

document.addEventListener("keydown", (evento) => {
    // "/" salta al buscador, como en cualquier buscador de verdad. Se descarta
    // si se está escribiendo: si no, teclear "/" en un campo cualquiera
    // escribiría una barra en lugar de llevar a la búsqueda.
    if (evento.key !== "/" || evento.ctrlKey || evento.metaKey || evento.altKey) return;

    const escribiendo = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? "");
    if (escribiendo) return;

    evento.preventDefault();
    buscador.focus();
    buscador.select();
});

// Imprimir la ayuda con el botón de la barra de acciones. Se usa
// window.print() y no el imprimir del sistema, porque lo que hay que imprimir
// es ESTA página y el CSS de impresión ya se encarga de esconder el buscador,
// el índice y los botones.
document.getElementById("boton-imprimir-ayuda").addEventListener("click", () => {
    window.print();
});


// ═══════════════════════════════════════════════════════════════════════════
// Al abrir con un ancla en la URL
// ═══════════════════════════════════════════════════════════════════════════

// Al llegar con #clientes, el navegador salta a la sección pero el bloque
// plegado sigue cerrado, y el destino parece estar vacío. Se abren los bloques
// de la sección apuntada y se marca en el índice.
function abrirAnclaInicial() {
    const id = window.location.hash.slice(1);
    if (!id) return;

    const seccion = document.getElementById(id);
    if (!seccion) return;

    for (const bloque of seccion.querySelectorAll(".ayuda-bloque")) {
        plegarBloque(bloque, true);
    }

    marcarIndice(seccion.id);
}

abrirAnclaInicial();
