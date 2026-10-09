package edu.xtd.facturacion360.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextHolderStrategy;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import edu.xtd.facturacion360.dto.CambioClaveRequest;
import edu.xtd.facturacion360.dto.CsrfResponse;
import edu.xtd.facturacion360.dto.LoginRequest;
import edu.xtd.facturacion360.dto.RegistroRequest;
import edu.xtd.facturacion360.dto.Rol;
import edu.xtd.facturacion360.dto.Usuario;
import edu.xtd.facturacion360.dto.UsuarioResponse;
import edu.xtd.facturacion360.service.UsuarioService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * La puerta de entrada del portal: iniciar sesión, registrarse y saber quién está dentro.
 *
 * <p>El cierre de sesión (<b>POST /auth/logout</b>) no está aquí: lo lleva Spring Security en su
 * propio filtro, porque cerrar la sesión bien no es solo borrarla, es también rotar el
 * identificador y anular la autenticación guardada. Está declarado en
 * {@code ConfiguracionSeguridad} para que quede a mano dónde está.</p>
 *
 * <p>Nada de lo que hay aquí necesita sesión iniciada, y por eso las tres rutas están marcadas
 * como abiertas: son justamente las que se usan <em>antes</em> de tenerla.</p>
 *
 * @author AngelDanielC0des
 */
@Tag(
	name = "Autenticación",
	description = "Inicio de sesión, registro de cuentas y datos de la sesión actual"
)
@RestController
@RequestMapping("/auth")
public class AuthController {

	private static final Logger log = LoggerFactory.getLogger(AuthController.class);

	private final AuthenticationManager         authenticationManager;
	private final UsuarioService                usuarioService;
	private final SessionAuthenticationStrategy sessionAuthenticationStrategy;

	/**
	 * La estrategia oficial de Spring Security para guardar y recuperar el contexto.
	 *
	 * <p>Se instancia aquí en vez de llamar a {@code SecurityContextHolder} a pelo porque la
	 * aplicación va enhebrada (Servlet), y es el mismo contexto que usan los filtros: lo que
	 * se guarde por una cuenta y lo que lean por otra tienen que ser el mismo.</p>
	 */
	private final SecurityContextHolderStrategy contextoSeguridad =
			SecurityContextHolder.getContextHolderStrategy();

	private final SecurityContextRepository repositorioContexto =
			new HttpSessionSecurityContextRepository();

	/**
	 * Si el registro público está apagado.
	 *
	 * <p>Con {@code app.seguridad.registro-abierto=false} la pantalla de registro deja de
	 * existir: se sigue creando la primera cuenta con el script de
	 * {@code docu/migracion-usuarios.sql} y, a partir de ahí, las cuentas nuevas las da de
	 * alta un administrador. Es el interruptor que hay que bajar en cuanto la aplicación esté
	 * en producción.</p>
	 */
	@Value("${app.seguridad.registro-abierto:true}")
	private boolean registroAbierto;

	public AuthController(AuthenticationManager authenticationManager,
						  UsuarioService usuarioService,
						  SessionAuthenticationStrategy sessionAuthenticationStrategy) {
		this.authenticationManager         = authenticationManager;
		this.usuarioService                = usuarioService;
		this.sessionAuthenticationStrategy = sessionAuthenticationStrategy;
	}

