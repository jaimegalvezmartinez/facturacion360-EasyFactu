import { crearAvisos } from './js/notificaciones.js';
import { motivoDe } from './js/problema.js';
// El PUT del emisor también necesita el token de CSRF.
import { cabecerasConSeguridad } from './js/seguridad.js';
import { limpiarValidacion, validar } from './js/validacion.js';

// Los avisos de esta pantalla. El comportamiento —cuándo se borra uno, cómo se lee en alto—
// vive en js/notificaciones.js, el mismo módulo que usan clientes, facturas y el visor. Aquí
// solo se dice cuáles son los dos contenedores del perfil.
const { anunciar, fijar } = crearAvisos({
    franja: document.getElementById('aviso-emisor'),
    region: document.getElementById('anuncios'),
});

/*
   * URL base del recurso del emisor.
   */
  const EMISOR_URL = "/emisor";

document.addEventListener("DOMContentLoaded", () => {

    const formEditarEmisor = document.getElementById("formEditarEmisor");
    const inputFoto = document.getElementById("inputFoto");
    const logoPreview = document.getElementById("logoPreview");

    const displayNombre = document.getElementById("displayNombre");
    const displayCif = document.getElementById("displayCif");
    const displayDireccion = document.getElementById("displayDireccion");
    const displayEmail = document.getElementById("displayEmail");
    const displayTelefono = document.getElementById("displayTelefono");

    const inputNombre = document.getElementById("inputNombre");
    const inputCif = document.getElementById("inputCif");
    const inputDireccion = document.getElementById("inputDireccion");
    const inputEmail = document.getElementById("inputEmail");
    const inputTelefono = document.getElementById("inputTelefono");

    const avisoEmisor = document.getElementById("aviso-emisor");
    const anuncios = document.getElementById("anuncios");

	const pantallaCarga = document.getElementById('pantallaCarga');

  

});
    /*
     * Carga los datos actuales del emisor.
     */
    async function cargarEmisor() {

        try {

            const response = await fetch(EMISOR_URL, {
                method: "GET"
            });

            if (!response.ok) {
                throw new Error("No se han podido obtener los datos del emisor.");
            }

            const emisor = await response.json();

            mostrarEmisor(emisor);

        } catch (error) {

            console.error("Error cargando el emisor:", error);

            mostrarAviso(
                "No se han podido cargar los datos del emisor.",
                true
            );
        }
    }


    /*
     * Muestra los datos del emisor en la página
     * y los coloca también en el formulario de edición.
     */
    function mostrarEmisor(emisor) {

        if (!emisor) {
            return;
        }

        const nombre = emisor.nombre ?? "";
        const cif = emisor.cif ?? "";
        const direccion = emisor.direccion ?? "";
        const email = emisor.email ?? "";
        const telefono = emisor.telefono ?? "";
        // 1. Buscamos la pantalla de carga y la mostramos quitando 'd-none'
        
        /*if (pantallaCarga) {
            pantallaCarga.classList.remove('d-none');
        }*/

        try {

			if (displayNombre) 
			{
			      displayNombre.textContent = nombre;
			 }
			
            if (displayCif) {
                displayCif.textContent = cif;
            }

            if (displayDireccion) {
                displayDireccion.textContent = direccion;
            }

            if (displayEmail) {
                displayEmail.textContent = email;
            }

            if (displayTelefono) {
                displayTelefono.textContent = telefono;
            }


            /*
             * Datos del formulario.
             */
            if (inputNombre) {
                inputNombre.value = nombre;
            }

            if (inputCif) {
                inputCif.value = cif;
            }

            if (inputDireccion) {
                inputDireccion.value = direccion;
            }

            if (inputEmail) {
                inputEmail.value = email;
            }
			
			if (inputTelefono) {
			    inputTelefono.value = telefono;
			}

            cargarLogo();

        } catch (error) {

            /*
             * El logo se obtiene mediante el endpoint existente.
             *
             * Si existe, se muestra.
             * Si no existe, se muestra el placeholder.
             */

            fijar(
                'No se han podido cargar los datos del emisor.',
                { esError: true }
            );
            fijar(
                'No se han podido cargar los datos del emisor.',
                { esError: true }
            );
            fijar(
                'No se han podido cargar los datos del emisor.',
                { esError: true }
            );
        } finally {
            // 2. Pase lo que pase (éxito o error), ocultamos la pantalla de carga al terminar
            if (pantallaCarga) {
                pantallaCarga.classList.add('d-none');
            }
        }
    }


    /*
     * Carga el logo actual del emisor.
     */
    function cargarLogo() {

        if (!logoPreview) {
            return;
        }

        /*
         * Se añade un timestamp para evitar que el navegador
         * mantenga en caché una versión anterior después de
         * cambiar el logo.
         */
        logoPreview.src = EMISOR_URL + "/logo?t=" + Date.now();

        logoPreview.onerror = () => {

            logoPreview.onerror = null;

            logoPreview.src = "./img/sinfotoperfil.webp";
        };
    }


    /*
     * Previsualización de la imagen seleccionada.
     */
    if (inputFoto && logoPreview) {

    inputFoto.addEventListener("change", () => {

        const archivo = inputFoto.files[0];

        if (!archivo) {
            cargarLogo();
            return;
        }


        /*
         * Comprobamos que sea una imagen.
         */
        if (!archivo.type || !archivo.type.startsWith("image/")) {

            inputFoto.value = "";

            mostrarAviso(
                "El archivo seleccionado debe ser una imagen.",
                true
            );

            cargarLogo();

            return;
        }


        /*
         * Creamos una URL temporal para mostrar
         * la imagen antes de guardarla.
         */
        const urlImagen = URL.createObjectURL(archivo);

        logoPreview.src = urlImagen;

        logoPreview.onload = () => {
            URL.revokeObjectURL(urlImagen);
        };

    });
}


