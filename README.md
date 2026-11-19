# OjoLink

Capa preventiva contra phishing: analiza los enlaces antes del clic, en el dispositivo, y explica por qué un enlace es sospechoso. Un mismo motor sirve a una extensión de navegador y a una web instalable (PWA).

El proyecto está en su etapa inicial. Hoy el repositorio contiene la base del monorepo y el paquete del motor, todavía sin lógica de detección.

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

## Estructura

| Carpeta         | Contenido                                                 |
| --------------- | --------------------------------------------------------- |
| `packages/core` | Motor de análisis (`@ojolink/core`)                       |
| `architecture/` | Requerimientos, arquitectura y plan de tareas, en español |
| `openspec/`     | Changes y specs de OpenSpec, en inglés                    |

Las carpetas `apps/` y `tools/` se agregan en changes posteriores.

## Documentación

- [Requerimientos](architecture/Requerimientos%20—%20Extensión%20anti-phishing%20de%20dominios%20falsos.md)
- [Arquitectura](architecture/Arquitectura%20anti-phishing.html)
- [Plan de tareas](architecture/Tareas%20—%20Extensión%20anti-phishing%20de%20dominios%20falsos.md)

El trabajo se organiza con [OpenSpec](openspec/). Para ver los changes pendientes: `openspec list`.