	/**
	 * Inicia sesión.
	 *
	 * <p>Si el usuario y la contraseña cuadran, devuelve 200 con sus datos y, en la cabecera
	 * {@code Set-Cookie}, la cookie de sesión. Si no cuadran, devuelve un 401 con un
	 * {@code ProblemDetail}; el motivo es siempre el mismo tanto si el usuario no existe como
	 * si la contraseña falla, para no regalar la lista de cuentas dadas de alta.</p>
	 *
	 * <p>Un usuario con {@code activo = 0} responde igual que uno que no existe, por el mismo
	 * motivo. La diferencia se guarda en el log, que sí distingue los tres casos.</p>
	 *
	 * @param login      usuario y contraseña
	 * @param peticion   la petición HTTP, necesaria para rotar la sesión
	 * @param respuesta  la respuesta HTTP donde se escribe la cookie
	 * @return 200 con los datos del usuario que acaba de entrar
	 */
	@Operation(
		summary = "Inicia sesión",
		description = "Comprueba el usuario y la contraseña y abre la sesión. Devuelve la cookie de sesión."
	)
	@ApiResponses({
		@ApiResponse(responseCode = "200", description = "Sesión iniciada"),
		@ApiResponse(responseCode = "400", description = "Faltan datos o no son válidos"),
		@ApiResponse(responseCode = "401", description = "Usuario o contraseña incorrectos, o cuenta desactivada")
	})
	@PostMapping("/login")
	public UsuarioResponse login(@Valid @RequestBody LoginRequest login,
								 HttpServletRequest peticion,
								 HttpServletResponse respuesta) {

		// El token se crea "no autenticado" a propósito: es la forma de decir que todavía
		// nadie ha dicho quién es. El AuthenticationManager es el que carga el usuario, saca
		// su hash de la base de datos y lo compara con lo tecleado.
		UsernamePasswordAuthenticationToken aAutenticar =
				UsernamePasswordAuthenticationToken.unauthenticated(login.usuario(), login.clave());

		// Si algo falla, sale BadCredentialsException o DisabledException hacia el manejador
		// global, que las traduce a un 401 con un motivo neutro. No se atrapan aquí.
		Authentication autenticacion = authenticationManager.authenticate(aAutenticar);

		// Lo que sigue es el trabajo que Spring hace automáticamente en su login y que hay
		// que replicar al escribir uno propio. Sin la primera línea, la sesión que se acaba
		// de abrir conserva el identificador que tenía antes de entrar, y un identificador
		// robado serviría para colarse más tarde: es la protección contra el secuestro de
		// sesión, y es la razón de que el orden de estas tres líneas no se pueda cambiar.
		sessionAuthenticationStrategy.onAuthentication(autenticacion, peticion, respuesta);

		SecurityContext contexto = contextoSeguridad.createEmptyContext();
		contexto.setAuthentication(autenticacion);
		contextoSeguridad.setContext(contexto);
		repositorioContexto.saveContext(contexto, peticion, respuesta);

		Usuario usuario = usuarioService.buscar(login.usuario()).orElse(null);

		if (usuario != null) {
			usuarioService.registrarAcceso(usuario.idUsuario());
		}

		log.info("Inicio de sesión correcto: {} ({})", autenticacion.getName(), autenticacion.getAuthorities());

		return aRespuesta(usuario, login.usuario());
	}

	/**
	 * Cambia la contraseña de quien está dentro.
	 *
	 * <p>Solo puede cambiarse la propia. No hay ningún campo de usuario en el cuerpo de la
	 * petición, y el que se cambia se saca de la autenticación: aunque alguien fabricara un
	 * JSON con el nombre de otro usuario, lo que se tocaría es siempre la cuenta de quien
	 * tiene la sesión abierta. Cambiar la contraseña de otro es cosa de un administrador
	 * con acceso a la base de datos, y a mano.</p>
	 *
	 * <p>Después del cambio, la sesión sigue abierta pero con las credenciales nuevas
	 * dentro. Si se dejaran las viejas, en la sesión quedaría un hash que ya no corresponde
	 * con nada, y cualquier comprobación futura de contraseña fallaría con un error
	 * inexplicable. Es lo mismo que hace Spring en su propio cambio de contraseña.</p>
	 *
	 * @param cambio    la contraseña actual y la nueva
	 * @param peticion  la petición, para poder guardar el contexto actualizado en la sesión
	 * @param respuesta la respuesta, donde se escribe la cookie
	 * @return 200 con los datos del usuario
	 */
	@Operation(
		summary = "Cambia la contraseña de la sesión actual",
		description = "Sustituye la contraseña del usuario que ha iniciado sesión. Hay que enviar también la actual."
	)
	@ApiResponses({
		@ApiResponse(responseCode = "200", description = "Contraseña cambiada"),
		@ApiResponse(responseCode = "400", description = "Datos no válidos, o la contraseña actual no es la correcta"),
		@ApiResponse(responseCode = "401", description = "No hay sesión iniciada")
	})
	@PutMapping("/clave")
	public UsuarioResponse cambiarClave(@Valid @RequestBody CambioClaveRequest cambio,
										Authentication autenticacion,
										HttpServletRequest peticion,
										HttpServletResponse respuesta) {

		Usuario usuario = usuarioService.buscar(autenticacion.getName()).orElse(null);

		if (usuario == null) {
			// El usuario existió al entrar y ya no está. Raro, pero un 401 lo deja todo en su
			// sitio: esta persona ya no es nadie.
			log.warn("Cambio de contraseña de un usuario que ya no existe: {}", autenticacion.getName());

			throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,
					"La cuenta ya no está dada de alta");
		}

