// Pestaña Respuestas: resumen con gráficas, una a una, CSV y abrir/cerrar.
import { api, h, icono, avisar, confirmar, plural, entrar, contar, fechaLarga, haceCuanto, reducido } from "./util.js";
import { SIN_RESPUESTA, CON_OPCIONES, campoRespuesta, tipo } from "./tipos.js";

let vista = "resumen";
let indiceUna = 0;

export async function pintarRespuestas(main, st, { actualizarCuenta, guardarAceptando, dialogoEnviar }) {
  main.replaceChildren(h("div.columna", h("div.esqueleto", { style: { height: "160px" } }), h("div.esqueleto", { style: { height: "240px" } })));
  let datos;
  try {
    datos = await api(`/api/formularios/${st.id}/respuestas`);
  } catch (err) {
    main.replaceChildren(h("div.columna", h("p.vacio", err.message)));
    return;
  }
  if (st.pestana !== "respuestas") return;
  const { respuestas } = datos;
  const contenido = st.f.contenido;
  actualizarCuenta(respuestas.length);

  const total = h("span.resumen-cifra__n.cifra", "0");
  const aceptando = h("input", { type: "checkbox", checked: st.f.aceptando, onchange: async (e) => {
    try { await guardarAceptando(e.target.checked); avisar(e.target.checked ? "Abierto: ya se puede responder" : "Cerrado: no entran más respuestas"); }
    catch (err) { e.target.checked = !e.target.checked; avisar(err.message); }
  } });
  const cuerpo = h("div.respuestas__cuerpo");
  const cambiar = h("div.segmentos", { role: "tablist", "aria-label": "Cómo ver las respuestas" },
    ["resumen", "una"].map((v) => h("button.segmento", { type: "button", role: "tab", "aria-selected": String(vista === v), onclick: (e) => {
      vista = v;
      cambiar.querySelectorAll(".segmento").forEach((b) => b.setAttribute("aria-selected", String(b === e.currentTarget)));
      pintarCuerpo();
    } }, v === "resumen" ? [icono("grafica"), "Resumen"] : [icono("lista"), "Una a una"])));

  const cabeza = h("section.hoja.respuestas__cabeza",
    h("div.resumen-cifra", total, h("span.resumen-cifra__texto", respuestas.length === 1 ? "respuesta" : "respuestas"),
      respuestas.length ? h("span.resumen-cifra__ultima", `la última ${haceCuanto(respuestas[respuestas.length - 1].enviada_en)}`) : null),
    h("div.respuestas__acciones",
      h("label.interruptor", aceptando, h("span.interruptor__canal"), "Aceptando respuestas"),
      respuestas.length ? [
        h("a.boton.boton--suave.boton--pequeno", { href: `/api/formularios/${st.id}/respuestas.csv`, download: "" }, icono("descargar"), "Descargar CSV"),
        h("button.icono-boton", { type: "button", title: "Borrar todas las respuestas", "aria-label": "Borrar todas las respuestas", onclick: borrarTodas }, icono("papelera")),
      ] : null),
    respuestas.length ? cambiar : null);

  main.replaceChildren(h("div.columna.respuestas", cabeza, cuerpo));
  contar(total, respuestas.length);
  entrar(cabeza);
  pintarCuerpo();

  async function borrarTodas() {
    if (!(await confirmar({ titulo: "¿Borrar todas las respuestas?", texto: `Se borran las ${plural(respuestas.length, "respuesta", "respuestas")}. Las preguntas no se tocan. No se puede deshacer. Si las quieres guardar, descarga antes el CSV.`, si: "Borrar todas" }))) return;
    try {
      await api(`/api/formularios/${st.id}/respuestas`, { metodo: "DELETE" });
      avisar("Respuestas borradas");
      pintarRespuestas(main, st, { actualizarCuenta, guardarAceptando, dialogoEnviar });
    } catch (err) { avisar(err.message); }
  }

  function pintarCuerpo() {
    if (!respuestas.length) {
      cuerpo.replaceChildren(h("section.hoja.vacio.vacio--grande",
        h("div.vacio__charco", { "aria-hidden": "true" }, h("span"), h("span"), h("span")),
        h("h2.titulo-gota", "Aún no ha caído ninguna"),
        h("p", st.f.aceptando ? "Comparte el enlace y las respuestas irán apareciendo aquí, con sus gráficas." : "El formulario está cerrado. Ábrelo para empezar a recibir respuestas."),
        st.f.aceptando ? h("button.boton.boton--primario", { type: "button", onclick: dialogoEnviar }, icono("enviar"), "Compartir el enlace") : null));
      return;
    }
    if (vista === "resumen") resumen(cuerpo, contenido, respuestas);
    else una(cuerpo, st, contenido, respuestas, (rid) => {
      const i = respuestas.findIndex((r) => r.id === rid);
      respuestas.splice(i, 1);
      actualizarCuenta(respuestas.length);
      total.textContent = respuestas.length;
      if (!respuestas.length) pintarRespuestas(main, st, { actualizarCuenta, guardarAceptando, dialogoEnviar });
      else pintarCuerpo();
    });
  }
}

