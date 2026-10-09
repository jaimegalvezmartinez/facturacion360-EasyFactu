package edu.xtd.facturacion360.service;

import java.util.List;
import java.util.Optional;

import edu.xtd.facturacion360.dto.AltaAdminRequest;
import edu.xtd.facturacion360.dto.EdicionUsuarioRequest;
import edu.xtd.facturacion360.dto.RegistroRequest;
import edu.xtd.facturacion360.dto.Usuario;
import edu.xtd.facturacion360.dto.UsuarioAdminResponse;

/**
 * Alta y seguimiento de las cuentas del portal.
 *
 * <p>Del login en sí no se ocupa esta interfaz, y es una decisión: comprobar la contraseña es
 * trabajo de Spring Security, que ya trae lo suyo (comparación a tiempo constante, usuario
 * inexistente y contraseña incorrecta dan el mismo error, bloqueo de cuentas desactivadas...).
 * Que el servicio lo repita sería tener dos verdades.</p>
 *
 * <p>Lo que hay aquí son las dos formas de dar de alta una cuenta y el mantenimiento de las que
 * ya existen. Son deliberadamente distintas porque lo que se puede pedir en cada una es distinto:
 * el registro público no acepta rol, y el panel de administración sí. Ver
 * {@link #registrar(RegistroRequest)} y {@link #alta(AltaAdminRequest)}.</p>
 */
public interface UsuarioService {

	/**
	 * Busca un usuario por su nombre de acceso.
	 *
	 * @param usuario el nombre con el que se inicia sesión
	 * @return el usuario, o vacío si no existe
	 */
	Optional<Usuario> buscar(String usuario);

	/**
	 * Da de alta una cuenta nueva con perfil USUARIO y <strong>desactivada</strong>.
	 *
	 * <p>Es lo que llama {@code POST /auth/registro}, el registro público. El rol no se lee de
	 * ninguna parte: se escribe {@code Rol.USUARIO} dentro de la implementación. Un endpoint que
	 * aceptara el rol aquí dejaría que cualquiera que llegara a la pantalla de acceso se
	 * creara una cuenta de administrador con una llamada.</p>
	 *
	 * <p>Nace con {@code activo = false}, así que la cuenta existe pero todavía no entra: hasta
	 * que un administrador la valida desde el panel ({@code PUT /usuarios/{id}} con
	 * {@code activo = true}) el login devuelve el mismo 401 que si no existiera. Es lo que hace
	 * que el registro abierto no sea dar acceso a la aplicación a cualquiera que llegue a la
	 * pantalla. La cuenta sí queda guardada y con su nombre reservado, y quien la ha creado
	 * recibe el aviso de que falta esa validación.</p>
	 *
	 * @param registro lo que ha enviado la pantalla de registro
	 * @return el usuario creado, ya con su identificador
	 * @throws edu.xtd.facturacion360.repository.UsuarioRepository.UsuarioDuplicadoException
	 *         si ese nombre de usuario ya estaba dado de alta
	 */
	Usuario registrar(RegistroRequest registro);

	/**
	 * Da de alta una cuenta nueva con el rol que elija quien la está dando de alta.
	 *
	 * <p>Es lo que llama el panel de administración, y solo el panel: el endpoint está cerrado con
	 * {@code ROLE_ADMIN} en la cadena de seguridad, no aquí. Un endpoint de alta que admita rol
	 * es exactamente lo que no puede existir abierto a cualquiera, así que la regla que lo
	 * protege está en {@code ConfiguracionSeguridad} y no repartida entre los controladores.</p>
	 *
	 * @param alta el usuario, la contraseña en claro, el nombre y el rol
	 * @return el usuario creado, ya con su identificador
	 * @throws edu.xtd.facturacion360.repository.UsuarioRepository.UsuarioDuplicadoException
	 *         si ese nombre de usuario ya estaba dado de alta
	 */
	Usuario alta(AltaAdminRequest alta);

