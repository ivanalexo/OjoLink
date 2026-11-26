# OjoLink

Capa preventiva contra phishing: analiza los enlaces antes del clic, en el dispositivo, y explica por qué un enlace es sospechoso. Un mismo motor sirve a una extensión de navegador y a una web instalable (PWA).

El proyecto está en su etapa inicial. Hoy el repositorio contiene el motor de análisis con sus señales de detección, los datos que usa, la aplicación web y el resolutor de enlaces cortos, ambos publicados en Cloudflare, y la extensión de navegador, que ya marca los enlaces sospechosos en el correo pero todavía no bloquea el clic.

## Requisitos

- Node.js 26 (LTS) o superior
- pnpm 12

## Instalación

```bash
pnpm install
```

## Comandos

Todos se ejecutan desde la raíz y corren en cada paquete del workspace.

| Comando             | Qué hace                                   |
| ------------------- | ------------------------------------------ |
| `pnpm build`        | Compila todos los paquetes                 |
| `pnpm test`         | Revisa los tipos y ejecuta las pruebas     |
| `pnpm lint`         | Ejecuta ESLint                             |
| `pnpm format`       | Da formato al código con Prettier          |
| `pnpm format:check` | Verifica el formato sin modificar archivos |

Ninguno de estos comandos necesita conexión a internet ni una cuenta en ningún servicio.

## Estructura

| Carpeta                | Contenido                                                   |
| ---------------------- | ----------------------------------------------------------- |
| `packages/core`        | Motor de análisis (`@ojolink/core`)                         |
| `packages/test-corpus` | Corpus de calibración y su reporte (`@ojolink/test-corpus`) |
| `apps/web`             | Aplicación web instalable (`@ojolink/web`)                  |
| `apps/resolver`        | Resolutor de enlaces cortos (`@ojolink/resolver`)           |
| `apps/extension`       | Extensión de navegador (`@ojolink/extension`)               |
| `tools/build-data`     | Generador de los datos del motor (`@ojolink/build-data`)    |
| `architecture/`        | Requerimientos, arquitectura y plan de tareas, en español   |

## Aplicación web

`apps/web` es una página que revisa un enlace o un mensaje completo y muestra un veredicto por cada enlace. Todo se analiza en el dispositivo: no guarda lo que se pega, y solo envía algo cuando está configurado el resolutor, como se explica más abajo.

Para usarla en local, con recarga automática:

```bash
pnpm --filter @ojolink/web dev
```

Para probar la versión de producción, que es la que funciona sin conexión y lleva la política de seguridad:

```bash
pnpm build
pnpm --filter @ojolink/web preview
```

Los dos comandos muestran la dirección local que hay que abrir en el navegador.

También se le puede pasar un enlace en la dirección, después de `#u=` y codificado. Por ejemplo, agregar `#u=https%3A%2F%2Fbit.ly%2F3xYz` al final de la dirección local abre la página con ese enlace ya analizado. El enlace va en el fragmento y no en la consulta, para que nunca llegue a un servidor.

### Publicar

La aplicación se publica en Cloudflare como un Worker que solo sirve archivos estáticos (`apps/web/wrangler.json`). El plan gratuito alcanza.

```bash
pnpm build
pnpm --filter @ojolink/web run deploy
```

El primer comando construye la app con los ajustes de `apps/web/.env.local`. El segundo sube `apps/web/dist` y muestra la dirección pública, que termina en `workers.dev`. Hace falta haber iniciado sesión antes con `pnpm --filter @ojolink/web exec wrangler login`.

Después de publicar conviene abrir la dirección y revisar un enlace corto, para comprobar que la app llega al resolutor. Para volver a la versión anterior: `pnpm --filter @ojolink/web exec wrangler rollback`.

Las cabeceras de seguridad de la página publicada están en `apps/web/public/_headers`.

### Ajustes de compilación

Los dos son opcionales y se leen al construir, desde el entorno o desde un archivo `apps/web/.env.local`:

| Variable                | Para qué sirve                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| `VITE_RESOLVER_URL`     | Dirección del resolutor de enlaces cortos. Sin ella, la app no hace ninguna petición de red     |
| `VITE_IOS_SHORTCUT_URL` | Enlace de iCloud del Atajo de iOS ya preparado. Sin él, la guía muestra solo los pasos manuales |