// ================= resumen =================

const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const texto = (v) => (typeof v === "object" && v !== null ? String(v.otro || "") : String(v));

function resumen(cuerpo, contenido, respuestas) {
  const tarjetas = [];
  const ids = new Set();
  for (const p of contenido.preguntas) {
    if (SIN_RESPUESTA.includes(p.tipo)) continue;
    ids.add(p.id);
    const valores = respuestas.map((r) => r.valores[p.id]).filter((v) => v !== undefined && v !== null && v !== "");
    tarjetas.push(h("section.hoja.grafico", { "aria-labelledby": `r-${p.id}` },
      h("header.grafico__cabeza",
        h(`h3#r-${p.id}.grafico__titulo`, p.titulo || "Pregunta sin título"),
        h("p.grafico__sub", icono(tipo(p.tipo).icono), `${plural(valores.length, "respuesta", "respuestas")}`, valores.length < respuestas.length ? ` · ${respuestas.length - valores.length} en blanco` : "")),
      valores.length ? cuerpoResumen(p, valores) : h("p.sin-respuesta", "Nadie ha contestado a esta pregunta todavía.")));
  }
  // Respuestas a preguntas que ya no existen: no se pierden, se avisa.
  const huerfanas = new Set(respuestas.flatMap((r) => Object.keys(r.valores)).filter((k) => !ids.has(k)));
  if (huerfanas.size) tarjetas.push(h("p.nota", icono("aviso"), `Hay respuestas a ${plural(huerfanas.size, "pregunta que ya has borrado", "preguntas que ya has borrado")}. Siguen en el CSV.`));
  cuerpo.replaceChildren(...tarjetas);
  tarjetas.forEach((t, i) => entrar(t, { retraso: Math.min(i, 6) * 60, y: 14 }));
  llenarBarras(cuerpo);
}

function cuerpoResumen(p, valores) {
  if (CON_OPCIONES.includes(p.tipo)) {
    const cuentas = new Map(p.opciones.map((o) => [o, 0]));
    const otros = [];
    let personas = 0;
    for (const v of valores) {
      personas++;
      for (const x of [].concat(v)) {
        if (typeof x === "object") { otros.push(x.otro); continue; }
        cuentas.set(x, (cuentas.get(x) || 0) + 1);     // opciones que ya no están siguen contando
      }
    }
    const filas = [...cuentas.entries()].map(([nombre, n]) => ({ nombre, n }));
    if (otros.length) filas.push({ nombre: "Otro", n: otros.length });
    return [barras(filas, personas, p.tipo === "varias"),
      otros.length ? listaTextos(otros, "Lo que escribieron en «Otro»") : null];
  }
  if (p.tipo === "escala" || p.tipo === "valoracion") {
    const desde = p.tipo === "escala" ? p.desde : 1;
    const hasta = p.tipo === "escala" ? p.hasta : p.maximo;
    const columnas = [];
    for (let n = desde; n <= hasta; n++) columnas.push({ nombre: String(n), n: valores.filter((v) => v === n).length });
    const media = valores.reduce((a, b) => a + b, 0) / valores.length;
    return [
      h("p.media", h("span.media__n.cifra", media.toLocaleString("es-ES", { maximumFractionDigits: 1 })), h("span", `de media, sobre ${hasta}`),
        p.tipo === "escala" && (p.etiquetaDesde || p.etiquetaHasta) ? h("span.media__escala", `${desde} = ${p.etiquetaDesde || "—"} · ${hasta} = ${p.etiquetaHasta || "—"}`) : null),
      columnasGrafico(columnas, valores.length),
    ];
  }
  if (p.tipo === "fecha" || p.tipo === "hora") {
    const cuentas = new Map();
    for (const v of valores) cuentas.set(v, (cuentas.get(v) || 0) + 1);
    const filas = [...cuentas.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([v, n]) => ({
      nombre: p.tipo === "fecha" ? new Date(v + "T12:00").toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : v, n,
    }));
    const mostradas = filas.slice(0, 8);
    return [barras(mostradas, valores.length, false), filas.length > 8 ? h("p.grafico__sub", `Y ${plural(filas.length - 8, "valor más", "valores más")} con menos respuestas (en el CSV).`) : null];
  }
  return listaTextos(valores.map(texto));
}

