package edu.xtd.facturacion360.service;

import java.util.List;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import edu.xtd.facturacion360.dto.AltaAdminRequest;
import edu.xtd.facturacion360.dto.EdicionUsuarioRequest;
import edu.xtd.facturacion360.dto.RegistroRequest;
import edu.xtd.facturacion360.dto.Rol;
import edu.xtd.facturacion360.dto.Usuario;
import edu.xtd.facturacion360.dto.UsuarioAdminResponse;
import edu.xtd.facturacion360.repository.UsuarioRepository;

/**
 * Alta de cuentas contra la tabla {@code usuarios}.
 *
 * <p>El único trabajo de verdad de esta clase es una cosa que no se puede dejar en el
 * controlador: <strong>hashear la contraseña antes de que llegue a la base de datos</strong>.
 * Todo lo que sale de aquí hacia abajo lleva ya un hash BCrypt, y la contraseña en claro no
 * vuelve a existir en la memoria del proceso más que en la petición entrante. Eso vale para las
 * tres puertas por las que se puede crear o cambiar una clave —el registro público, el alta del
 * panel y la clave que un administrador pone a otro— y por eso el hasheo está en un solo sitio
 * y no repetido en cada uno.</p>
 *
 * <p>Lo que NO comprueba esta clase es quién está llamando. Eso lo hace la cadena de seguridad
 * de {@code ConfiguracionSeguridad}, y es a propósito: si cada método de servicio comprobara su
 * propio permiso habría dos sitios donde se puede equivocar uno, y el que se equivoca es el que
 * nadie lee.</p>
 */
@Service
public class UsuarioServiceImpl implements UsuarioService {

	private static final Logger log = LoggerFactory.getLogger(UsuarioServiceImpl.class);

	private final UsuarioRepository usuarioRepository;
	private final PasswordEncoder    passwordEncoder;

	public UsuarioServiceImpl(UsuarioRepository usuarioRepository, PasswordEncoder passwordEncoder) {
		this.usuarioRepository = usuarioRepository;
		this.passwordEncoder    = passwordEncoder;
	}

	@Override
	public Optional<Usuario> buscar(String usuario) {
		return usuarioRepository.findPorUsuario(usuario);
	}

	@Override
	public Usuario registrar(RegistroRequest registro) {

		// El rol se escribe aquí, no se lee de la petición: Rol.USUARIO, sin más. Es la
		// segunda vez que se dice (la primera, en el DTO) y se vuelve a decir porque es el
		// tipo de línea que un buen día alguien "flexibiliza" con un campo opcional.
		String claveHash = passwordEncoder.encode(registro.clave());

		log.info("Alta de usuario: {}", registro.usuario());

		// La cuenta nace DESACTIVADA, y esta línea es la razón de que el registro abierto no
		// sea una puerta abierta: quien se registra puede entrar en la base de datos, pero no
		// puede usar la aplicación hasta que un administrador lo valide. El que vale la pena es
		// "ha escrito su nombre y una contraseña"; lo que no vale, todavía, es "es quien dice
		// ser". Por eso el false de aquí, y por eso en alta() de abajo sea un true.
		return usuarioRepository.insert(new Usuario(
				0,
				registro.usuario(),
				claveHash,
				registro.nombre(),
				Rol.USUARIO,
				false,
				null,
				null
		));
	}

	@Override
	public Usuario alta(AltaAdminRequest alta) {

		// Aquí, en cambio, el rol SÍ viene de la petición, y es la diferencia entre este
		// método y registrar(): quien llega aquí ha pasado antes la regla /usuarios/** →
		// ROLE_ADMIN, así que crear un ADMIN a propósito es justamente su trabajo.
		//
		// La cuenta nace activa. Crear una cuenta desactivada desde el alta no tiene sentido:
		// sería dar de alta a alguien y dejarle escrito que no puede entrar, que es lo mismo
		// que no darlo de alta.
		String claveHash = passwordEncoder.encode(alta.clave());

		log.info("Alta de usuario desde el panel: {} con rol {}", alta.usuario(), alta.rol());

		return usuarioRepository.insert(new Usuario(
				0,
				alta.usuario(),
				claveHash,
				alta.nombre(),
				alta.rol(),
				true,
				null,
				null
		));
	}