`VITE_RESOLVER_URL` tiene que ser una dirección `https`, o `http` en `localhost`. Un valor mal escrito detiene la compilación. La política de seguridad de la página solo permite conectarse a ese origen.

### Qué envía la app y cuándo

Sin resolutor configurado, nada. Con resolutor, lo único que sale del dispositivo es un enlace corto (por ejemplo de `bit.ly`), solo, para preguntar a dónde lleva:

- Al analizar, la app consulta hasta 5 enlaces cortos por su cuenta. Los demás muestran un botón «Revelar destino».
- El destino que devuelve el resolutor se analiza en el dispositivo, y el resultado que se ve es el de ese destino. La app nunca abre el destino.
- Si no se pudo revelar, el resultado se muestra como «Precaución», nunca como seguro, con un botón «Reintentar».
- El botón «Análisis profundo» aparece cuando el intento normal no alcanzó. Solo se envía al pulsarlo.

El único archivo de la app que puede usar la red es `apps/web/src/lib/reveal.ts`; una prueba falla si otro lo intenta.

Para probarlo en local, con el resolutor en una terminal y la app en otra:

```bash
pnpm --filter @ojolink/resolver dev
```

```bash
VITE_RESOLVER_URL=http://localhost:8787 pnpm --filter @ojolink/web dev
```

En PowerShell, la variable se define antes: `$env:VITE_RESOLVER_URL = "http://localhost:8787"`.

### Compartir desde el teléfono

- **Android:** al instalar la app desde Chrome, OjoLink aparece en el menú de compartir. Lo compartido llega a la ruta `/analizar`, que responde la copia de la app guardada en el dispositivo.
- **iPhone y iPad:** iOS no deja que una app web reciba lo compartido, así que se usa un Atajo. La app incluye una guía con los pasos, en `#ios`. El Atajo abre la página en Safari.

## Resolutor de enlaces cortos

`apps/resolver` es un Cloudflare Worker que dice a dónde lleva un enlace corto, como los de `bit.ly`, sin abrirlo. Es la única pieza de OjoLink que recibe algo desde el dispositivo, y lo único que recibe es el enlace corto.

Qué hace y qué no hace:

- Solo acepta enlaces de la lista de acortadores y servicios de seguimiento del motor. Cualquier otro recibe un error y el resolutor no contacta a nadie.
- Le pregunta al acortador a dónde redirige, salto por salto. En cuanto el siguiente salto sale de la lista, se detiene y devuelve esa dirección. Nunca visita el destino.
- Si el acortador responde con una página, busca en ella una redirección escrita (`meta refresh` o una asignación a `location`), sin ejecutar nada.
- Solo si la petición lo pide, abre el enlace en un navegador en el servidor para los acortadores que redirigen con código. El navegador corta toda petición que salga de la lista, así que tampoco visita el destino.
- No dice si el destino es seguro. Ese veredicto lo da el motor, en el dispositivo.
- No registra enlaces y no le pasa al acortador ningún dato de quien pregunta.

### Petición y respuestas

```http
POST /resolve
Content-Type: application/json

{ "url": "https://bit.ly/3xYz" }
```

| Respuesta              | Estado | Contenido                                                                           |
| ---------------------- | ------ | ----------------------------------------------------------------------------------- |
| Destino revelado       | 200    | `{ "status": "resolved", "destination": "…", "hops": ["…"], "method": "redirect" }` |
| No se pudo revelar     | 200    | `{ "status": "unresolved", "reason": "no-redirect", "hops": ["…"] }`                |
| Petición mal formada   | 400    | `{ "error": "invalid-request" }`                                                    |
| Host fuera de la lista | 403    | `{ "error": "host-not-allowed" }`                                                   |
| Demasiadas peticiones  | 429    | `{ "error": "rate-limited" }`, con `Retry-After`                                    |

`method` es `redirect`, `html` o `headless`. Los motivos de «no resuelto» son `no-redirect`, `too-many-hops`, `loop`, `unsupported-destination`, `shortener-error`, `timeout` y `deep-unavailable`. Un «no resuelto» nunca significa que el enlace sea seguro.

