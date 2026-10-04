package edu.xtd.facturacion360.dto;

import edu.xtd.facturacion360.validacion.ClaveSegura;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Lo que envía la pantalla de cuenta para cambiar la contraseña de quien ha entrado.
 *
 * <p>Pide la contraseña <strong>actual</strong> y eso no es por molestia. Sin ella,
 * cualquiera que se colara en una sesión —o que dejara el navegador abierto en una máquina
 * que no es suya— podría cambiar la contraseña y quedarse con la cuenta para siempre. Con
 * ella, hace falta algo que solo sabe quien la puso.</p>
 *
 * @param claveActual la contraseña con la que se está entrando ahora mismo
 * @param nueva       la contraseña que se quiere poner
 */
public record CambioClaveRequest(

		// Sin mínimo de longitud: la actual solo se compara, y una contraseña vieja de tres
		// caracteres tiene que poder cambiarse. El mínimo va en la nueva.
		@NotBlank(message = "La contraseña actual es obligatoria")
		@Size(max = 200, message = "La contraseña actual no puede superar 200 caracteres")
		String claveActual,

		// Las reglas de la nueva (12 caracteres, mayúscula, minúscula, número y símbolo) están
		// en @ClaveSegura, y no repetidas aquí, porque son las mismas que se exigen en el
		// registro y en el panel de administración.
		@NotBlank(message = "La contraseña nueva es obligatoria")
		@ClaveSegura
		String nueva) {

}