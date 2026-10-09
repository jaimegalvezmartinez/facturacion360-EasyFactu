/**
 * @file El ojo que enseña la contraseña y la vuelve a tapar.
 *
 * Capa 0, como seguridad.js y clave.js: no importa nada, así que lo usan las tres pantallas
 * que escriben contraseñas —el alta del login, "Mi cuenta" y el panel de administración—
 * sin arrastrar ninguna otra capa.
 *
 * Se pone en JavaScript y no en el HTML a propósito. El botón se crea desde aquí y se cuelga
 * dentro del <div class="acceso-campo"> del campo, porque el sitio tiene las dos formas: en
 * login.html y cuenta.html los campos están escritos en el HTML, y en usuarios.js se
 * construyen con la fábrica `campo()` cada vez que se abre un panel. Escribir el botón once
 * en cada HTML dejaría los del panel fuera, y repetir la lógica del toggle en tres sitios es
 * justo lo que un módulo como este evita.
 *
 * Lo que NO hace, y no por descuido: no lee el valor de la contraseña ni lo escribe en ningún
 * sitio. Solo cambia el atributo `type` del input, que es lo que hace que el navegador lo
 * enmascare o no. La contraseña no sale nunca del campo.
 *
 * @author AngelDanielC0des
 */

/** La clase que el CSS usa para reservar el hueco del ojo y apartar el icono del campo. */
const CLASE_CON_OJO = "con-ojo";

/** Marca el input al que ya se le ha puesto un ojo, para no ponerlo dos veces. */
const MARCA = "ojoPuesto";

/**
 * Le pone un ojo a todos los campos de contraseña que hay dentro de un contenedor.
 *
 * <p>Se puede llamar más de una vez sobre el mismo sitio sin que pase nada: un campo que ya
 * tiene ojo se salta. Eso importa en el panel de administración, donde `campo()` construye los
 * campos de nuevo cada vez que se abre un panel, pero también por si una pantalla lo llama al
 * cargar y otra al abrir algo.</p>
 *
 * @param {HTMLElement} contenedor el sitio donde buscar campos de contraseña
 */
export function conectarOjos(contenedor) {

    if (!contenedor) return;

    for (const input of contenedor.querySelectorAll('input[type="password"]')) {
        const campo = input.closest(".acceso-campo") ?? input.parentElement;

        if (!campo || input.dataset[MARCA]) continue;

        campo.classList.add(CLASE_CON_OJO);
        input.dataset[MARCA] = "si";
        campo.append(botonDe(input));
    }
}

/**
 * El botón del ojo de un campo.
 *
 * <p>Es un <button type="button"> y no un <i> como los iconos de adorno que llevan los campos:
 * ese es solo decorativo y lleva `pointer-events:none` para que el clic pase al input de
 * debajo. Aquí el clic tiene que parar aquí, y además es un control de verdad: sin la etiqueta
 * y con el tabulador no se podría usar con el teclado, que es como se usa la mayor parte de
 * las veces.</p>
 *
 * @param {HTMLInputElement} input el campo de contraseña
 * @return {HTMLButtonElement} el botón, ya metido dentro del campo
 */
function botonDe(input) {

    const boton = document.createElement("button");

    boton.type = "button";
    boton.className = "ojo-clave";

    const glifo = document.createElement("i");
    glifo.setAttribute("aria-hidden", "true");
    boton.append(glifo);

    pintarOjo(boton, false);

    boton.addEventListener("click", () => {

        const visible = input.type === "text";

        input.type = visible ? "password" : "text";

        pintarOjo(boton, !visible);

        // El foco se devuelve al campo y el cursor se pone al final. Sin esto, el foco se
        // queda en el botón y quien iba por la mitad de la contraseña al decidir que quería
        // verla tiene que volver a hacer clic en el campo para seguir escribiendo, con el
        // cursor además donde lo dejó, que no es donde estaba escribiendo.
        input.focus();

        try {
            input.setSelectionRange(input.value.length, input.value.length);
        } catch {
            // Algunos navegadores no dejan mover el cursor dentro de un campo de contraseña.
            // Es un detalle de dónde se ve el cursor y no vale la pena que falle el clic.
        }
    });

    return boton;
}

/**
 * Pone el botón en el estado que le toca: ojo abierto para tapar, ojo tachado para enseñar.
 *
 * <p>La etiqueta y el título DICEN lo que va a hacer el botón, no lo que está haciendo ahora.
 * Es al revés de lo habitual a propósito: un lector de pantalla necesita saber que al pulsarlo
 * se le va a enseñar la contraseña, y un "Ocultar la contraseña" en un botón cuya función es
 * enseñar obliga a quien lo oye a deducir el estado. El icono, en cambio, sí dibuja el estado,
 * porque es lo que se ve.</p>
 *
 * <p>Sin `aria-pressed`: el estado ya lo dice la etiqueta, y un `aria-pressed` que cambia
 * junto con ella le diría dos veces lo mismo al lector de pantalla, con el peligro de que se
 * le oigan contradictorios.</p>
 *
 * @param {HTMLButtonElement} boton el botón del ojo
 * @param {boolean} visible si la contraseña se está viendo
 */
function pintarOjo(boton, visible) {

    const glifo = boton.firstElementChild;

    glifo.className = visible ? "fa-regular fa-eye-slash" : "fa-regular fa-eye";

    const texto = visible ? "Ocultar la contraseña" : "Mostrar la contraseña";

    boton.setAttribute("aria-label", texto);
    boton.title = texto;
}