### Análisis profundo

Con `"deep": true` el resolutor puede usar un navegador (Cloudflare Browser Run):

```json
{ "url": "https://t.co/abc", "deep": true }
```

Primero prueba los pasos normales. El navegador solo arranca si esos terminan en `no-redirect` o `shortener-error`, y un destino encontrado así lleva `"method": "headless"`. Sin `deep`, nunca arranca un navegador.

El navegador es un recurso escaso en el plan gratuito: 10 minutos al día y un navegador nuevo cada 20 segundos en toda la cuenta. Cuando no se puede arrancar uno, la respuesta es «no resuelto» con el motivo `deep-unavailable`, y se puede reintentar más tarde.

Si la cuenta de Cloudflare está en un plan de pago, el tiempo de navegador que pase de lo incluido se cobra. El resolutor no lleva la cuenta de ese tiempo: se apoya en el corte del plan gratuito. Antes de desplegar en una cuenta de pago hay que agregar un contador propio.

`GET /privacidad` devuelve la política de privacidad.

### Límites

| Límite                              | Valor         |
| ----------------------------------- | ------------- |
| Peticiones al acortador por enlace  | 5             |
| Tiempo por salto y en total         | 4 s y 8 s     |
| Lectura de una página               | 64 KB         |
| Peticiones por dirección IP         | 20 por minuto |
| Análisis profundos por dirección IP | 2 por minuto  |
| Duración de un análisis profundo    | 10 s          |
| Caché de un destino revelado        | 1 hora        |
| Caché de un «no resuelto» estable   | 10 minutos    |

Los valores están en `apps/resolver/src/limits.ts`. Los dos límites por IP también están en `apps/resolver/wrangler.json`, y una prueba comprueba que coinciden.

### Comandos

```bash
pnpm --filter @ojolink/resolver test
pnpm --filter @ojolink/resolver build
pnpm --filter @ojolink/resolver dev
```

`test` usa respuestas simuladas de acortadores y no necesita red. `build` empaqueta el Worker en `apps/resolver/dist` sin desplegarlo. `dev` lo levanta en local y muestra la dirección; ahí sí consulta acortadores reales.

### Desplegar

Hace falta una cuenta de Cloudflare. El plan gratuito alcanza.

```bash
pnpm --filter @ojolink/resolver exec wrangler login
pnpm --filter @ojolink/resolver run deploy
```

El segundo comando muestra la dirección pública, que termina en `workers.dev`. Después del primer despliegue conviene comprobar tres cosas:

1. Que `/privacidad` abre en esa dirección.

La política cubre la app web y la extensión del navegador: qué queda en el equipo y cuál es la única petición que la extensión hace. El texto está en `apps/resolver/src/policy.ts`; cambiarlo exige volver a desplegar el resolutor para que la versión publicada lo refleje. 2. Que en el panel de Cloudflare los registros del Worker (Workers Logs) aparecen desactivados. 3. Que una petición de prueba con un enlace corto devuelve su destino. 4. Que una petición con `"deep": true` para un enlace que redirige con código devuelve `"method": "headless"`, y que en el panel la sesión del navegador aparece cerrada. Las pruebas automáticas usan un navegador simulado, así que esta es la única comprobación con uno real.

Para volver a la versión anterior: `pnpm --filter @ojolink/resolver exec wrangler rollback`.

## Extensión de navegador

`apps/extension` es una extensión Manifest V3 para Chrome, Edge y Brave, construida con WXT. Revisa cada enlace de la página con el mismo motor que la app web y pone una marca junto a los sospechosos: «Peligro», «Precaución» o «Destino oculto», con un ícono y su color. Al pasar el mouse, o al llegar con el teclado, muestra una frase con el motivo.

Para que se note que revisó la página aunque no haya nada sospechoso, da dos señales más:

- Un indicador abajo, al centro de la página: «OjoLink · 12 enlaces revisados, sin señales de alerta», o cuántos tienen aviso. A los pocos segundos se reduce a «OjoLink» con un número.
- Al dejar el mouse sobre cualquier enlace revisado, sea texto, botón o imagen, una nota dice su resultado y a qué sitio lleva de verdad.

