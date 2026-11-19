# OjoLink

Capa preventiva contra phishing: analiza los enlaces antes del clic, en el dispositivo, y explica por qué un enlace es sospechoso. Un mismo motor sirve a una extensión de navegador y a una web instalable (PWA).

El proyecto está en su etapa inicial. Hoy el repositorio contiene el motor de análisis, con sus primeras señales de detección, y los datos que usa. La PWA y la extensión todavía no existen.

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
| `tools/build-data` | Generador de los datos del motor (`@ojolink/build-data`)  |
| `architecture/`    | Requerimientos, arquitectura y plan de tareas, en español |
| `openspec/`        | Changes y specs de OpenSpec, en inglés                    |

La carpeta `apps/` se agrega en changes posteriores.

## Datos

El motor usa tres conjuntos de datos: los caracteres confundibles de Unicode, los dominios protegidos y los acortadores de enlaces. Los archivos de `packages/core/src/data/` se generan y no se editan a mano. Lo que se edita son sus fuentes, en `tools/build-data/sources/`:

| Fuente                    | Contenido                                            |
| ------------------------- | ---------------------------------------------------- |
| `unicode/confusables.txt` | Archivo de Unicode (UTS #39), sin modificar          |
| `protected/<país>.json`   | Entidades protegidas de un país, un archivo por país |
| `shorteners.json`         | Acortadores y dominios de seguimiento                |

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

## Licencias de terceros

Los datos de terceros que incluye el motor y sus avisos están en [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Documentación

- [Requerimientos](architecture/Requerimientos%20—%20Extensión%20anti-phishing%20de%20dominios%20falsos.md)
- [Arquitectura](architecture/Arquitectura%20anti-phishing.html)
- [Plan de tareas](architecture/Tareas%20—%20Extensión%20anti-phishing%20de%20dominios%20falsos.md)

El trabajo se organiza con [OpenSpec](openspec/). Para ver los changes pendientes: `openspec list`.