		// Si la actual no cuadra, sale ClaveActualIncorrectaException hacia el manejador
		// global, que la devuelve como un 400 diciendo exactamente eso.
		String claveHashNueva = usuarioService.cambiarClave(
				usuario, cambio.claveActual(), cambio.nueva());

		// Se rehace la autenticación de la sesión con el hash nuevo, para que lo que queda
		// dentro sea verdad. Los permisos se copian tal cual: este endpoint no los toca.
		Authentication actualizada = UsernamePasswordAuthenticationToken.authenticated(
				autenticacion.getName(),
				claveHashNueva,
				autenticacion.getAuthorities());

		SecurityContext contexto = contextoSeguridad.createEmptyContext();
		contexto.setAuthentication(actualizada);
		contextoSeguridad.setContext(contexto);
		repositorioContexto.saveContext(contexto, peticion, respuesta);

		return aRespuesta(usuario, autenticacion.getName());
	}

	/**
	 * Da de alta una cuenta nueva, desactivada.
	 *
	 * <p>La cuenta nace siempre con rol USUARIO: este endpoint no lee ningún campo de rol
	 * porque no lo hay en {@link RegistroRequest}, y esa ausencia es la medida de seguridad.
	 * Los ADMIN los crea un administrador desde el panel ({@code POST /usuarios}, cerrado con
	 * {@code ROLE_ADMIN}); además del script de {@code docu/migracion-usuarios.sql} y del
	 * UPDATE a mano, que siguen sirviendo para dejar la aplicación lista antes de que haya
	 * ninguna cuenta.</p>
	 *
	 * <p>Y nace también con {@code activo = false}: el 201 de aquí significa "tu cuenta está
	 * creada y esperando", no "ya puedes entrar". Hasta que un administrador la active desde el
	 * panel, el login devuelve el mismo 401 que devolvería si el usuario no existiera. La
	 * respuesta no lleva el campo {@code activo} —como no lleva el hash— porque a quien se
	 * registra no le hace falta saberlo: se lo dice el mensaje de la pantalla.</p>
	 *
	 * @param registro usuario, contraseña y nombre de la persona
	 * @return 201 con los datos de la cuenta creada, sin su hash
	 */
	@Operation(
		summary = "Crea una cuenta desactivada",
		description = "Da de alta una cuenta nueva con perfil USUARIO y sin activo. El rol no se puede elegir desde aquí, y hasta que un administrador no la active no puede usarse para entrar."
	)
	@ApiResponses({
		@ApiResponse(responseCode = "201", description = "Cuenta creada, y desactivada a la espera de que un administrador la active"),
		@ApiResponse(responseCode = "400", description = "Datos no válidos"),
		@ApiResponse(responseCode = "403", description = "El registro público está desactivado"),
		@ApiResponse(responseCode = "409", description = "Ese usuario ya está dado de alta")
	})
	@PostMapping("/registro")
	public ResponseEntity<UsuarioResponse> registrar(@Valid @RequestBody RegistroRequest registro) {

		if (!registroAbierto) {
			log.warn("Se ha intentado registrar una cuenta con el registro público desactivado");
			throw new ResponseStatusException(HttpStatus.FORBIDDEN,
					"El registro está cerrado: las cuentas nuevas las da de alta un administrador");
		}

		Usuario creado = usuarioService.registrar(registro);

		log.info("Cuenta creada: {}", creado.usuario());

		return ResponseEntity
				.status(HttpStatus.CREATED)
				.body(new UsuarioResponse(
						creado.idUsuario(),
						creado.usuario(),
						creado.nombre(),
						creado.rol()));
	}

	/**
	 * Dice quién está dentro.
	 *
	 * <p>Sin sesión devuelve 401, que es lo que espera: quien pregunta si ha entrado y la
	 * respuesta es que no, tiene que ir al login.</p>
	 *
	 * @param autenticacion la autenticación de la petición, que ya ha sido comprobada por el
	 *                      filtro de seguridad
	 * @return los datos del usuario de la sesión
	 */
	@Operation(
		summary = "Datos de la sesión actual",
		description = "Devuelve el usuario que ha iniciado sesión y su rol. 401 si no hay sesión."
	)
	@ApiResponses({
		@ApiResponse(responseCode = "200", description = "Datos de la sesión"),
		@ApiResponse(responseCode = "401", description = "No hay sesión iniciada")
	})
	@GetMapping("/yo")
	public UsuarioResponse yo(Authentication autenticacion) {

		Usuario usuario = usuarioService.buscar(autenticacion.getName()).orElse(null);

		return aRespuesta(usuario, autenticacion.getName());
	}

	/**
	 * Entrega el token de CSRF que el JavaScript tiene que mandar en las peticiones que
	 * escriben.
	 *
	 * <p>Se pide antes de escribir nada, también antes de iniciar sesión. Spring además
	 * deja el token en una cookie llamada {@code XSRF-TOKEN}, pero depender de ella obliga al
	 * JavaScript a ir leyendo y descifrando cookies, y este endpoint devuelve ya el valor
	 * limpio junto con el nombre de la cabecera en la que hay que ponerlo.</p>
	 *
	 * @param token el token que el filtro de seguridad ha dejado en la petición
	 * @return el token y los nombres de cabecera y parámetro
	 */
	@Operation(
		summary = "Token de CSRF",
		description = "Devuelve el token que debe mandar la cabecera indicada en las peticiones que modifican datos"
	)
	@GetMapping("/csrf")
	public CsrfResponse csrf(CsrfToken token) {

		return new CsrfResponse(token.getHeaderName(), token.getParameterName(), token.getToken());
	}

	/**
	 * Traduce un usuario de la base de datos al DTO que sale por la API.
	 *
	 * <p>Si el usuario ha desaparecido entre la autenticación y ahora (que es posible: alguien
	 * lo ha borrado desde otro sitio en ese medio segundo), se devuelve lo mínimo con el rol
	 * que se le había dado al entrar, en vez de un 500. Es un caso ridículo, pero el
	 * <em>nombre</em> de la sesión lo tiene que dar alguien.</p>
	 *
	 * @param usuario      el usuario leído de la base de datos, o {@code null}
	 * @param nombreConocido el nombre que ya se sabe, el de la autenticación
	 * @return el DTO de respuesta
	 */
	private UsuarioResponse aRespuesta(Usuario usuario, String nombreConocido) {

		if (usuario == null) {
			return new UsuarioResponse(0, nombreConocido, nombreConocido, Rol.USUARIO);
		}

		return new UsuarioResponse(
				usuario.idUsuario(),
				usuario.usuario(),
				usuario.nombre(),
				usuario.rol());
	}

}