La extensión nunca dice que un enlace es seguro: dice que no le encontró señales de alerta.

También compara lo que el enlace dice con a dónde lleva. Si el texto muestra una dirección, por ejemplo `https://Outlook.com/verificar-identidad`, y el enlace lleva a otro sitio, lo marca con el motivo «Dice outlook.com, pero lleva a jimdosite.com.». Es «Peligro» cuando el texto muestra un dominio protegido y «Precaución» cuando muestra cualquier otro. No avisa por esto cuando:

- el texto no es una dirección: un botón, el nombre de una marca sin dominio, un correo electrónico o un nombre de archivo;
- el destino está oculto tras un acortador o un enlace de seguimiento, como en casi todos los boletines: ahí la marca sigue siendo «Destino oculto»;
- los dos dominios son de la misma organización, como `outlook.com` y `login.live.com`.

La app web no tiene texto de enlace que comparar, así que esta señal solo actúa en la extensión.

Al hacer clic en un enlace marcado «Peligro», la extensión detiene el clic antes de que el correo web o el navegador lo abran, y muestra un aviso: «OjoLink detuvo este enlace», el motivo con las mismas palabras de la app web, el sitio al que lleva de verdad y dos opciones.

- «Volver» cierra el aviso sin abrir nada. Es la opción que tiene el foco: Enter, Escape o un clic fuera del aviso hacen lo mismo.
- «Abrir de todos modos» abre el enlace en una pestaña nueva, aislada de la página del correo. Vale solo para ese clic: la próxima vez vuelve a avisar.

Detiene el clic normal, el botón del medio, el clic con Ctrl, Cmd o Shift, y Enter con el teclado. Los enlaces en «Precaución» se abren como siempre. El aviso se dibuja por encima de toda la página, donde el correo web no puede leerlo ni taparlo, y mientras está abierto las teclas no llegan a los atajos del correo.

Límites de hoy:

- No detiene lo que la página no puede ver: «Abrir enlace en una pestaña nueva» del menú del clic derecho, arrastrar el enlace a la barra de pestañas, o copiar su dirección y pegarla. Ahí solo protege la marca.
- No usa el análisis profundo del resolutor (el que abre un navegador en el servidor). Un enlace corto que los niveles rápidos no resuelven se muestra como no revelado.
- Un acortador puede responderle al resolutor algo distinto de lo que te respondería a ti. «Lleva a» describe lo que el resolutor vio en ese momento.
- No revisa enlaces dentro de marcos. Gmail y Outlook muestran el mensaje en la página principal, pero un correo web que use marcos no mostrará marcas.
- No conoce todavía los dominios propios de quien la usa.

La marca no cambia el mensaje: no altera la dirección ni el texto del enlace, no entra en lo que se copia y no aparece en un correo que se está escribiendo. Los enlaces se buscan por lo que son, sin depender de los nombres internos de Gmail u Outlook.

### Dónde corre

Desde que se instala, solo en tres sitios: `mail.google.com`, `outlook.office.com` y `outlook.live.com`. Nunca pide acceso a todos los sitios.

### El panel del ícono

Al pulsar el ícono de OjoLink se abre un panel con cuatro partes:

- **En esta página:** lo mismo que dice el indicador, por ejemplo «OjoLink · 12 enlaces revisados, 3 con avisos». En un sitio donde no funciona lo dice y lleva a las opciones; en una página de correo abierta antes de instalar o recargar la extensión, pide recargarla.
- **Tus dominios protegidos:** los sitios que más te importan, como tu banco o tu trabajo. Se aceptan como la gente los escribe (`https://www.MiEmpresa.com.bo/login` queda como `miempresa.com.bo`), hasta 100. OjoLink avisa de enlaces que los imiten y de enlaces cuyo texto los muestra pero llevan a otro sitio. Al agregar o quitar uno, los correos abiertos se vuelven a revisar sin recargar.
- **Dónde funciona:** los tres correos web de siempre y los que agregaste, con un botón que abre las opciones.
- **Apoyar el proyecto:** un enlace para donar, solo si el paquete se construyó con `WXT_DONATE_URL` (tiene que ser `https`). La extensión no lo recuerda ni insiste en ningún otro lugar.