	@Override
	public List<UsuarioAdminResponse> listar() {

		List<Usuario> usuarios = usuarioRepository.findTodos();

		log.debug("Listado de usuarios del panel: {} cuentas", usuarios.size());

		// El map es de Usuario a UsuarioAdminResponse, y UsuarioAdminResponse.de() es el único
		// punto de traducción. El hash se queda en la fila de la base de datos y no sale de
		// aquí: no es que se filtre en la respuesta, es que el record de salida no tiene donde
		// escribirlo.
		return usuarios.stream()
				.map(UsuarioAdminResponse::de)
				.toList();
	}

	@Override
	public UsuarioAdminResponse editar(int idUsuario, EdicionUsuarioRequest edicion) {

		Usuario actual = usuarioRepository.findPorId(idUsuario)
				.orElseThrow(() -> new UsuarioNoEncontradoException(idUsuario));

		// La comprobación va ANTES de escribir nada, y mira la tabla entera, no solo esta fila.
		// Si esta cuenta es la última con rol ADMIN y activo, y el cambio la deja sin permisos
		// o la desactiva, el panel se queda sin quien pueda volver a abrirlo: habría que
		// arreglarlo con un UPDATE en la base de datos.
		if (dejariaSinAdministradores(actual, edicion.rol(), Boolean.TRUE.equals(edicion.activo()))) {

			log.warn("Se ha rechazado dejar la aplicación sin administradores: {} era la última "
					+ "cuenta con permisos de administrador", actual.usuario());

			throw new UsuarioInalterableException();
		}

		usuarioRepository.actualizar(idUsuario, edicion.nombre(), edicion.rol(), edicion.activo());

		log.info("Cuenta modificada: {} (rol {}, activo {})",
				actual.usuario(), edicion.rol(), edicion.activo());

		// Se relee con findPorId y no se devuelve el record de entrada: entre el UPDATE y el
		// SELECT no ha pasado nada, pero el patrón "escribe y vuelve a leer lo que hay" evita
		// que la pantalla se repinte con un objeto construido a mano que se parece a la fila
		// pero no es la fila.
		return usuarioRepository.findPorId(idUsuario)
				.map(UsuarioAdminResponse::de)
				.orElseThrow(() -> new UsuarioNoEncontradoException(idUsuario));
	}

	@Override
	public UsuarioAdminResponse ponerClave(int idUsuario, String clave) {

		Usuario usuario = usuarioRepository.findPorId(idUsuario)
				.orElseThrow(() -> new UsuarioNoEncontradoException(idUsuario));

		// El hasheo es el mismo de siempre y ocurre aquí, no en el controlador: la contraseña
		// en claro no baja de este método.
		usuarioRepository.cambiarClave(idUsuario, passwordEncoder.encode(clave));

		// No se registra la contraseña ni el hash, solo quién la cambió y a quién. El log es lo
		// primero que se lee cuando hay que saber qué pasó con una cuenta.
		log.info("Contraseña cambiada por un administrador: {} -> {}",
				"panel", usuario.usuario());

		return UsuarioAdminResponse.de(usuario);
	}

	@Override
	public void registrarAcceso(int idUsuario) {
		usuarioRepository.registrarAcceso(idUsuario);
	}

	@Override
	public void borrar(int idUsuario, String nombreAdmin, String claveAdmin) {

		Usuario objetivo = usuarioRepository.findPorId(idUsuario)
				.orElseThrow(() -> new UsuarioNoEncontradoException(idUsuario));

		// Quién va a borrarlo se saca de la autenticación, nunca del cuerpo de la petición: si
		// el cuerpo dijera a quién se le pregunta la contraseña, bastaría con mandar el nombre
		// de otro para que la comprobación fuera sobre la cuenta equivocada.
		Usuario admin = usuarioRepository.findPorUsuario(nombreAdmin)
				.orElseThrow(() -> new UsuarioNoEncontradoException(0));

		// Borrarse a uno mismo se rechaza antes de mirar la contraseña, y por una razón que no
		// es de seguridad sino de sentido común: el que borra su propia cuenta se queda sin
		// sesión en el mismo instante, y si era el último ADMIN se queda además fuera del
		// panel. Hay un endpoint para todo lo que se le pueda ocurrir hacer con su cuenta.
		if (objetivo.idUsuario() == admin.idUsuario()) {

			log.warn("Se ha rechazado un intento de borrar la propia cuenta: {}", nombreAdmin);

			throw new UsuarioInalterableException("No te puedes borrar a ti mismo desde el panel. "
					+ "Para dejar tu cuenta, pídeselo a otro administrador");
		}

		// La contraseña del que está dentro. Se compara contra el hash guardado con el
		// codificador de Spring, que es lo único que sabe hacer: comparar cadenas no valdría
		// porque los hashes llevan sal y dos personas con la misma contraseña tienen hashes
		// distintos.
		if (!passwordEncoder.matches(claveAdmin, admin.claveHash())) {

			log.warn("Borrado de la cuenta {} rechazado: contraseña de confirmación incorrecta "
					+ "de {}", objetivo.usuario(), nombreAdmin);

			throw new ClaveConfirmacionIncorrectaException();
		}

		// Aquí no hace falta la comprobación de "no dejar la aplicación sin administradores"
		// que sí hace editar(). El invariante se cumple solo: quien llama es un administrador
		// que acaba de autenticarse —una cuenta activa con rol ADMIN— y el borrado de la
		// propia cuenta se ha rechazado justo antes. Con esas dos cosas, después del borrado
		// sigue existiendo al menos un administrador activo, siempre. En la edición sí hace
		// falta, porque allí el que llama puede ser el propio usuario que se baja de rol.
		usuarioRepository.borrar(idUsuario);

		log.info("Cuenta borrada por {}: {}", nombreAdmin, objetivo.usuario());
	}

