// La página de quien responde: /f/<enlace>
import { api, h, icono, avisar, confirmar, moverGota, reducido, entrar } from "./util.js";
import { campoRespuesta, errorDe, estaVacia, SIN_RESPUESTA } from "./tipos.js";

const enlace = location.pathname.split("/")[2];
const pideVista = new URLSearchParams(location.search).has("vista");
let vista = false;      // solo si quien mira es quien lo creó
const raiz = document.getElementById("formulario");
const CLAVE_BORRADOR = `sforms-borrador-${enlace}`;

let f, paginas, pagina = 0, valores = {}, gota, hilo;

const guardarBorrador = () => {
  if (vista) return;
  try { localStorage.setItem(CLAVE_BORRADOR, JSON.stringify({ valores, pagina, t: Date.now() })); } catch { /* sin almacenamiento */ }
};
const leerBorrador = () => {
  try {
    const b = JSON.parse(localStorage.getItem(CLAVE_BORRADOR) || "null");
    if (b && Date.now() - b.t < 30 * 86400e3) return b;
  } catch { /* sin almacenamiento */ }
  return null;
};
const borrarBorrador = () => { try { localStorage.removeItem(CLAVE_BORRADOR); } catch { /* sin almacenamiento */ } };

// Las secciones parten el formulario en páginas; cada página empieza con su sección.
function partir(preguntas) {
  const res = [[]];
  for (const p of preguntas) {
    if (p.tipo === "seccion" && res[res.length - 1].length) res.push([]);
    res[res.length - 1].push(p);
  }
  return res;
}

const contestables = () => f.preguntas.filter((p) => !SIN_RESPUESTA.includes(p.tipo));

function cabecera() {
  const hayObligatorias = (f.preguntas || []).some((p) => p.obligatoria);
  return h("header.cabecera",
    h("h1.cabecera__titulo.titulo-gota", f.titulo),
    f.descripcion ? h("p.cabecera__descripcion", f.descripcion) : null,
    hayObligatorias && pagina === 0 ? h("p.cabecera__pie", h("span.obligatoria", "*"), " Pregunta obligatoria") : null);
}

function tarjeta(p, numSeccion) {
  if (p.tipo === "seccion" || p.tipo === "texto") {
    return h(`section.pregunta${p.tipo === "seccion" ? ".pregunta--seccion" : ""}`, { "data-id": p.id },
      p.tipo === "seccion" ? h("span.seccion-etiqueta", `Parte ${numSeccion} de ${paginas.length}`) : null,
      p.titulo ? h("h2.pregunta__titulo", p.titulo) : null,
      p.ayuda ? h("p.pregunta__ayuda", p.ayuda) : null);
  }
  const t = h("section.pregunta", { "data-id": p.id },
    h(`h2#t-${p.id}.pregunta__titulo`, p.titulo || "Pregunta sin título", p.obligatoria ? h("span.obligatoria", { "aria-label": "obligatoria" }, "*") : null),
    p.ayuda ? h("p.pregunta__ayuda", p.ayuda) : null,
    h("div.pregunta__campo", campoRespuesta(p, valores[p.id], {
      alCambiar: (v) => {
        if (estaVacia(v)) delete valores[p.id]; else valores[p.id] = v;
        if (t.dataset.error !== undefined && !errorDe(p, valores[p.id])) marcarError(t, null);
        progreso();
        guardarBorrador();
      },
    })));
  t.addEventListener("focusout", () => {
    // Al salir de un campo con formato (correo, número…), se avisa ya, sin esperar al envío.
    if (p.tipo === "corta" && valores[p.id] !== undefined) marcarError(t, errorDe(p, valores[p.id]));
  });
  return t;
}

function marcarError(t, mensaje) {
  t.querySelector(".error-campo")?.remove();
  const control = t.querySelector("input, textarea, select");
  if (!mensaje) {
    delete t.dataset.error;
    control?.removeAttribute("aria-invalid");
    return;
  }
  t.dataset.error = "";
  const id = `e-${t.dataset.id}`;
  const msj = h(`p#${id}.error-campo`, { role: "alert" }, icono("aviso"), mensaje);
  t.append(msj);
  control?.setAttribute("aria-invalid", "true");
  control?.setAttribute("aria-describedby", id);
}

function progreso() {
  if (!hilo) return;
  const todas = contestables();
  const hechas = todas.filter((p) => !estaVacia(valores[p.id])).length;
  hilo.style.setProperty("--p", todas.length ? hechas / todas.length : 0);
  hilo.closest(".hilo").querySelector(".hilo__texto").textContent = paginas.length > 1 ? `Parte ${pagina + 1} de ${paginas.length}` : `${hechas} de ${todas.length}`;
}