Tus dominios se guardan solo en este equipo, en el almacenamiento local de la extensión. No se sincronizan con tu cuenta del navegador, no se envían a ningún servidor y no van en las consultas de «Revelar destino». En otro navegador hay que volver a escribirlos.

El panel no necesita permisos nuevos: le pregunta el estado al script que la propia extensión tiene en esa página. Por eso mismo no puede nombrar el sitio en el que estás ni ofrecer «agregar este sitio»; para eso lleva a las opciones.

### Enlaces con destino oculto

Un enlace que pasa por un acortador (`bit.ly`, `t.co`) o por un enlace de seguimiento de boletín lleva la marca «Destino oculto»: no se puede saber a dónde va sin abrirlo.

- **Acortadores:** al hacer clic, la extensión detiene el clic y pregunta: «Revelar destino», «Abrir de todos modos» o «Cancelar».
- **Enlaces de seguimiento:** se abren como siempre, para no interrumpir cada clic de un boletín.
- **La marca es un botón:** al pulsarla, con el mouse o con Tab y Enter, abre el mismo diálogo. Sirve para los dos casos.

«Revelar destino» le pregunta al resolutor de OjoLink a dónde lleva ese enlace y analiza la respuesta en tu equipo:

- Si el destino es peligroso, el diálogo se convierte en el aviso de peligro, la marca pasa a «Peligro» y los clics siguientes se detienen.
- Si no tiene señales de alerta, lo dice, muestra el sitio y ofrece «Abrir». La extensión sigue sin decir que es seguro.
- Si no se pudo revelar (sin conexión, demasiadas consultas, el servicio no respondió), lo muestra en precaución y ofrece intentar de nuevo.

«Abrir» abre el enlace tal como venía en el mensaje, no el destino revelado, así llegas a donde habría llevado un clic normal.

Qué se envía y cuándo:

- Solo el enlace corto. No se envía la página, el mensaje, el texto del enlace, cookies ni ningún identificador.
- Solo cuando pulsas «Revelar destino». Leer correo, pasar el mouse o hacer clic no envía nada.
- La petición la hace el script de fondo de la extensión, no la página del correo, y solo acepta enlaces de servicios que están en la lista de acortadores.
- El destino revelado se recuerda 30 minutos en la memoria de sesión del navegador, nunca en disco, y se borra al cerrarlo.

En la página de opciones hay un ajuste, apagado por defecto, para revelar al dejar el mouse 400 ms sobre un enlace. Si lo activas, cada enlace corto sobre el que dejes el mouse se envía al servicio, con un tope de 10 por minuto.

La dirección del resolutor se fija al construir, con `WXT_RESOLVER_URL` en el entorno o en `apps/extension/.env.local` (hay un `.env.example`). Tiene que ser `https`, o `http` en `localhost`. Sin ella el paquete no declara ningún servidor, no hace ninguna petición y el diálogo dice que revelar no está disponible. Con ella, el manifiesto declara ese servidor y ningún otro.

Quien la usa puede agregar otro correo web, uno a la vez, desde la página de opciones de la extensión. Cada sitio necesita su acción y el aviso de permiso del propio navegador, y se puede quitar cuando quiera.

### Permisos

| Permiso                            | Para qué                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `storage`                          | Recordar los ajustes en el equipo. No se sincroniza con ningún servidor                                |
| `scripting`                        | Revisar enlaces en un sitio que la persona agregó, además de los tres por defecto                      |
| Acceso a los tres sitios de correo | Revisar los enlaces de los mensajes                                                                    |
| `https://*/*`, opcional            | Permite agregar un sitio a la vez. Por sí solo no concede nada: el navegador no lo muestra al instalar |

No usa `tabs`, `history`, `cookies`, `downloads`, `webRequest` ni `<all_urls>`. Los motivos están en `apps/extension/src/permissions.ts`, y `pnpm test` falla si el paquete declara un permiso que no figure ahí.

