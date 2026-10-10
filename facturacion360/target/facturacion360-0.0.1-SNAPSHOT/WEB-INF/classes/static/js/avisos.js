/**
 * @file Lo que la pantalla le dice a quien la usa.
 *
 * Capa 1. La franja de avisos, la region para lectores de pantalla y los globos emergentes.
 *
 * @author AngelDanielC0des
 */

import { RETARDO_PISTA_MS } from "./config.js";
import { avisoClientes, barraFiltros, cuerpoTabla, regionAnuncios } from "./dom.js";
import { crearAvisos } from "./notificaciones.js";

// Los avisos de esta pantalla. El comportamiento —cuándo se borra uno, cómo se lee en alto,
// por qué se vacía en vez de esconderse— vive en notificaciones.js, que es el mismo para las
// cuatro páginas. Aquí solo se dice CUÁLES son los dos contenedores de clientes.
//
// Se reexportan para que los módulos que ya llamaban a anunciar() sigan importando de aquí y
// no tengan que enterarse de nada. limpiar() no se saca: en clientes la franja nunca se vacía
// a mano, cada aviso releva al anterior. El día que haga falta, se añade aquí.
const { anunciar, fijar } = crearAvisos({
    franja: avisoClientes,
    region: regionAnuncios,
});

export { anunciar, fijar };

/** Escribe el texto del aviso en cada elemento y descarta el globo que ya tuviera. */
export function escribirPista(elementos, texto) {
    for (const elemento of elementos) {
        // Repintar una fila casi nunca cambia la palabra. Sin esta salida, cada repaso
        // destruye y recrea una instancia que estaba bien, peleándose con los temporizadores
        // de apertura que hubiera en vuelo.
        if (elemento.dataset.bsTitle === texto) continue;

        elemento.dataset.bsTitle = texto;

        // El globo se crea en el primer hover y se queda con el texto que hubiera entonces.
        // Al destruirlo, el siguiente hover lo vuelve a crear ya con el texto nuevo.
        window.bootstrap?.Tooltip.getInstance(elemento)?.dispose();
    }
}

/**
 * Destruye los globos de una zona y barre los que hayan quedado sueltos.
 *
 * Destruye y no esconde: hide() no sirve aquí. Bootstrap se salta el cierre mientras quede
 * ALGÚN disparador activo, y al pulsar un botón ese botón se queda con el foco, así que el
 * globo sobreviviría al hide() y al mouseleave y se quedaría flotando. dispose() derriba el
 * globo pase lo que pase, y la raíz delegada vuelve a crear la instancia en el siguiente
 * hover, así que no se pierde nada.
 *
 * @param {Element} raiz la tabla entera al repintarla, una sola fila si solo se rehacen sus
 *        celdas, o la fila que se acaba de pulsar
 */
export function limpiarPistas(raiz = cuerpoTabla) {
    for (const elemento of raiz.querySelectorAll("[data-bs-title]")) {
        window.bootstrap?.Tooltip.getInstance(elemento)?.dispose();
    }

    // Y lo que haya quedado suelto. Con container: "body" el globo cuelga del <body>, no del
    // elemento, así que si su dueño desapareció sin pasar por aquí nadie lo cierra nunca y se
    // van acumulando. Un globo vivo siempre lo apunta el aria-describedby de su elemento; el
    // que no, es basura. El selector es ~= y no =: aria-describedby admite varios ids
    // separados por espacios.
    for (const globo of document.body.querySelectorAll(".tooltip")) {
        if (!globo.id || !document.querySelector(`[aria-describedby~="${globo.id}"]`)) {
            globo.remove();
        }
    }
}

// Un único aviso delegado en el <tbody>, no uno por celda: así vale también para las filas
// que todavía no se han pintado y no hay que crearlos y destruirlos en cada repintado.
// container: 'body' porque la tabla va dentro de .table-responsive, que tiene overflow y
// recortaría el globo por arriba.
if (window.bootstrap) {
    new bootstrap.Tooltip(cuerpoTabla, {
        // UNA sola celda por fila lleva el aviso de la fila, la del nombre. Antes lo llevaban
        // las cinco, y recorrer una fila con el ratón encendía cinco instancias con sus cinco
        // temporizadores para decir todas lo mismo. Que el resto de la fila también despliega
        // ya lo cuenta el cursor de mano que .fila-cliente pone en style.css.
        // El enlace del correo o del teléfono conserva el suyo, que dice algo distinto, y
        // Bootstrap se queda con el elemento coincidente MÁS INTERNO.
        selector: ".enlace-celda, .fila-cliente th.cliente-nombre, .celda-acciones .btn[data-bs-title]",
        delay: { show: RETARDO_PISTA_MS, hide: 0 },
        container: "body",
        placement: "top",
        trigger: "hover focus",
    });

    // Y otro para la barra de filtros, con los mismos ajustes: un aviso que se abre distinto
    // o con otro retardo según la zona de la pantalla se nota, y ahí es donde estaba el title
    // del navegador que ponía el botón de dirección.
    new bootstrap.Tooltip(barraFiltros, {
        selector: "[data-bs-title]",
        delay: { show: RETARDO_PISTA_MS, hide: 0 },
        container: "body",
        placement: "top",
        trigger: "hover focus",
    });
}
