# Portal de acceso (login)

Cómo se entra en Facturación 360, quién puede hacer qué, y qué hay que mirar antes de
dejar la aplicación en un servidor de verdad.

---

## 1. Puesta en marcha

### 1.1 La tabla de usuarios

La tabla `usuarios` es nueva y es la que decide quién entra. Hay dos formas de crearla:

| Situación | Qué cargar |
|---|---|
| Base de datos nueva, desde cero | `docu/backupFacturacion360v4.sql` (el esquema completo) |
| Base de datos ya en el v3, con datos que no quieres tocar | `docu/migracion-usuarios.sql` |

La migración no hace `DROP TABLE` de nada: solo crea `usuarios` y mete las dos cuentas
iniciales.

### 1.2 Las dos cuentas que vienen puestas

| Usuario | Contraseña | Rol |
|---|---|---|
| `admin` | `CambiarYa.2026` | ADMIN |
| `datos` | `CambiarYa.2026` | USUARIO |

**Hay que cambiar esa contraseña antes de que la aplicación se pueda ver desde fuera.** En la
base de datos no está la contraseña: está su hash BCrypt, así que cambiar una contraseña
consiste en generar el hash de la nueva y hacer un `UPDATE`:

```sql
UPDATE usuarios SET clave_hash = '<hash nuevo>' WHERE usuario = 'admin';
```

Para generar un hash:

```java
new BCryptPasswordEncoder().encode("la contraseña nueva");
```

Dos avisos sobre esto:

- BCrypt lleva sal, así que **nunca devuelve dos hashes iguales para la misma contraseña**.
  Para comprobar si una contraseña es la correcta hay que usar `PasswordEncoder.matches()`, no
  comparar las cadenas.
- Lo más fácil para cambiar la de un usuario es crear la cuenta nueva desde la pantalla de
  registro (que hashea lo que se teclea) y leer el valor de la fila.

### 1.3 Arrancar

Igual que siempre. Al abrir la aplicación sin sesión, cualquier dirección lleva a
`login.html`.

---

## 2. Qué se puede ver sin iniciar sesión

Solo tres cosas, y están marcadas como abiertas en `ConfiguracionSeguridad`:

- `login.html` (y su JavaScript y su CSS)
- Los estáticos: `js/**`, `css/**`, `img/**` y las hojas sueltas
- `POST /auth/login`, `POST /auth/registro` y `GET /auth/csrf`

**Todo lo demás exige sesión**: las pantallas (inicio, clientes, facturas, perfil, ayuda, mi
cuenta y el panel de usuarios), la API entera (`/cliente`, `/factura`, `/emisor`,
`/usuarios`), los PDF, y también la documentación de Swagger. El panel además exige ser
administrador: tiene su propia regla.

La regla general es `anyRequest().authenticated()`: una pantalla nueva nace protegida, y para
abrirla hay que hacer algo a propósito. Ese es el motivo de que la lista de lo abierto sea
corta y la de lo cerrado sea "todo lo demás".

### Qué pasa según quién llama

| Quién llama | Sin sesión | Con sesión |
|---|---|---|
| El navegador abriendo una página | 302 a `login.html` | La página |
| El JavaScript llamando por `fetch` | 401 con un `ProblemDetail` | Lo que sea |

Las dos respuestas de la API son `ProblemDetail` (RFC 9457), el mismo formato que usa el
resto de errores del proyecto, con el motivo en `detail`.

---

## 3. Los dos roles

| | ADMIN | USUARIO |
|---|:---:|:---:|
| Consultar clientes, facturas, listados | Sí | Sí |
| Crear y modificar clientes | Sí | Sí |
| Crear y modificar facturas | Sí | Sí |
| Ver el perfil de la empresa | Sí | Sí |
| **Borrar clientes** (`DELETE /cliente/{id}`) | Sí | **No** (403) |
| **Cambiar los datos del emisor** (`PUT /emisor`) | Sí | **No** (403) |
| **El panel de usuarios** (`/usuarios.html` y `/usuarios/**`) | Sí | **No** (403) |

Las tres operaciones restringidas son las que no se pueden deshacer, o las que dan el control
de la aplicación: borrar un cliente, tocar la razón social, el NIF y el domicilio que salen
impresos en las facturas, y administrar las cuentas.

En la pantalla, un USUARIO no ve el enlace "Usuarios", ni el botón de la papelera. Eso es
comodidad, **no protección**: si alguien quita el `data-solo-admin` con el inspector, el enlace
vuelve a aparecer y el servidor lo rechaza con un 403. Las dos cosas —la página del panel y su
API— están en la misma regla: si `usuarios.html` se quedara fuera, caería en la regla general de
"tener sesión" y cualquier USUARIO podría abrirla entera.