La extensión no carga código de fuera de su paquete; el motor va dentro. Revisar, marcar y detener enlaces no envía nada. La única petición de red que hace es la de «Revelar destino», a una sola dirección, y solo cuando la pides. Está explicado en «Enlaces con destino oculto», más abajo. `pnpm test` falla si aparece una petición en cualquier otro archivo que no sea `apps/extension/src/reveal.ts`, o si el paquete nombra otro servidor.

### Comandos

```bash
pnpm --filter @ojolink/extension build
pnpm --filter @ojolink/extension test
pnpm --filter @ojolink/extension dev
pnpm --filter @ojolink/extension zip
```

`build` deja el paquete en `apps/extension/.output/chrome-mv3`. `dev` abre un navegador con la extensión cargada y la recarga al guardar. `zip` genera el archivo para una tienda de extensiones.

### Cargarla en tu navegador

1. Ejecuta `pnpm build`.
2. Abre `chrome://extensions` (o `edge://extensions`, `brave://extensions`) y activa el «Modo de desarrollador».
3. Pulsa «Cargar descomprimida» y elige `apps/extension/.output/chrome-mv3`.

### Publicación

El mismo paquete se publica en Chrome Web Store y en Microsoft Edge Add-ons. Brave, Opera y Vivaldi instalan desde la tienda de Chrome. Firefox y Safari no están cubiertos por este paquete.

```bash
pnpm --filter @ojolink/extension release
```

El comando exige la dirección pública del resolutor (`https`, nunca `localhost`) y una versión que no se haya publicado antes, construye, corre las pruebas, arma `apps/extension/.output/ojolink-<versión>-chrome.zip` y revisa su contenido. Si algo falla no deja ningún archivo. No sube nada a las tiendas.

Cada permiso que declara el paquete tiene su motivo, en español, en `apps/extension/src/permissions.ts`; es el mismo texto que se entrega a las tiendas. Las capturas de la ficha están en `apps/extension/store/screenshots/` y se rehacen con `pnpm --filter @ojolink/extension store:screenshots`, sobre mensajes inventados.

Las versiones publicadas se anotan en [apps/extension/CHANGELOG.md](apps/extension/CHANGELOG.md).

## Datos

El motor usa cuatro conjuntos de datos: los caracteres confundibles de Unicode, los dominios protegidos, los acortadores de enlaces y los servicios donde cualquiera puede publicar una página, con las palabras típicas de engaño. Los archivos de `packages/core/src/data/` se generan y no se editan a mano. Lo que se edita son sus fuentes, en `tools/build-data/sources/`:

