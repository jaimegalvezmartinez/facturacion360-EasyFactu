-- ═════════════════════════════════════════════════════════════════════════
-- migracion-usuarios.sql - añade el portal de acceso a una base que ya está
-- en el esquema v3.
--
-- CARGA ESTE si ya tienes datos (clientes, facturas, el emisor) y solo te
-- falta la tabla de usuarios. No toca ninguna tabla de las que ya tienes:
-- solo crea `usuarios` y mete las dos cuentas iniciales.
--
-- Si partes de cero, carga directamente docu/backupFacturacion360v4.sql, que
-- lleva ya esta tabla dentro.
--
-- CÓMO DAR DE ALTA MÁS CUENTAS
--   1) Desde la propia pantalla de acceso, con el botón "Crear cuenta"
--      (equivale a POST /auth/registro). Todas nacen con rol USUARIO.
--   2) Con una sentencia UPDATE sobre esta misma tabla para cambiar un rol:
--        UPDATE usuarios SET rol = 'ADMIN' WHERE usuario = 'nombre';
--
-- CÓMO CAMBIAR UNA CONTRASEÑA
--   Las contraseñas NO se guardan en claro: se guarda su hash BCrypt. Para
--   cambiar una hay que generar el hash de la nueva y hacer un UPDATE. El
--   hash de abajo es de "CambiarYa.2026":
--
--     UPDATE usuarios
--        SET clave_hash = '<pega aquí el hash nuevo>'
--      WHERE usuario = 'admin';
--
--   Para generar un hash puedes usar la pantalla de registro (que hashea lo
--   que te teclee) y leer el valor de la fila, o generar uno desde Java:
--
--     new BCryptPasswordEncoder().encode("la contraseña nueva");
--
--   Ojo: BCrypt nunca devuelve dos hashes iguales para la misma contraseña
--   (lleva sal), así que no se puede comprobar comparando cadenas: hay que
--   usar PasswordEncoder.matches().
-- ═════════════════════════════════════════════════════════════════════════

CREATE DATABASE  IF NOT EXISTS `bd_facturacion` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci */;
USE `bd_facturacion`;

DROP TABLE IF EXISTS `usuarios`;
CREATE TABLE `usuarios` (
  `idusuario`     int          NOT NULL AUTO_INCREMENT,
  `usuario`       varchar(50)  NOT NULL COMMENT 'Nombre con el que se inicia sesión',
  `clave_hash`    varchar(100) NOT NULL COMMENT 'Hash BCrypt. NUNCA la contraseña en claro',
  `nombre`        varchar(100) NOT NULL COMMENT 'Nombre y apellidos, solo para mostrarlo',
  `rol`           varchar(20)  NOT NULL DEFAULT 'USUARIO' COMMENT 'ADMIN o USUARIO',
  `activo`        tinyint(1)   NOT NULL DEFAULT 1 COMMENT '0 = la cuenta existe pero no puede entrar',
  `fecha_alta`    datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ultimo_acceso` datetime     DEFAULT NULL COMMENT 'Se rellena en cada acceso correcto',
  PRIMARY KEY (`idusuario`),
  UNIQUE KEY `usuario_UNIQUE` (`usuario`),
  CONSTRAINT `ck_usuarios_rol` CHECK (`rol` IN ('ADMIN', 'USUARIO'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- LAS DOS CUENTAS INICIALES
--
-- Las dos tienen la contraseña "CambiarYa.2026". Cámbialas antes de que la
-- aplicación se pueda ver desde fuera: quien sepa estas dos puede entrar.
--
--   admin  / CambiarYa.2026   -> ADMIN   (borrar clientes y tocar el emisor)
--   datos  / CambiarYa.2026   -> USUARIO (todo menos lo anterior)
--
-- Si solo vas a instalar la aplicación para pruebas, entra con `admin`.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO `bd_facturacion`.`usuarios`
  (`usuario`, `clave_hash`, `nombre`, `rol`, `activo`)
VALUES
  ('admin', '$2a$10$XLknJReh.BEubHm2F1uYjeV16cnuqAcvJIkT5ozT..x6bwhSEicdu', 'Administrador', 'ADMIN', 1),
  ('datos', '$2a$10$XLknJReh.BEubHm2F1uYjeV16cnuqAcvJIkT5ozT..x6bwhSEicdu', 'Usuario de pruebas', 'USUARIO', 1);

-- Para dejar de permitir el acceso a una cuenta sin borrarla:
--   UPDATE usuarios SET activo = 0 WHERE usuario = 'nombre';