**"Mi Perfil" sí se le enseña a todo el mundo**, y va al revés de lo anterior a propósito: ver
los datos de la empresa no es una operación de administrador, lo que es de un administrador es
cambiarlos. Así que `perfil.html` no lleva `data-solo-admin`, cualquiera con sesión la abre, y
un USUARIO que llega allí ve el aviso de que puede verlos pero no guardarlos —el `PUT /emisor`
está cerrado con `ROLE_ADMIN`—. Si el enlace se escondiera, ese aviso no se lo enseñaría nunca
nadie, que es exactamente a quien va dirigido.

### El panel de administración de cuentas

Desde el menú, en **Usuarios** (`usuarios.html`). Es la tabla de las cuentas, con lo que se
puede hacer con cada una:

| Acción | Endpoint | Qué hace |
|---|---|---|
| Ver la lista | `GET /usuarios` | Todas las cuentas con su rol, su estado y sus fechas |
| Dar de alta | `POST /usuarios` | Crea una cuenta **con el rol que se elija** |
| Editar | `PUT /usuarios/{id}` | Cambia el nombre, el rol y si queda activa |
| Poner contraseña | `PUT /usuarios/{id}/clave` | Le pone una contraseña nueva, sin pedir la anterior |
| Borrar | `DELETE /usuarios/{id}` | Elimina la cuenta, previa confirmación |

```json
POST /usuarios
{ "usuario": "nombre", "clave": "...", "nombre": "Nombre y apellidos", "rol": "ADMIN" }

PUT /usuarios/3
{ "nombre": "Nombre y apellidos", "rol": "USUARIO", "activo": true }

PUT /usuarios/3/clave
{ "nueva": "..." }

DELETE /usuarios/3
{ "clave": "la contraseña del administrador que está dentro" }
```

Cinco cosas que conviene tener presentes:

1. **El nombre de usuario no se puede cambiar.** Es la clave con la que esa persona entra y con
   la que `UsuariosDetailsService` la busca. Para renombrar a alguien hay que darle un nombre
   nuevo en el alta y desactivar la cuenta vieja.
2. **El registro público sigue creando USUARIO, y además lo crea desactivado.**
   `POST /auth/registro` no tiene campo de rol y no lo lee: la única forma de crear un ADMIN por
   la API es `POST /usuarios`, que está cerrado con `ROLE_ADMIN`. La cuenta que nace del registro
   se guarda con `activo = false`, así que hasta que un administrador la active desde el panel no
   puede entrar. Ver más abajo.
3. **La contraseña se guarda hasheada con BCrypt**, con su sal nueva, y no sale nunca por la
   API: el DTO de salida no tiene ningún campo donde escribirla. La que se pone desde aquí está
   en claro solo hasta que la hashea el servicio.
4. **Cambiar la contraseña de otro no pide la anterior.** Quien está dentro ya ha demostrado ser
   administrador con su propia sesión, y esto existe justamente para abrirle la cuenta a quien
   la ha perdido. Para cambiarte la tuya, `Mi cuenta` (`PUT /auth/clave`) sí la pide. El borrado
   sí pide una contraseña, pero es la del que borra: mira más abajo.
5. **No se puede dejar la aplicación sin administradores.** Si el cambio bajaría de rol o
   desactivaría a la última cuenta con permisos de ADMIN, se responde un 409 y no se toca nada.
   Un panel desde el que uno mismo se puede quedar fuera es un panel del que hay que salir con
   un `UPDATE` en la base de datos.

### El borrado pide la contraseña de quien borra

Es lo único que separa «estoy delante del teclado» de «he dejado el navegador abierto»: con la
sesión sola, cualquiera que se sentara en ese equipo podría borrar cuentas de la aplicación. Por
eso `DELETE /usuarios/{id}` lleva en el cuerpo la contraseña **del administrador que está
haciendo el borrado**, no la de la cuenta que se va a borrar. Nadie tiene por qué saber la de
otra persona, y lo que se comprueba es lo primero, no lo segundo.

Tres reglas más, todas en el servidor:

- **No se puede borrar la propia cuenta** (409). Quien lo hace se queda sin sesión en el mismo
  instante, y si además era el último administrador, fuera del panel. Para dejar tu cuenta,
  pídeselo a otro.
- **No se borra sin la contraseña correcta** (400). Un 400 y no un 401 porque la sesión es
  válida: lo que está mal es lo que se ha escrito en el formulario de confirmación.
