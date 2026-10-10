package edu.xtd.facturacion360;

import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.servlet.support.SpringBootServletInitializer;

/**
 * Punto de entrada de la aplicación cuando se despliega en un Tomcat de servidor.
 *
 * <p>Spring Boot, por defecto, arranca con su PROPIO Tomcat embebido (es un
 * JAR ejecutable: se lanza con {@code java -jar} y levanta su servidor en
 * el puerto que diga {@code server.port}). Para desplegar dentro de un Tomcat
 * ya instalado hay que darle otra entrada: esta clase. El contenedor la busca
 * por nombre, la encuentra, y llama a su {@code onStartup}, que es lo que
 * monta el contexto de Spring DENTRO del Tomcat que ya está corriendo.
 *
 * <p>Sin esta clase, el WAR se despliega pero da 404 en todas las rutas: el
 * Tomcat no sabe que tiene que arrancarla.
 *
 * <p>Convive con {@link Facturacion360Application} sin problema, porque cada
 * una sirve para un caso distinto y solo se usa la que corresponda:
 * esta para Tomcat, aquella para {@code java -jar}.
 */
public class Facturacion360ServletInitializer extends SpringBootServletInitializer {

	/**
	 * Monta la aplicación dentro del contenedor que la hospeda.
	 *
	 * <p>El builder recibe la clase de la aplicación como clase principal, no
	 * esta: la que lleva {@code @SpringBootApplication} y por tanto la que
	 * decide dónde está el código a escanear. Si se pasara esta, Spring no
	 * encontraría ningún componente y arrancaría vacío.
	 */
	@Override
	protected SpringApplicationBuilder configure(SpringApplicationBuilder builder) {
		return builder.sources(Facturacion360Application.class);
	}
}