	@Override
	public String cambiarClave(Usuario usuario, String claveActual, String nueva) {

		// Se comprueba la actual contra el hash guardado ANTES de tocar nada. Sin esta
		// comprobación, tener una sesión abierta bastaría para quedarse con la cuenta.
		if (!passwordEncoder.matches(claveActual, usuario.claveHash())) {

			log.warn("Intento de cambio de contraseña con la clave actual equivocada: {}", usuario.usuario());

			throw new ClaveActualIncorrectaException();
		}

		// La contraseña en claro se hashea aquí y no baja de aquí. Al repositorio solo llega
		// un $2a$10$..., igual que en el alta.
		String claveHash = passwordEncoder.encode(nueva);

		usuarioRepository.cambiarClave(usuario.idUsuario(), claveHash);

		log.info("Contraseña cambiada: {}", usuario.usuario());

		// Se devuelve el hash para que quien llama lo meta en la sesión. Volver a leerlo de
		// la base de datos con un SELECT sería tirar una consulta por el mismo dato que
		// aquí ya está.
		return claveHash;
	}

	/**
	 * ¿Este cambio dejaría la tabla de usuarios sin ningún administrador activo?
	 *
	 * <p>Solo mira el caso en el que la cuenta es <em>la última</em> con
	 * {@code rol = 'ADMIN'} y {@code activo = 1}, y el cambio la deja sin rol ADMIN o la
	 * desactiva (o la borra, que es el caso que se le pasa con {@code Rol.USUARIO} y
	 * {@code false}). Los demás —cambiar el nombre, quitarle el rol a alguien que no es el
	 * último, activar una cuenta— no tienen nada que ver con esto.</p>
	 *
	 * <p>Contar es una consulta más, y podría hacerse en SQL con un {@code UPDATE} que solo
	 * escribiera cuando hubiera más de un administrador. Se pregunta en Java y se escribe después
	 * a propósito: el {@code UPDATE} condicional tiene el fallo clásico de que, si lo que falla
	 * es la condición, la cuenta se queda sin tocar y el 409 no explica por qué. Aquí el cambio
	 * o se hace entero o no se hace.</p>
	 *
	 * @param actual      la cuenta tal y como está ahora en la base de datos
	 * @param rolNuevo    el perfil que se le quiere dejar
	 * @param activoNuevo si se la quiere dejar activa
	 * @return true si el cambio no se puede permitir
	 */
	private boolean dejariaSinAdministradores(Usuario actual, Rol rolNuevo, boolean activoNuevo) {

		// Si esta cuenta no es administradora activa, no puede ser la última: no hay nada que
		// comprobar y no hace falta gastar la consulta.
		boolean eraAdministradorActivo = actual.rol() == Rol.ADMIN && actual.activo();

		if (!eraAdministradorActivo) {
			return false;
		}

		// Si sigue siendo administradora activa, tampoco hay problema.
		if (rolNuevo == Rol.ADMIN && activoNuevo) {
			return false;
		}

		// Ha dicho que sí, que la bajan de rol o la desactivan. Solo queda mirar si hay
		// alguien más de administrador activo al que poder abrir el panel más adelante.
		return usuarioRepository.findTodos()
				.stream()
				.filter(Usuario::activo)
				.filter(otro -> otro.rol() == Rol.ADMIN)
				.filter(otro -> otro.idUsuario() != actual.idUsuario())
				.findFirst()
				.isEmpty();
	}

}