- **La sesión de una cuenta borrada no se cae.** Ni la del propio administrador ni, si la
  tuviera abierta, la de la cuenta que se acaba de borrar. Es el mismo límite que el cambio de
  rol: Spring copia los permisos a la sesión al entrar y no vuelve a mirar la base de datos
  hasta la siguiente entrada. Para dejar de entrar sin borrar, desactiva la cuenta; para echar
  del todo a alguien que tenga una sesión abierta, hay que cerrar además esa sesión desde
  fuera.

Y una diferencia entre las dos formas de quitar a alguien, que no es la misma:

| | Desactivar (`activo = false`) | Borrar |
|---|---|---|
| Puede volver a entrar | No, hasta que se vuelva a activar | No |
| Libera el nombre de usuario | No | **Sí** |
| Conserva las fechas de alta y último acceso | Sí | No |
| Se puede deshacer desde el panel | Sí | No |

Y un detalle de las sesiones que conviene saber: cambiar el rol de una cuenta **no cambia los
permisos de la sesión que esa persona tiene abierta**. Al entrar, Spring copia el rol a la
autenticación y a partir de ahí es lo que manda. Subir a alguien a ADMIN surte efecto la
próxima vez que entre, y bajarle el rol también. Es preferible a invalidar la sesión entera en
cada cambio, que echaría a la gente de la aplicación a mitad de un trabajo.

### Dar de alta cuentas

- Desde el panel de administración, que es lo que se usa en cuanto la aplicación está en marcha.
- Desde la propia pantalla de acceso, con el botón "Crear cuenta" (`POST /auth/registro`).
- Con un `UPDATE` para cambiar un rol o una contraseña:
  ```sql
  UPDATE usuarios SET rol = 'ADMIN' WHERE usuario = 'nombre';
  ```

### El registro público crea la cuenta desactivada

Las tres diferencias entre el registro abierto y el alta del panel:

| | Registro público | Panel de administración |
|---|---|---|
| Quién lo hace | cualquiera que llegue a `login.html` | un ADMIN, con su sesión |
| El rol | siempre `USUARIO`, no se elige | el que elija quien da de alta |
| **`activo`** | **`false`, nace desactivada** | `true`, nace activa |
| Al terminar | hay que activarla desde el panel | se puede entrar ya |

La línea de `activo = false` está en `UsuarioServiceImpl.registrar()`, y es lo que permite tener
el registro abierto sin que sea una puerta abierta: quien se registra ocupa un nombre de usuario
y una fila en la tabla, y nada más. Hasta que un administrador la valida, el login devuelve el
mismo 401 que devolvería si el usuario no existiera —el mismo, sin decir cuál de los dos casos
es—, así que que la cuenta exista no se puede deducir de un intento fallido.

La cuenta **sí** queda guardada y con el nombre reservado, y sale en la lista del panel con
`activo = false`, que es donde el administrador la ve y la activa (`PUT /usuarios/{id}` con
`activo = true`). Por eso la pantalla de acceso avisa de que la cuenta queda desactivada: quien
la acaba de crear se queda con el dedo encima del botón de "Entrar", y si no se le dice que
tiene que esperar se va a pensar que ha fallado algo.

Dos cosas de la pantalla del alta que no están en el servidor:

- **La contraseña se escribe dos veces.** El campo de repetición se compara en el navegador y
  no se manda nunca: la repetición no es un dato, es una comprobación contra lo que ya está
  escrito en el campo de al lado. Mandarla al servidor sería mandar la contraseña dos veces para
  compararla con la primera, que es una copia de sí misma. Es lo mismo que hace "Mi cuenta" al
  cambiar la contraseña.
- **El 201 no significa "ya puedes entrar".** `UsuarioResponse` no lleva el campo `activo` —como
  no lleva el hash—, porque a quien se registra no le hace falta saberlo: se lo dice el mensaje
  de la pantalla.

### El ojo de las contraseñas

Los tres sitios donde se escribe una contraseña —el alta del login, "Mi cuenta" y los dos
paneles del administrador de cuentas— llevan un ojo que la enseña y la vuelve a tapar. Vive en
`static/js/ver-clave.js` (capa 0, no importa nada) y se llama `conectarOjos()`.

Lo que hace es cambiar el atributo `type` del input entre `password` y `text`. **No lee el valor
de la contraseña ni lo escribe en ninguna parte**: la contraseña no sale nunca del campo, ni
siquiera un momento.

Dos detalles que no son de estilo:

- **El botón es un `<button type="button">`, no un `<i>` como los iconos de adorno.** Los iconos
  de los campos llevan `pointer-events:none` para que el clic pase al input de debajo; con esa
  misma regla el ojo sería inocuo. Y además tiene que ser un control de verdad, con etiqueta y
  con tabulador, que es como se usa la mayor parte de las veces.
