
Documentación de Facturación 360

Documentación de la aplicación y de esta carpeta docu/: qué hace el proyecto, cómo es por dentro, qué fichero de base de datos cargar, cómo importarlo en MySQL, qué tablas crea y cómo dejar la aplicación lista para usar.

docu/
├── README.md                    Este fichero
├── backupFacturacion360v4.sql   Esquema completo actual (incluye `usuarios`)
├── backupFacturacion360v3.sql   Esquema anterior, sin `usuarios`
├── migracion-usuarios.sql       Añade solo `usuarios` a una base ya existente
└── portal-de-acceso.md          Guía del portal: login, roles y panel de cuentas
Tabla de contenidos

Qué es el proyecto
Funciones
Estructura del proyecto
La base de datos
4.1 Qué fichero cargar
4.2 Requisitos
4.3 Cómo importar la base de datos
4.4 Dejar la aplicación lista
4.5 Estructura de las tablas
4.6 Solución de problemas
Acceso y usuarios
Seguridad y roles
Documentación relacionada
1. Qué es el proyecto

Facturación 360 / EasyFactu es una aplicación web de gestión de facturas online: lleva los clientes, las facturas y los datos fiscales del emisor, y genera la factura en PDF. Tiene además un portal de acceso con dos roles (ADMIN y USUARIO) y un panel de administración de cuentas.

Java 21 con Spring Boot 4.1.0 (WebMVC, Validation, Security, JDBC y Thymeleaf).
Persistencia con MySQL 8 a través de JdbcTemplate (SQL puro, sin JPA).
Se empaqueta como WAR y se despliega en un Apache Tomcat 11 externo.
La interfaz es HTML estático servido por Spring con JavaScript propio.
Documentación de la API con Swagger UI (springdoc).
2. Funciones

Lo que la aplicación puede hacer, agrupado por módulo.

2.1 Clientes

Dar de alta, modificar y borrar clientes.
Listar clientes paginados, con búsqueda, filtros (provincia, población) y ordenación.
Consultar las provincias y poblaciones distintas (para rellenar los desplegables).
Obtener los últimos clientes dados de alta (desplegable del alta de facturas).
Un NIF/CIF repetido se rechaza con un 409; un cliente con facturas no se puede borrar.
2.2 Facturas

Crear una factura y editarla mientras sea borrador.
Consultar el detalle completo de una factura.
Buscar facturas por texto y/o por estado (BORRADOR, EMITIDA, ANULADA).
Sugerencias de conceptos para el alta de facturas.
Resumen trimestral (por año y trimestre).
Generar y descargar el PDF de la factura (en A4, A5 o carta).
2.3 Emisor

Ver y modificar los datos fiscales que salen impresos: razón social, NIF, domicilio, email y teléfono.
Subir el logotipo (multipart) y servirlo en /emisor/logo.
Solo lo modifica un ADMIN.
2.4 Autenticación

Iniciar sesión (POST /auth/login).
Cerrar sesión (POST /auth/logout).
Cambiar la contraseña propia (PUT /auth/clave), que pide la actual.
Registro público de cuentas (POST /auth/registro), que crea cuentas desactivadas.
Saber quién está dentro (GET /auth/yo) y pedir el token CSRF (GET /auth/csrf).
2.5 Panel de administración de cuentas

Listar todas las cuentas con su rol, estado y fechas.
Dar de alta cuentas con el rol que se elija (es el único punto donde nace un ADMIN).
Editar nombre, rol y estado de una cuenta.
Poner una contraseña nueva a una cuenta (sin pedir la anterior).
Borrar una cuenta, exigiendo la contraseña del administrador que la borra.
Reglas de seguridad: no se puede borrar la propia cuenta ni dejar la aplicación sin administradores.
2.6 Páginas (frontend)

| Página | Fichero | Qué hace | |---|---|---| | Acceso / login | login.html | Entrar y crear cuenta | | Inicio | index.html | Pantalla principal y menú | | Clientes | clientes.html | Alta, edición, borrado y listado | | Facturas | facturas.html | Alta, borrador, búsqueda y resumen | | Imprimir factura | factura-imprimir.html | Visor de impresión | | Perfil de empresa | perfil.html | Ver los datos del emisor | | Mi cuenta | cuenta.html | Cambiar la contraseña propia | | Usuarios | usuarios.html | Panel de administración | | Ayuda | ayuda.html | Ayuda de la aplicación |

