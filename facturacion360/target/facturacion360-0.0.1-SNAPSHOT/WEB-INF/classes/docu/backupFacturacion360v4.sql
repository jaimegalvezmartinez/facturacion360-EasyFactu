-- ═════════════════════════════════════════════════════════════════════════
-- backupFacturacion360v4.sql - el esquema completo, al dia.
--
-- CARGA ESTE si montas la base desde cero. Es el del numero mas alto, y esa
-- es la regla: el mayor es el que vale.
--
-- Cambios respecto al v3:
--   usuarios   tabla nueva. Es la del portal de acceso: guarda el nombre de
--              inicio de sesion, el hash BCrypt de la contrasena y el rol
--              (ADMIN o USUARIO). Sin esta tabla la aplicacion no arranca
--              del todo: nadie puede entrar.
--
-- Si YA tienes datos y no quieres perderlos, no cargues esto (haria DROP TABLE
-- de todo): usa docu/migracion-usuarios.sql, que crea solo la tabla usuarios
-- y sus dos cuentas iniciales sin tocar lo demas.
--
-- Cuentas iniciales (cambiar la contrasena antes de salir de aqui):
--   admin / CambiarYa.2026   -> ADMIN
--   datos / CambiarYa.2026   -> USUARIO
--
-- Los v1, v2 y v3 se quedan como estan a proposito, para poder volver a un
-- esquema anterior. No son copias de seguridad y no hay que cargarlos.
-- ═════════════════════════════════════════════════════════════════════════

CREATE DATABASE  IF NOT EXISTS `bd_facturacion` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;
USE `bd_facturacion`;
-- MySQL dump 10.13  Distrib 8.0.46, for Win64 (x86_64)
--
-- Host: localhost    Database: bd_facturacion
-- ------------------------------------------------------
-- Server version	8.4.10

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `clientes`
--

DROP TABLE IF EXISTS `clientes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `clientes` (
  `idcliente` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(60) NOT NULL,
  `nif_cif` varchar(10) NOT NULL,
  `direccion` varchar(90) NOT NULL,
  `codigopostal` varchar(6) DEFAULT NULL,
  `poblacion` varchar(30) NOT NULL,
  `provincia` varchar(15) NOT NULL,
  `telefono` varchar(15) DEFAULT NULL,
  `email` varchar(30) DEFAULT NULL,
  `fecha_alta` date DEFAULT NULL,
  PRIMARY KEY (`idcliente`),
  UNIQUE KEY `nif_cif_UNIQUE` (`nif_cif`)
) ENGINE=InnoDB AUTO_INCREMENT=54 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `conceptos`
--

DROP TABLE IF EXISTS `conceptos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `conceptos` (
  `idconcepto` bigint NOT NULL AUTO_INCREMENT,
  `descripcion` varchar(50) DEFAULT NULL,
  `cantidad` int DEFAULT NULL,
  `precio_unitario` decimal(10,2) DEFAULT NULL,
  `descuento` decimal(5,2) DEFAULT NULL,
  `porcentaje_iva` decimal(4,2) DEFAULT NULL,
  `importe_iva` decimal(10,2) DEFAULT NULL,
  `base_imponible` decimal(10,2) DEFAULT NULL,
  `total` decimal(10,2) NOT NULL,
  `idfactura` int NOT NULL,
  `clave_regimen` varchar(2) NOT NULL DEFAULT '01',
  `calificacion` varchar(2) NOT NULL DEFAULT 'S1',
  PRIMARY KEY (`idconcepto`),
  KEY `FK_FACTURA_idx` (`idfactura`),
  CONSTRAINT `FK_FACTURA` FOREIGN KEY (`idfactura`) REFERENCES `facturas` (`idfactura`)
) ENGINE=InnoDB AUTO_INCREMENT=28 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `emisor`
--