// Barras horizontales: una sola serie, en el color del formulario. El valor va en la punta.
function barras(filas, total, varias) {
  const max = Math.max(1, ...filas.map((f) => f.n));
  const lista = h("ul.barras", { role: "list" });
  for (const f of filas) {
    const p = pct(f.n, total);
    lista.append(h("li.barra-fila", { tabindex: 0, "data-tip": `${f.nombre}: ${plural(f.n, "respuesta", "respuestas")} (${p} %)` },
      h("span.barra-fila__nombre", f.nombre),
      h("span.barra-fila__pista", h("span.barra-fila__barra", { style: { "--v": f.n / max } })),
      h("span.barra-fila__valor.cifra", h("strong", f.n), ` · ${p} %`)));
  }
  return h("div", lista, varias ? h("p.grafico__nota", "Se podía elegir más de una: los porcentajes son sobre quienes contestaron y pueden sumar más de 100.") : null);
}

// Columnas para escalas y valoraciones: un valor por columna, la cifra encima.
function columnasGrafico(cols, total) {
  const max = Math.max(1, ...cols.map((c) => c.n));
  return h("div.columnas", { role: "list", style: { "--n": cols.length } },
    cols.map((c) => h("div.columna-g", { role: "listitem", tabindex: 0, "data-tip": `${c.nombre}: ${plural(c.n, "respuesta", "respuestas")} (${pct(c.n, total)} %)` },
      h("span.columna-g__valor.cifra", c.n || ""),
      h("span.columna-g__pista", h("span.columna-g__barra", { style: { "--v": c.n / max } })),
      h("span.columna-g__eje.cifra", c.nombre))));
}

function listaTextos(textos, titulo) {
  const MOSTRAR = 5;
  const ul = h("ul.textos");
  const pintar = (todas) => ul.replaceChildren(...(todas ? textos : textos.slice(-MOSTRAR)).slice().reverse().map((t) => h("li", t)));
  pintar(false);
  const mas = textos.length > MOSTRAR ? h("button.boton.boton--fantasma.boton--pequeno", { type: "button", onclick: () => { pintar(true); mas.remove(); } }, `Ver las ${textos.length}`) : null;
  return h("div.textos-bloque", titulo ? h("p.grafico__sub", titulo) : null, ul, mas);
}

// Las barras se llenan como agua al entrar en pantalla.
function llenarBarras(cuerpo) {
  tooltip(cuerpo);
  const llenas = cuerpo.querySelectorAll(".barra-fila__barra, .columna-g__barra");
  if (reducido() || !("IntersectionObserver" in window)) { llenas.forEach((b) => b.classList.add("lleno")); return; }
  const obs = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue;
      e.target.querySelectorAll(".barra-fila__barra, .columna-g__barra").forEach((b, i) => setTimeout(() => b.classList.add("lleno"), i * 50));
      obs.unobserve(e.target);
    }
  }, { threshold: 0.2 });
  cuerpo.querySelectorAll(".grafico").forEach((g) => obs.observe(g));
}