2.7 Endpoints de la API

`/auth` — autenticación | Método | Ruta | Función | |---|---|---| | POST | /auth/login | Iniciar sesión | | POST | /auth/logout | Cerrar sesión (Spring Security) | | PUT | /auth/clave | Cambiar la contraseña propia | | POST | /auth/registro | Crear una cuenta desactivada | | GET | /auth/yo | Datos de la sesión actual | | GET | /auth/csrf | Token de CSRF |

`/cliente` — clientes | Método | Ruta | Función | |---|---|---| | POST | /cliente | Crear cliente | | GET | /cliente/listar-pagina | Página de clientes con búsqueda/filtros | | GET | /cliente/listar-ultimos | Últimos clientes (desplegable) | | GET | /cliente/provincias | Provincias distintas | | GET | /cliente/poblaciones | Poblaciones distintas | | GET | /cliente/{id} | Cliente por id | | PUT | /cliente/{id} | Actualizar cliente | | DELETE | /cliente/{id} | Borrar cliente (solo ADMIN) |

`/factura` — facturas | Método | Ruta | Función | |---|---|---| | POST | /factura | Crear factura | | PUT | /factura/{idFactura}/borrador | Editar borrador | | GET | /factura/{idFactura}/detalle | Detalle de la factura | | GET | /factura/buscar | Buscar por texto y/o estado | | GET | /factura/conceptos/sugerencias | Sugerencias de conceptos | | GET | /factura/trimestral | Resumen trimestral | | GET | /factura/{idFactura}/pdf | Descargar el PDF |

`/emisor` — datos fiscales | Método | Ruta | Función | |---|---|---| | GET | /emisor | Datos del emisor | | GET | /emisor/logo | Logotipo (PNG) | | PUT | /emisor | Guardar emisor (JSON, solo ADMIN) | | PUT | /emisor/con-imagen | Guardar emisor con logo (multipart, solo ADMIN) |

`/usuarios` — panel de administración (solo ADMIN) | Método | Ruta | Función | |---|---|---| | GET | /usuarios | Listar cuentas | | POST | /usuarios | Dar de alta una cuenta | | PUT | /usuarios/{idUsuario} | Editar rol/estado/nombre | | PUT | /usuarios/{idUsuario}/clave | Poner contraseña nueva | | DELETE | /usuarios/{idUsuario} | Borrar cuenta |

Todos los errores de la API responden con `ProblemDetail` (RFC 9457), con el motivo en el campo detail.

3. Estructura del proyecto

3.1 Árbol general

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
3.2 Capas del backend

La aplicación sigue una arquitectura en capas clásica, y cada paquete tiene una sola responsabilidad:

| Paquete | Responsabilidad | |---|---| | controller | Recibe las peticiones HTTP, valida la entrada y devuelve la respuesta. No contiene lógica de negocio. | | dto | Objetos de transferencia (records) y los RowMapper que convierten filas en objetos. | | service | La lógica de negocio: cálculos, reglas, transacciones y orquestación. | | repository | La única capa que habla SQL. Traduce cada operación a una consulta con JdbcTemplate. | | seguridad | La configuración de Spring Security: reglas de acceso, codificador BCrypt, handlers 401/403. | | validacion | Validadores personalizados: @NifCif y @ClaveSegura. | | pdf | El render de la factura: servicio, formateador y formatos de papel. |

Flujo de una petición típica:

Navegador → controller → service → repository → MySQL
                ↑                        ↓
                └──── dto / RowMapper ───┘
Los controladores no comprueban permisos: lo decide el filtro de seguridad en seguridad/ConfiguracionSeguridad.
Los repositorios parametrizan todos los valores (?) y usan listas blancas para lo que no admite parámetro (como el ORDER BY), para evitar inyección SQL.
`ManejadorExcepciones` (@RestControllerAdvice) es el único sitio que decide qué responde la API cuando algo sale mal.
3.3 Frontend

