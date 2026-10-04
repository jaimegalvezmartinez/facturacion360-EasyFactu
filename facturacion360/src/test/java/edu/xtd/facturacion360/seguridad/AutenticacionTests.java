package edu.xtd.facturacion360.seguridad;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.mock.web.MockCookie;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.MvcResult;

/**
 * El acceso al portal: entrar, no entrar y darse de alta.
 *
 * <p>La contraparte de {@code AccesoSinSesionTests}: allí se comprueba la puerta y aquí la
 * llave.</p>
 *
 * @author AngelDanielC0des
 */
@SpringBootTest
@AutoConfigureMockMvc
class AutenticacionTests {

	private static final String CLAVE = "CambiarYa.2026";

	private static final String CABECERA_CSRF = "X-XSRF-TOKEN";

	private static final String COOKIE_CSRF = "XSRF-TOKEN";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Test
	@DisplayName("Con usuario y contraseña correctos se abre sesión")
	void entrarConCredencialesCorrectas() throws Exception {

		MvcResult resultado = mockMvc.perform(entrar("admin", CLAVE))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.usuario").value("admin"))
				.andExpect(jsonPath("$.rol").value("ADMIN"))
				// El hash de la contraseña no sale nunca por la API, ni siquiera aquí.
				.andExpect(jsonPath("$.claveHash").doesNotExist())
				.andReturn();

		// Y tiene que existir sesión. No se comprueba la cabecera Set-Cookie con su
		// JSESSIONID porque MockMvc no gestiona cookies de sesión (es el contenedor el que
		// las pone, y aquí no hay contenedor): lo que se comprueba es que la sesión se ha
		// creado y guarda la autenticación, que es lo que en Tomcat se traduce en esa
		// cabecera.
		assertThat(resultado.getRequest().getSession(false)).isNotNull();
	}

	@Test
	@DisplayName("Con la contraseña mal puesta, un 401 y ningún detalle de más")
	void entrarConContrasenaIncorrecta() throws Exception {

		mockMvc.perform(entrar("admin", "no-es-la-clave"))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.detail", containsString("no son correctos")));
	}

	@Test
	@DisplayName("Un usuario que no existe responde lo mismo que una contraseña mala")
	void entrarComoUsuarioInexistente() throws Exception {

		mockMvc.perform(entrar("no-existe", CLAVE))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.detail", containsString("no son correctos")));
	}

	@Test
	@DisplayName("Una cuenta desactivada no puede entrar, pero tampoco se confirma que exista")
	void entrarEnCuentaDesactivada() throws Exception {

		mockMvc.perform(entrar("baja", CLAVE))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.detail", containsString("no son correctos")));
	}

	@Test
	@DisplayName("Faltan campos: un 400 con el motivo de cada uno")
	void entrarSinDatos() throws Exception {

		MvcResult resultado = mockMvc.perform(conToken(post("/auth/login")
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"usuario\":\"\",\"clave\":\"\"}")))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errores.usuario", containsString("obligatorio")))
				.andExpect(jsonPath("$.errores.clave", containsString("obligatoria")))
				.andReturn();

