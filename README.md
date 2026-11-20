# OjoLink

Capa preventiva contra phishing: analiza los enlaces antes del clic, en el dispositivo, y explica por qué un enlace es sospechoso. Un mismo motor sirve a una extensión de navegador y a una web instalable (PWA).

El proyecto está en su etapa inicial. Hoy el repositorio contiene el motor de análisis con sus señales de detección, los datos que usa, y una primera versión de la aplicación web. La extensión de navegador todavía no existe.

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

Ninguno de estos comandos necesita conexión a internet.

## Estructura

| Carpeta            | Contenido                                                 |
| ------------------ | --------------------------------------------------------- |
| `packages/core`    | Motor de análisis (`@ojolink/core`)                       |
| `apps/web`         | Aplicación web instalable (`@ojolink/web`)                |
| `tools/build-data` | Generador de los datos del motor (`@ojolink/build-data`)  |
| `architecture/`    | Requerimientos, arquitectura y plan de tareas, en español |
| `openspec/`        | Changes y specs de OpenSpec, en inglés                    |

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

## Licencias de terceros

Los datos de terceros que incluye el motor y sus avisos están en [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Documentación

- [Requerimientos](architecture/Requerimientos%20—%20Extensión%20anti-phishing%20de%20dominios%20falsos.md)
- [Arquitectura](architecture/Arquitectura%20anti-phishing.html)
- [Plan de tareas](architecture/Tareas%20—%20Extensión%20anti-phishing%20de%20dominios%20falsos.md)

El trabajo se organiza con [OpenSpec](openspec/). Para ver los changes pendientes: `openspec list`.