La interfaz es HTML servido por Spring (static/), sin plantillas para las pantallas:

HTML: una página por pantalla (login.html, clientes.html, facturas.html...).
CSS: hojas sueltas en la raíz de static (sin carpeta css) para poder reutilizarlas en el PDF.
JavaScript: ~26 scripts en static/js/, agrupados por responsabilidad (api.js, sesion.js, validacion.js, tabla.js, fila.js, clave.js, ver-clave.js...).
PDF: plantillas Thymeleaf propias en templates/, con sus propios estilos (el motor del PDF es CSS 2.1 y no entiende la hoja del visor).
4. La base de datos

4.1 Qué fichero cargar

| Situación | Fichero a cargar | |---|---| | Instalación nueva, base de datos desde cero | backupFacturacion360v4.sql | | Ya tienes datos del v3 y no quieres perderlos | migracion-usuarios.sql | | Quieres ver el esquema anterior, sin aplicarlo | backupFacturacion360v3.sql |

Regla general: si montas desde cero, carga el de número más alto (`v4`).

Dos cosas que conviene saber antes de cargar nada:

backupFacturacion360v4.sql y backupFacturacion360v3.sql hacen `DROP TABLE` de las tablas que crean. No son copias de seguridad con datos: solo llevan el esquema y unas pocas filas (el emisor y las cuentas iniciales). Si ya tienes datos, no los cargues; usa migracion-usuarios.sql.
migracion-usuarios.sql no toca las demás tablas: solo crea usuarios y mete las dos cuentas iniciales. Es el script seguro para una base ya en producción.
Ambos scripts crean la base `bd_facturacion` si no existe y hacen USE de ella, así que no hay que crearla a mano.

4.2 Requisitos

MySQL 8.0 o superior (el esquema usa la collation utf8mb4_0900_ai_ci, que es de MySQL 8). En MariaDB la collation puede no existir y dar error: véase 4.6 Solución de problemas.
Un usuario de MySQL con permisos para crear bases de datos y tablas.
4.3 Cómo importar la base de datos

Desde la línea de comandos (recomendado)

mysql -u root -p < src/main/resources/docu/backupFacturacion360v4.sql
Te pedirá la contraseña de root. Si prefieres ver el progreso o vas en Windows:

# Linux / macOS
mysql -u root -p --default-character-set=utf8mb4 < backupFacturacion360v4.sql

# Windows (PowerShell)
mysql -u root -p --default-character-set=utf8mb4 -e "source backupFacturacion360v4.sql"
Importando solo la tabla de usuarios (base ya existente)

mysql -u root -p < src/main/resources/docu/migracion-usuarios.sql
Este script no borra las tablas de clientes, facturas ni el emisor; solo recrea usuarios.

Con un cliente gráfico (phpMyAdmin, DBeaver, MySQL Workbench...)

Abre el fichero backupFacturacion360v4.sql con el cliente.
Ejecútalo completo. El script ya lleva CREATE DATABASE y USE, así que no hay que seleccionar ninguna base antes.
Comprueba que se han creado las 6 tablas.
Crear un usuario de aplicación (recomendado en producción)

No uses root para la aplicación. Crea un usuario propio con solo los permisos necesarios:

CREATE USER 'facturacion'@'localhost' IDENTIFIED BY 'una_contraseña_segura';
GRANT SELECT, INSERT, UPDATE, DELETE ON bd_facturacion.* TO 'facturacion'@'localhost';
FLUSH PRIVILEGES;
Después apunta application.properties a ese usuario (ver 4.4).

Comprobar que se ha importado bien

USE bd_facturacion;
SHOW TABLES;
SELECT usuario, rol, activo FROM usuarios;
Deberías ver las 6 tablas (clientes, conceptos, desglose_impositivo, emisor, facturas, usuarios) y, en usuarios, las dos cuentas iniciales.

4.4 Dejar la aplicación lista

Con la base ya cargada, solo falta decirle a la aplicación dónde está:

Edita src/main/resources/application.properties:
`properties spring.datasource.url=jdbc:mysql://localhost:3306/bd_facturacion spring.datasource.username=root spring.datasource.password=root `

Compila y despliega (ver ../README.md):
`bash mvn clean package ./desplegar.sh `