- **El CSS de los iconos de campo usa el combinador hijo (`.acceso-campo > i.fa-regular`)** y no
  el de descendiente. Sin el `>` esa regla alcanzaría también al `<i>` del ojo, que es un
  `.fa-regular` más, y lo volvería decorativo justo en los campos donde tiene que funcionar.

Al pulsarlo, el foco vuelve al campo y el cursor se pone al final, para poder seguir escribiendo
sin tener que volver a hacer clic.

### Cambiar tu propia contraseña

Desde el menú de la aplicación, en **Mi cuenta** (`cuenta.html`), que está dentro de la
aplicación y no en la pantalla de acceso: se llega con la sesión ya abierta. La pantalla pide
la contraseña actual, la nueva y la nueva repetida.

Lo que hay detrás es `PUT /auth/clave`:

```json
{ "claveActual": "...", "nueva": "..." }
```

Cuatro cosas sobre ese endpoint:

1. **Pide la contraseña actual.** Sin ella, tener una sesión abierta —o sentarse delante de un
   navegador que lo tenía abierto— bastaría para quedarse con la cuenta para siempre.
2. **Solo cambia la contraseña de quien tiene la sesión.** No hay ningún campo de usuario en
   el cuerpo de la petición: el que se cambia se saca de la autenticación. Cambiar la de otro
   es cosa de un administrador con acceso a la base de datos, y a mano.
3. **Lo que se guarda es un hash BCrypt nuevo**, con su sal nueva. La contraseña en claro no
   sale del proceso.
4. **La sesión no se cae** tras el cambio, pero se queda con las credenciales nuevas dentro:
   si se dejaran las viejas, en la sesión quedaría un hash que ya no corresponde con nada.

Un 400 con `"La contraseña actual no es correcta"` no es un 401 a propósito: la sesión es
válida, lo que está mal es lo que se ha enviado.

### Las reglas de la contraseña

Las cinco reglas están escritas **una sola vez**, en
`validacion/ClaveSegura` (con su validador `ClaveSeguraValidador`), y se aplican con la
anotación `@ClaveSegura` en los cuatro sitios donde se escribe una contraseña:

| Dónde | Record | Por qué |
| --- | --- | --- |
| Registro público | `RegistroRequest` | `POST /auth/registro` |
| Alta desde el panel | `AltaAdminRequest` | `POST /usuarios` |
| Cambio propio | `CambioClaveRequest` | `PUT /auth/clave` |
| Cambio de otra cuenta | `ClaveAdminRequest` | `PUT /usuarios/{id}/clave` |

Las reglas: **12 caracteres o más** (y 200 como máximo), **una mayúscula**, **una minúscula**,
**un número** y **un símbolo**. El símbolo es cualquier cosa que no sea letra, número ni
espacio, y las letras se comparan con `Character.isUpperCase`, así que `Á` cuenta como
mayúscula y `ñ` como minúscula.

Dos detalles que no son accidentales y conviene no deshacer:

- **El espacio no cuenta como símbolo.** Si contara, `"esta es la mia"` cumpliría la regla del
  símbolo sin llevar ninguno.
- **El motivo del 400 enumera todo lo que falta de una vez**, en vez de decir solo "no es
  válida" o soltar cinco errores de `@Pattern` a la vez: `"La contraseña necesita un número y
  un símbolo (por ejemplo . , ! ? @)."`.

En el navegador, `static/js/clave.js` tiene una copia de las reglas (`REGLAS_CLAVE`) para
pintar la lista de requisitos de **Mi cuenta** y avisar antes de gastar una petición. Es una
copia y no una fuente: si se cambian las reglas hay que cambiar los dos sitios, y siempre que
haga falta el servidor es el que decide.

---

## 4. El interruptor del registro

```properties
app.seguridad.registro-abierto=true
```

Con `false` desaparece el botón "Crear una" de la pantalla de acceso y `POST /auth/registro`
responde 403: las cuentas nuevas las da de alta un administrador desde el panel, y no hay forma
de crear filas en la tabla usuarios por la pantalla de acceso.

Con `true` cualquiera que llegue a la pantalla puede crearse una cuenta, **pero esa cuenta nace
desactivada** y no puede entrar hasta que un administrador la active. Lo que se abre con el
interruptor no es el acceso a la aplicación: es la lista de espera. Lo que sí queda abierto es
que se pueden ocupar nombres de usuario y llenar la tabla de filas pendientes, que luego hay
que revisar desde el panel.