/*
 * Validación del formulario.
 */
function validarFormulario() {

    if (!formEditarEmisor) {
        return false;
    }

    if (!formEditarEmisor.checkValidity()) {

        formEditarEmisor.classList.add("was-validated");

        return false;
    }


    /*
     * Validación de la imagen.
     */
    if (inputFoto && inputFoto.files.length > 0) {

        const archivo = inputFoto.files[0];

        if (!archivo.type || !archivo.type.startsWith("image/")) {

            mostrarAviso(
                "El archivo seleccionado debe ser una imagen.",
                true
            );

            return false;
        }
    }

    return true;
}


/*
 * Guarda los datos del emisor.
 */
async function guardarEmisor() {

    if (!validarFormulario()) {
        return;
    }


    /*
     * Creamos FormData porque el endpoint admite
     * multipart/form-data.
     */
    const formData = new FormData();


    /*
     * Datos normales del emisor.
     *
     * Estos nombres deben coincidir con las propiedades
     * del objeto Emisor del backend.
     */
    formData.append(
        "nombre",
        inputNombre.value.trim()
    );

    formData.append(
        "cif",
        inputCif.value.trim()
    );

    formData.append(
        "direccion",
        inputDireccion.value.trim()
    );

    formData.append(
        "email",
        inputEmail.value.trim()
    );

    formData.append(
        "telefono",
        inputTelefono.value.trim()
    );


    /*
     * Imagen.
     *
     * MUY IMPORTANTE:
     * si el usuario no ha seleccionado una imagen nueva,
     * NO añadimos "foto" al FormData.
     *
     * El backend se encargará de conservar el logo existente.
     */
    if (inputFoto && inputFoto.files.length > 0) {

        const archivo = inputFoto.files[0];

        formData.append("foto", archivo);
    }


    try {

        /*
         * Deshabilitamos el botón mientras se procesa
         * la petición para evitar envíos duplicados.
         */
        const botonGuardar =
            formEditarEmisor.querySelector(
                'button[type="submit"]'
            );

        if (botonGuardar) {
            botonGuardar.disabled = true;
        }


        /*
         * PUT al endpoint que admite la imagen.
         *
         * NO establecemos Content-Type manualmente.
         *
         * El navegador lo genera automáticamente incluyendo
         * el boundary necesario para multipart/form-data.
         */
        const response = await fetch(
            EMISOR_URL + "/con-imagen",
            {
                method: "PUT",
                // El Content-Type NO se pone a mano: lo tiene que generar el navegador
                // para que incluya el "boundary" del multipart. Solo se añade la cabecera
                // del token de CSRF, que es lo que Spring exige en toda escritura.
                headers: await cabecerasConSeguridad(),
                body: formData
            }
        );


        if (!response.ok) {

            let mensaje = "No se han podido guardar los datos del emisor.";

            try {

                const errorResponse = await response.json();

                if (errorResponse && errorResponse.message) {
                    mensaje = errorResponse.message;
                }

            } catch (e) {
                /*
                 * La respuesta de error puede no ser JSON.
                 */
            }

            throw new Error(mensaje);
        }


        /*
         * Obtenemos el emisor actualizado.
         */
        const emisorActualizado = await response.json();


        /*
         * Actualizamos la información mostrada.
         */
        mostrarEmisor(emisorActualizado);


        /*
         * Limpiamos el selector.
         */
        if (inputFoto) {
            inputFoto.value = "";
        }


        /*
         * Eliminamos el estado de validación.
         */
        formEditarEmisor.classList.remove("was-validated");


        /*
         * Cerramos el modal.
         */
        const modalElement =
            document.getElementById("modalEditarEmisor");

        if (modalElement && typeof bootstrap !== "undefined") {

            const modal =
                bootstrap.Modal.getInstance(modalElement);

            if (modal) {
                modal.hide();
            }
        }


        mostrarAviso(
            "Los datos del emisor se han actualizado correctamente.",
            false
        );


        anunciar(
            "Los datos del emisor se han actualizado correctamente."
        );


    } catch (error) {

        console.error(
            "Error actualizando el emisor:",
            error
        );

        mostrarAviso(
            error.message ||
            "No se han podido actualizar los datos del emisor.",
            true
        );


        anunciar(
            "Se ha producido un error al actualizar los datos del emisor."
        );


    } finally {

        const botonGuardar =
            formEditarEmisor.querySelector(
                'button[type="submit"]'
            );

        if (botonGuardar) {
            botonGuardar.disabled = false;
        }
    }
}


