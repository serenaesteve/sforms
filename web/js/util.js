// Utilidades compartidas por el panel y la página de responder.

export const reducido = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- API ----------
export class ErrorApi extends Error {
  constructor(estado, mensaje, campo) { super(mensaje); this.estado = estado; this.campo = campo; }
}

export async function api(ruta, { metodo = "GET", datos } = {}) {
  let r;
  try {
    r = await fetch(ruta, {
      method: metodo,
      headers: { "X-Sforms": "1", ...(datos !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: datos !== undefined ? JSON.stringify(datos) : undefined,
      credentials: "same-origin",
    });
  } catch {
    throw new ErrorApi(0, "No hay conexión. Revisa la red y vuelve a intentarlo.");
  }
  let cuerpo = null;
  try { cuerpo = await r.json(); } catch { /* sin cuerpo */ }
  if (!r.ok) throw new ErrorApi(r.status, cuerpo?.error || "Algo ha fallado en el servidor.", cuerpo?.campo);
  return cuerpo;
}

// ---------- DOM ----------
// h("button.boton.boton--primario", { onclick, type: "button" }, "Texto", otroNodo)
export function h(sel, props, ...hijos) {
  const [etq, ...clases] = sel.split(".");
  const [nombre, id] = etq.split("#");
  const el = document.createElement(nombre || "div");
  if (id) el.id = id;
  if (clases.length) el.className = clases.join(" ");
  if (props !== null && props !== undefined && (typeof props !== "object" || props instanceof Node || Array.isArray(props))) { hijos.unshift(props); props = null; }
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k === "style" && typeof v === "object") {
      for (const [prop, val] of Object.entries(v)) {
        if (prop.startsWith("--")) el.style.setProperty(prop, val); else el.style[prop] = val;
      }
    }
    else if (k === "value" || k === "checked" || k === "selected" || k === "disabled" || k === "textContent") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const hijo of hijos.flat(Infinity)) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    el.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return el;
}

// ---------- iconos (trazo propio, 24×24, mismo grosor) ----------
const TRAZOS = {
  mas: "M12 5v14M5 12h14",
  x: "M6 6l12 12M18 6 6 18",
  atras: "M15 18l-6-6 6-6",
  adelante: "m9 18 6-6-6-6",
  abajo: "m6 9 6 6 6-6",
  arriba: "m18 15-6-6-6 6",
  copiar: "M9 9h10v10H9zM5 15V5h10",
  papelera: "M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3",
  puntos: "M12 5.5h.01M12 12h.01M12 18.5h.01",
  asa: "M8 9h.01M12 9h.01M16 9h.01M8 15h.01M12 15h.01M16 15h.01",
  ojo: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  enviar: "M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z",
  enlace: "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7",
  paleta: "M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.9 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8ZM7.5 11h.01M10 7.5h.01M14.5 7.5h.01",
  descargar: "M12 4v11M7 10l5 5 5-5M5 20h14",
  check: "m5 12.5 4.5 4.5L19 7.5",
  aviso: "M12 8v5M12 16.5h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  corta: "M4 9h16M4 15h10",
  parrafo: "M4 6h16M4 10h16M4 14h16M4 18h10",
  unica: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  varias: "M4 4h16v16H4zM8 12l3 3 5-6",
  desplegable: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM8 10.5l4 4 4-4",
  escala: "M3 17h18M6 17v-3M10 17v-5M14 17v-7M18 17v-9",
  valoracion: "M2 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0M9 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0M16 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0",
  fecha: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  hora: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v5l3 2",
  seccion: "M4 5h16M4 19h16M4 12h7M15 12h5",
  texto: "M5 6V5h14v1M12 5v14M9 19h6",
  lupa: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4-4",
  salir: "M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10",
  luna: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z",
  sol: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  usuario: "M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4 21a8 8 0 0 1 16 0",
  candado: "M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3",
  abrir: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  lista: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  grafica: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  ajustes: "M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6",
  mover: "M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4",
};

export function icono(nombre, clase = "") {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", `icono ${clase}`.trim());
  svg.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", TRAZOS[nombre] || TRAZOS.puntos);
  svg.append(p);
  return svg;
}

// ---------- avisos ----------
let tostadas;
export function avisar(texto, { accion, alPulsar, ms = 4200 } = {}) {
  if (!tostadas) {
    tostadas = h("div.tostadas", { role: "status", "aria-live": "polite" });
    document.body.append(tostadas);
  }
  const t = h("div.tostada", h("span", texto));
  let quitada = false;
  const quitar = () => {
    if (quitada) return;
    quitada = true;
    t.dataset.saliendo = "";
    setTimeout(() => t.remove(), reducido() ? 0 : 180);
  };
  if (accion) t.append(h("button", { type: "button", onclick: () => { alPulsar?.(); quitar(); } }, accion));
  tostadas.append(t);
  setTimeout(quitar, ms);
  return quitar;
}