	/**
	 * Todas las cuentas de la aplicación.
	 *
	 * <p>Solo la llama el panel. Devuelve {@link UsuarioAdminResponse}, que no tiene campo para
	 * el hash: la traducción de la fila al DTO de salida está en
	 * {@link UsuarioAdminResponse#de(Usuario)} y por eso la contraseña no puede colarse ni por
	 * error.</p>
	 *
	 * @return todas las cuentas, de la más antigua a la más reciente
	 */
	List<UsuarioAdminResponse> listar();

	/**
	 * Cambia el nombre, el rol y el estado de una cuenta.
	 *
	 * @param idUsuario identificador de la cuenta a modificar
	 * @param edicion  el nombre, el rol y si queda activa
	 * @return la cuenta ya modificada, para que la pantalla se repinte con lo que hay en la
	 *         base de datos y no con lo que se tecleó
	 * @throws UsuarioNoEncontradoException si no hay ninguna cuenta con ese identificador
	 * @throws UsuarioInalterableException si se intenta dejar sin administradores a la propia
	 *         aplicación (baixar de rol o desactivar la última cuenta con permisos de
	 *         administrador)
	 */
	UsuarioAdminResponse editar(int idUsuario, EdicionUsuarioRequest edicion);

	/**
	 * Pone una contraseña nueva a una cuenta, sin preguntar la anterior.
	 *
	 * <p>La diferencia con {@link #cambiarClave(Usuario, String, String)} es intencionada: allí
	 * el que cambia es el dueño y tiene que demostrar que tiene la contraseña vieja; aquí el que
	 * cambia es un administrador, que ya ha demostrado tener permiso con su sesión y cuyo trabajo
	 * es precisamente abrir la cuenta de quien la ha perdido.</p>
	 *
	 * @param idUsuario identificador de la cuenta a la que se le pone clave
	 * @param clave     la contraseña nueva, en claro
	 * @return la cuenta ya modificada
	 * @throws UsuarioNoEncontradoException si no hay ninguna cuenta con ese identificador
	 */
	UsuarioAdminResponse ponerClave(int idUsuario, String clave);

	/**
	 * Borra una cuenta, previa confirmación con la contraseña del que la está borrando.
	 *
	 * <p>Tres comprobaciones, en este orden, y todas antes de tocar la tabla:</p>
	 * <ol>
	 *   <li><strong>Que la cuenta exista</strong>, o un 404.</li>
	 *   <li><strong>Que la contraseña sea la del administrador que está dentro</strong>, o un 400.
	 *       Es lo que separa «estoy delante del teclado» de «he dejado el navegador abierto»:
	 *       quien no pueda teclear esa contraseña no borra nada, por muy válida que sea su
	 *       sesión.</li>
	 *   <li><strong>Que no se pueda dejar la aplicación sin administradores</strong>, o un 409, con
	 *       la misma regla que el cambio de rol.</li>
	 * </ol>
	 *
	 * @param idUsuario   identificador de la cuenta a borrar
	 * @param nombreAdmin nombre de la cuenta que está haciendo el borrado
	 * @param claveAdmin  contraseña de esa cuenta, en claro
	 * @throws UsuarioNoEncontradoException si la cuenta a borrar no existe, o si la del
	 *         administrador tampoco (que sería raro: significaría que la sesión es de alguien
	 *         que ya no está dado de alta)
	 * @throws UsuarioInalterableException si el borrado dejaría la aplicación sin
	 *         administradores
	 * @throws ClaveConfirmacionIncorrectaException si la contraseña no es la de la cuenta que
	 *         está dentro
	 */
	void borrar(int idUsuario, String nombreAdmin, String claveAdmin);

	/**
	 * Anota el último acceso de un usuario.
	 *
	 * @param idUsuario identificador del usuario que acaba de entrar
	 */
	void registrarAcceso(int idUsuario);

