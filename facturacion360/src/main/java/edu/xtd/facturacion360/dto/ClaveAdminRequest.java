package edu.xtd.facturacion360.dto;

import edu.xtd.facturacion360.validacion.ClaveSegura;

import jakarta.validation.constraints.NotBlank;

/**
 * Lo que envía el panel de administración para <strong>poner una contraseña nueva a otra
 * cuenta</strong>.
 *
 * <p>No hay campo de usuario: el que se cambia va en la ruta ({@code PUT
 * /usuarios/{id}/clave}). Así el cuerpo no puede pedir una cuenta distinta de la que señala la
 * dirección, que es la forma más fácil de tener dos verdades —la de la URL y la del JSON— que
 * acabar discrepando.</p>
 *
 * <p>Tampoco se pide la contraseña anterior, y esa es la diferencia con
 * {@link CambioClaveRequest}: allí se pide porque el que cambia es el dueño de la cuenta y
 * tiene que demostrar que la tiene; aquí quien cambia es un administrador, que ya ha
 * demostrado tener permiso con su propia sesión, y cuyo trabajo es exactamente poder abrir la
 * cuenta de alguien que ha perdido su clave.</p>
 *
 * @param nueva la contraseña que se quiere poner a esa cuenta
 */
public record ClaveAdminRequest(

		@NotBlank(message = "La contraseña nueva es obligatoria")
		@ClaveSegura
		String nueva) {

}
