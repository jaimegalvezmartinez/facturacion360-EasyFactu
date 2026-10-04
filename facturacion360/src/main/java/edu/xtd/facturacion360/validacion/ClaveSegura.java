package edu.xtd.facturacion360.validacion;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

/**
 * La contraseña tiene que ser larga y tener de todo: una mayúscula, una minúscula, un dígito y
 * un símbolo.
 *
 * <p>Una anotación propia y no cuatro {@code @Pattern} sueltos porque las reglas de contraseña
 * se repiten en cuatro sitios —el registro público, el alta del panel, el cambio de contraseña
 * propia y la contraseña que le pone un administrador a otra cuenta— y en cuatro sitios
 * distintos se acabaron escribiendo cuatro reglas parecidas que no eran iguales. Aquí están
 * escritas una vez y se aplican poniendo la anotación.</p>
 *
 * <p>También evita el efecto contrario de {@code @Pattern}: con cuatro patrones sobre el mismo
 * campo, un 400 con dos contraseñas flojas trae cuatro mensajes a la vez, tres de ellos
 * diciendo cosas que el usuario no ha hecho ("debe contener un símbolo") y solo uno que le
 * sirve. {@link ClaveSeguraValidador} junta en un único motivo lo que falta, que es lo que se
 * puede leer de un vistazo.</p>
 *
 * <p>El campo en blanco se da por válido a propósito: de si es obligatoria se encarga
 * {@code @NotBlank}. Es la convención de Bean Validation y evita que un campo vacío suelte
 * dos errores a la vez diciendo lo mismo.</p>
 *
 * @author AngelDanielC0des
 */
@Documented
@Constraint(validatedBy = ClaveSeguraValidador.class)
@Target({ ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT })
@Retention(RetentionPolicy.RUNTIME)
public @interface ClaveSegura {

	/** Caracteres mínimos. El de fábrica es el que exigen los formularios de la aplicación. */
	int minimo() default 12;

	/** Caracteres máximos: el que se guarda en la base de datos, y de ahí el tope. */
	int maximo() default 200;

	/**
	 * Lo que se cuenta cuando no hay nada más concreto que decir. El validador lo sustituye
	 * siempre por uno que enumera lo que falta, así que este texto es el que se vería si
	 * alguien escribiera la anotación sin validador al lado.
	 */
	String message() default "La contraseña necesita al menos 12 caracteres, una mayúscula, "
			+ "una minúscula, un número y un símbolo (por ejemplo . , ! ? @)";

	Class<?>[] groups() default {};

	Class<? extends Payload>[] payload() default {};

}
