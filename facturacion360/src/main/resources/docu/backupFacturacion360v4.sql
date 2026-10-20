
-- ============================================================
-- backupFacturacion360v4_phpmyadmin.sql
-- Base de datos de Facturacion360 para PHP y phpMyAdmin
-- Compatible con MySQL y MariaDB
--
-- IMPORTANTE:
-- Este script elimina las tablas existentes antes de recrearlas.
-- Haz una copia de seguridad si ya tienes datos.
-- ============================================================

CREATE DATABASE IF NOT EXISTS `bd_facturacion`
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE `bd_facturacion`;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- ELIMINAR TABLAS EXISTENTES
-- ============================================================

DROP TABLE IF EXISTS `conceptos`;
DROP TABLE IF EXISTS `desglose_impositivo`;
DROP TABLE IF EXISTS `facturas`;
DROP TABLE IF EXISTS `clientes`;
DROP TABLE IF EXISTS `emisor`;
DROP TABLE IF EXISTS `usuarios`;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- TABLA: clientes
-- ============================================================

CREATE TABLE `clientes` (
    `idcliente` INT NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(60) NOT NULL,
    `nif_cif` VARCHAR(10) NOT NULL,
    `direccion` VARCHAR(90) NOT NULL,
    `codigopostal` VARCHAR(6) DEFAULT NULL,
    `poblacion` VARCHAR(30) NOT NULL,
    `provincia` VARCHAR(15) NOT NULL,
    `telefono` VARCHAR(15) DEFAULT NULL,
    `email` VARCHAR(30) DEFAULT NULL,
    `fecha_alta` DATE DEFAULT NULL,
    PRIMARY KEY (`idcliente`),
    UNIQUE KEY `nif_cif_UNIQUE` (`nif_cif`)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLA: emisor
-- ============================================================

CREATE TABLE `emisor` (
    `idemisor` INT NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(60) NOT NULL,
    `nif_cif` VARCHAR(10) NOT NULL,
    `direccion` VARCHAR(200) NOT NULL,
    `email` VARCHAR(50) DEFAULT NULL,
    `telefono` VARCHAR(15) DEFAULT NULL,
    `logo` MEDIUMBLOB DEFAULT NULL,
    PRIMARY KEY (`idemisor`)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLA: usuarios
-- Para el inicio de sesión de la aplicación PHP.
-- clave_hash almacena hashes BCrypt, nunca contraseñas en claro.
-- ============================================================

CREATE TABLE `usuarios` (
    `idusuario` INT NOT NULL AUTO_INCREMENT,
    `usuario` VARCHAR(50) NOT NULL,
    `clave_hash` VARCHAR(255) NOT NULL,
    `nombre` VARCHAR(100) NOT NULL,
    `rol` VARCHAR(20) NOT NULL DEFAULT 'USUARIO',
    `activo` TINYINT(1) NOT NULL DEFAULT 1,
    `fecha_alta` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `ultimo_acceso` DATETIME DEFAULT NULL,
    PRIMARY KEY (`idusuario`),
    UNIQUE KEY `usuario_UNIQUE` (`usuario`),
    CONSTRAINT `ck_usuarios_rol`
        CHECK (`rol` IN ('ADMIN', 'USUARIO'))
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLA: facturas
-- ============================================================

CREATE TABLE `facturas` (
    `idfactura` INT NOT NULL AUTO_INCREMENT,
    `idcliente` INT NOT NULL,
    `num_factura` VARCHAR(15) NOT NULL,
    `fecha_emision` DATE NOT NULL,
    `estado` ENUM('BORRADOR','EMITIDA','ANULADA')
        DEFAULT 'BORRADOR',
    `observaciones` VARCHAR(90) DEFAULT NULL,
    `subtotal` DECIMAL(10,2) NOT NULL,
    `importe_iva` DECIMAL(10,2) NOT NULL,
    `total` DECIMAL(10,2) NOT NULL,
    `fecha_creacion` DATETIME DEFAULT NULL,
    `fecha_actualizacion` DATETIME DEFAULT NULL,
    PRIMARY KEY (`idfactura`),
    UNIQUE KEY `num_factura_UNIQUE` (`num_factura`),
    KEY `FK_CLIENTE_idx` (`idcliente`),
    CONSTRAINT `FK_CLIENTE`
        FOREIGN KEY (`idcliente`)
        REFERENCES `clientes` (`idcliente`)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLA: conceptos
-- ============================================================

CREATE TABLE `conceptos` (
    `idconcepto` BIGINT NOT NULL AUTO_INCREMENT,
    `descripcion` VARCHAR(50) DEFAULT NULL,
    `cantidad` INT DEFAULT NULL,
    `precio_unitario` DECIMAL(10,2) DEFAULT NULL,
    `descuento` DECIMAL(5,2) DEFAULT NULL,
    `porcentaje_iva` DECIMAL(4,2) DEFAULT NULL,
    `importe_iva` DECIMAL(10,2) DEFAULT NULL,
    `base_imponible` DECIMAL(10,2) DEFAULT NULL,
    `total` DECIMAL(10,2) NOT NULL,
    `idfactura` INT NOT NULL,
    `clave_regimen` VARCHAR(2) NOT NULL DEFAULT '01',
    `calificacion` VARCHAR(2) NOT NULL DEFAULT 'S1',
    PRIMARY KEY (`idconcepto`),
    KEY `FK_FACTURA_idx` (`idfactura`),
    CONSTRAINT `FK_FACTURA`
        FOREIGN KEY (`idfactura`)
        REFERENCES `facturas` (`idfactura`)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLA: desglose_impositivo
-- Desglose del IVA por régimen, calificación y tipo.
-- ============================================================

CREATE TABLE `desglose_impositivo` (
    `iddesglose` BIGINT NOT NULL AUTO_INCREMENT,
    `idfactura` INT NOT NULL,
    `impuesto` VARCHAR(2) NOT NULL DEFAULT '01',
    `clave_regimen` VARCHAR(2) NOT NULL DEFAULT '01',
    `calificacion` VARCHAR(2) NOT NULL DEFAULT 'S1',
    `tipo_impositivo` DECIMAL(5,2) NOT NULL,
    `base_imponible` DECIMAL(12,2) NOT NULL,
    `cuota_repercutida` DECIMAL(12,2) NOT NULL,
    PRIMARY KEY (`iddesglose`),
    KEY `ix_desglose_factura` (`idfactura`),
    CONSTRAINT `fk_desglose_factura`
        FOREIGN KEY (`idfactura`)
        REFERENCES `facturas` (`idfactura`)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- DATOS INICIALES DEL EMISOR
-- ============================================================

INSERT INTO `emisor`
    (`idemisor`, `nombre`, `nif_cif`, `direccion`, `email`, `telefono`)
VALUES
    (1, 'Mi Empresa S.L', 'A12345678',
     'Calle Mayor 15', 'miempresa@test.es', '900123456');

-- ============================================================
-- USUARIOS INICIALES
-- Los dos hashes siguientes son los facilitados en el script
-- original. Verifica que corresponden a la contraseña indicada.
-- ============================================================

INSERT INTO `usuarios`
    (`usuario`, `clave_hash`, `nombre`, `rol`, `activo`)
VALUES
    ('adminsite',
     '$2a$10$XLknJReh.BEubHm2F1uYjeV16cnuqAcvJIkT5ozT..x6bwhSEicdu',
     'Administrador', 'ADMIN', 1),
    ('datos',
     '$2a$10$XLknJReh.BEubHm2F1uYjeV16cnuqAcvJIkT5ozT..x6bwhSEicdu',
     'Usuario de pruebas', 'USUARIO', 1);

-- ============================================================
-- FIN DEL SCRIPT
-- ============================================================