// ---------- menú emergente anclado a un botón ----------
let menuAbierto = null;
export function cerrarMenu() {
  if (!menuAbierto) return;
  const { el, boton, alCerrar } = menuAbierto;
  menuAbierto = null;
  boton?.setAttribute("aria-expanded", "false");
  el.dataset.saliendo = "";
  setTimeout(() => el.remove(), reducido() ? 0 : 140);
  document.removeEventListener("pointerdown", fueraDelMenu, true);
  document.removeEventListener("keydown", teclaMenu, true);
  alCerrar?.();
}
function fueraDelMenu(e) {
  if (menuAbierto && !menuAbierto.el.contains(e.target) && !menuAbierto.boton?.contains(e.target)) cerrarMenu();
}
function teclaMenu(e) {
  if (!menuAbierto) return;
  const items = [...menuAbierto.el.querySelectorAll(".menu__item:not([disabled])")];
  const i = items.indexOf(document.activeElement);
  if (e.key === "Escape") { e.preventDefault(); const b = menuAbierto.boton; cerrarMenu(); b?.focus(); }
  else if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
  else if (e.key === "Tab") cerrarMenu();
}

// items: [{ texto, icono, alPulsar, peligro, marcado }] | "linea" | Node
export function abrirMenu(boton, items, { rol = "menu", alCerrar, ancho } = {}) {
  if (menuAbierto?.boton === boton) { cerrarMenu(); return; }
  cerrarMenu();
  const el = h("div.menu", { role: rol });
  if (ancho) el.style.minWidth = ancho;
  for (const it of items) {
    if (it === "linea") { el.append(h("div.menu__linea", { role: "separator" })); continue; }
    if (it instanceof Node) { el.append(it); continue; }
    el.append(h(`button.menu__item${it.peligro ? ".menu__item--peligro" : ""}`, {
      type: "button", role: rol === "listbox" ? "option" : (it.marcado !== undefined ? "menuitemradio" : "menuitem"),
      "aria-checked": it.marcado !== undefined && rol !== "listbox" ? String(!!it.marcado) : undefined,
      "aria-selected": rol === "listbox" ? String(!!it.marcado) : undefined,
      onclick: () => { cerrarMenu(); it.alPulsar?.(); },
    }, it.icono ? (it.icono instanceof Node ? it.icono : icono(it.icono)) : null, h("span", it.texto)));
  }
  document.body.append(el);
  const r = boton.getBoundingClientRect();
  const m = el.getBoundingClientRect();
  const abajo = r.bottom + 6 + m.height < innerHeight || r.top < m.height;
  let izq = r.right - m.width;
  if (izq < 12) izq = Math.min(r.left, innerWidth - m.width - 12);
  izq = Math.max(12, izq);
  el.style.left = `${izq}px`;
  el.style.top = `${abajo ? r.bottom + 6 : Math.max(12, r.top - 6 - m.height)}px`;
  el.style.setProperty("--origen", `${r.left + r.width / 2 - izq}px ${abajo ? "0" : "100%"}`);
  boton.setAttribute("aria-expanded", "true");
  menuAbierto = { el, boton, alCerrar };
  document.addEventListener("pointerdown", fueraDelMenu, true);
  document.addEventListener("keydown", teclaMenu, true);
  (el.querySelector("[aria-selected='true'], [aria-checked='true']") || el.querySelector(".menu__item"))?.focus({ preventScroll: true });
  return el;
}

// ---------- diálogos ----------
export function dialogo({ titulo, cuerpo, botones = [], alCerrar }) {
  const d = h("dialog.dialogo", { "aria-labelledby": "dlg-titulo" });
  const pie = h("div.dialogo__pie");
  const cerrar = (valor) => {
    if (!d.open) return;
    d.dataset.saliendo = "";
    setTimeout(() => { d.close(); d.remove(); alCerrar?.(valor); }, reducido() ? 0 : 160);
  };
  for (const b of botones) {
    pie.append(h(`button.boton${b.clase ? "." + b.clase : ""}`, {
      type: "button", onclick: async (e) => {
        if (!b.alPulsar) return cerrar(b.valor);
        const boton = e.currentTarget;
        boton.disabled = true;
        try { if ((await b.alPulsar(boton)) !== false) cerrar(b.valor); } finally { boton.disabled = false; }
      },
    }, b.texto));
  }
  d.append(h("div.dialogo__cuerpo", h("h2#dlg-titulo.titulo-gota", titulo), cuerpo), botones.length ? pie : null);
  d.addEventListener("cancel", (e) => { e.preventDefault(); cerrar(null); });
  d.addEventListener("click", (e) => { if (e.target === d) cerrar(null); });
  document.body.append(d);
  d.showModal();
  return { el: d, cerrar };
}

export function confirmar({ titulo, texto, si = "Borrar", peligro = true }) {
  return new Promise((resolver) => {
    dialogo({
      titulo, cuerpo: h("p", { style: { color: "var(--tinta-2)" } }, texto),
      botones: [{ texto: "Cancelar", clase: "boton--fantasma", valor: false }, { texto: si, clase: peligro ? "boton--peligro" : "boton--primario", valor: true }],
      alCerrar: (v) => resolver(!!v),
    });
  });
}