function seguirGota(t) {
  if (!gota || !t) return;
  moverGota(gota, t.offsetTop + 18, Math.max(40, t.offsetHeight - 36));
}

function pintarPagina(direccion = 0) {
  const zona = raiz.querySelector(".paginas");
  const nueva = h("div.pagina", { style: { display: "grid", gap: "inherit" } });
  for (const p of paginas[pagina]) nueva.append(tarjeta(p, pagina + 1));
  const ultima = pagina === paginas.length - 1;
  nueva.append(h("div.navegacion",
    pagina > 0 ? h("button.boton", { type: "button", onclick: () => ir(-1) }, icono("atras"), "Atrás") : null,
    h(`button.boton.boton--primario`, { type: "button", onclick: ultima ? enviar : () => ir(1) }, ultima ? ["Enviar respuestas", icono("enviar")] : ["Siguiente", icono("adelante")]),
    h("span.navegacion__hueco"),
    h("button.boton.boton--fantasma.boton--pequeno", { type: "button", onclick: limpiar }, "Vaciar formulario")));
  const vieja = zona.firstElementChild;
  zona.replaceChildren(nueva);
  if (direccion && !reducido()) {
    nueva.animate([{ opacity: 0, transform: `translateX(${direccion * 40}px)` }, { opacity: 1, transform: "none" }], { duration: 300, easing: "cubic-bezier(.23, 1, .32, 1)" });
  } else if (!vieja) {
    [...nueva.children].forEach((c, i) => entrar(c, { retraso: 60 + i * 50 }));
  }
  progreso();
  nueva.addEventListener("focusin", (e) => seguirGota(e.target.closest(".pregunta")));
  gota.style.opacity = "0";
  gota._pos = null;
}

