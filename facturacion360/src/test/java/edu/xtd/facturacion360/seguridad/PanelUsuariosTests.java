package edu.xtd.facturacion360.seguridad;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * El panel de administración de cuentas: la puerta, el alta, el cambio de rol y el de contraseña.
 *
 * <p>La contrapartida de {@code AccesoSinSesionTests} para este endpoint. Allí se comprueba que
 * no se salta la puerta; aquí, que la puerta del panel además está cerrada con el rol, y que lo
 * que hay detrás hace lo que dice.</p>
 *
 * <p>Ningún test falsea la autenticación: el login se hace de verdad contra
 * {@code POST /auth/login}, porque si el login se rompiera tienen que enterarse y la única
 * forma es pasando por él.</p>
 *
 * @author AngelDanielC0des
 */
@SpringBootTest
@AutoConfigureMockMvc
class PanelUsuariosTests {

	private static final String CLAVE = "CambiarYa.2026";

	private static final String CABECERA_CSRF = "X-XSRF-TOKEN";

	private static final String COOKIE_CSRF = "XSRF-TOKEN";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	/**
	 * Deja la tabla como estaba antes de cada test: 'admin' como único administrador y las
	 * demás cuentas de prueba sin rol de administrador.
	 *
	 * <p>Los tests comparten base de datos y no se puede contar con el orden en que se ejecutan
	 * (JUnit no lo garantiza). Sin esta vuelta atrás, el test de "no te puedes quedar sin
	 * administradores" dependería de que ningún otro test hubiera creado antes un ADMIN, y
	 * saldría verde unas veces y rojas otras. Y pasa también al revés: un test que desactiva
	 * 'datos' o que baja a 'admin' de rol dejaría a los tests siguientes sin una cuenta con la
	 * que entrar o sin administrador, y se verían en un 401 o un 403 en lugar de en el fallo
	 * que les corresponde.</p>
	 */
	@BeforeEach
	void dejarLaTablaComoEstaba() {

		jdbcTemplate.update("""
				UPDATE bd_facturacion.usuarios
				SET rol = 'ADMIN', activo = 1
				WHERE usuario = 'admin'
				""");

		jdbcTemplate.update("""
				UPDATE bd_facturacion.usuarios
				SET rol = 'USUARIO', activo = 1
				WHERE usuario = 'datos'
				""");

		jdbcTemplate.update("""
				UPDATE bd_facturacion.usuarios
				SET rol = 'USUARIO'
				WHERE usuario <> 'admin'
				""");
	}

	// ── La puerta ────────────────────────────────────────────────────────────────