// ---------- tiempo ----------
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];
export function fechaSbd(t) { return t ? new Date(t.replace(" ", "T")) : null; }
export function haceCuanto(t) {
  const d = fechaSbd(t);
  if (!d) return "";
  const s = (Date.now() - d) / 1000;
  if (s < 60) return "ahora mismo";
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  if (s < 86400 * 2) return "ayer";
  if (s < 86400 * 7) return `hace ${Math.round(s / 86400)} días`;
  return `${d.getDate()} ${MESES[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? " " + d.getFullYear() : ""}`;
}
export function fechaLarga(t) {
  const d = fechaSbd(t);
  return d ? `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : "";
}
export function plural(n, uno, varios) { return `${n.toLocaleString("es-ES")} ${n === 1 ? uno : varios}`; }

// ---------- movimiento ----------
// FLIP: mide, cambia el DOM, y anima desde donde estaba cada pieza.
export function flip(elementos, cambiar, { duracion = 320 } = {}) {
  const antes = new Map(elementos().map((el) => [el, el.getBoundingClientRect()]));
  cambiar();
  if (reducido()) return;
  for (const el of elementos()) {
    const a = antes.get(el);
    if (!a) continue;
    const d = el.getBoundingClientRect();
    const dy = a.top - d.top, dx = a.left - d.left;
    if (Math.abs(dy) < 1 && Math.abs(dx) < 1) continue;
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: duracion, easing: "cubic-bezier(.23, 1, .32, 1)" });
  }
}

export function entrar(el, { y = 10, escala = 0.97, duracion = 280, retraso = 0 } = {}) {
  if (reducido()) return;
  el.animate([{ opacity: 0, transform: `translateY(${y}px) scale(${escala})` }, { opacity: 1, transform: "none" }],
    { duration: duracion, delay: retraso, easing: "cubic-bezier(.23, 1, .32, 1)", fill: "backwards" });
}

export function salir(el, { duracion = 180 } = {}) {
  if (reducido()) { el.remove(); return Promise.resolve(); }
  const alto = el.offsetHeight;
  el.style.overflow = "hidden";
  return el.animate([
    { opacity: 1, transform: "none", height: `${alto}px` },
    { opacity: 0, transform: "scale(.96)", height: `${alto}px`, offset: 0.6 },
    { opacity: 0, transform: "scale(.96)", height: "0px", marginTop: "0px", marginBottom: "0px", paddingTop: "0px", paddingBottom: "0px" },
  ], { duration: duracion + 120, easing: "cubic-bezier(.55, 0, 1, .45)" }).finished.then(() => el.remove());
}

// La gota que marca: se desplaza hasta el destino y se estira por el camino, como un líquido.
export function moverGota(gota, top, alto, { primera = false } = {}) {
  const anterior = gota._pos;
  gota._pos = { top, alto };
  gota.style.height = `${alto}px`;
  gota.style.transform = `translateY(${top}px)`;
  gota.style.opacity = "1";
  if (primera || !anterior || reducido()) return;
  const salto = top - anterior.top;
  if (Math.abs(salto) < 2 && Math.abs(alto - anterior.alto) < 2) return;
  const estirado = Math.min(1.6, 1 + Math.abs(salto) / 900);
  gota.animate([
    { transform: `translateY(${anterior.top}px)`, height: `${anterior.alto}px` },
    { transform: `translateY(${anterior.top + salto * 0.55}px) scaleX(.7)`, height: `${Math.max(alto, anterior.alto) * estirado}px`, offset: 0.45 },
    { transform: `translateY(${top}px) scaleX(1.25)`, height: `${alto * 0.94}px`, offset: 0.8 },
    { transform: `translateY(${top}px)`, height: `${alto}px` },
  ], { duration: 520, easing: "cubic-bezier(.23, 1, .32, 1)" });
}

// Cuenta hacia arriba un número
export function contar(el, hasta, { duracion = 700 } = {}) {
  if (reducido() || hasta < 2) { el.textContent = hasta.toLocaleString("es-ES"); return; }
  const t0 = performance.now();
  const paso = (t) => {
    const p = Math.min(1, (t - t0) / duracion);
    el.textContent = Math.round(hasta * (1 - Math.pow(1 - p, 3))).toLocaleString("es-ES");
    if (p < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

// ---------- tema ----------
export function aplicarTema() {
  let t = null;
  try { t = localStorage.getItem("sforms-tema"); } catch { /* sin almacenamiento */ }
  if (t === "claro" || t === "oscuro") document.documentElement.dataset.tema = t;
  else delete document.documentElement.dataset.tema;
}
export function temaActual() {
  const t = document.documentElement.dataset.tema;
  return t || (matchMedia("(prefers-color-scheme: dark)").matches ? "oscuro" : "claro");
}
export function cambiarTema() {
  const nuevo = temaActual() === "oscuro" ? "claro" : "oscuro";
  try { localStorage.setItem("sforms-tema", nuevo); } catch { /* sin almacenamiento */ }
  aplicarTema();
}

export function autoAltura(ta) {
  const ajustar = () => { ta.style.height = "auto"; ta.style.height = `${ta.scrollHeight + 2}px`; };
  ta.addEventListener("input", ajustar);
  requestAnimationFrame(ajustar);
  return ajustar;
}