Abre la aplicación. Sin sesión te llevará a login.html.
4.5 Estructura de las tablas

Base de datos: `bd_facturacion` (utf8mb4, collation utf8mb4_0900_ai_ci).

Hay 6 tablas. La regla que las relaciona es sencilla: un cliente tiene muchas facturas, una factura tiene muchos conceptos y muchos desgloses de IVA, y el emisor es una única fila de datos fiscales.

clientes 1 ────< N facturas 1 ────< N conceptos
                            │
                            └───────< N desglose_impositivo

emisor       (fila única, sin relaciones)
usuarios     (una fila por cuenta, sin relaciones con el resto)
`clientes` — los clientes a los que se emiten facturas.

| Columna | Tipo | Notas | |---|---|---| | idcliente | int PK, auto-incremental | Identificador | | nombre | varchar(60) | Razón social | | nif_cif | varchar(10) | único | | direccion | varchar(90) | | | codigopostal | varchar(6) | Puede ser nulo | | poblacion | varchar(30) | | | provincia | varchar(15) | | | telefono | varchar(15) | Puede ser nulo | | email | varchar(30) | Puede ser nulo | | fecha_alta | date | Puede ser nulo |

`facturas` — la cabecera de cada factura.

| Columna | Tipo | Notas | |---|---|---| | idfactura | int PK, auto-incremental | Identificador | | idcliente | int | FK → clientes.idcliente | | num_factura | varchar(15) | único (número de factura) | | fecha_emision | date | | | estado | enum('BORRADOR','EMITIDA','ANULADA') | Ciclo de vida | | observaciones | varchar(90) | Puede ser nulo | | subtotal | decimal(10,2) | Base sin IVA | | importe_iva | decimal(10,2) | Cuota de IVA | | total | decimal(10,2) | Total de la factura | | fecha_creacion | datetime | | | fecha_actualizacion | datetime | |

`conceptos` — líneas de detalle de la factura (qué se factura).

| Columna | Tipo | Notas | |---|---|---| | idconcepto | bigint PK, auto-incremental | Identificador | | descripcion | varchar(50) | | | cantidad | int | | | precio_unitario | decimal(10,2) | | | descuento | decimal(5,2) | | | porcentaje_iva | decimal(4,2) | | | importe_iva | decimal(10,2) | | | base_imponible | decimal(10,2) | | | total | decimal(10,2) | | | idfactura | int | FK → facturas.idfactura | | clave_regimen | varchar(2) | Default 01 | | calificacion | varchar(2) | Default S1 |

`desglose_impositivo` — desglose del IVA agrupado por la terna (régimen, calificación, tipo), tal y como se declara.

| Columna | Tipo | Notas | |---|---|---| | iddesglose | bigint PK, auto-incremental | Identificador | | idfactura | int | FK → facturas.idfactura | | impuesto | varchar(2) | Default 01 | | clave_regimen | varchar(2) | Default 01 | | calificacion | varchar(2) | Default S1 | | tipo_impositivo | decimal(5,2) | | | base_imponible | decimal(12,2) | | | cuota_repercutida | decimal(12,2) | |

`emisor` — los datos fiscales que salen impresos en la factura: razón social, NIF, domicilio y logo. Es una tabla de una sola fila.

| Columna | Tipo | Notas | |---|---|---| | idemisor | int PK, auto-incremental | Identificador | | nombre | varchar(60) | Razón social | | nif_cif | varchar(10) | | | direccion | varchar(200) | | | email | varchar(50) | Puede ser nulo | | telefono | varchar(15) | Puede ser nulo | | logo | mediumblob | Imagen del logotipo |

El script v4 ya inserta una fila de ejemplo: Mi Empresa S.L., A12345678, `Calle Mayor 15`. Cámbiala desde la aplicación (solo un ADMIN puede modificar el emisor).

`usuarios` — la tabla del portal de acceso: decide quién puede entrar y con qué permisos. Sin ella la aplicación no arranca del todo.

