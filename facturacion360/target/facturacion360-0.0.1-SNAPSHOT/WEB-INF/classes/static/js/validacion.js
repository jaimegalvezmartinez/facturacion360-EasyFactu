/**
 * @file La validación de un formulario, igual en las tres pantallas que tienen uno.
 *
 * Capa 1. Este módulo NO sabe de clientes, de facturas ni del emisor: recibe el formulario
 * o el campo y hace lo mismo en los tres sitios.
 *
 * Antes de esto la misma puerta estaba escrita de tres maneras: clientes la duplicaba en
 * alta.js y edicion.js, facturas usaba reportValidity() y el perfil checkValidity() seguido
 * de reportValidity(). Las tres decidían lo mismo y se veían distintas.
 *
 * La decisión de fondo es que los formularios van con `novalidate`: el navegador comprueba
 * pero NO dibuja. El globo nativo no se puede estilar, no se puede leer con el teclado, se
 * cierra solo y solo enseña un error cada vez. Enseñarlo nosotros en un .invalid-feedback
 * bajo el campo cuesta este módulo y a cambio los errores se quedan, se ven todos a la vez
 * y los lee un lector de pantalla.
 *
 * OJO al añadir un campo nuevo: con `novalidate`, lo que no se pinte aquí no se ve. Un
 * campo con restricciones y sin su .invalid-feedback no da error, simplemente no deja
 * guardar sin decir por qué.
 *
 * @author AngelDanielC0des
 */

/**
 * El hueco donde va el mensaje de error de un campo.
 *
 * Se busca por el nombre del campo y no con nextElementSibling: así el mensaje se puede
 * mover dentro de la celda sin que esto deje de encontrarlo.
 *
 * @param {HTMLFormElement} formulario el formulario que contiene el campo
 * @param {string} campo el atributo name del campo
 * @return {Element} el div del mensaje
 */
export function mensajeDe(formulario, campo) {
    return formulario.querySelector(`[name="${campo}"] ~ .invalid-feedback`);
}

/**
 * El hueco de un campo, venga de un formulario o no.
 *
 * No todo control vive dentro de un <form>: el filtro de año del listado trimestral es un
 * control suelto de la barra de filtros, y ahí `campo.form` es null. Se busca por el nombre
 * cuando lo tiene y, si no, entre sus hermanos.
 *
 * OJO con la segunda vía: coge el PRIMER .invalid-feedback del contenedor, así que da por
 * hecho que ahí dentro hay un solo campo. Hoy se cumple en los tres formularios, pero si
 * alguna vez conviven dos controles en el mismo envoltorio, el segundo escribiría su error
 * en el hueco del primero. Si llega ese caso, lo que toca es darle un `name` al campo para
 * que entre por la primera vía, no retorcer esta.
 *
 * @param {HTMLElement} campo
 * @return {Element|null}
 */
function huecoDe(campo) {
    if (campo.form && campo.name) return mensajeDe(campo.form, campo.name);

    return campo.parentElement?.querySelector(".invalid-feedback") ?? null;
}

/**
 * Marca un campo como incorrecto y escribe por qué.
 *
 * @param {HTMLElement} campo el control que no vale
 * @param {string} texto el motivo, en la lengua del usuario
 * @param {Object} [opciones]
 * @param {boolean} [opciones.enfocar=false] si además se lleva el cursor al campo. Solo
 *        para errores que llegan de una respuesta del servidor: en los que se recalculan
 *        mientras se teclea, mover el foco sacaría al usuario del campo que está usando
 */
export function marcarCampo(campo, texto, { enfocar = false } = {}) {
    const mensaje = huecoDe(campo);

    if (mensaje) {
        mensaje.textContent = texto;

        // El hueco necesita id para que el campo pueda apuntarle. Algunos ya vienen con uno
        // puesto desde fuera (los paneles de cliente se lo dan con su sufijo, porque puede
        // haber varios formularios abiertos); al resto se lo inventamos aquí para no obligar
        // a escribirlo a mano en cada HTML.
        if (!mensaje.id) {
            mensaje.id = `error-${campo.id || campo.name}`;
        }

        // El rojo de Bootstrap es solo color. aria-invalid es lo que hace que un lector de
        // pantalla diga "no válido" al llegar al campo, y describedby es lo que le hace leer
        // el motivo: sin ellos, quien no ve la pantalla se queda con el foco en un campo que
        // aparentemente no tiene nada.
        campo.setAttribute("aria-describedby", mensaje.id);
    }

    campo.classList.add("is-invalid");
    campo.setAttribute("aria-invalid", "true");

    if (enfocar) campo.focus();
}

/**
 * Quita la marca de un campo y le devuelve el mensaje que traía de fábrica.
 *
 * @param {HTMLElement} campo el control que vuelve a estar bien
 * @param {string} [textoBase] el mensaje que le toca enseñar al navegador cuando el campo
 *        se quede vacío. Se pasa porque el texto de fábrica lo sabe quien pintó el HTML,
 *        no este módulo
 */
export function limpiarCampo(campo, textoBase = "") {
    campo.classList.remove("is-invalid");
    campo.removeAttribute("aria-invalid");
    campo.removeAttribute("aria-describedby");

    const mensaje = huecoDe(campo);
    if (mensaje && textoBase) mensaje.textContent = textoBase;
}

/**
 * Quita la marca de "ya se ha intentado enviar".
 *
 * Es la contraparte obligatoria de validar() en los formularios que se REUTILIZAN, como los
 * que viven dentro de un modal. was-validated no se quita solo, y mientras esté puesta
 * Bootstrap pinta en rojo todo lo que esté :invalid, en vivo y según se teclea. Sin esta
 * llamada, un intento fallido deja el formulario en rojo para siempre: se cierra el modal, se
 * vuelve a abrir vacío, y ya sale todo marcado sin haber tocado nada.
 *
 * Los paneles de cliente no la necesitan porque se rehacen desde el <template> cada vez.
 *
 * @param {HTMLFormElement} formulario
 */
export function limpiarValidacion(formulario) {
    formulario.classList.remove("was-validated");
}

/**
 * Comprueba el formulario entero antes de enviarlo.
 *
 * was-validated es lo que hace que Bootstrap pinte en rojo el campo que falla y enseñe su
 * .invalid-feedback. El foco al primer campo malo NO es un adorno: con `novalidate`,
 * checkValidity() comprueba en silencio y no mueve nada, así que sin esta línea el usuario
 * ve un formulario que no se envía y ninguna pista de dónde está el problema.
 *
 * @param {HTMLFormElement} formulario
 * @return {boolean} si se puede enviar
 */
export function validar(formulario) {
    formulario.classList.add("was-validated");

    if (formulario.checkValidity()) return true;

    formulario.querySelector(":invalid")?.focus();
    return false;
}
