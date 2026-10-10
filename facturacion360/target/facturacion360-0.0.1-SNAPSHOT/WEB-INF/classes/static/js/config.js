/**
 * @file Constantes de la pantalla de clientes.
 *
 * Capa 0. No importa nada y no toca el documento: solo valores que el resto lee.
 *
 * @author AngelDanielC0des
 */

// Rutas relativas: el HTML lo sirve el propio Spring Boot, mismo origen (sin CORS).
export const API_CLIENTE = "/cliente";

export const API_LISTAR_PAGINA = "/cliente/listar-pagina";

export const API_PROVINCIAS = "/cliente/provincias";

export const API_POBLACIONES = "/cliente/poblaciones";

// Clientes por página. Tiene que valer lo mismo que CriteriosCliente.TAMANO_DEFECTO en el
// backend; no hay forma de compartir la constante entre Java y este archivo, así que queda
// anotado en los dos sitios. Si aquí se pusiera más de TAMANO_MAX (100), el backend lo
// acotaría por su cuenta y la paginación seguiría cuadrando, pero la tabla enseñaría menos
// filas de las pedidas sin decir por qué.
export const TAMANO_PAGINA = 10;

// Cuánto esperamos tras la última tecla antes de consultar. Sin esta pausa,
// escribir "garcia" lanzaría 6 peticiones a la base de datos en vez de 1.
export const ESPERA_TECLEO_MS = 300;

// Cuánto tarda en aparecer el aviso de "Ver detalles" al dejar el ratón encima.
export const RETARDO_PISTA_MS = 1000;

// Lo que dura el plegado del panel. Tiene que coincidir con la transición de
// .despliegue-envoltorio en style.css: es el tiempo que esperamos para quitarlo del DOM.
export const DURACION_PLEGADO_MS = 250;

// Cuánto se queda en pantalla un aviso ("Cliente guardado") antes de borrarse solo.
export const DURACION_AVISO_MS = 5000;

// El sufijo de los id del formulario del alta. Los de la edición llevan el id del cliente, que
// siempre es un número, así que "nuevo" no puede chocar con ninguno.
export const SUFIJO_ALTA = "nuevo";

/**
 * La tabla acaba de repintarse y lo que hubiera abierto encima hay que rehacerlo.
 *
 * Lo dispara el repintado y lo escucha el alta, que vuelve a insertar su fila. Va por evento y
 * no por llamada directa para que la tabla no tenga que conocer cada funcionalidad que pinta
 * algo encima de ella: anuncia lo que ha hecho y quien tenga trabajo se apunta.
 */
export const EVENTO_TABLA_REPINTADA = "clientes:repintados";

// Los campos que se pueden editar, en un orden fijo. Se usa para leer el formulario, para
// rellenarlo y para comparar si algo ha cambiado: al recorrer siempre esta misma lista, los
// dos objetos que se comparan salen con las claves en el mismo orden.
export const CAMPOS_EDITABLES = ["nombre", "nifCif", "email", "telefono",
    "direccion", "codigoPostal", "poblacion", "provincia"];

// Los que la BD admite a NULL (el resto son NOT NULL y el formulario los exige).
export const CAMPOS_OPCIONALES = ["email", "telefono", "codigoPostal"];

// Todo lo que un cliente puede traer distinto de una vez a otra. La fecha de alta no se edita
// desde aquí, pero se compara igual: si cambiara, la columna "Alta" tendría que enseñarlo.
export const CAMPOS_CLIENTE = [...CAMPOS_EDITABLES, "fechaAlta"];

/*
 * Etiqueta e icono del botón según lo que se esté viendo AHORA. Decir "Más recientes"
 * o "A → Z" es mucho más claro que un "asc/desc" genérico, porque nombra el resultado
 * y no el mecanismo.
 */
export const ETIQUETAS_ORDEN = {
    "fecha_alta|desc": { texto: "Más recientes", icono: "fa-arrow-down-wide-short" },
    "fecha_alta|asc": { texto: "Más antiguos", icono: "fa-arrow-up-short-wide" },
    "nombre|asc": { texto: "A → Z", icono: "fa-arrow-down-a-z" },
    "nombre|desc": { texto: "Z → A", icono: "fa-arrow-up-z-a" },
};

// Sentido natural de cada columna al empezar a ordenar por ella: las fechas se miran
// de la más nueva a la más vieja, y los nombres de la A a la Z.
export const DIRECCION_POR_DEFECTO = {
    fecha_alta: "desc",
    nombre: "asc",
};