// Una etiqueta que sigue al ratón (o al foco) sobre cada barra o columna.
function tooltip(cuerpo) {
  let tip = document.querySelector(".tip");
  if (!tip) { tip = h("div.tip", { role: "tooltip", hidden: true }); document.body.append(tip); }
  const mostrar = (el, x, y) => {
    tip.textContent = el.dataset.tip;
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    tip.style.left = `${Math.min(innerWidth - r.width - 8, Math.max(8, x - r.width / 2))}px`;
    tip.style.top = `${Math.max(8, y - r.height - 12)}px`;
  };
  cuerpo.addEventListener("pointermove", (e) => {
    const el = e.target.closest("[data-tip]");
    if (el && e.pointerType === "mouse") mostrar(el, e.clientX, e.clientY); else tip.hidden = true;
  });
  cuerpo.addEventListener("pointerleave", () => { tip.hidden = true; });
  cuerpo.addEventListener("focusin", (e) => {
    const el = e.target.closest("[data-tip]");
    if (!el) return;
    const r = el.getBoundingClientRect();
    mostrar(el, r.left + r.width / 2, r.top);
  });
  cuerpo.addEventListener("focusout", () => { tip.hidden = true; });
  window.addEventListener("scroll", () => { tip.hidden = true; }, { passive: true });
}

// ================= una a una =================

function una(cuerpo, st, contenido, respuestas, alBorrar) {
  indiceUna = Math.min(Math.max(0, indiceUna), respuestas.length - 1);
  const r = respuestas[indiceUna];
  const ir = (paso) => {
    indiceUna = (indiceUna + paso + respuestas.length) % respuestas.length;
    una(cuerpo, st, contenido, respuestas, alBorrar);
    if (!reducido()) cuerpo.querySelector(".una__hojas").animate([{ opacity: 0, transform: `translateX(${paso * 24}px)` }, { opacity: 1, transform: "none" }], { duration: 260, easing: "cubic-bezier(.23, 1, .32, 1)" });
  };
  const n = h("input.entrada.entrada--pequena.cifra", { type: "number", min: 1, max: respuestas.length, value: indiceUna + 1, "aria-label": "Número de respuesta",
    onchange: (e) => { const v = Math.max(1, Math.min(respuestas.length, parseInt(e.target.value, 10) || 1)); indiceUna = v - 1; una(cuerpo, st, contenido, respuestas, alBorrar); } });
  const barra = h("div.hoja.una__barra",
    h("button.icono-boton", { type: "button", "aria-label": "Respuesta anterior", onclick: () => ir(-1) }, icono("atras")),
    h("span.una__pos", n, h("span.cifra", `de ${respuestas.length}`)),
    h("button.icono-boton", { type: "button", "aria-label": "Respuesta siguiente", onclick: () => ir(1) }, icono("adelante")),
    h("span.una__fecha", `Enviada el ${fechaLarga(r.enviada_en)}`),
    h("span.barra__hueco"),
    h("button.icono-boton", { type: "button", "aria-label": "Borrar esta respuesta", title: "Borrar esta respuesta", onclick: async () => {
      if (!(await confirmar({ titulo: "¿Borrar esta respuesta?", texto: `La respuesta ${indiceUna + 1}, enviada el ${fechaLarga(r.enviada_en)}. No se puede deshacer.` }))) return;
      try { await api(`/api/formularios/${st.id}/respuestas/${r.id}`, { metodo: "DELETE" }); avisar("Respuesta borrada"); alBorrar(r.id); }
      catch (err) { avisar(err.message); }
    } }, icono("papelera")));
  const hojas = h("div.una__hojas", contenido.preguntas.map((p) => {
    if (p.tipo === "seccion" || p.tipo === "texto") return p.tipo === "seccion" ? h("h3.una__seccion.titulo-gota", p.titulo || "Sección") : null;
    return h("section.pregunta", h(`h3#t-${p.id}.pregunta__titulo`, p.titulo || "Pregunta sin título"), h("div.pregunta__campo", campoRespuesta(p, r.valores[p.id], { soloLectura: true })));
  }));
  cuerpo.replaceChildren(barra, hojas);
}