| Fuente                    | Contenido                                               |
| ------------------------- | ------------------------------------------------------- |
| `unicode/confusables.txt` | Archivo de Unicode (UTS #39), sin modificar             |
| `protected/<país>.json`   | Entidades protegidas de un país, un archivo por país    |
| `protected/global.json`   | Marcas que el phishing suplanta en cualquier país       |
| `shorteners.json`         | Acortadores y dominios de seguimiento                   |
| `hosting.json`            | Servicios donde cualquiera publica y palabras de engaño |

Después de cambiar una fuente hay que regenerar:

```bash
pnpm --filter @ojolink/build-data generate
```

El comando valida las fuentes, escribe los módulos y muestra un resumen, con las entradas que dejó fuera por no estar confirmadas. Si una fuente cambia y no se regenera, `pnpm test` falla y nombra el archivo desactualizado.

### Agregar un país

1. Crea `tools/build-data/sources/protected/<código>.json`, con el código del país en dos letras minúsculas. Usa `bo.json` como modelo.
2. Ejecuta el comando de generación.

No hace falta tocar los archivos de otros países.

Un sufijo protegido, como `gob.bo`, puede declarar en `lookalikes` las terminaciones que lo imitan, como `gov.bo`. Solo se detectan las que están en esa lista.

### Confirmar una entidad

Cada entidad lleva un registro de verificación. Solo las confirmadas llegan al motor.

1. Abre el sitio oficial de la entidad y comprueba su dominio. No alcanza con una fuente secundaria: dos dominios de la primera lista estaban mal en directorios de terceros.
2. En el archivo del país, pon `"status": "confirmed"`, la dirección del sitio en `"source"` y la fecha en `"checked"` (formato `AAAA-MM-DD`).
3. Ejecuta el comando de generación.

El dominio debe ser el registrable, sin `www` ni otros subdominios: `bcp.com.bo`, no `www.bcp.com.bo`.

### Marcas globales

`protected/global.json` reúne las marcas que más se suplantan: pagos, banca, correo y cuentas, streaming, redes y mensajería, compras, envíos y telefonía. No es un ranking de sitios populares: los primeros puestos de un ranking son sobre todo infraestructura que nadie suplanta en un mensaje.

Usa el mismo formato que el archivo de un país, con dos campos opcionales:

- `names`: los nombres con los que se busca la marca dentro de otras direcciones. Si falta, es el nombre de su dominio (`paypal` para `paypal.com`). Una lista vacía indica que ese dominio no se busca por nombre.
- `commonWord`: `true` cuando el nombre es una palabra corriente, como `apple` o `amazon`. Esas marcas solo se señalan si la dirección trae además una palabra de engaño.

Los demás dominios oficiales de una marca van en `aliases`, para que el motor nunca tome el sitio real por una imitación: `live.com` y `outlook.com` son de Microsoft.

Cada entrada se confirma de una de dos formas, que se anota en `verification`:

- `"method": "ranking"`: el dominio figura en Majestic Million. Es lo habitual en este archivo.
- `"method": "site"`: se comprobó en el sitio del dueño, con la dirección consultada en `source`.

Para agregar o corregir una marca, edita el archivo y ejecuta:

```bash
pnpm --filter @ojolink/build-data refresh:ranking
pnpm --filter @ojolink/build-data generate
```

El primer comando usa la red: descarga Majestic Million (unos 80 MB), anota la posición de cada dominio y avisa de los que no encontró. El ranking no se guarda en el repositorio. Majestic pide no descargarlo más de una vez al día. El segundo comando funciona sin red.

Después hay que agregar al corpus una página real de cada dominio nuevo; si falta, `pnpm test` lo nombra.

### Actualizar los datos de Unicode

Usa la red, como el de las marcas globales:

```bash
pnpm --filter @ojolink/build-data refresh:unicode latest
pnpm --filter @ojolink/build-data generate
```

En lugar de `latest` se puede indicar una versión, por ejemplo `18.0.0`.

## Dominios del usuario y presupuestos

El motor puede proteger dominios que no están en ninguna lista embebida, como el banco o el empleador de quien lo usa:

```ts
import { checkUserDomain, createDefaultEngine } from "@ojolink/core";

checkUserDomain("https://www.MiEmpresa.com.bo/login"); // { ok: true, domain: "miempresa.com.bo" }

const engine = createDefaultEngine({ userDomains: ["miempresa.com.bo", "com.bo"] });
engine.userDomains.entries; // qué entradas se aceptaron y por qué se rechazó el resto
engine.analyze("https://miempresa.com.bo.verifica.net/"); // peligro
```

Se aceptan hasta 100 dominios. El motor no guarda la lista: la aporta quien lo llama, y `analyze` sin motor propio sigue usando solo las listas embebidas.

`pnpm test` comprueba dos presupuestos y falla si alguno se supera:

| Presupuesto                                           | Límite | Medido (19 nov 2026) |
| ----------------------------------------------------- | ------ | -------------------- |
| Tiempo medio por enlace, con 100 dominios del usuario | 1 ms   | 0,027 ms             |
| Preparación de las listas                             | 50 ms  | 1,2 ms               |
| Motor empaquetado con datos y dependencias, gzip      | 300 KB | 85,7 KB              |

El tamaño también se puede medir solo, con el reparto entre datos embebidos, `tldts` y código:

```bash
pnpm --filter @ojolink/core size
```

## Corpus de calibración

`packages/test-corpus` guarda enlaces legítimos y de phishing etiquetados. El motor se mide contra ellos, y `pnpm test` falla si deja de cumplir las metas. Por eso un cambio en un peso o un umbral de `packages/core/src/calibration.ts` no pasa sin esta medición.

| Meta                                                                                                                     | Límite         | Medido (23 nov 2026)     |
| ------------------------------------------------------------------------------------------------------------------------ | -------------- | ------------------------ |
| Enlaces legítimos en «peligro»                                                                                           | 0              | 0 fuera de 2 excepciones |
| Enlaces legítimos en «precaución», sin contar páginas de alojamiento, nombres vecinos ni nombres que contienen una marca | 5 % como mucho | 0 % (0 de 625)           |
| Páginas reales de dominios protegidos en «seguro»                                                                        | todas          | 370 de 370               |
| Phishing que el motor cubre con un nivel distinto de «seguro»                                                            | 90 % o más     | 100 % (121 de 121)       |

Un límite a tener en cuenta: casi todo el phishing del corpus está construido a mano para mostrar una técnica. La tasa de detección sirve para notar que un cambio rompió una señal. No dice cuánto phishing real detecta el motor. Cada muestra real que llegue vale más que diez construidas.

### Agregar una muestra

Cada muestra es un enlace. La etiqueta y el tipo salen de la carpeta y del archivo:

- `samples/legitimate/<tipo>.json`, con los tipos `protected`, `general`, `idn`, `tracker`, `shortener`, `hosting`, `near-neighbour` y `brand-word` (nombres reales que contienen el de una marca).
- `samples/phishing/<técnica>.json`, con un archivo por señal del motor, y `out-of-reach.json` para el phishing que ninguna señal local puede detectar.

```json
{
  "id": "subdomain-bcp-domain",
  "input": "https://bcp.com.bo.example.net/",
  "source": "constructed",
  "collected": "2026-11-20",
  "note": "Construido a mano para mostrar la técnica; no observado."
}
```

`source` es `real` (recibido en un mensaje), `constructed` (armado a mano) u `observed` (dirección legítima tomada de la web pública). Los campos opcionales son `expected`, `userDomains`, `visibleText` y `outOfReach`.

Reglas:

- Sin datos personales. La comprobación falla si un enlace o una nota contiene una dirección de correo. En un enlace real, reemplaza los identificadores del destinatario por un marcador y dilo en la nota.
- Los caracteres parecidos o invisibles se escriben como escapes `\u` para que se vean al revisar.
- En el phishing construido, el dominio del atacante es un nombre reservado (`example.net`) siempre que la técnica lo permita.

Después de agregar muestras:

```bash
pnpm --filter @ojolink/test-corpus report
pnpm --filter @ojolink/test-corpus test
```

El primer comando reescribe `report.md`, que se confirma junto con las muestras. Para comprobar por DNS que existen los dominios de las muestras `observed` (usa la red; no forma parte de las pruebas):

```bash
pnpm --filter @ojolink/test-corpus check:dns
```

### Leer el reporte

[packages/test-corpus/report.md](packages/test-corpus/report.md) muestra las metas, el tamaño del corpus por tipo, y por cada señal cuántos enlaces legítimos marcó y cuántos de phishing de su técnica dejó pasar. También lista cada resultado equivocado, las excepciones aceptadas con su motivo, los casos fijos de la tabla «Textos por caso» (los pendientes dicen qué change los destraba) y el motivo de cada peso y umbral, que se guarda en `calibration.json`.

`baseline.json` guarda el nivel de cada muestra legítima en la última calibración aceptada. Si una sube de nivel, por ejemplo al agregar marcas, la comprobación falla y la nombra hasta que se resuelva. Cuando el resultado nuevo se acepta, la línea base se reescribe con `pnpm --filter @ojolink/test-corpus run baseline`.

Si una muestra legítima recibe un nivel equivocado y el proyecto lo acepta, se anota en `exceptions.json` con su motivo. Una excepción que ya no hace falta hace fallar la comprobación, y una página real de un dominio protegido no admite excepción.

## Licencia

El código de OjoLink se publica bajo la licencia MIT. El texto está en [LICENSE](LICENSE). Los datos de terceros que el motor incluye conservan sus propias licencias, descritas a continuación.

## Licencias de terceros

Los datos de terceros que incluye el motor y sus avisos están en [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Documentación

- [Requerimientos](architecture/Requerimientos%20—%20Extensión%20anti-phishing%20de%20dominios%20falsos.md)
- [Arquitectura](architecture/Arquitectura%20anti-phishing.html)
- [Plan de tareas](architecture/Tareas%20—%20Extensión%20anti-phishing%20de%20dominios%20falsos.md)
