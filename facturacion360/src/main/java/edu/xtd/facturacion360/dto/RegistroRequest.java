package edu.xtd.facturacion360.dto;

import edu.xtd.facturacion360.validacion.ClaveSegura;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Lo que envía la pantalla de registro para dar de alta una cuenta nueva.
 *
 * <p><strong>No hay campo de rol, y es deliberado.</strong> El registro público siempre crea
 * usuarios {@link Rol#USUARIO}; el primer ADMIN se crea a mano desde
 * {@code docu/migracion-usuarios.sql} o con un {@code UPDATE}. Si el endpoint aceptara el
 * rol, cualquiera que llegara a la pantalla podría quedarse con permiso de borrar clientes y
 * de tocar los datos fiscales del emisor con una sola llamada.</p>
 *
 * @param usuario nombre con el que se entrará después
 * @param clave   contraseña en claro; se hashea antes de tocar la base de datos
 * @param nombre  nombre y apellidos de la persona
 */
public record RegistroRequest(

		@NotBlank(message = "El usuario es obligatorio")
		@Size(min = 3, max = 50, message = "El usuario debe tener entre 3 y 50 caracteres")
		@Pattern(
				regexp = "^[A-Za-z0-9._-]+$",
				message = "El usuario solo puede llevar letras, números, punto, guion y guion bajo"
		)
		String usuario,

		// Las reglas de la contraseña (12 caracteres, mayúscula, minúscula, número y símbolo)
		// están en @ClaveSegura, la misma anotación que usan el panel de administración y el
		// cambio de contraseña. Que una cuenta se pueda crear por el registro público o desde
		// el panel no puede cambiar lo que se le pide: si las reglas estuvieran escritas en los
		// dos sitios, bastaría con que en uno de los dos se olvidaran para tener cuentas con
		// contraseña floja.
		@NotBlank(message = "La contraseña es obligatoria")
		@ClaveSegura
		String clave,

		@NotBlank(message = "El nombre es obligatorio")
		@Size(min = 2, max = 100, message = "El nombre debe tener entre 2 y 100 caracteres")
		String nombre) {

}