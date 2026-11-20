import { RATE_LIMIT, RESOLVED_TTL_SECONDS, STABLE_TTL_SECONDS } from "./limits.ts";

export function describeDuration(seconds: number): string {
  const [amount, one, many] =
    seconds % 3600 === 0
      ? [seconds / 3600, "hora", "horas"]
      : seconds % 60 === 0
        ? [seconds / 60, "minuto", "minutos"]
        : [seconds, "segundo", "segundos"];
  return `${amount} ${amount === 1 ? one : many}`;
}

export function policyPage(): string {
  const resolved = describeDuration(RESOLVED_TTL_SECONDS);
  const stable = describeDuration(STABLE_TTL_SECONDS);
  const period = describeDuration(RATE_LIMIT.period);
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacidad — OjoLink</title>
<style>
body { font-family: system-ui, sans-serif; line-height: 1.55; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; background: #fff; }
h1 { font-size: 1.5rem; }
h2 { font-size: 1.1rem; margin-top: 1.6rem; }
@media (prefers-color-scheme: dark) { body { color: #eaeaea; background: #141414; } }
</style>
</head>
<body>
<h1>Privacidad de OjoLink</h1>
<p>OjoLink revisa los enlaces en tu dispositivo. Este servicio solo existe para una cosa: decirte a dónde lleva un enlace corto antes de que lo abras.</p>

<h2>Qué se envía</h2>
<p>Solo el enlace corto que quieres revelar, por ejemplo una dirección de <code>bit.ly</code>. El contenido de tus correos y mensajes nunca sale de tu dispositivo. Tampoco se envían los enlaces normales: esos se analizan sin conexión.</p>

<h2>Qué hacemos con el enlace</h2>
<p>Le preguntamos al servicio acortador a dónde redirige y te devolvemos esa dirección. Nunca visitamos el sitio de destino, así que quien lo controla no ve ninguna visita. Al acortador no le pasamos nada tuyo: ni tu dirección IP, ni tus cookies, ni tu navegador.</p>

<h2>Análisis profundo</h2>
<p>Si lo pides, y solo entonces, abrimos el enlace corto en un navegador que corre en el servidor, para los acortadores que redirigen con código. Ese navegador empieza limpio cada vez, sin cookies ni historial, y tampoco visita el destino: se detiene justo antes.</p>

<h2>Qué se guarda</h2>
<p>No guardamos registros de los enlaces que se consultan ni de quién los consulta. La respuesta se conserva en una memoria temporal durante ${resolved} cuando se pudo revelar el destino, o ${stable} cuando no se pudo, para no repetir la consulta. Esa copia contiene el enlace corto y su destino, y nada sobre ti.</p>

<h2>Límite de uso</h2>
<p>Para evitar abusos se cuentan las peticiones que llegan desde cada dirección IP: hasta ${RATE_LIMIT.limit} cada ${period}. Ese conteo es temporal y no lo guardamos.</p>

<h2>Dónde funciona</h2>
<p>El servicio corre en Cloudflare Workers. Cloudflare transporta las peticiones como proveedor de infraestructura. No usamos cookies, cuentas, publicidad ni herramientas de medición.</p>
</body>
</html>
`;
}