	@Test
	@DisplayName("Sin sesión, el panel responde 401")
	void sinSesionNoSeEntra() throws Exception {

		mockMvc.perform(get("/usuarios").accept(MediaType.APPLICATION_JSON))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.detail", containsString("sesión")));

		mockMvc.perform(conToken(post("/usuarios")
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"usuario":"colado","clave":"UnaClave.Larga2026","nombre":"Colado",
								 "rol":"ADMIN"}""")))
				.andExpect(status().isUnauthorized());
	}

	@Test
	@DisplayName("Un USUARIO recibe un 403 en la API y en la página del panel")
	void unUsuarioNoTieneElPanel() throws Exception {

		MockHttpSession sesion = iniciarSesion("datos");

		mockMvc.perform(get("/usuarios").session(sesion).accept(MediaType.APPLICATION_JSON))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.detail", containsString("permiso")));

		// La página va en la MISMA regla que la API. Si se olvidara, caería en la regla
		// general (tener sesión) y un USUARIO abriría el panel entero.
		mockMvc.perform(get("/usuarios.html").session(sesion).accept(MediaType.TEXT_HTML))
				.andExpect(status().isForbidden());
	}

	@Test
	@DisplayName("Un USUARIO tampoco puede escribir en el panel ni por la API")
	void unUsuarioNoEscribeEnElPanel() throws Exception {

		MockHttpSession sesion = iniciarSesion("datos");

		mockMvc.perform(conToken(put("/usuarios/1").session(sesion)
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"nombre":"Colado","rol":"ADMIN","activo":true}""")))
				.andExpect(status().isForbidden());

		mockMvc.perform(conToken(put("/usuarios/1/clave").session(sesion)
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"nueva":"LaClaveNueva.2026"}""")))
				.andExpect(status().isForbidden());

		// Y la tabla no se ha movido: el 403 tiene que haber parado la petición ANTES de que
		// llegara al controlador, no después.
		assertThat(rolDe("admin")).isEqualTo("ADMIN");
	}

	@Test
	@DisplayName("Sin sesión, la página del panel va al login")
	void laPaginaSinSesionVaAlLogin() throws Exception {

		mockMvc.perform(get("/usuarios.html").accept(MediaType.TEXT_HTML))
				.andExpect(status().is3xxRedirection())
				.andExpect(redirectedUrl("/login.html"));
	}

	@Test
	@DisplayName("Un administrador abre la página del panel")
	void unAdministradorAbreElPanel() throws Exception {

		mockMvc.perform(get("/usuarios.html").session(iniciarSesion("admin"))
						.accept(MediaType.TEXT_HTML))
				.andExpect(status().isOk());
	}

	@Test
	@DisplayName("Una escritura sin token de CSRF no se cuela en el panel")
	void escribirSinTokenCsrfNoSeCuela() throws Exception {

		mockMvc.perform(post("/usuarios").session(iniciarSesion("admin"))
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"usuario":"sin-token","clave":"UnaClave.Larga2026","nombre":"Sin Token",
								 "rol":"ADMIN"}"""))
				.andExpect(status().isForbidden());
	}

	// ── El listado ───────────────────────────────────────────────────────────────

	@Test
	@DisplayName("El listado trae las cuentas con su rol y su estado")
	void listarLasCuentas() throws Exception {

		mockMvc.perform(get("/usuarios").session(iniciarSesion("admin"))
						.accept(MediaType.APPLICATION_JSON))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$", org.hamcrest.Matchers.hasSize(3)))
				.andExpect(jsonPath("$[0].usuario").value("admin"))
				.andExpect(jsonPath("$[0].rol").value("ADMIN"))
				.andExpect(jsonPath("$[0].activo").value(true))
				// La cuenta desactivada sale en la lista con activo = false, no desaparece:
				// se puede volver a activar desde el propio panel.
				.andExpect(jsonPath("$[?(@.usuario == 'baja')].activo")
						.value(org.hamcrest.Matchers.contains(false)));
	}

	@Test
	@DisplayName("El listado no lleva el hash de la contraseña de nadie")
	void elListadoNoLevaElHash() throws Exception {

		MvcResult resultado = mockMvc.perform(
						get("/usuarios").session(iniciarSesion("admin"))
								.accept(MediaType.APPLICATION_JSON))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[0].claveHash").doesNotExist())
				.andReturn();

		// Y no solo en el primer elemento: se mira el cuerpo entero, porque un hash filtrado
		// por un segundo elemento cualquiera sería igual de malo.
		assertThat(resultado.getResponse().getContentAsString())
				.doesNotContain("clave_hash")
				.doesNotContain("$2a$");
	}

	// ── El alta ──────────────────────────────────────────────────────────────────

	@Test
	@DisplayName("El panel da de alta una cuenta con el rol que se le pide")
	void darDeAltaConRol() throws Exception {

		mockMvc.perform(conToken(post("/usuarios").session(iniciarSesion("admin"))
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"usuario":"nuevo-admin","clave":"UnaClave.Larga2026",
								 "nombre":"Nueva Administración","rol":"ADMIN"}""")))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.usuario").value("nuevo-admin"))
				.andExpect(jsonPath("$.rol").value("ADMIN"))
				.andExpect(jsonPath("$.activo").value(true))
				.andExpect(jsonPath("$.claveHash").doesNotExist());

		assertThat(hashDe("nuevo-admin"))
				.startsWith("$2a$")
				.doesNotContain("UnaClave.Larga2026");

		// Y esa cuenta ya puede entrar, y entra con permisos de administrador.
		MockHttpSession sesion = iniciarSesion("nuevo-admin", "UnaClave.Larga2026");

		mockMvc.perform(get("/usuarios").session(sesion).accept(MediaType.APPLICATION_JSON))
				.andExpect(status().isOk());
	}

	@Test
	@DisplayName("El alta sin rol es un 400, no un alta con USUARIO por defecto")
	void darDeAltaSinRol() throws Exception {

		mockMvc.perform(conToken(post("/usuarios").session(iniciarSesion("admin"))
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"usuario":"sin-rol","clave":"UnaClave.Larga2026","nombre":"Sin Rol"}""")))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errores.rol", containsString("obligatorio")));

		assertThat(jdbcTemplate.queryForObject(
				"SELECT COUNT(*) FROM bd_facturacion.usuarios WHERE usuario = 'sin-rol'",
				Integer.class)).isZero();
	}

	@Test
	@DisplayName("Una cuenta repetida responde 409, y solo en el panel")
	void darDeAltaUnUsuarioQueYaExiste() throws Exception {

		mockMvc.perform(conToken(post("/usuarios").session(iniciarSesion("admin"))
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"usuario":"datos","clave":"UnaClave.Larga2026","nombre":"Repetido",
								 "rol":"ADMIN"}""")))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail", containsString("datos")));
	}

	@Test
	@DisplayName("Una contraseña corta en el alta es un 400 con el motivo del campo")
	void darDeAltaConClaveCorta() throws Exception {

		mockMvc.perform(conToken(post("/usuarios").session(iniciarSesion("admin"))
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"usuario":"clave-corta","clave":"corta","nombre":"Clave Corta",
								 "rol":"USUARIO"}""")))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errores.clave", containsString("12")));
	}

	@Test
	@DisplayName("Una contraseña floja en el alta es un 400 que dice lo que le falta")
	void darDeAltaConClaveFloja() throws Exception {

		// Larga y con mayúsculas y minúsculas: solo le faltan el número y el símbolo. El
		// motivo tiene que nombrarlos los dos.
		mockMvc.perform(conToken(post("/usuarios").session(iniciarSesion("admin"))
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"usuario":"clave-floja","clave":"UnaClaveFloja","nombre":"Clave Floja",
								 "rol":"USUARIO"}""")))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errores.clave", containsString("número")))
				.andExpect(jsonPath("$.errores.clave", containsString("símbolo")));
	}

	// ── La edición ───────────────────────────────────────────────────────────────

	@Test
	@DisplayName("Se cambia el rol de una cuenta y el cambio está en la base de datos")
	void cambiarElRol() throws Exception {

		int id = idDe("datos");

		mockMvc.perform(editar(id, "Usuario de pruebas", "ADMIN", true).session(panel()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.rol").value("ADMIN"))
				.andExpect(jsonPath("$.nombre").value("Usuario de pruebas"));

		assertThat(rolDe("datos")).isEqualTo("ADMIN");

		// Y con el rol nuevo ya entra en el panel: el cambio no es solo una letra en la
		// columna, cambia lo que el servidor deja hacer.
		mockMvc.perform(get("/usuarios").session(iniciarSesion("datos"))
						.accept(MediaType.APPLICATION_JSON))
				.andExpect(status().isOk());

		// Se vuelve a dejar como estaba, para no arrastrar el cambio a los demás tests.
		mockMvc.perform(editar(id, "Usuario de pruebas", "USUARIO", true).session(panel()))
				.andExpect(status().isOk());
	}

	@Test
	@DisplayName("Una cuenta desactivada no puede entrar, y se puede volver a activar")
	void desactivarYReactivar() throws Exception {

		int id = idDe("datos");

		mockMvc.perform(editar(id, "Usuario de pruebas", "USUARIO", false).session(panel()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.activo").value(false));

		// Desactivada no se puede entrar. Se comprueba con entrar() a pelo y no con
		// iniciarSesion(), porque ese helper da el acceso por bueno y aquí lo que se quiere
		// ver es justo que no lo hay.
		mockMvc.perform(entrar("datos", CLAVE))
				.andExpect(status().isUnauthorized());

		mockMvc.perform(editar(id, "Usuario de pruebas", "USUARIO", true).session(panel()))
				.andExpect(status().isOk());

		// Reactivada, otra vez como antes.
		mockMvc.perform(get("/auth/yo").session(iniciarSesion("datos")))
				.andExpect(status().isOk());
	}

	@Test
	@DisplayName("Editar una cuenta que no existe es un 404")
	void editarUnaCuentaInexistente() throws Exception {

		mockMvc.perform(editar(9999, "Nadie", "USUARIO", true).session(panel()))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.detail", containsString("9999")));
	}

	@Test
	@DisplayName("No se puede dejar la aplicación sin administradores")
	void noSePuedeQuedarSinAdministradores() throws Exception {

		int id = idDe("admin");

		// 'admin' es el único administrador activo (lo garantiza el @BeforeEach): bajarlo de
		// rol dejaría la aplicación sin nadie que pueda volver a abrir este panel.
		mockMvc.perform(editar(id, "Administrador", "USUARIO", true).session(panel()))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail", containsString("administradores")));

		// Desactivarlo es el mismo problema por el otro lado.
		mockMvc.perform(editar(id, "Administrador", "ADMIN", false).session(panel()))
				.andExpect(status().isConflict());

		// Y nada de eso ha tocado la tabla.
		assertThat(rolDe("admin")).isEqualTo("ADMIN");
		assertThat(activoDe("admin")).isTrue();
	}

	@Test
	@DisplayName("Con otro administrador de respaldo, sí se puede bajar de rol al primero")
	void conUnRespaldoSiSePuede() throws Exception {

		mockMvc.perform(conToken(post("/usuarios").session(iniciarSesion("admin"))
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"usuario":"segundo-admin","clave":"UnaClave.Larga2026",
								 "nombre":"Segundo","rol":"ADMIN"}""")))
				.andExpect(status().isCreated());

		// Ahora hay dos: bajar a 'admin' es legitimo, porque 'segundo-admin' puede seguir
		// entrando por el panel.
		mockMvc.perform(editar(idDe("admin"), "Administrador", "USUARIO", true).session(panel()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.rol").value("USUARIO"));

		assertThat(rolDe("admin")).isEqualTo("USUARIO");

		// Y el cambio de verdad ha cambiado algo: la cuenta que era admin ya no entra al panel.
		mockMvc.perform(get("/usuarios").session(iniciarSesion("admin"))
						.accept(MediaType.APPLICATION_JSON))
				.andExpect(status().isForbidden());
	}

	// ── La contraseña de otro ────────────────────────────────────────────────────

	@Test
	@DisplayName("El panel pone una contraseña nueva a otra cuenta")
	void ponerClaveAOtraCuenta() throws Exception {

		String usuario = "olvido-la-clave";

		mockMvc.perform(conToken(post("/usuarios").session(iniciarSesion("admin"))
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"usuario":"%s","clave":"LaClaveVieja.2026","nombre":"La Que La Olvidó",
								 "rol":"USUARIO"}""".formatted(usuario))))
				.andExpect(status().isCreated());

		int id = idDe(usuario);

		// No se pide la anterior: es la operación que existe justamente para cuando nadie la
		// sabe. Y el body solo lleva la nueva, sin ningún campo de usuario: el que se cambia
		// es el de la ruta y no el que diga el JSON.
		mockMvc.perform(conToken(put("/usuarios/" + id + "/clave").session(iniciarSesion("admin"))
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"nueva":"LaClaveNueva.2026","usuario":"admin"}""")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.usuario").value(usuario))
				.andExpect(jsonPath("$.claveHash").doesNotExist());

		assertThat(hashDe(usuario))
				.startsWith("$2a$")
				.doesNotContain("LaClaveNueva.2026");

		mockMvc.perform(entrar(usuario, "LaClaveNueva.2026")).andExpect(status().isOk());

		mockMvc.perform(entrar(usuario, "LaClaveVieja.2026")).andExpect(status().isUnauthorized());

		// Lo que iba en el campo "usuario" del cuerpo se ha descartado: la contraseña de
		// 'admin' sigue siendo la de siempre.
		mockMvc.perform(entrar("admin", CLAVE)).andExpect(status().isOk());
	}

	@Test
	@DisplayName("Una contraseña nueva demasiado corta es un 400 con el motivo")
	void ponerUnaClaveCorta() throws Exception {

		mockMvc.perform(conToken(put("/usuarios/" + idDe("datos") + "/clave")
						.session(iniciarSesion("admin"))
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"nueva":"corta"}""")))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errores.nueva", containsString("12")));
	}

	@Test
	@DisplayName("Una contraseña nueva floja es un 400 que dice lo que le falta")
	void ponerUnaClaveFloja() throws Exception {

		int id = idDe("datos");

		// Sin mayúscula, sin número y sin símbolo: el motivo los menciona los tres.
		mockMvc.perform(conToken(put("/usuarios/" + id + "/clave")
						.session(iniciarSesion("admin"))
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"nueva":"una clave sin mayusculas"}""")))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errores.nueva", containsString("mayúscula")))
				.andExpect(jsonPath("$.errores.nueva", containsString("número")))
				.andExpect(jsonPath("$.errores.nueva", containsString("símbolo")));

		// Y nada de esto ha tocado la base de datos: un 400 con el motivo tiene que dejar la
		// cuenta como estaba.
		assertThat(hashDe("datos")).doesNotContain("una clave sin mayusculas");
	}

	@Test
	@DisplayName("Poner la contraseña de una cuenta que no existe es un 404")
	void ponerClaveAUnaCuentaInexistente() throws Exception {

		mockMvc.perform(conToken(put("/usuarios/9999/clave").session(iniciarSesion("admin"))
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"nueva":"UnaClave.Larga2026"}""")))
				.andExpect(status().isNotFound());
	}

	// ── El borrado ───────────────────────────────────────────────────────────────

	@Test
	@DisplayName("Se borra una cuenta confirmando con la contraseña del administrador")
	void borrarUnaCuenta() throws Exception {

		String usuario = "para-borrar";

		mockMvc.perform(conToken(post("/usuarios").session(panel())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"usuario":"%s","clave":"LaClaveVieja.2026","nombre":"Se Va",
								 "rol":"USUARIO"}""".formatted(usuario))))
				.andExpect(status().isCreated());

		int id = idDe(usuario);

		// Un 204 sin cuerpo: borrado no devuelve la cuenta que ha borrado, es que no la hay.
		mockMvc.perform(borrar(id, CLAVE).session(panel()))
				.andExpect(status().isNoContent());

		assertThat(existe(usuario)).isFalse();

		// Y con la cuenta fuera ya no se puede entrar. Antes de borrarla sí se podía.
		mockMvc.perform(entrar(usuario, "LaClaveVieja.2026")).andExpect(status().isUnauthorized());

		// El nombre de usuario queda libre. Eso es justo lo que distingue borrar de
		// desactivar, y por lo que se prueba aquí: la misma cuenta se puede volver a crear.
		mockMvc.perform(conToken(post("/usuarios").session(panel())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"usuario":"%s","clave":"LaClaveVieja.2026","nombre":"Otra",
								 "rol":"USUARIO"}""".formatted(usuario))))
				.andExpect(status().isCreated());

		mockMvc.perform(conToken(borrar(idDe(usuario), CLAVE).session(panel())))
				.andExpect(status().isNoContent());
	}

	@Test
	@DisplayName("Sin la contraseña correcta no se borra nada")
	void borrarConLaClaveEquivocada() throws Exception {

		String usuario = "esta-se-queda";

		mockMvc.perform(conToken(post("/usuarios").session(panel())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"usuario":"%s","clave":"LaClaveVieja.2026","nombre":"Se Queda",
								 "rol":"USUARIO"}""".formatted(usuario))))
				.andExpect(status().isCreated());

		int id = idDe(usuario);

		// La sesión es válida y el rol es el correcto: lo que falla es la confirmación. Por
		// eso es un 400 y no un 401; mandar al login sería desconcertante, porque en el login
		// la contraseña que se teclea sí es la buena.
		mockMvc.perform(borrar(id, "no-es-la-clave").session(panel()))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail", containsString("no es la correcta")));

		mockMvc.perform(borrar(id, "").session(panel()))
				.andExpect(status().isBadRequest());

		// Y la cuenta sigue ahí, con su contraseña intacta: se entra como siempre.
		assertThat(existe(usuario)).isTrue();

		mockMvc.perform(entrar(usuario, "LaClaveVieja.2026")).andExpect(status().isOk());
	}

	@Test
	@DisplayName("Lo que se compara es la contraseña del que borra, no la de la cuenta borrada")
	void laClaveEsLaDelAdministrador() throws Exception {

		String usuario = "clave-distinta";

		mockMvc.perform(conToken(post("/usuarios").session(panel())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"usuario":"%s","clave":"LaClave.DeLaCuenta2026","nombre":"Otra Clave",
								 "rol":"USUARIO"}""".formatted(usuario))))
				.andExpect(status().isCreated());

		// La contraseña de la cuenta que se borra no vale para confirmar el borrado. Si
		// valiera, bastaría con conocer una contraseña cualquiera para borrar cualquier
		// cuenta, y la confirmación no serviría para nada.
		mockMvc.perform(borrar(idDe(usuario), "LaClave.DeLaCuenta2026").session(panel()))
				.andExpect(status().isBadRequest());

		assertThat(existe(usuario)).isTrue();
	}

	@Test
	@DisplayName("No se puede borrar la propia cuenta")
	void noSePuedeBorrarLaPropiaCuenta() throws Exception {

		// Ni aunque la contraseña sea la buena: el problema no es la confirmación, es que
		// quien borra se queda sin sesión en el mismo instante.
		mockMvc.perform(borrar(idDe("admin"), CLAVE).session(panel()))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.detail", containsString("ti mismo")));

		assertThat(existe("admin")).isTrue();
	}

	@Test
	@DisplayName("Con otro administrador de respaldo, sí se puede borrar a un administrador")
	void conUnRespaldoSiSePuedeBorrarUnAdmin() throws Exception {

		// Se da de alta un ADMIN más. Sin él, borrar a un administrador no pondría a prueba
		// nada: la regla que lo impide es "no te puedes borrar a ti mismo", y ya se ha
		// comprobado arriba con la cuenta propia.
		mockMvc.perform(conToken(post("/usuarios").session(panel())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"usuario":"otro-admin","clave":"UnaClave.Larga2026","nombre":"Otro",
								 "rol":"ADMIN"}""")))
				.andExpect(status().isCreated());

		// Con dos administradores, borrar a uno de ellos es una operación normal.
		mockMvc.perform(borrar(idDe("otro-admin"), CLAVE).session(panel()))
				.andExpect(status().isNoContent());

		assertThat(existe("otro-admin")).isFalse();
		assertThat(existe("admin")).isTrue();

		// Y el que queda sigue pudiendo usar el panel: el borrado no deja la aplicación sin
		// administrador, porque el que ha borrado es un administrador.
		mockMvc.perform(get("/usuarios").session(panel()).accept(MediaType.APPLICATION_JSON))
				.andExpect(status().isOk());
	}

	@Test
	@DisplayName("Quien borra no pierde la sesión, y el borrado de otro tampoco")
	void borrarNoCierraLaSesionDeQuienLoHace() throws Exception {

		String usuario = "se-van-a-borrar";

		mockMvc.perform(conToken(post("/usuarios").session(panel())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"usuario":"%s","clave":"LaClaveVieja.2026","nombre":"Se Va",
								 "rol":"USUARIO"}""".formatted(usuario))))
				.andExpect(status().isCreated());

		MockHttpSession sesionAdmin = panel();

		mockMvc.perform(borrar(idDe(usuario), CLAVE).session(sesionAdmin))
				.andExpect(status().isNoContent());

		// La sesión de quien ha borrado sigue viva. Es lo esperable: borrar una cuenta no
		// cierra otras sesiones, ni la del propio administrador ni, si la tuviera abierta,
		// la de la cuenta borrada. Que esto es una limitación y no una casualidad está
		// escrito en docu/portal-de-acceso.md.
		mockMvc.perform(get("/auth/yo").session(sesionAdmin))
				.andExpect(status().isOk());
	}

	@Test
	@DisplayName("Un USUARIO no puede borrar cuentas ni con la contraseña buena")
	void unUsuarioNoBorra() throws Exception {

		// En los datos de prueba todas las cuentas comparten contraseña, así que el 403 no
		// puede achacarse a una contraseña equivocada: es el rol y solo el rol.
		mockMvc.perform(borrar(idDe("baja"), CLAVE).session(iniciarSesion("datos")))
				.andExpect(status().isForbidden());

		assertThat(existe("baja")).isTrue();
	}

	@Test
	@DisplayName("Borrar una cuenta que no existe es un 404")
	void borrarUnaCuentaInexistente() throws Exception {

		mockMvc.perform(borrar(9999, CLAVE).session(panel()))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.detail", containsString("9999")));
	}

	@Test
	@DisplayName("Borrar sin token de CSRF no se cuela")
	void borrarSinTokenCsrfNoSeCuela() throws Exception {

		mockMvc.perform(delete("/usuarios/" + idDe("datos"))
						.session(panel())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"clave":"%s"}""".formatted(CLAVE)))
				.andExpect(status().isForbidden());

		assertThat(existe("datos")).isTrue();
	}

	// ── Utilidades ───────────────────────────────────────────────────────────────

	/**
	 * Petición de edición de una cuenta, ya con su token de CSRF pero sin sesión: cada test
	 * le pone la suya.
	 *
	 * <p>La sesión NO se pone aquí a propósito. Si lo hiciera, quien llamara después con
	 * {@code .session(otra)} la estaría sustituyendo sin querer, y un test que compusiera las
	 * dos cosas acabaría escribiendo con una cuenta y comprobando con otra. Que cada test elija
	 * su sesión es lo que deja claro cuál manda.</p>
	 *
	 * @param idUsuario identificador de la cuenta
	 * @param nombre    nombre y apellidos
	 * @param rol       perfil
	 * @param activo    si la cuenta queda activa
	 */
	private MockHttpServletRequestBuilder editar(int idUsuario, String nombre,
												String rol, boolean activo) throws Exception {

		return conToken(put("/usuarios/" + idUsuario)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"nombre":"%s","rol":"%s","activo":%s}"""
						.formatted(nombre, rol, activo)));
	}

	/**
	 * La sesión de 'admin', que es la que puede usar el panel.
	 *
	 * @return la sesión ya iniciada
	 */
	private MockHttpSession panel() throws Exception {
		return iniciarSesion("admin");
	}

	/**
	 * Inicia sesión de verdad (pasa por {@code POST /auth/login}) y devuelve la sesión.
	 *
	 * @param usuario el nombre con el que se entra
	 * @return la sesión ya iniciada
	 */
	private MockHttpSession iniciarSesion(String usuario) throws Exception {
		return iniciarSesion(usuario, CLAVE);
	}

	/**
	 * Inicia sesión con una contraseña cualquiera.
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

	/**
	 * Le pone a la petición el token de CSRF, en la cabecera y en la cookie que lo acompaña.
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

		Matcher token = Pattern.compile("\"token\"\\s*:\\s*\"([^\"]+)\"").matcher(cuerpo);

		if (!token.find()) {
			throw new IllegalStateException("La respuesta de /auth/csrf no trae token: " + cuerpo);
		}

		return peticion
				.header(CABECERA_CSRF, token.group(1))
				.cookie(resultado.getResponse().getCookie(COOKIE_CSRF));
	}

	/** El identificador de una cuenta. */
	private int idDe(String usuario) {

		return jdbcTemplate.queryForObject(
				"SELECT idusuario FROM bd_facturacion.usuarios WHERE usuario = ?",
				Integer.class, usuario);
	}

	/** El rol que tiene ahora mismo una cuenta. */
	private String rolDe(String usuario) {

		return jdbcTemplate.queryForObject(
				"SELECT rol FROM bd_facturacion.usuarios WHERE usuario = ?",
				String.class, usuario);
	}

	/** Si una cuenta está activa ahora mismo. */
	private boolean activoDe(String usuario) {

		return Boolean.TRUE.equals(jdbcTemplate.queryForObject(
				"SELECT activo FROM bd_facturacion.usuarios WHERE usuario = ?",
				Boolean.class, usuario));
	}

	/**
	 * Petición de borrado de una cuenta, ya con su token de CSRF pero sin sesión.
	 *
	 * <p>Igual que editar(): la sesión la pone cada test. Aquí tiene más sentido todavía,
	 * porque quién borra es justo lo que se está comprobando.</p>
	 *
	 * @param idUsuario identificador de la cuenta a borrar
	 * @param clave     la contraseña de confirmación
	 */
	private MockHttpServletRequestBuilder borrar(int idUsuario, String clave) throws Exception {

		return conToken(delete("/usuarios/" + idUsuario)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"clave":"%s"}""".formatted(clave)));
	}

	/** Si esa cuenta sigue en la tabla. */
	private boolean existe(String usuario) {

		Integer cuenta = jdbcTemplate.queryForObject(
				"SELECT COUNT(*) FROM bd_facturacion.usuarios WHERE usuario = ?",
				Integer.class, usuario);

		return cuenta != null && cuenta > 0;
	}

	/** El hash que hay ahora mismo en la base de datos para ese usuario. */
	private String hashDe(String usuario) {

		return jdbcTemplate.queryForObject(
				"SELECT clave_hash FROM bd_facturacion.usuarios WHERE usuario = ?",
				String.class, usuario);
	}

}