function validarPagina() {
  let primera = null;
  for (const p of paginas[pagina]) {
    const t = raiz.querySelector(`.pregunta[data-id="${p.id}"]`);
    const err = errorDe(p, valores[p.id]);
    marcarError(t, err);
    if (err && !primera) primera = t;
  }
  if (primera) {
    primera.scrollIntoView({ behavior: reducido() ? "auto" : "smooth", block: "center" });
    if (!reducido()) primera.animate([{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(5px)" }, { transform: "translateX(-3px)" }, { transform: "none" }], { duration: 380, easing: "ease-out", delay: 200 });
    primera.querySelector("input, textarea, select")?.focus({ preventScroll: true });
    return false;
  }
  return true;
}

function ir(paso) {
  if (paso > 0 && !validarPagina()) return;
  pagina = Math.max(0, Math.min(paginas.length - 1, pagina + paso));
  guardarBorrador();
  pintarPagina(paso);
  raiz.querySelector(".cabecera").replaceWith(cabecera());
  window.scrollTo({ top: 0, behavior: reducido() ? "auto" : "smooth" });
}

async function limpiar() {
  if (!Object.keys(valores).length) return;
  if (!(await confirmar({ titulo: "¿Vaciar el formulario?", texto: "Se borra todo lo que has contestado en todas las partes. No se puede deshacer.", si: "Vaciar" }))) return;
  valores = {};
  pagina = 0;
  borrarBorrador();
  pintarPagina(0);
  raiz.querySelector(".cabecera").replaceWith(cabecera());
}

async function enviar(e) {
  if (!validarPagina()) return;
  const boton = e.currentTarget;
  boton.disabled = true;
  boton.replaceChildren("Enviando…");
  try {
    let res;
    if (vista) res = { confirmacion: f.ajustes?.confirmacion || "Hemos recibido tu respuesta.", otraRespuesta: true, vista: true };
    else res = await api(`/api/f/${enlace}`, { metodo: "POST", datos: { valores } });
    borrarBorrador();
    final(res);
  } catch (err) {
    boton.disabled = false;
    boton.replaceChildren("Enviar respuestas", icono("enviar"));
    if (err.campo && f.preguntas.some((p) => p.id === err.campo)) {
      const i = paginas.findIndex((pag) => pag.some((p) => p.id === err.campo));
      if (i !== pagina) { pagina = i; pintarPagina(-1); }
      const t = raiz.querySelector(`.pregunta[data-id="${err.campo}"]`);
      marcarError(t, err.message);
      t.scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (err.campo === "cerrado" || err.campo === "repetida") {
      cerrado(err.message);
    } else {
      avisar(err.message, { accion: "Reintentar", alPulsar: () => boton.click() });
    }
  }
}

// Al enviar, la tarjeta final aparece con unas ondas que se abren desde arriba.
function final(res) {
  const tarjeta = h("section.cabecera", { tabindex: "-1" },
    h("h1.titulo-gota", f.titulo),
    h("p", res.confirmacion),
    res.vista ? h("p", h("strong", "Era una vista previa: "), "esta respuesta no se ha guardado.") : null,
    h("div.final__acciones",
      res.otraRespuesta ? h("button.boton.boton--suave", { type: "button", onclick: () => { valores = {}; pagina = 0; montar(); } }, "Enviar otra respuesta") : null));
  const envoltura = h("div.final", tarjeta);
  raiz.replaceChildren(envoltura);
  window.scrollTo({ top: 0 });
  tarjeta.focus({ preventScroll: true });
  if (reducido()) return;
  for (let i = 0; i < 3; i++) {
    const onda = h("span.final__onda");
    envoltura.append(onda);
    onda.animate([{ opacity: 0.8, transform: "scale(.2)" }, { opacity: 0, transform: `scale(${5 + i * 3}, ${1.6 + i})` }],
      { duration: 900, delay: 120 + i * 140, easing: "cubic-bezier(.23, 1, .32, 1)", fill: "forwards" }).finished.then(() => onda.remove());
  }
  [...tarjeta.querySelectorAll("h1, p, .final__acciones")].forEach((el, i) => entrar(el, { retraso: 200 + i * 70, y: 8 }));
}

function cerrado(mensaje) {
  raiz.replaceChildren(
    h("header.cabecera", h("h1.cabecera__titulo.titulo-gota", f.titulo), f.descripcion ? h("p.cabecera__descripcion", f.descripcion) : null),
    h("section.pregunta", h("p.pregunta__titulo", mensaje)));
}

function montar() {
  raiz.removeAttribute("aria-busy");
  if (!f.preguntas) return cerrado(f.mensaje);
  paginas = partir(f.preguntas);
  pagina = Math.min(pagina, paginas.length - 1);
  gota = h("div.gota-marca", { style: { opacity: 0 } });
  const barra = f.ajustes?.progreso !== false && contestables().length > 1
    ? h("div.hilo.cristal", { "aria-hidden": "true" }, h("div.hilo__tubo", hilo = h("div.hilo__agua")), h("span.hilo__texto"))
    : (hilo = null);
  raiz.replaceChildren(...[
    vista ? h("p.cristal", { style: { padding: "var(--e3) var(--e5)", borderRadius: "var(--pastilla)", fontSize: "var(--t-s)" } }, h("strong", "Vista previa. "), "Así lo ve quien responde; lo que envíes aquí no se guarda.") : null,
    barra, cabecera(), h("div.paginas", { style: { display: "grid", gap: "inherit" } }), gota,
    h("p.pie-legal", "Hecho con sforms. Lo que envíes le llega solo a quien creó el formulario. ", h("a", { href: "/privacidad.html" }, "Privacidad"))].filter(Boolean));
  pintarPagina(0);
  window.addEventListener("resize", () => seguirGota(document.activeElement?.closest?.(".pregunta")));
}

async function cargar() {
  try {
    f = await api(`/api/f/${encodeURIComponent(enlace)}${pideVista ? "?vista=1" : ""}`);
    vista = !!f.vistaPrevia;
  } catch (err) {
    raiz.removeAttribute("aria-busy");
    raiz.replaceChildren(h("header.cabecera", h("h1.cabecera__titulo.titulo-gota", err.estado === 404 ? "Este formulario no existe" : "No se ha podido abrir"),
      h("p.cabecera__descripcion", err.estado === 404 ? "Puede que lo hayan borrado o que el enlace esté incompleto. Pide a quien te lo mandó que lo revise." : err.message)));
    return;
  }
  document.documentElement.dataset.color = f.color;
  document.title = `${f.titulo} · sforms`;
  const b = f.preguntas && leerBorrador();
  if (b && Object.keys(b.valores || {}).length) {
    const ids = new Set(f.preguntas.map((p) => p.id));
    valores = Object.fromEntries(Object.entries(b.valores).filter(([k]) => ids.has(k)));
    pagina = b.pagina || 0;
  }
  montar();
  if (b && Object.keys(valores).length) avisar("Hemos recuperado lo que dejaste a medias.", { accion: "Empezar de cero", alPulsar: () => { valores = {}; pagina = 0; borrarBorrador(); montar(); } });
}

cargar();