| Columna | Tipo | Notas | |---|---|---| | idusuario | int PK, auto-incremental | Identificador | | usuario | varchar(50) | único, nombre de inicio de sesión | | clave_hash | varchar(100) | Hash BCrypt, nunca la contraseña en claro | | nombre | varchar(100) | Nombre y apellidos (solo para mostrarlo) | | rol | varchar(20) | ADMIN o USUARIO (con restricción CHECK) | | activo | tinyint(1) | 0 = la cuenta existe pero no puede entrar | | fecha_alta | datetime | Default CURRENT_TIMESTAMP | | ultimo_acceso | datetime | Se rellena en cada acceso correcto |

Relaciones (claves ajenas)

| Tabla | Columna | Apunta a | |---|---|---| | facturas | idcliente | clientes.idcliente | | conceptos | idfactura | facturas.idfactura | | desglose_impositivo | idfactura | facturas.idfactura |

emisor y usuarios son tablas independientes, sin claves ajenas.

4.6 Solución de problemas

`Unknown collation: 'utf8mb4_0900_ai_ci'` La collation es de MySQL 8. Actualiza MySQL o cambia la collation a utf8mb4_general_ci en el script antes de importarlo.

`Access denied for user 'root'@'localhost'` Comprueba el usuario y la contraseña. Si has creado un usuario de aplicación (4.3), usa ese en application.properties y en el comando mysql -u facturacion -p.

`Unknown database 'bd_facturacion'` El script la crea con CREATE DATABASE IF NOT EXISTS, así que no debería pasar. Si importaste solo una tabla a mano, crea la base antes: CREATE DATABASE bd_facturacion CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

La aplicación arranca pero nadie puede entrar Falta la tabla usuarios o está vacía. Cárgala con migracion-usuarios.sql.

Contraseña de las cuentas iniciales Las dos cuentas que vienen en los scripts son admin y datos, ambas con CambiarYa.2026 (hash BCrypt ya incluido). Cámbialas antes de exponer la aplicación:

UPDATE usuarios
   SET clave_hash = '<hash nuevo>'
 WHERE usuario = 'admin';
Para generar un hash: new BCryptPasswordEncoder().encode("contraseña nueva"). BCrypt lleva sal, así que no se puede comprobar comparando cadenas: usa PasswordEncoder.matches().

5. Acceso y usuarios

La aplicación abre en login.html. Las cuentas iniciales que vienen en los scripts son:

| Usuario | Contraseña | Rol | |---|---|---| | admin | CambiarYa.2026 | ADMIN | | datos | CambiarYa.2026 | USUARIO |

Cambia estas contraseñas antes de que la aplicación sea accesible desde fuera. No se guardan en claro: se guarda su hash BCrypt, así que un cambio es un UPDATE con un hash nuevo (ver 4.6).

El registro público está controlado por app.seguridad.registro-abierto (por defecto true). Con true, cualquiera puede crearse una cuenta, pero nace desactivada y no puede entrar hasta que un ADMIN la active desde el panel.

6. Seguridad y roles

Regla general: anyRequest().authenticated() — todo está protegido salvo lo que se abre explícitamente (login, estáticos, /auth/login, /auth/registro, /auth/csrf).
Contraseñas con BCrypt (con sal propia), sesiones rotadas al entrar y cookie HttpOnly.
CSRF activo: la cookie es legible por el JavaScript y se devuelve por GET /auth/csrf; las peticiones que escriben la mandan en la cabecera X-XSRF-TOKEN.
| Operación | ADMIN | USUARIO | |---|:---:|:---:| | Consultar clientes, facturas, listados | Sí | Sí | | Crear y modificar clientes/facturas | Sí | Sí | | Ver el perfil de la empresa | Sí | Sí | | Borrar clientes (DELETE /cliente/{id}) | Sí | No (403) | | Cambiar los datos del emisor (PUT /emisor) | Sí | No (403) | | Panel de usuarios (/usuarios, /usuarios.html) | Sí | No (403) |

Detalles ampliados en portal-de-acceso.md.

7. Documentación relacionada

portal-de-acceso.md — el portal: qué se ve sin sesión, roles, el panel de administración de cuentas, el borrado y las reglas de contraseña.
../README.md — arranque, build y despliegue de la aplicación completa.
../src/main/resources/static/ — las páginas y los scripts del frontend.