DROP TABLE IF EXISTS `emisor`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `emisor` (
  `idemisor` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_eo_0900_ai_ci NOT NULL,
  `nif_cif` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_eo_0900_ai_ci NOT NULL,
  `direccion` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_eo_0900_ai_ci NOT NULL,
  `email` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_eo_0900_ai_ci DEFAULT NULL,
  `telefono` varchar(15) CHARACTER SET utf8mb4 COLLATE utf8mb4_eo_0900_ai_ci DEFAULT NULL,
  `logo` mediumblob,
  PRIMARY KEY (`idemisor`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `facturas`
--

DROP TABLE IF EXISTS `facturas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `facturas` (
  `idfactura` int NOT NULL AUTO_INCREMENT,
  `idcliente` int NOT NULL,
  `num_factura` varchar(15) NOT NULL,
  `fecha_emision` date NOT NULL,
  `estado` enum('BORRADOR','EMITIDA','ANULADA') DEFAULT NULL,
  `observaciones` varchar(90) DEFAULT NULL,
  `subtotal` decimal(10,2) NOT NULL,
  `importe_iva` decimal(10,2) NOT NULL,
  `total` decimal(10,2) NOT NULL,
  `fecha_creacion` datetime DEFAULT NULL,
  `fecha_actualizacion` datetime DEFAULT NULL,
  PRIMARY KEY (`idfactura`),
  UNIQUE KEY `num_factura_UNIQUE` (`num_factura`),
  KEY `FK_CLIENTE_idx` (`idcliente`),
  CONSTRAINT `FK_CLIENTE` FOREIGN KEY (`idcliente`) REFERENCES `clientes` (`idcliente`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `desglose_impositivo`
--
-- El desglose del IVA agrupado por la terna (regimen, calificacion, tipo), tal
-- y como se declara. Va despues de `facturas` porque su clave ajena apunta ahi.
--

DROP TABLE IF EXISTS `desglose_impositivo`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `desglose_impositivo` (
  `iddesglose` bigint NOT NULL AUTO_INCREMENT,
  `idfactura` int NOT NULL,
  `impuesto` varchar(2) NOT NULL DEFAULT '01',
  `clave_regimen` varchar(2) NOT NULL DEFAULT '01',
  `calificacion` varchar(2) NOT NULL DEFAULT 'S1',
  `tipo_impositivo` decimal(5,2) NOT NULL,
  `base_imponible` decimal(12,2) NOT NULL,
  `cuota_repercutida` decimal(12,2) NOT NULL,
  PRIMARY KEY (`iddesglose`),
  KEY `ix_desglose_factura` (`idfactura`),
  CONSTRAINT `fk_desglose_factura` FOREIGN KEY (`idfactura`) REFERENCES `facturas` (`idfactura`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `usuarios`
--
-- El portal de acceso. Unica tabla que el usuario escribe y la unica cuyo
-- contenido decide quien puede ver el resto de la aplicacion.
--
-- `clave_hash` es un hash BCrypt y jamas la contrasena en claro. `rol` decide
-- lo que se puede hacer: ADMIN puede borrar clientes y modificar los datos
-- fiscales del emisor; USUARIO, todo lo demas.
--

DROP TABLE IF EXISTS `usuarios`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `usuarios` (
  `idusuario` int NOT NULL AUTO_INCREMENT,
  `usuario` varchar(50) NOT NULL,
  `clave_hash` varchar(100) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `rol` varchar(20) NOT NULL DEFAULT 'USUARIO',
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `fecha_alta` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ultimo_acceso` datetime DEFAULT NULL,
  PRIMARY KEY (`idusuario`),
  UNIQUE KEY `usuario_UNIQUE` (`usuario`),
  CONSTRAINT `ck_usuarios_rol` CHECK ((`rol` in (_utf8mb4'ADMIN',_utf8mb4'USUARIO')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-09-16 11:56:30

INSERT INTO `bd_facturacion`.`emisor` 
(`idemisor`, `nombre`, `nif_cif`, `direccion`, `email`, `telefono`) 
VALUES ('1', 'Mi Empresa S.L', 'A12345678', 'Calle Mayor 15', 'miempresa@test.es', '900123456');

INSERT INTO `bd_facturacion`.`usuarios`
(`usuario`, `clave_hash`, `nombre`, `rol`, `activo`)
VALUES
('adminsite', '$2a$10$XLknJReh.BEubHm2F1uYjeV16cnuqAcvJIkT5ozT..x6bwhSEicdu', 'Administrador', 'ADMIN', 1),
('datos', '$2a$10$XLknJReh.BEubHm2F1uYjeV16cnuqAcvJIkT5ozT..x6bwhSEicdu', 'Usuario de pruebas', 'USUARIO', 1);

-- Contraseña de las dos cuentas de arriba: CambiarYa.2026
-- Para cambiar una: genera el hash de la nueva y haz UPDATE usuarios
-- SET clave_hash = '<hash nuevo>' WHERE usuario = 'admin';