/*
 * Evento de envío del formulario.
 */
if (formEditarEmisor) {

    formEditarEmisor.addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();

            await guardarEmisor();
        }
    );
}


/*
 * Muestra mensajes visibles.
 */
function mostrarAviso(mensaje, error = false) {

    if (!avisoEmisor) {
        return;
    }

    avisoEmisor.textContent = mensaje;

    if (error) {
        avisoEmisor.classList.add("error");
    } else {
        avisoEmisor.classList.remove("error");
    }
}


/*
 * Mensajes para lectores de pantalla.
 */
/*function anunciar(mensaje) {

    if (!anuncios) {
        return;
    }

    anuncios.textContent = "";

    setTimeout(() => {
        anuncios.textContent = mensaje;
    }, 50);
}*/


/*
 * Cuando se abre el modal de edición volvemos a cargar
 * los datos actuales para asegurarnos de que el formulario
 * contiene la información más reciente.
 */
const modalEditarEmisor =
    document.getElementById("modalEditarEmisor");

if (modalEditarEmisor) {

    modalEditarEmisor.addEventListener(
        "show.bs.modal",
        () => {

            cargarEmisor();

            /*
             * Nunca mantenemos seleccionado un archivo
             * anterior al abrir el formulario.
             */
            if (inputFoto) {
                inputFoto.value = "";
            }
        }
    );
}


/*
 * Carga inicial.
 */
cargarEmisor();