Es una decisión que depende de para qué sea la aplicación: en un servidor abierto al público, lo
normal es dejarlo en `false` y dar de alta las cuentas a mano. Con `true` y el diseño actual, el
peor caso es una tabla con cuentas que nadie valida.

---

## 5. Los tests

```bash
mvn test
```

Dos clases de puerta y una de las cuentas, y levantan la aplicación entera contra una base de
datos H2 en memoria (la real sigue siendo MySQL; H2 solo se usa en test):

- `AccesoSinSesionTests` — la puerta: qué se puede ver sin sesión, qué salta a `login`, qué
  devuelve un 403, y que sin token de CSRF no se escribe nada.
- `AutenticacionTests` — la llave: entrar bien y entrar mal, cuentas desactivadas, el registro
  (que crea la cuenta desactivada, que no deja entrar hasta que un administrador la activa y que
  no deja pedir el rol ADMIN), el cierre de sesión y el cambio de contraseña (que se guarda
  hasheada, que la vieja deja de servir y que la actual equivocada no cambia nada).
- `PanelUsuariosTests` — el panel de administración: que sin sesión sea un 401 y con un USUARIO
  un 403 (en la API y en la página), que un ADMIN pueda dar de alta cuentas con el rol que elija,
  cambiar roles y estados, poner contraseñas y borrar, que el borrado exija la contraseña del que
  borra y no se pueda hacer uno mismo, y que no se pueda dejar la aplicación sin
  administradores.

Ninguno falsea la autenticación con mocks: los tests de la puerta hacen el login de verdad
contra `POST /auth/login`, porque si el login se rompiera tienen que enterarse.

---

## 6. Lo que hay que mirar antes de publicar esto

Ninguna de estas cosas la arregla el código, y las cuatro se suelen dejar sin hacer en un
proyecto de prácticas:

1. **HTTPS.** La contraseña viaja en el cuerpo de la petición en claro. Por HTTP, cualquiera
   que esté en la red la lee tal cual.
2. **`server.servlet.session.cookie.secure=true`** cuando haya TLS. Ahora está en `false`
   porque en local es `http` y con la cookie como solo-HTTPS no se guardaría nunca: nadie
   podría entrar.
3. **Cambiar la contraseña de `admin` y de `datos`.**
4. **`app.seguridad.registro-abierto=false`**, si no quieres que cualquiera que llegue a la
   pantalla pueda crearse una cuenta pendiente de activar.

Y una cosa buena que ya viene hecha: la cookie de sesión es `HttpOnly`, así que el JavaScript
de la aplicación no puede leerla, y las contraseñas se guardan hasheadas con BCrypt, que es
lento a propósito y lleva sal propia.

---

## 7. Dónde está cada cosa

```
seguridad/ConfiguracionSeguridad.java    Qué se puede ver sin entrar, qué necesita ser ADMIN,
                                        el codificador de contraseñas y la cookie de sesión
seguridad/UsuariosDetailsService.java    Traduce una fila de usuarios a lo que Spring
                                        Security llama "usuario"
seguridad/PuntoEntradaNoAutenticada.java Qué se responde cuando no hay sesión (401 o login)
seguridad/AccesoDenegado.java            Qué se responde cuando hay sesión pero falta permiso
controller/AuthController.java           /auth/login, /auth/registro, /auth/yo, /auth/csrf
                                        y /auth/clave (cambio de contraseña)
controller/UsuarioAdminController.java   El panel: /usuarios, /usuarios/{id},
                                        /usuarios/{id}/clave y DELETE /usuarios/{id}
service/UsuarioService.java              Da de alta cuentas (hashea la contraseña), las lista
                                        y las modifica
repository/UsuarioRepositoryJdbcImpl.java  Acceso a la tabla usuarios
static/login.html, static/js/login.js    La pantalla de acceso y su alta
static/cuenta.html, static/js/cuenta.js  "Mi cuenta": datos de la sesión y cambio de clave
static/usuarios.html, static/js/usuarios.js  El panel de administración de cuentas
static/js/seguridad.js                   Token de CSRF, salto al login y cierre de sesión
static/js/sesion.js                      El botón "Salir" y esconder lo de ADMIN
static/js/ver-clave.js                   El ojo que muestra y tapa las contraseñas, en los
                                        tres sitios donde se escriben
```

El cierre de sesión (`POST /auth/logout`) **no** está en `AuthController`: lo pone Spring
Security en su propio filtro, porque cerrar bien una sesión no es solo borrarla, es también
rotar el identificador y anular la autenticación guardada. Está declarado en
`ConfiguracionSeguridad`.