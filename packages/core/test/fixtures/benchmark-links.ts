const cp = (...points: number[]) => String.fromCodePoint(...points);

export const BENCHMARK_USER_DOMAINS: readonly string[] = Array.from({ length: 100 }, (_, i) => {
  const kinds = ["empresa", "cooperativa", "clinica", "colegio", "tienda"];
  const places = ["norte", "sur", "andina", "central", "oriente", "lapaz", "sucre", "tarija"];
  const name = `${kinds[i % kinds.length]}${places[i % places.length]}${Math.floor(i / 40) || ""}`;
  return `${name}${i}.${i % 2 === 0 ? "bo" : "com.bo"}`;
});

export const BENCHMARK_LINKS: readonly string[] = [
  "https://www.bcp.com.bo/personas",
  "https://www.bnb.com.bo/PortalBNB/Principal",
  "https://www.segip.gob.bo/tramites",
  "https://example.com/some/long/path?with=query&and=more",
  "https://mail.google.com/mail/u/0/#inbox",
  "https://es.wikipedia.org/wiki/Bolivia",
  "https://www.youtube.com/watch?v=abc123",
  "https://tienda.ejemplo.com.bo/producto/123?ref=correo",
  "https://docs.google.com/document/d/1abc/edit",
  `https://yuri${cp(0xf1)}a.gob.bo/`,
  "https://xn--yuria-rta.gob.bo/",
  "https://un-dominio-cualquiera-bastante-largo-para-medir.com.bo/",
  "https://a-very-long-subdomain-name.another-label.yet-another.example.co.uk/",
  "https://bcp.com.bo.verifica.net/login",
  "https://bnb.com.bo.seguro-acceso.example.org/a/b?c=d",
  "https://tramites.gob.bo.example.net/",
  "https://tramites.gov.bo/",
  "https://banco.com.bo/",
  "https://bancofin.com.bo/",
  "https://bcpp.com.bo/",
  "https://bancosoI.com.bo/",
  "https://empresanorte0.bo.verifica.net/",
  "https://ernpresanorte0.bo/",
  "https://cooperativasur1.com.co/",
  `https://b${cp(0x0441, 0x0440)}.com.bo/`,
  `https://${cp(0x0430, 0x0440, 0x0440, 0x04cf, 0x0435)}.com/`,
  `https://ejem${cp(0xad)}plo.com/`,
  "https://usuario:clave@example.com/",
  "https://www.bcp.com.bo@example.net/",
  "http://192.168.1.10/panel",
  "http://0x7f.0.0.1/",
  "https://ex%61mple.com/",
  "https://bit.ly/x",
  "https://t.co/AbCdEf",
  "https://ejemplo.github.io/recetas/",
  "https://soporte-usuarios-biblioteca.blogspot.com/",
  "https://verificasion-actualizasion-confirmasion.netlify.app/",
  "https://sites.google.com/view/serivciosbandejamensajeriaen/",
  "http://www.google.com/url?q=http%3A%2F%2Fasistenciatecnicaserviciosmensajeria.zya.me%2F&sa=D&sntz=1",
  "https://nam02.safelinks.protection.outlook.com/?url=https%3A%2F%2Fbcp.com.bo.verifica.net%2F&data=05",
];
