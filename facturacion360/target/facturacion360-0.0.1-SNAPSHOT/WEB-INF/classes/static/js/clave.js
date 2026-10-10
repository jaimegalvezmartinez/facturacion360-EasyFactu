/**
 * @file Las reglas de la contraseña, escritas una sola vez para el navegador.
 *
 * Capa 0, como seguridad.js: no importa nada, así que lo pueden usar las pantallas que
 * cambian contraseñas (Mi cuenta y el panel de administración) sin arrastrar el resto.
 *
 * Lo que hay aquí es una copia de lo que exige el servidor, en `ClaveSegura` (validacion/).
 * Una copia, no una fuente: lo que decide es el servidor, y este módulo sirve para no gastar
 * una petición en un 400 que ya se sabe. Si se cambian las reglas, hay que cambiar los dos
 * sitios, y por eso el texto de REGLAS_CLAVE es el mismo que construye ClaveSeguraValidador.
 *
 * @author AngelDanielC0des
 */

/** Caracteres mínimos, lo mismo que `minimo()` en la anotación del servidor. */
export const MINIMO_CLAVE = 12;

/** Caracteres máximos: el tamaño de la columna. */
export const MAXIMO_CLAVE = 200;

/**
 * Las reglas, una por una, para poder pintarlas en una lista y decir cuáles faltan.
 *
 * Cada regla es un texto para la persona y una función que dice si la contraseña la cumple.
 * Las funciones usan `\p{...}` con la marca `u`: las clases de Unicode, y no [A-Z], porque en
 * español "Á" es mayúscula y "ñ" minúscula, y con el rango ASCII saldrían rechazadas. El
 * símbolo es lo que no es letra, ni número, ni espacio: el espacio se deja fuera porque si
 * contara, "esta es la mia" cumpliría la regla del símbolo sin llevar ninguno.
 */
export const REGLAS_CLAVE = [
    {
        id: "longitud",
        texto: `Al menos ${MINIMO_CLAVE} caracteres`,
        cumple: (clave) => clave.length >= MINIMO_CLAVE && clave.length <= MAXIMO_CLAVE,
    },
    {
        id: "mayuscula",
        texto: "Una letra mayúscula (A-Z)",
        cumple: (clave) => /\p{Lu}/u.test(clave),
    },
    {
        id: "minuscula",
        texto: "Una letra minúscula (a-z)",
        cumple: (clave) => /\p{Ll}/u.test(clave),
    },
    {
        id: "digito",
        texto: "Un número (0-9)",
        cumple: (clave) => /\p{N}/u.test(clave),
    },
    {
        id: "simbolo",
        texto: "Un símbolo (. , ! ? @ #)",
        cumple: (clave) => /[^\p{L}\p{N}\s]/u.test(clave),
    },
];

/**
 * Las reglas que esta contraseña NO cumple, en el orden en que están escritas.
 *
 * @param {string} clave la contraseña tecleada
 * @return {Object[]} las reglas que faltan, cada una con su `id` y su `texto`
 */
export function reglasQueFaltan(clave) {
    const valor = clave ?? "";

    return REGLAS_CLAVE.filter((regla) => !regla.cumple(valor));
}

/**
 * Si la contraseña cumple todo.
 *
 * @param {string} clave la contraseña tecleada
 * @return {boolean}
 */
export function claveValida(clave) {
    return reglasQueFaltan(clave).length === 0;
}

/**
 * El motivo de por qué no vale, en una frase.
 *
 * Se juntan todas las que faltan en vez de decir solo la primera: quien está escribiendo va a
 * tener que arreglar más de una cosa casi siempre, y enterarse de una en una es ir a ciegas.
 *
 * @param {string} clave la contraseña tecleada
 * @param {string} [sujeto="La contraseña"] cómo llamar a la contraseña en el mensaje, para que
 *        "Mi cuenta" y el panel no digan exactamente la misma frase
 * @return {string} el motivo, o una cadena vacía si la contraseña cumple todo
 */
export function motivoDeClave(clave, sujeto = "La contraseña") {
    const faltan = reglasQueFaltan(clave);

    if (faltan.length === 0) return "";

    // Se escriben en minúscula porque van en medio de la frase: "necesita una letra
    // mayúscula, un número y un símbolo".
    const partes = faltan.map((regla) => minuscula(regla.texto));

    if (partes.length === 1) return `${sujeto} necesita ${partes[0]}.`;

    return `${sujeto} necesita ${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}.`;
}

/**
 * Pinta la lista de requisitos y la va marcando según lo que se teclee.
 *
 * La lista se construye una vez y después solo se le cambia la clase a cada punto: repintarla
 * entera en cada tecla resetea el foco si el <li> lo tuviera, y hace parpadear el texto.
 *
 * @param {HTMLElement} lista el <ul> donde van los requisitos
 * @param {string} clave la contraseña tecleada, o "" para dejarlos todos sin marcar
 */
export function pintarRequisitos(lista, clave) {
    if (!lista) return;

    if (lista.childElementCount !== REGLAS_CLAVE.length) {
        lista.replaceChildren(...REGLAS_CLAVE.map((regla) => {
            const punto = document.createElement("li");
            punto.className = "requisito";
            punto.dataset.regla = regla.id;

            const icono = document.createElement("i");
            icono.className = "requisito-icono";
            icono.setAttribute("aria-hidden", "true");

            const texto = document.createElement("span");
            texto.textContent = regla.texto;

            punto.append(icono, texto);

            return punto;
        }));
    }

    for (const punto of lista.children) {
        const cumple = REGLAS_CLAVE.find((regla) => regla.id === punto.dataset.regla).cumple(clave);

        punto.classList.toggle("cumplido", cumple);

        // El <i> del icono lleva lo que se ve; el texto del punto lo lee entero un lector de
        // pantalla, así que el estado se le dice con aria, no solo pintando el color.
        punto.querySelector(".requisito-icono").className = cumple
            ? "requisito-icono fa-solid fa-check"
            : "requisito-icono fa-solid fa-xmark";
    }
}

/** "Una letra mayúscula (A-Z)" -> "una letra mayúscula (a-z)". */
function minuscula(texto) {
    return texto.charAt(0).toLowerCase() + texto.slice(1);
}
