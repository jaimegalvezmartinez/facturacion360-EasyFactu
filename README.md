# Facturación 360 / EasyFactu

Aplicación web para la gestión de facturas online: clientes, facturas, datos del emisor y
generación de PDF, con portal de acceso, roles y panel de administración de cuentas.

---

## Tabla de contenidos

- [1. Qué es](#1-qué-es)
- [2. Funciones](#2-funciones)
- [3. Estructura del proyecto](#3-estructura-del-proyecto)
- [4. La base de datos](#4-la-base-de-datos)
  - [4.1 Qué fichero cargar](#41-qué-fichero-cargar)
  - [4.2 Importar la base](#42-importar-la-base)
  - [4.3 Estructura de las tablas](#43-estructura-de-las-tablas)
  - [4.4 Solución de problemas](#44-solución-de-problemas)
- [5. Ponerla en marcha](#5-ponerla-en-marcha)
- [6. Acceso y roles](#6-acceso-y-roles)
- [7. Antes de publicar](#7-antes-de-publicar)
- [8. Referencias](#8-referencias)

---

## 1. Qué es

Aplicación web de gestión de facturas online. Lleva los clientes, las facturas y los datos
fiscales del emisor, y genera la factura en PDF. Tiene portal de acceso con dos roles y un
panel de administración de cuentas.

- **Lenguaje:** Java 21
- **Framework:** Spring Boot 4.1.0 (WebMVC, Validation, Security, JDBC, Thymeleaf)
- **Base de datos:** MySQL 8 con `JdbcTemplate` (SQL puro, sin JPA)
- **PDF:** openhtmltopdf-pdfbox + plantillas Thymeleaf
- **API:** documentada con Swagger UI (springdoc)
- **Empaquetado:** WAR, se despliega en Apache Tomcat 11
- **Frontend:** HTML estático servido por Spring + JavaScript propio

---

## 2. Funciones

### 2.1 Clientes

- Alta, modificación y borrado de clientes.
- Listado **paginado** con búsqueda, filtros (provincia, población) y ordenación.
- Provincias y poblaciones distintas para los desplegables.
- Últimos clientes dados de alta (desplegable del alta de facturas).
- Un NIF/CIF repetido → **409**; un cliente con facturas no se puede borrar.

### 2.2 Facturas

- Crear y editar facturas mientras son **borrador**.
- Detalle completo de una factura.
- Búsqueda por texto y/o estado (`BORRADOR`, `EMITIDA`, `ANULADA`).
- Sugerencias de conceptos.
- Resumen trimestral (año y trimestre).
- Descarga del **PDF** en A4, A5 o carta.

### 2.3 Emisor

- Ver y modificar razón social, NIF, domicilio, email y teléfono.
- Subir y servir el logotipo (`/emisor/logo`).
- Solo lo modifica un **ADMIN**.

### 2.4 Autenticación

- Iniciar sesión (`POST /auth/login`).
- Cerrar sesión (`POST /auth/logout`).
- Cambiar la contraseña propia (`PUT /auth/clave`), que pide la actual.
- Registro público (`POST /auth/registro`), que crea cuentas **desactivadas**.
- Datos de la sesión (`GET /auth/yo`) y token CSRF (`GET /auth/csrf`).

### 2.5 Panel de administración de cuentas

- Listar todas las cuentas (rol, estado y fechas).
- Dar de alta cuentas **con el rol que se elija** (único punto donde nace un ADMIN).
- Editar nombre, rol y estado.
- Poner una contraseña nueva (sin pedir la anterior).
- Borrar una cuenta, exigiendo la contraseña del administrador que la borra.
- No se puede borrar la propia cuenta ni dejar la aplicación sin administradores.

### 2.6 Pantallas

| Pantalla | Fichero | Qué hace |
|---|---|---|
| Acceso | `login.html` | Entrar y crear cuenta |
| Inicio | `index.html` | Pantalla principal y menú |
| Clientes | `clientes.html` | Alta, edición, borrado y listado |
| Facturas | `facturas.html` | Alta, borrador, búsqueda y resumen |
| Imprimir | `factura-imprimir.html` | Visor de impresión |
| Perfil | `perfil.html` | Ver los datos del emisor |
| Mi cuenta | `cuenta.html` | Cambiar la contraseña propia |
| Usuarios | `usuarios.html` | Panel de administración |
| Ayuda | `ayuda.html` | Ayuda de la aplicación |

### 2.7 Endpoints de la API

**`/auth`**

| Método | Ruta | Función |
|---|---|---|
| POST | `/auth/login` | Iniciar sesión |
| POST | `/auth/logout` | Cerrar sesión |
| PUT | `/auth/clave` | Cambiar la contraseña propia |
| POST | `/auth/registro` | Crear una cuenta desactivada |
| GET | `/auth/yo` | Datos de la sesión actual |
| GET | `/auth/csrf` | Token de CSRF |

**`/cliente`**

| Método | Ruta | Función |
|---|---|---|
| POST | `/cliente` | Crear cliente |
| GET | `/cliente/listar-pagina` | Página con búsqueda y filtros |
| GET | `/cliente/listar-ultimos` | Últimos clientes |
| GET | `/cliente/provincias` | Provincias distintas |
| GET | `/cliente/poblaciones` | Poblaciones distintas |
| GET | `/cliente/{id}` | Cliente por id |
| PUT | `/cliente/{id}` | Actualizar cliente |
| DELETE | `/cliente/{id}` | Borrar cliente (solo ADMIN) |

**`/factura`**

| Método | Ruta | Función |
|---|---|---|
| POST | `/factura` | Crear factura |
| PUT | `/factura/{idFactura}/borrador` | Editar borrador |
| GET | `/factura/{idFactura}/detalle` | Detalle de la factura |
| GET | `/factura/buscar` | Buscar por texto y/o estado |
| GET | `/factura/conceptos/sugerencias` | Sugerencias de conceptos |
| GET | `/factura/trimestral` | Resumen trimestral |
| GET | `/factura/{idFactura}/pdf` | Descargar el PDF |

**`/emisor`**

| Método | Ruta | Función |
|---|---|---|
| GET | `/emisor` | Datos del emisor |
| GET | `/emisor/logo` | Logotipo (PNG) |
| PUT | `/emisor` | Guardar emisor (JSON, solo ADMIN) |
| PUT | `/emisor/con-imagen` | Guardar emisor con logo (multipart, solo ADMIN) |

**`/usuarios`** (solo ADMIN)

| Método | Ruta | Función |
|---|---|---|
| GET | `/usuarios` | Listar cuentas |
| POST | `/usuarios` | Dar de alta una cuenta |
| PUT | `/usuarios/{idUsuario}` | Editar rol/estado/nombre |
| PUT | `/usuarios/{idUsuario}/clave` | Poner contraseña nueva |
| DELETE | `/usuarios/{idUsuario}` | Borrar cuenta |

Todos los errores responden con **`ProblemDetail`** (RFC 9457), con el motivo en `detail`.

---

## 3. Estructura del proyecto

### 3.1 Árbol

```
facturacion360/
├── pom.xml                          Build Maven (WAR) y perfiles
├── desplegar.sh                     Script de despliegue automatizado
├── proguard-rules.pro               Reglas de ofuscación (desactivada por defecto)
├── README.md                        README general de la aplicación
├── src/main/
│   ├── java/edu/xtd/facturacion360/
│   │   ├── Facturacion360Application.java        Clase principal (java -jar)
│   │   ├── Facturacion360ServletInitializer.java Entrada para Tomcat externo
│   │   ├── controller/      Controladores REST + manejador global de excepciones
│   │   ├── dto/             DTOs y RowMappers
│   │   ├── repository/      Interfaces + implementaciones JdbcTemplate
│   │   ├── service/         Lógica de negocio
│   │   ├── seguridad/       Configuración de Spring Security
│   │   ├── validacion/      Validadores (@NifCif, @ClaveSegura)
│   │   └── pdf/             Generación de PDF
│   └── resources/
│       ├── application.properties   Configuración de la aplicación
│       ├── logback-spring.xml        Configuración de logs
│       ├── docu/                     Esta carpeta: SQL y documentación
│       ├── static/                  HTML, CSS, JS e imágenes
│       └── templates/               Plantillas Thymeleaf del PDF
└── src/test/                Tests (seguridad) + esquema H2
```

### 3.2 Capas

| Paquete | Responsabilidad |
|---|---|
| `controller` | Recibe las peticiones HTTP, valida la entrada y devuelve la respuesta. No contiene lógica de negocio. |
| `dto` | Objetos de transferencia (records) y los `RowMapper` que convierten filas en objetos. |
| `service` | Lógica de negocio: cálculos, reglas, transacciones y orquestación. |
| `repository` | La única capa que habla SQL. Traduce cada operación a una consulta con `JdbcTemplate`. |
| `seguridad` | Configuración de Spring Security: reglas de acceso, BCrypt, handlers 401/403. |
| `validacion` | Validadores personalizados: `@NifCif` y `@ClaveSegura`. |
| `pdf` | Render de la factura: servicio, formateador y formatos de papel. |

Flujo de una petición:

```
Navegador → controller → service → repository → MySQL
                ↑                        ↓
                └──── dto / RowMapper ───┘
```

- Los controladores no comprueban permisos: lo decide `seguridad/ConfiguracionSeguridad`.
- Los repositorios parametrizan todos los valores (`?`) y usan listas blancas para el `ORDER BY`.
- `ManejadorExcepciones` (`@RestControllerAdvice`) es el único sitio que da formato a los errores.

### 3.3 Frontend

- **HTML**: una página por pantalla (`login.html`, `clientes.html`, `facturas.html`...).
- **CSS**: hojas sueltas en la raíz de `static` (sin carpeta `css`) para reutilizarlas en el PDF.
- **JS**: ~26 scripts en `static/js/`, agrupados por responsabilidad (`api.js`, `sesion.js`,
  `validacion.js`, `tabla.js`, `fila.js`, `clave.js`, `ver-clave.js`...).
- **PDF**: plantillas Thymeleaf propias en `templates/` (el motor es CSS 2.1 y no entiende la
  hoja del visor).

### 3.4 Seguridad

- Regla general `anyRequest().authenticated()`: todo nace protegido salvo lo abierto explícitamente.
- Contraseñas con **BCrypt** (con sal), sesiones rotadas al entrar y cookie `HttpOnly`.
- **CSRF** activo: token en cookie legible por el JS, devuelto por `GET /auth/csrf`.

---

## 4. La base de datos

### 4.1 Qué fichero cargar

Base de datos: **`bd_facturacion`**. Si montas desde cero, carga el de número más alto.

| Situación | Fichero |
|---|---|
| Base nueva, desde cero | `docu/backupFacturacion360v4.sql` |
| Base ya en el v3, con datos | `docu/migracion-usuarios.sql` |

- `backup...v4.sql` y `backup...v3.sql` **hacen `DROP TABLE`**: solo llevan el esquema y unas
  pocas filas.
- `migracion-usuarios.sql` **no toca las demás tablas**: solo crea `usuarios` y mete las cuentas
  iniciales.
- Ambos crean la base si no existe y hacen `USE` de ella.

### 4.2 Importar la base

```bash
mysql -u root -p < src/main/resources/docu/backupFacturacion360v4.sql
```

Windows:

```bash
mysql -u root -p --default-character-set=utf8mb4 -e "source backupFacturacion360v4.sql"
```

Solo la tabla de usuarios (base ya existente):

```bash
mysql -u root -p < src/main/resources/docu/migracion-usuarios.sql
```

Usuario de aplicación (recomendado en producción):

```sql
CREATE USER 'facturacion'@'localhost' IDENTIFIED BY 'una_contraseña_segura';
GRANT SELECT, INSERT, UPDATE, DELETE ON bd_facturacion.* TO 'facturacion'@'localhost';
FLUSH PRIVILEGES;
```

Comprobar:

```sql
USE bd_facturacion;
SHOW TABLES;
SELECT usuario, rol, activo FROM usuarios;
```

### 4.3 Estructura de las tablas

Relaciones:

```
clientes 1 ────< N facturas 1 ────< N conceptos
                            │
                            └───────< N desglose_impositivo

emisor       (fila única, sin relaciones)
usuarios     (una fila por cuenta, sin relaciones con el resto)
```

**`clientes`**

| Columna | Tipo | Notas |
|---|---|---|
| `idcliente` | `int` PK | Auto-incremental |
| `nombre` | `varchar(60)` | Razón social |
| `nif_cif` | `varchar(10)` | Único |
| `direccion` | `varchar(90)` | |
| `codigopostal` | `varchar(6)` | Nulo |
| `poblacion` | `varchar(30)` | |
| `provincia` | `varchar(15)` | |
| `telefono` | `varchar(15)` | Nulo |
| `email` | `varchar(30)` | Nulo |
| `fecha_alta` | `date` | Nulo |

**`facturas`**

| Columna | Tipo | Notas |
|---|---|---|
| `idfactura` | `int` PK | Auto-incremental |
| `idcliente` | `int` | FK → `clientes.idcliente` |
| `num_factura` | `varchar(15)` | Único |
| `fecha_emision` | `date` | |
| `estado` | `enum` | `BORRADOR`, `EMITIDA`, `ANULADA` |
| `observaciones` | `varchar(90)` | Nulo |
| `subtotal` | `decimal(10,2)` | Base sin IVA |
| `importe_iva` | `decimal(10,2)` | Cuota de IVA |
| `total` | `decimal(10,2)` | Total |
| `fecha_creacion` | `datetime` | |
| `fecha_actualizacion` | `datetime` | |

**`conceptos`**

| Columna | Tipo | Notas |
|---|---|---|
| `idconcepto` | `bigint` PK | Auto-incremental |
| `descripcion` | `varchar(50)` | |
| `cantidad` | `int` | |
| `precio_unitario` | `decimal(10,2)` | |
| `descuento` | `decimal(5,2)` | |
| `porcentaje_iva` | `decimal(4,2)` | |
| `importe_iva` | `decimal(10,2)` | |
| `base_imponible` | `decimal(10,2)` | |
| `total` | `decimal(10,2)` | |
| `idfactura` | `int` | FK → `facturas.idfactura` |
| `clave_regimen` | `varchar(2)` | Default `01` |
| `calificacion` | `varchar(2)` | Default `S1` |

**`desglose_impositivo`**

| Columna | Tipo | Notas |
|---|---|---|
| `iddesglose` | `bigint` PK | Auto-incremental |
| `idfactura` | `int` | FK → `facturas.idfactura` |
| `impuesto` | `varchar(2)` | Default `01` |
| `clave_regimen` | `varchar(2)` | Default `01` |
| `calificacion` | `varchar(2)` | Default `S1` |
| `tipo_impositivo` | `decimal(5,2)` | |
| `base_imponible` | `decimal(12,2)` | |
| `cuota_repercutida` | `decimal(12,2)` | |

**`emisor`** (una sola fila)

| Columna | Tipo | Notas |
|---|---|---|
| `idemisor` | `int` PK | Auto-incremental |
| `nombre` | `varchar(60)` | Razón social |
| `nif_cif` | `varchar(10)` | |
| `direccion` | `varchar(200)` | |
| `email` | `varchar(50)` | Nulo |
| `telefono` | `varchar(15)` | Nulo |
| `logo` | `mediumblob` | Logotipo |

**`usuarios`**

| Columna | Tipo | Notas |
|---|---|---|
| `idusuario` | `int` PK | Auto-incremental |
| `usuario` | `varchar(50)` | Único |
| `clave_hash` | `varchar(100)` | Hash BCrypt, nunca en claro |
| `nombre` | `varchar(100)` | Nombre y apellidos |
| `rol` | `varchar(20)` | `ADMIN` o `USUARIO` |
| `activo` | `tinyint(1)` | `0` = no puede entrar |
| `fecha_alta` | `datetime` | Default `CURRENT_TIMESTAMP` |
| `ultimo_acceso` | `datetime` | Se rellena en cada acceso |

Claves ajenas:

| Tabla | Columna | Apunta a |
|---|---|---|
| `facturas` | `idcliente` | `clientes.idcliente` |
| `conceptos` | `idfactura` | `facturas.idfactura` |
| `desglose_impositivo` | `idfactura` | `facturas.idfactura` |

### 4.4 Solución de problemas

- **`Unknown collation: 'utf8mb4_0900_ai_ci'`** — es de MySQL 8. Actualiza o cambia la collation a `utf8mb4_general_ci`.
- **`Access denied for user 'root'@'localhost'`** — comprueba usuario y contraseña.
- **`Unknown database 'bd_facturacion'`** — crea la base con `CREATE DATABASE bd_facturacion CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`.
- **La aplicación arranca pero nadie entra** — falta `usuarios`; cárgala con `migracion-usuarios.sql`.

---

## 5. Ponerla en marcha

Edita `src/main/resources/application.properties`:

```properties
spring.datasource.url=jdbc:mysql://localhost:3306/bd_facturacion
spring.datasource.username=root
spring.datasource.password=root
```

Compila y despliega:

```bash
mvn clean package
./desplegar.sh
```

- `desplegar.sh` instala Java 21, Maven, MySQL y Tomcat si hace falta, configura puertos, HTTPS y systemd, y despliega el WAR.
- Resultado: `http://<servidor>:<puerto>/facturacion360`.
- Build de producción con estáticos minificados: `mvn package -Pproduccion`.
- Al abrir sin sesión, cualquier dirección lleva a `login.html`.

---

## 6. Acceso y roles

Cuentas iniciales:

| Usuario | Contraseña | Rol |
|---|---|---|
| `admin` | `CambiarYa.2026` | ADMIN |
| `datos` | `CambiarYa.2026` | USUARIO |

Cambiar una contraseña (se guarda su hash BCrypt):

```sql
UPDATE usuarios SET clave_hash = '<hash nuevo>' WHERE usuario = 'admin';
```

Generar el hash:

```java
new BCryptPasswordEncoder().encode("la contraseña nueva");
```

- BCrypt lleva sal: nunca devuelve dos hashes iguales. Para comprobar usa `PasswordEncoder.matches()`.
- `app.seguridad.registro-abierto` controla el registro público (por defecto `true`); las cuentas nacen **desactivadas**.

Permisos:

| | ADMIN | USUARIO |
|---|:---:|:---:|
| Consultar clientes, facturas, listados | Sí | Sí |
| Crear y modificar clientes/facturas | Sí | Sí |
| Ver el perfil de la empresa | Sí | Sí |
| **Borrar clientes** (`DELETE /cliente/{id}`) | Sí | No (403) |
| **Cambiar los datos del emisor** (`PUT /emisor`) | Sí | No (403) |
| **Panel de usuarios** (`/usuarios`, `/usuarios.html`) | Sí | No (403) |

---

## 7. Antes de publicar

1. **HTTPS** — la contraseña viaja en claro por HTTP.
2. **`server.servlet.session.cookie.secure=true`** — cuando haya TLS.
3. **Cambiar la contraseña de `admin` y `datos`.**
4. **`app.seguridad.registro-abierto=false`** — si no quieres registros pendientes.

---

## 8. Referencias

- [`portal-de-acceso.md`](portal-de-acceso.md) — el portal: qué se ve sin sesión, roles, el panel de administración, el borrado y las reglas de contraseña.
- [README general](../../../../README.md) — arranque, build y despliegue completos.
- [`static/`](../static/) — las páginas y los scripts del frontend.
