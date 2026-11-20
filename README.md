# OjoLink

Capa preventiva contra phishing: analiza los enlaces antes del clic, en el dispositivo, y explica por qué un enlace es sospechoso. Un mismo motor sirve a una extensión de navegador y a una web instalable (PWA).

El proyecto está en su etapa inicial. Hoy el repositorio contiene el motor de análisis con sus señales de detección, los datos que usa, una primera versión de la aplicación web y el resolutor de enlaces cortos, listo para desplegar. La extensión de navegador todavía no existe.

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
| `tools/build-data`     | Generador de los datos del motor (`@ojolink/build-data`)    |
| `architecture/`        | Requerimientos, arquitectura y plan de tareas, en español   |
| `openspec/`            | Changes y specs de OpenSpec, en inglés                      |

## Aplicación web

`apps/web` es una página que revisa un enlace o un mensaje completo y muestra un veredicto por cada enlace. Todo se analiza en el dispositivo: no envía ni guarda lo que se pega.

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

La aplicación todavía no está publicada.

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
2. Que en el panel de Cloudflare los registros del Worker (Workers Logs) aparecen desactivados.
3. Que una petición de prueba con un enlace corto devuelve su destino.
4. Que una petición con `"deep": true` para un enlace que redirige con código devuelve `"method": "headless"`, y que en el panel la sesión del navegador aparece cerrada. Las pruebas automáticas usan un navegador simulado, así que esta es la única comprobación con uno real.

Para volver a la versión anterior: `pnpm --filter @ojolink/resolver exec wrangler rollback`.

## Datos

El motor usa cuatro conjuntos de datos: los caracteres confundibles de Unicode, los dominios protegidos, los acortadores de enlaces y los servicios donde cualquiera puede publicar una página, con las palabras típicas de engaño. Los archivos de `packages/core/src/data/` se generan y no se editan a mano. Lo que se edita son sus fuentes, en `tools/build-data/sources/`:

| Fuente                    | Contenido                                               |
| ------------------------- | ------------------------------------------------------- |
| `unicode/confusables.txt` | Archivo de Unicode (UTS #39), sin modificar             |
| `protected/<país>.json`   | Entidades protegidas de un país, un archivo por país    |
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

### Actualizar los datos de Unicode

Es el único comando que usa la red:

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

| Meta                                                                                    | Límite         | Medido (20 nov 2026)     |
| --------------------------------------------------------------------------------------- | -------------- | ------------------------ |
| Enlaces legítimos en «peligro»                                                          | 0              | 0 fuera de 2 excepciones |
| Enlaces legítimos en «precaución», sin contar páginas de alojamiento ni nombres vecinos | 5 % como mucho | 0 % (0 de 329)           |
| Páginas reales de dominios protegidos en «seguro»                                       | todas          | 72 de 72                 |
| Phishing que el motor cubre con un nivel distinto de «seguro»                           | 90 % o más     | 100 % (86 de 86)         |

Un límite a tener en cuenta: casi todo el phishing del corpus está construido a mano para mostrar una técnica. La tasa de detección sirve para notar que un cambio rompió una señal. No dice cuánto phishing real detecta el motor. Cada muestra real que llegue vale más que diez construidas.

### Agregar una muestra

Cada muestra es un enlace. La etiqueta y el tipo salen de la carpeta y del archivo:

- `samples/legitimate/<tipo>.json`, con los tipos `protected`, `general`, `idn`, `tracker`, `shortener`, `hosting` y `near-neighbour`.
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

Si una muestra legítima recibe un nivel equivocado y el proyecto lo acepta, se anota en `exceptions.json` con su motivo. Una excepción que ya no hace falta hace fallar la comprobación, y una página real de un dominio protegido no admite excepción.

## Licencias de terceros

Los datos de terceros que incluye el motor y sus avisos están en [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Documentación

- [Requerimientos](architecture/Requerimientos%20—%20Extensión%20anti-phishing%20de%20dominios%20falsos.md)
- [Arquitectura](architecture/Arquitectura%20anti-phishing.html)
- [Plan de tareas](architecture/Tareas%20—%20Extensión%20anti-phishing%20de%20dominios%20falsos.md)

El trabajo se organiza con [OpenSpec](openspec/). Para ver los changes pendientes: `openspec list`.