		assertNoTraza(resultado);
	}

	@Test
	@DisplayName("Tras entrar, /auth/yo dice quién está dentro")
	void saberQuienEsta() throws Exception {

		MvcResult entrada = mockMvc.perform(entrar("datos", CLAVE)).andReturn();

		MockHttpSession sesion = (MockHttpSession) entrada.getRequest().getSession(false);

		mockMvc.perform(get("/auth/yo").session(sesion))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.usuario").value("datos"))
				.andExpect(jsonPath("$.rol").value("USUARIO"));
	}

	@Test
	@DisplayName("El registro da de alta una cuenta y esa cuenta ya puede entrar")
	void registrarYEntrar() throws Exception {

		String usuario = "recien-creado";

		mockMvc.perform(registrar(usuario, "UnaClave.Larga2026", "Persona Nueva"))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.rol").value("USUARIO"))
				.andExpect(jsonPath("$.claveHash").doesNotExist());

		mockMvc.perform(entrar(usuario, "UnaClave.Larga2026"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.rol").value("USUARIO"));

		// La contraseña no está en la tabla ni en claro ni hasheada como MD5: lo que se
		// guarda es el hash de BCrypt, que empieza por "$2a$".
		String guardada = jdbcTemplate.queryForObject(
				"SELECT clave_hash FROM bd_facturacion.usuarios WHERE usuario = ?", String.class, usuario);

		assertThatGuardada(guardada);
	}

	@Test
	@DisplayName("El registro no deja pedir el rol ADMIN")
	void elRegistroNoDejaPedirAdmin() throws Exception {

		// La petición manda un campo "rol":"ADMIN" de más. El registro lo ignora, y en
		// ningún caso lo convierte en ADMIN: que los campos desconocidos se descarten sin
		// quejarse es justo lo que hace que esto no sea un agujero.
		mockMvc.perform(registrar("falso-admin", "UnaClave.Larga2026", "Falso Administrador"))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.rol").value("USUARIO"));

		String rol = jdbcTemplate.queryForObject(
				"SELECT rol FROM bd_facturacion.usuarios WHERE usuario = ?", String.class, "falso-admin");

		assertThat(rol).isEqualTo("USUARIO");
	}

	@Test
	@DisplayName("Pedir el token de CSRF deja la cookie que lo acompaña")
	void pedirElTokenDejaCookie() throws Exception {

		MvcResult resultado = mockMvc
				.perform(get("/auth/csrf").session(new MockHttpSession()))
				.andExpect(status().isOk())
				.andReturn();

		// El token no solo se devuelve en el cuerpo: Spring lo deja también en la cookie
		// XSRF-TOKEN, y es de ahí contra la que luego se compara el de la cabecera. Sin esa
		// cookie, toda escritura saldría con un 403.
		assertThat(resultado.getResponse().getCookie(COOKIE_CSRF)).isNotNull();
	}

	@Test
	@DisplayName("Un usuario repetido responde 409 diciendo cuál es el campo")
	void registrarUnUsuarioQueYaExiste() throws Exception {

		mockMvc.perform(registrar("admin", "UnaClave.Larga2026", "El Que Ya Está"))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail", containsString("admin")));
	}

	@Test
	@DisplayName("Al entrar se anota el último acceso")
	void entrarAnotaElUltimoAcceso() throws Exception {

		// Se deja a NULL antes de entrar. No por gusto: los tests comparten base de datos y
		// esta misma cuenta ya habrá entrado en otro test antes que este, así que dar por
		// hecho que está a NULL al empezar sería depender del orden en que se ejecutan.
		jdbcTemplate.update(
				"UPDATE bd_facturacion.usuarios SET ultimo_acceso = NULL WHERE usuario = 'datos'");

		Object antes = jdbcTemplate.queryForObject(
				"SELECT ultimo_acceso FROM bd_facturacion.usuarios WHERE usuario = 'datos'", Object.class);

		assertThat(antes).isNull();

		mockMvc.perform(entrar("datos", CLAVE)).andExpect(status().isOk());

		Object despues = jdbcTemplate.queryForObject(
				"SELECT ultimo_acceso FROM bd_facturacion.usuarios WHERE usuario = 'datos'", Object.class);

		assertThat(despues).isNotNull();
	}

	@Test
	@DisplayName("Al cerrar sesión, la sesión deja de valer")
	void cerrarSesion() throws Exception {

		MvcResult entrada = mockMvc.perform(entrar("datos", CLAVE)).andReturn();

		MockHttpSession sesion = (MockHttpSession) entrada.getRequest().getSession(false);

		mockMvc.perform(conToken(post("/auth/logout").session(sesion)))
				.andExpect(status().isNoContent());

		mockMvc.perform(get("/auth/yo").session(sesion))
				.andExpect(status().isUnauthorized());
	}

	// ── Cambio de contraseña ─────────────────────────────────────────────────────

	@Test
	@DisplayName("Se cambia la contraseña con la actual correcta y luego se entra con la nueva")
	void cambiarLaContrasena() throws Exception {

		// Una cuenta propia para este test: si se cambiara la de "datos", los demás tests
		// dejarían de poder entrar con la clave que tienen escrita.
		String usuario = "cambio-de-clave";

		mockMvc.perform(registrar(usuario, "LaClaveVieja.2026", "Persona del Cambio"))
				.andExpect(status().isCreated());

		MockHttpSession sesion = iniciarSesion(usuario, "LaClaveVieja.2026");

		mockMvc.perform(cambiarClave(sesion, "LaClaveVieja.2026", "LaClaveNueva.2026"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.usuario").value(usuario))
				.andExpect(jsonPath("$.claveHash").doesNotExist());

		// La sesión sigue viva: cambiar la contraseña no echa a nadie de la aplicación.
		mockMvc.perform(get("/auth/yo").session(sesion))
				.andExpect(status().isOk());

		// Y con la nueva ya se entra, mientras que con la vieja no.
		mockMvc.perform(entrar(usuario, "LaClaveNueva.2026")).andExpect(status().isOk());

		mockMvc.perform(entrar(usuario, "LaClaveVieja.2026"))
				.andExpect(status().isUnauthorized());
	}

	@Test
	@DisplayName("Con la contraseña actual equivocada, no se cambia nada")
	void cambiarLaContrasenaConLaActualEquivocada() throws Exception {

		String usuario = "actual-equivocada";

		mockMvc.perform(registrar(usuario, "LaClaveVieja.2026", "Persona del Fallo"))
				.andExpect(status().isCreated());

		MockHttpSession sesion = iniciarSesion(usuario, "LaClaveVieja.2026");
		String hashAntes = hashDe(usuario);

		mockMvc.perform(cambiarClave(sesion, "no-es-la-mia", "LaClaveNueva.2026"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail", containsString("actual no es correcta")));

		// Lo importante: el hash en la base de datos es exactamente el mismo. Sin esta
		// comprobación, un 400 podría estar diciendo "no se ha podido" y haber guardado el
		// cambio a medias.
		assertThat(hashDe(usuario)).isEqualTo(hashAntes);

		mockMvc.perform(entrar(usuario, "LaClaveVieja.2026")).andExpect(status().isOk());
	}

	@Test
	@DisplayName("Una contraseña nueva demasiado corta, un 400 con el motivo")
	void cambiarLaContrasenaConUnaCorta() throws Exception {

		String usuario = "clave-corta";

		mockMvc.perform(registrar(usuario, "LaClaveVieja.2026", "Persona de la Clave Corta"))
				.andExpect(status().isCreated());

		mockMvc.perform(cambiarClave(iniciarSesion(usuario, "LaClaveVieja.2026"), "LaClaveVieja.2026", "corta"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errores.nueva", containsString("12")));
	}

	@Test
	@DisplayName("Una contraseña nueva sin símbolos ni números, un 400 que dice las dos cosas")
	void cambiarLaContrasenaConUnaFloja() throws Exception {

		String usuario = "clave-floja";

		mockMvc.perform(registrar(usuario, "LaClaveVieja.2026", "Persona de la Clave Floja"))
				.andExpect(status().isCreated());

		// Larga de sobra y con mayúsculas y minúsculas: solo le faltan el número y el símbolo.
		// El motivo tiene que nombrarlos los dos, que es justo lo que hace la lista de
		// ClaveSeguraValidador y lo que evita tener que adivinar cuál de los dos falla.
		mockMvc.perform(cambiarClave(iniciarSesion(usuario, "LaClaveVieja.2026"),
						"LaClaveVieja.2026", "LaClaveFlojaDePrueba"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errores.nueva", containsString("número")))
				.andExpect(jsonPath("$.errores.nueva", containsString("símbolo")));
	}

	@Test
	@DisplayName("Una contraseña con tildes y ñ que cumple las reglas, se acepta")
	void cambiarLaContrasenaConAcentos() throws Exception {

		String usuario = "clave-con-acentos";

		mockMvc.perform(registrar(usuario, "LaClaveVieja.2026", "Persona de los Acentos"))
				.andExpect(status().isCreated());

		// Á y ñ son mayúscula y minúscula de verdad: si el validador las mirara con un rango
		// [A-Z], esto sería un 400 y el usuario no entendería por qué.
		mockMvc.perform(cambiarClave(iniciarSesion(usuario, "LaClaveVieja.2026"),
						"LaClaveVieja.2026", "Ándale.ñu34C!"))
				.andExpect(status().isOk());

		mockMvc.perform(entrar(usuario, "Ándale.ñu34C!")).andExpect(status().isOk());
	}

	@Test
	@DisplayName("Lo que se guarda es un hash de BCrypt, no la contraseña")
	void loQueSeGuardaEsUnHash() throws Exception {

		String usuario = "hash-guardado";

		mockMvc.perform(registrar(usuario, "LaClaveVieja.2026", "Persona del Hash"))
				.andExpect(status().isCreated());

		mockMvc.perform(cambiarClave(iniciarSesion(usuario, "LaClaveVieja.2026"), "LaClaveVieja.2026", "LaClaveNueva.2026"))
				.andExpect(status().isOk());

		String guardada = hashDe(usuario);

		assertThat(guardada)
				.startsWith("$2a$")
				.doesNotContain("LaClaveNueva.2026")
				.doesNotContain("LaClaveVieja.2026");
	}

	@Test
	@DisplayName("Cambiar la contraseña sin sesión, un 401")
	void cambiarLaContrasenaSinSesion() throws Exception {

		mockMvc.perform(conToken(put("/auth/clave")
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"claveActual":"LaClaveVieja.2026","nueva":"LaClaveNueva.2026"}""")))
				.andExpect(status().isUnauthorized());
	}

	/** Petición de cambio de contraseña, ya con su token de CSRF. */
	private MockHttpServletRequestBuilder cambiarClave(MockHttpSession sesion,
													  String actual, String nueva) throws Exception {

		return conToken(put("/auth/clave").session(sesion)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"claveActual":"%s","nueva":"%s"}""".formatted(actual, nueva)));
	}

	/** El hash que hay ahora mismo en la base de datos para ese usuario. */
	private String hashDe(String usuario) {
		return jdbcTemplate.queryForObject(
				"SELECT clave_hash FROM bd_facturacion.usuarios WHERE usuario = ?",
				String.class, usuario);
	}

	// ── Utilidades ───────────────────────────────────────────────────────────────

	/**
	 * Inicia sesión y devuelve la sesión con su cookie.
	 *
	 * @param usuario el nombre con el que se entra
	 * @param clave   la contraseña
	 * @return la sesión ya iniciada
	 */
	private MockHttpSession iniciarSesion(String usuario, String clave) throws Exception {

		MvcResult resultado = mockMvc.perform(entrar(usuario, clave))
				.andExpect(status().isOk())
				.andReturn();

		return (MockHttpSession) resultado.getRequest().getSession(false);
	}

	/** Petición de acceso ya con su token de CSRF. */
	private MockHttpServletRequestBuilder entrar(String usuario, String clave) throws Exception {

		return conToken(post("/auth/login")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"usuario\":\"" + usuario + "\",\"clave\":\"" + clave + "\"}"));
	}

	/** Petición de alta ya con su token de CSRF. */
	private MockHttpServletRequestBuilder registrar(String usuario, String clave, String nombre)
			throws Exception {

		return conToken(post("/auth/registro")
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"usuario":"%s","clave":"%s","nombre":"%s","rol":"ADMIN"}"""
						.formatted(usuario, clave, nombre)));
	}

	/**
	 * Le pone a una petición lo mismo que le pone el navegador: el token en la cabecera y la
	 * cookie que lo acompaña.
	 *
	 * <p>Las dos cosas son necesarias y va la segunda en segundo lugar a propósito: Spring
	 * guarda el token en la cookie XSRF-TOKEN, y al mandar solo la cabecera se.compare el
	 * token recibido con uno recien generado que no es el mismo, y todo POST sale con un 403.
	 * Es exactamente lo que le pasaría a un navegador al que le faltase esa cookie.</p>
	 *
	 * @param peticion la petición a preparar
	 * @return la misma petición, con el token puesto
	 */
	private MockHttpServletRequestBuilder conToken(MockHttpServletRequestBuilder peticion)
			throws Exception {

		MvcResult resultado = mockMvc
				.perform(get("/auth/csrf").session(new MockHttpSession()))
				.andExpect(status().isOk())
				.andReturn();

		String cuerpo = resultado.getResponse().getContentAsString();

		// El token se saca con una expresión regular y no con un mapper: para un campo
		// suelto, meter Jackson en el test es más línea de la que ahorra.
		Matcher token = Pattern.compile("\"token\"\\s*:\\s*\"([^\"]+)\"").matcher(cuerpo);

		if (!token.find()) {
			throw new IllegalStateException("La respuesta de /auth/csrf no trae token: " + cuerpo);
		}

		return peticion
				.header(CABECERA_CSRF, token.group(1))
				.cookie(resultado.getResponse().getCookie(COOKIE_CSRF));
	}

	/** La contraseña guardada tiene que ser un hash de BCrypt, no la contraseña. */
	private void assertThatGuardada(String guardada) {
		assertThat(guardada)
				.startsWith("$2a$")
				.doesNotContain("UnaClave.Larga2026");
	}

	/** El error que se devuelve nunca puede llevar una traza. */
	private void assertNoTraza(MvcResult resultado) throws Exception {
		String cuerpo = resultado.getResponse().getContentAsString();

		assertThat(cuerpo)
				.doesNotContain("Exception")
				.doesNotContain("at edu.xtd");
	}

}