	/**
	 * Cambia la contraseña de un usuario, pero solo si la que dice tener ahora es la buena.
	 *
	 * @param usuario     el usuario que cambia su contraseña (el de la sesión, nunca uno que
	 *                    venga en el cuerpo de la petición)
	 * @param claveActual la contraseña con la que se supone que está dentro
	 * @param nueva       la contraseña que quiere poner
	 * @return el hash de la contraseña nueva, que quien la cambia necesita para dejar la
	 *         sesión con las credenciales al día
	 * @throws ClaveActualIncorrectaException si la claveActual no es la que tiene guardada
	 */
	String cambiarClave(Usuario usuario, String claveActual, String nueva);

	/**
	 * La contraseña que se ha puesto no es la que tiene el usuario.
	 *
	 * <p>Es un 400 y no un 401: la sesión existe y es válida (por eso ha llegado hasta aquí),
	 * lo que está mal es lo que se ha enviado. Un 401 mandaría al login, que es
	 * desconcertante, porque en el login la contraseña es la correcta.</p>
	 */
	class ClaveActualIncorrectaException extends RuntimeException {

		public ClaveActualIncorrectaException() {
			super("La contraseña actual no es correcta");
		}
	}

	/**
	 * La cuenta que hay que modificar no existe.
	 *
	 * <p>Un 404 y no un 400: lo que no encaja no es el cuerpo de la petición, es el identificador
	 * de la ruta, que apunta a algo que no está. El mismo criterio que se aplica al resto de
	 * rutas con {@code @PathVariable} del proyecto.</p>
	 */
	class UsuarioNoEncontradoException extends RuntimeException {

		public UsuarioNoEncontradoException(int idUsuario) {
			super("No hay ninguna cuenta con el identificador " + idUsuario);
		}
	}

	/**
	 * El cambio dejaría la aplicación sin ningún administrador.
	 *
	 * <p>Existe porque el panel deja cambiar roles y estados a cualquiera, y una de las dos
	 * combinaciones posibles es quedarse sin nadie que pueda volver a abrir el panel. Un
	 * administrador que se baja a sí mismo de rol, o que desactiva la última cuenta de
	 * administrador, se queda fuera y la vuelta a entrar es por la base de datos.</p>
	 */
	class UsuarioInalterableException extends RuntimeException {

		public UsuarioInalterableException() {
			this("No se puede dejar la aplicación sin administradores: "
					+ "es la última cuenta con permisos de administrador");
		}

		/**
		 * Para los rechazos que son por otra causa pero se sirven con el mismo 409.
		 *
		 * <p>Borrarse a uno mismo no es, en el fondo, lo mismo que dejar la aplicación sin
		 * administradores, pero comparte con ello la consecuencia: quien lo hace se queda
		 * fuera del panel y no lo ha querido. Un mismo 409 con el motivo de cada caso es más
		 * útil que dos códigos que el frontend tendría que aprender a distinguir.</p>
		 *
		 * @param motivo el texto que se le va a enseñar a quien lo ha provocado
		 */
		public UsuarioInalterableException(String motivo) {
			super(motivo);
		}
	}

	/**
	 * La contraseña que se ha escrito para confirmar no es la de quien está dentro.
	 *
	 * <p>Un 400 y no un 401, por el mismo motivo que {@link ClaveActualIncorrectaException}: la
	 * sesión es válida (si no, la petición ni siquiera habría llegado al servicio), lo que está
	 * mal es lo que se ha enviado. Un 401 aquí mandaría al login, que sería desconcertante,
	 * porque en el login la contraseña que se teclea sí es la correcta.</p>
	 *
	 * <p>El mensaje dice solo que la contraseña no es la correcta, sin decir de qué cuenta: con la
	 * sesión ya abierta no hay ningún nombre en juego —el del administrador ya lo sabe—, pero no
	 * se da ningún detalle de más. Los errores de esta clase se escriben para quien los va a
	 * leer, no para quien los pueda provocar.</p>
	 */
	class ClaveConfirmacionIncorrectaException extends RuntimeException {

		public ClaveConfirmacionIncorrectaException() {
			super("La contraseña no es la correcta");
		}
	}

}
