package edu.xtd.facturacion360.validacion;

import java.util.ArrayList;
import java.util.List;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

/**
 * Comprueba que una contraseña sea larga y no se quede solo en minúsculas.
 *
 * <p>Las cinco reglas, que son las que enseñan los formularios de la aplicación:</p>
 *
 * <ul>
 *   <li>al menos 12 caracteres (y 200 como mucho, que es la columna de la base de datos);</li>
 *   <li>una mayúscula;</li>
 *   <li>una minúscula;</li>
 *   <li>un dígito;</li>
 *   <li>un símbolo: cualquier cosa que no sea letra, ni número, ni espacio.</li>
 * </ul>
 *
 * <p>Las letras se comparan con {@link Character#isUpperCase(int)} y no con un rango
 * {@code [A-Z]} porque en español una contraseña puede llevar tildes y ñ: {@code Á} es
 * mayúscula, y con el rangoASCII saldría rechazada. El espacio no cuenta como símbolo a
 * propósito: si contara, "esta es la contraseña" cumpliría la regla del símbolo sin llevar
 * ninguno, que es el truco que se cuela en cuanto alguien lo prueba.</p>
 *
 * <p>El mensaje no dice "la contraseña no es válida", dice qué le falta. Con cinco reglas,
 * el mensaje único obliga a ir probando y quitando, mientras que la lista se lee de una vez y
 * se corrige de una pasada.</p>
 *
 * @author AngelDanielC0des
 */
public class ClaveSeguraValidador implements ConstraintValidator<ClaveSegura, String> {

	private int minimo;
	private int maximo;

	@Override
	public void initialize(ClaveSegura anotacion) {
		this.minimo = anotacion.minimo();
		this.maximo = anotacion.maximo();
	}

	@Override
	public boolean isValid(String valor, ConstraintValidatorContext contexto) {

		// En blanco se da por bueno: de si el campo es obligatorio decide @NotBlank. Si esto
		// devolviera false, un campo vacío soltaría dos errores diciendo lo mismo.
		if (valor == null || valor.isEmpty()) {
			return true;
		}

		List<String> falta = new ArrayList<>();

		if (valor.length() < minimo) {
			falta.add("al menos " + minimo + " caracteres");
		}

		if (valor.length() > maximo) {
			falta.add("no más de " + maximo + " caracteres");
		}

		if (!tiene(valor, Character::isUpperCase)) {
			falta.add("una letra mayúscula");
		}

		if (!tiene(valor, Character::isLowerCase)) {
			falta.add("una letra minúscula");
		}

		if (!tiene(valor, Character::isDigit)) {
			falta.add("un número");
		}

		if (!tieneSimbolo(valor)) {
			falta.add("un símbolo (por ejemplo . , ! ? @)");
		}

		if (falta.isEmpty()) {
			return true;
		}

		return rechazar(contexto, "La contraseña necesita " + unir(falta) + ".");
	}

	/** Si algún carácter de la contraseña cumple la condición. */
	private boolean tiene(String valor, java.util.function.IntPredicate condicion) {
		return valor.codePoints().anyMatch(condicion);
	}

	/**
	 * Si hay algún símbolo: lo que no es letra, ni número, ni espacio.
	 *
	 * <p>El espacio se excluye a propósito, y el comentario de la clase dice por qué: si
	 * contara, una frase con huecos cumpliría la regla del símbolo sin llevar ninguno.</p>
	 */
	private boolean tieneSimbolo(String valor) {
		return valor.codePoints()
				.anyMatch(codigo -> !Character.isLetterOrDigit(codigo)
						&& !Character.isWhitespace(codigo));
	}

	/** "a, b y c", que es como se lee una lista de Reasons en español. */
	private String unir(List<String> partes) {
		if (partes.size() == 1) {
			return partes.getFirst();
		}

		return String.join(", ", partes.subList(0, partes.size() - 1))
				+ " y " + partes.getLast();
	}

	/**
	 * Sustituye el mensaje por defecto por uno que dice qué falta.
	 *
	 * <p>Aquí no hay nada calculado que sí sea peligroso, pero el texto de una violación se
	 * interpreta como plantilla de todos modos: lo que se mete son motivos fijos de este
	 * archivo, nunca lo que haya tecleado el usuario.</p>
	 *
	 * @return siempre false, para poder escribir {@code return rechazar(...)}
	 */
	private boolean rechazar(ConstraintValidatorContext contexto, String motivo) {
		if (contexto != null) {
			contexto.disableDefaultConstraintViolation();
			contexto.buildConstraintViolationWithTemplate(motivo).addConstraintViolation();
		}

		return false;
	}

}
