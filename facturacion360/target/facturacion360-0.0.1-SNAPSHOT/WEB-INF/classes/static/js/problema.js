/**
 * @file Leer el motivo cuando el servidor responde que algo ha ido mal.
 *
 * Capa 1. Una sola función, sin dependencias, que usan las tres pantallas que consultan el
 * cuerpo de un error.
 *
 * Existe porque la API devuelve los errores como ProblemDetail (RFC 9457): el cuerpo es un
 * JSON y el motivo vive en su campo `detail`. Antes se leía con `respuesta.text()`, que
 * ahora le enseñaría al usuario el JSON entero, con sus llaves y sus comillas.
 *
 * @author AngelDanielC0des
 */

/**
 * El motivo que cuenta el servidor, o el de reserva si no cuenta ninguno.
 *
 * No lanza nunca, y eso es lo importante: si el cuerpo viene vacío, no es JSON o no trae
 * `detail`, devuelve el texto de reserva. Un fallo dentro del manejo de un fallo deja la
 * pantalla muda, que es bastante peor que un mensaje genérico.
 *
 * @param {Response} respuesta la respuesta que no vino bien
 * @param {string} reserva qué decir si el servidor no explica nada
 * @return {Promise<string>} el motivo, listo para enseñar
 */
export async function motivoDe(respuesta, reserva) {
    try {
        const problema = await respuesta.json();

        return problema?.detail || reserva;
    } catch {
        // Sin variable: no hay nada que mirar. Que el cuerpo no sea JSON es justo el caso
        // para el que existe la reserva, no una incidencia que haga falta registrar.
        return reserva;
    }
}
