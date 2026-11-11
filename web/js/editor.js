// El editor de un formulario: pestañas Preguntas · Respuestas · Ajustes, con autoguardado.
import { api, h, icono, avisar, abrirMenu, dialogo, plural, entrar, salir, flip, moverGota, reducido, autoAltura } from "./util.js";
import { TIPOS, tipo, COLORES, VALIDACIONES, CON_OPCIONES, SIN_RESPUESTA, nuevaPregunta, cambiarTipo, nuevoId, campoRespuesta } from "./tipos.js";
import { pintarRespuestas } from "./respuestas.js";

let st = null;          // estado del formulario abierto

// ================= abrir, cerrar, guardar =================

export async function abrirEditor(raiz, id, pestana, { nueva, barra }) {
  if (nueva || !st || st.id !== id) {
    cerrarEditor();
    raiz.replaceChildren(barra(h("span.barra__hueco")), h("main#contenido.editor-carga", h("div.esqueleto", { style: { height: "180px" } }), h("div.esqueleto", { style: { height: "140px" } })));
    let f;
    try {
      f = await api(`/api/formularios/${id}`);
    } catch (err) {
      raiz.replaceChildren(barra(), h("main#contenido.portada", h("div.vacio.vacio--grande", h("h1.titulo-gota", "No se puede abrir"), h("p", err.message), h("a.boton", { href: "#/" }, icono("atras"), "Volver a tus formularios"))));
      return;
    }
    st = { id, f, raiz, barra, activa: "cabecera", sucio: false, temporizador: null, guardando: null, pestana: null, respuestas: null };
    window.addEventListener("beforeunload", avisarSinGuardar);
    window.addEventListener("resize", recolocar);
    montar();
  }
  cambiarPestana(pestana);
}

export function cerrarEditor() {
  if (!st) return;
  if (st.sucio) guardarYa();
  window.removeEventListener("beforeunload", avisarSinGuardar);
  window.removeEventListener("resize", recolocar);
  st = null;
}

function avisarSinGuardar(e) {
  if (st?.sucio || st?.guardando) { e.preventDefault(); e.returnValue = ""; }
}

function cambio({ inmediato = false } = {}) {
  st.sucio = true;
  marcarGuardado("guardando");
  clearTimeout(st.temporizador);
  st.temporizador = setTimeout(guardarYa, inmediato ? 0 : 700);
}

async function guardarYa() {
  if (!st || !st.sucio) return;
  const s = st;
  clearTimeout(s.temporizador);
  if (s.guardando) { await s.guardando; if (!s.sucio) return; }
  s.sucio = false;
  const datos = { titulo: s.f.titulo, color: s.f.color, contenido: s.f.contenido };
  s.guardando = api(`/api/formularios/${s.id}`, { metodo: "PUT", datos })
    .then(() => { if (st === s && !s.sucio) marcarGuardado("ok"); })
    .catch((err) => {
      s.sucio = true;
      if (st === s) {
        marcarGuardado("error");
        avisar(`No se ha guardado: ${err.message}`, { accion: "Reintentar", alPulsar: guardarYa, ms: 8000 });
      }
    })
    .finally(() => { s.guardando = null; });
  await s.guardando;
}

function marcarGuardado(que) {
  const el = st?.raiz.querySelector(".guardado");
  if (!el) return;
  el.dataset.estado = que;
  el.replaceChildren(...{
    guardando: [h("span.guardado__punto"), "Guardando…"],
    ok: [icono("check"), "Guardado"],
    error: [icono("aviso"), h("button", { type: "button", onclick: guardarYa }, "Sin guardar · reintentar")],
  }[que]);
}

// ================= estructura =================

function montar() {
  const { f, raiz, barra } = st;
  document.documentElement.dataset.color = f.color;
  const paleta = h("button.icono-boton", { type: "button", "aria-label": "Color del formulario", title: "Color", "aria-haspopup": "menu", "aria-expanded": "false" }, icono("paleta"));
  paleta.addEventListener("click", () => menuColor(paleta));
  const titulo = h("span.barra__titulo", f.titulo);
  raiz.replaceChildren(
    barra(
      h("a.icono-boton", { href: "#/", "aria-label": "Volver a tus formularios", title: "Tus formularios" }, icono("atras")),
      h("div.barra__doc", titulo, h("span.guardado", { "data-estado": "ok", role: "status" }, icono("check"), "Guardado")),
      h("span.barra__hueco"),
      paleta,
      h("a.icono-boton.solo-ancho", { href: `/f/${f.enlace}?vista=1`, target: "_blank", rel: "noopener", "aria-label": "Vista previa (se abre en otra pestaña)", title: "Vista previa" }, icono("ojo")),
      h("button.boton.boton--primario.boton--pequeno", { type: "button", onclick: dialogoEnviar }, icono("enviar"), h("span.solo-ancho", "Enviar"))),
    pestanas(),
    h("main#contenido.editor"));
}

function pestanas() {
  const n = st.f.respuestas;
  const nav = h("nav.pestanas.cristal", { "aria-label": "Partes del formulario" },
    h("span.pestanas__gota", { "aria-hidden": "true" }),
    h("a.pestana", { href: `#/f/${st.id}`, "data-p": "preguntas" }, "Preguntas"),
    h("a.pestana", { href: `#/f/${st.id}/respuestas`, "data-p": "respuestas" }, "Respuestas", h("span.pestana__cuenta.cifra", { hidden: !n }, n)),
    h("a.pestana", { href: `#/f/${st.id}/ajustes`, "data-p": "ajustes" }, "Ajustes"));
  return nav;
}

export function actualizarCuenta(n) {
  if (!st) return;
  st.f.respuestas = n;
  const c = st.raiz.querySelector(".pestana__cuenta");
  if (c) { c.textContent = n; c.hidden = !n; }
}

function moverGotaPestana(primera) {
  const nav = st.raiz.querySelector(".pestanas");
  const activa = nav.querySelector("[aria-current='page']");
  const gota = nav.querySelector(".pestanas__gota");
  if (!activa) return;
  const x = activa.offsetLeft, w = activa.offsetWidth;
  const antes = gota._x;
  gota._x = x;
  gota.style.width = `${w}px`;
  gota.style.transform = `translateX(${x}px)`;
  if (primera || antes === undefined || reducido()) return;
  gota.animate([
    { transform: `translateX(${antes}px)` },
    { transform: `translateX(${antes + (x - antes) * 0.6}px) scaleY(.8)`, offset: 0.5 },
    { transform: `translateX(${x}px) scaleY(1.06)`, offset: 0.85 },
    { transform: `translateX(${x}px)` },
  ], { duration: 460, easing: "cubic-bezier(.23, 1, .32, 1)" });
}

function cambiarPestana(p) {
  if (!st) return;
  const anterior = st.pestana;
  st.pestana = p;
  st.raiz.querySelectorAll(".pestana").forEach((a) => { if (a.dataset.p === p) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  moverGotaPestana(!anterior);
  const main = st.raiz.querySelector("main");
  document.title = `${st.f.titulo} · sforms`;
  const orden = ["preguntas", "respuestas", "ajustes"];
  const dir = anterior ? Math.sign(orden.indexOf(p) - orden.indexOf(anterior)) : 0;
  if (p === "preguntas") pintarPreguntas(main);
  else if (p === "respuestas") pintarRespuestas(main, st, { actualizarCuenta, guardarAceptando, dialogoEnviar });
  else pintarAjustes(main);
  if (dir && !reducido()) main.animate([{ opacity: 0, transform: `translateX(${dir * 24}px)` }, { opacity: 1, transform: "none" }], { duration: 280, easing: "cubic-bezier(.23, 1, .32, 1)" });
}

// ================= color y enviar =================

function menuColor(boton) {
  const fila = h("div.colores", { role: "radiogroup", "aria-label": "Color del formulario" },
    COLORES.map((c) => h("button.color", {
      type: "button", role: "radio", "aria-checked": String(c.id === st.f.color), "data-color": c.id, title: c.nombre, "aria-label": c.nombre,
      onclick: (e) => {
        st.f.color = c.id;
        document.documentElement.dataset.color = c.id;
        fila.querySelectorAll(".color").forEach((b) => b.setAttribute("aria-checked", String(b === e.currentTarget)));
        if (!reducido()) e.currentTarget.animate([{ transform: "scale(1)" }, { transform: "scale(1.25, .8)" }, { transform: "scale(.92, 1.1)" }, { transform: "none" }], { duration: 420 });
        cambio({ inmediato: true });
      },
    }, h("span.color__muestra"))));
  abrirMenu(boton, [h("div.menu__cabeza", h("strong", "Color del formulario"), h("span", "Lo ve también quien responde.")), fila]);
}

async function guardarAceptando(valor) {
  await api(`/api/formularios/${st.id}`, { metodo: "PUT", datos: { aceptando: valor } });
  st.f.aceptando = valor;
}

function dialogoEnviar() {
  const url = `${location.origin}/f/${st.f.enlace}`;
  const entrada = h("input.entrada", { value: url, readonly: true, "aria-label": "Enlace del formulario", onfocus: (e) => e.target.select() });
  const copiar = h("button.boton.boton--primario", {
    type: "button", onclick: async () => {
      try { await navigator.clipboard.writeText(url); copiar.replaceChildren(icono("check"), "Copiado"); setTimeout(() => copiar.replaceChildren(icono("copiar"), "Copiar"), 1800); }
      catch { entrada.select(); }
    },
  }, icono("copiar"), "Copiar");
  const interruptor = h("input", { type: "checkbox", checked: st.f.aceptando, onchange: async (e) => {
    try { await guardarAceptando(e.target.checked); aviso.hidden = e.target.checked; }
    catch (err) { e.target.checked = !e.target.checked; avisar(err.message); }
  } });
  const aviso = h("p.aviso-cerrado", { hidden: st.f.aceptando }, icono("aviso"), "Está cerrado: quien abra el enlace verá el mensaje de cerrado.");
  const texto = encodeURIComponent(`${st.f.titulo}: ${url}`);
  dialogo({
    titulo: "Comparte tu formulario",
    cuerpo: h("div", { style: { display: "grid", gap: "var(--e4)" } },
      h("p", { style: { color: "var(--tinta-2)" } }, "Quien tenga el enlace puede responder. No necesita cuenta."),
      h("div.enlace-fila", entrada, copiar),
      h("div.compartir",
        h("a.boton.boton--suave.boton--pequeno", { href: `https://wa.me/?text=${texto}`, target: "_blank", rel: "noopener" }, "WhatsApp"),
        h("a.boton.boton--suave.boton--pequeno", { href: `mailto:?subject=${encodeURIComponent(st.f.titulo)}&body=${texto}` }, "Correo"),
        h("a.boton.boton--suave.boton--pequeno", { href: url, target: "_blank", rel: "noopener" }, icono("abrir"), "Abrir")),
      h("label.interruptor", interruptor, h("span.interruptor__canal"), "Aceptando respuestas"),
      aviso),
    botones: [{ texto: "Hecho", clase: "boton--tinta" }],
  });
}

// ================= preguntas =================

function pintarPreguntas(main) {
  const { f } = st;
  const columna = h("div.columna.editor__columna");
  st.gota = h("div.gota-marca", { style: { opacity: 0 } });
  st.herramientas = h("div.herramientas.cristal", { role: "toolbar", "aria-label": "Añadir al formulario" },
    h("button.icono-boton", { type: "button", title: "Añadir pregunta", "aria-label": "Añadir pregunta", onclick: () => anadir("unica") }, icono("mas")),
    h("button.icono-boton", { type: "button", title: "Añadir título y texto", "aria-label": "Añadir título y texto", onclick: () => anadir("texto") }, icono("texto")),
    h("button.icono-boton", { type: "button", title: "Añadir sección (parte el formulario en páginas)", "aria-label": "Añadir sección", onclick: () => anadir("seccion") }, icono("seccion")));
  columna.append(st.gota, tarjetaCabecera(), ...f.contenido.preguntas.map((p) => tarjeta(p)), st.herramientas);
  main.replaceChildren(columna, h("div.editor__aire"));
  if (!f.contenido.preguntas.length) columna.append(h("p.vacio.editor__vacio", "Sin preguntas todavía. Pulsa ", icono("mas"), " para añadir la primera."));
  [...columna.querySelectorAll(".tarjeta")].forEach((t, i) => entrar(t, { retraso: Math.min(i, 8) * 40, y: 12 }));
  requestAnimationFrame(() => recolocar(true));
  columna.addEventListener("pointerdown", (e) => {
    const t = e.target.closest(".tarjeta");
    if (t && t.dataset.id !== st.activa && !e.target.closest(".tarjeta__asa")) activar(t.dataset.id, { foco: !e.target.closest("input, textarea, select, button") });
  });
  columna.addEventListener("focusin", (e) => {
    const t = e.target.closest(".tarjeta");
    if (t && t.dataset.id !== st.activa) activar(t.dataset.id, { foco: false });
  });
  ordenable(columna);
}

const preguntas = () => st.f.contenido.preguntas;
const indice = (id) => preguntas().findIndex((p) => p.id === id);
const tarjetaDe = (id) => st.raiz.querySelector(`.tarjeta[data-id="${id}"]`);

function recolocar(primera = false) {
  if (!st?.gota || !st.gota.isConnected) return;
  const t = tarjetaDe(st.activa);
  if (!t) { st.gota.style.opacity = "0"; return; }
  moverGota(st.gota, t.offsetTop + 16, t.offsetHeight - 32, { primera: primera === true });
  const ancho = matchMedia("(min-width: 900px)").matches;
  const y = ancho ? Math.max(0, t.offsetTop) : 0;
  if (ancho) {
    const antes = st.herramientas._y;
    st.herramientas._y = y;
    st.herramientas.style.transform = `translateY(${y}px)`;
    if (antes !== undefined && antes !== y && !reducido() && primera !== true) {
      st.herramientas.animate([{ transform: `translateY(${antes}px)` }, { transform: `translateY(${y}px)` }], { duration: 420, easing: "cubic-bezier(.23, 1, .32, 1)" });
    }
  } else {
    st.herramientas.style.transform = "";
  }
}

function activar(id, { foco = true } = {}) {
  const antes = st.activa;
  st.activa = id;
  if (antes && antes !== id) repintar(antes);
  repintar(id);
  recolocar();
  if (foco) {
    const t = tarjetaDe(id);
    t?.querySelector(".tarjeta__titulo-edit, .cabecera__titulo-edit")?.focus({ preventScroll: true });
  }
}

function repintar(id) {
  const vieja = tarjetaDe(id);
  if (!vieja) return;
  const p = id === "cabecera" ? null : preguntas()[indice(id)];
  if (id !== "cabecera" && !p) return;
  const nueva = id === "cabecera" ? tarjetaCabecera() : tarjeta(p);
  vieja.replaceWith(nueva);
  requestAnimationFrame(recolocar);
}

// ---------- cabecera ----------
function tarjetaCabecera() {
  const { f } = st;
  const activa = st.activa === "cabecera";
  const titulo = h("textarea.cabecera__titulo-edit.titulo-gota", { rows: 1, maxlength: 200, "aria-label": "Título del formulario", placeholder: "Título del formulario", value: f.titulo });
  titulo.addEventListener("input", () => {
    f.titulo = titulo.value.replace(/\n/g, " ");
    st.raiz.querySelector(".barra__titulo").textContent = f.titulo || "Formulario sin título";
    document.title = `${f.titulo || "Formulario sin título"} · sforms`;
    cambio();
  });
  titulo.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); desc.focus(); } });
  autoAltura(titulo);
  const desc = h("textarea.cabecera__desc-edit", { rows: 1, maxlength: 4000, "aria-label": "Descripción del formulario", placeholder: "Descripción: para qué es, cuánto se tarda, qué pasará con las respuestas…", value: f.contenido.descripcion });
  desc.addEventListener("input", () => { f.contenido.descripcion = desc.value; cambio(); });
  autoAltura(desc);
  return h(`header.cabecera.tarjeta${activa ? ".tarjeta--activa" : ""}`, { "data-id": "cabecera" }, titulo, desc);
}

// ---------- una pregunta ----------
function tarjeta(p) {
  const activa = st.activa === p.id;
  const n = indice(p.id);
  const seccion = p.tipo === "seccion";
  const numSeccion = seccion ? preguntas().slice(0, n + 1).filter((q) => q.tipo === "seccion").length + (preguntas()[0]?.tipo === "seccion" ? 0 : 1) : 0;
  const totalSecciones = preguntas().filter((q) => q.tipo === "seccion").length + (preguntas()[0]?.tipo === "seccion" ? 0 : 1);
  const asa = h("button.tarjeta__asa", { type: "button", "aria-label": `Mover «${p.titulo || "pregunta"}». Usa las flechas arriba y abajo.`, title: "Arrastra para mover" }, icono("asa"));
  asa.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); mover(p.id, e.key === "ArrowUp" ? -1 : 1, { foco: true }); }
  });
  const clase = `article.tarjeta.pregunta${seccion ? ".pregunta--seccion" : ""}${activa ? ".tarjeta--activa" : ""}`;
  const etiqueta = seccion ? h("span.seccion-etiqueta", `Parte ${numSeccion} de ${totalSecciones}`) : null;
  if (!activa) {
    return h(clase, { "data-id": p.id, "data-tipo": p.tipo }, etiqueta, asa,
      h(`h3#t-${p.id}.pregunta__titulo`, p.titulo || h("span.sin-titulo", SIN_RESPUESTA.includes(p.tipo) ? (seccion ? "Sección sin título" : "Texto sin título") : "Pregunta sin título"), p.obligatoria ? h("span.obligatoria", " *") : null),
      p.ayuda ? h("p.pregunta__ayuda", p.ayuda) : null,
      SIN_RESPUESTA.includes(p.tipo) ? null : h("div.pregunta__campo", campoRespuesta(p, undefined, { vistaPrevia: true })));
  }

  const titulo = h("textarea.tarjeta__titulo-edit", { rows: 1, maxlength: 500, placeholder: seccion ? "Título de la sección" : p.tipo === "texto" ? "Título" : "Pregunta", "aria-label": "Texto de la pregunta", value: p.titulo });
  titulo.addEventListener("input", () => { p.titulo = titulo.value; cambio(); });
  titulo.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && CON_OPCIONES.includes(p.tipo)) { e.preventDefault(); st.raiz.querySelector(`.tarjeta[data-id="${p.id}"] .opcion-edit input`)?.focus(); }
  });
  autoAltura(titulo);
  const verAyuda = p.ayuda !== "" || p._ayuda || SIN_RESPUESTA.includes(p.tipo);
  const ayuda = verAyuda ? h("textarea.tarjeta__ayuda-edit", { rows: 1, maxlength: 2000, placeholder: SIN_RESPUESTA.includes(p.tipo) ? "Descripción (opcional)" : "Descripción o pista para quien responde", "aria-label": "Descripción", value: p.ayuda }) : null;
  if (ayuda) { ayuda.addEventListener("input", () => { p.ayuda = ayuda.value; cambio(); }); autoAltura(ayuda); }

  let selector = null;
  if (!SIN_RESPUESTA.includes(p.tipo)) {
    const t = tipo(p.tipo);
    selector = h("button.selector-tipo", { type: "button", "aria-haspopup": "listbox", "aria-expanded": "false", "aria-label": `Tipo de pregunta: ${t.nombre}` }, icono(t.icono), h("span", t.nombre), icono("abajo", "selector-tipo__flecha"));
    selector.addEventListener("click", () => abrirMenu(selector, TIPOS.map((x) => x === "linea" ? "linea" : {
      texto: x.nombre, icono: x.icono, marcado: x.id === p.tipo,
      alPulsar: () => {
        if (x.id === p.tipo) return;
        preguntas()[indice(p.id)] = cambiarTipo(p, x.id);
        cambio();
        repintar(p.id);
      },
    }), { rol: "listbox" }));
  }

  const pie = h("footer.tarjeta__pie",
    h("button.icono-boton", { type: "button", title: "Duplicar", "aria-label": "Duplicar", onclick: () => duplicar(p.id) }, icono("copiar")),
    h("button.icono-boton", { type: "button", title: "Borrar", "aria-label": "Borrar", onclick: () => quitar(p.id) }, icono("papelera")),
    !SIN_RESPUESTA.includes(p.tipo) ? [
      h("span.tarjeta__separador"),
      h("label.interruptor", h("input", { type: "checkbox", checked: p.obligatoria, onchange: (e) => { p.obligatoria = e.target.checked; cambio(); } }), h("span.interruptor__canal"), "Obligatoria"),
    ] : null,
    masOpciones(p));

  return h(clase, { "data-id": p.id, "data-tipo": p.tipo }, etiqueta, asa,
    h("div.tarjeta__fila", titulo, selector),
    ayuda,
    SIN_RESPUESTA.includes(p.tipo) ? null : h("div.tarjeta__cuerpo", editorDeTipo(p)),
    pie);
}

function masOpciones(p) {
  const b = h("button.icono-boton", { type: "button", "aria-label": "Más opciones", title: "Más opciones", "aria-haspopup": "menu", "aria-expanded": "false" }, icono("puntos"));
  b.addEventListener("click", () => {
    const n = indice(p.id);
    const items = [];
    if (!SIN_RESPUESTA.includes(p.tipo)) {
      const con = p.ayuda !== "" || p._ayuda;
      items.push({ texto: con ? "Quitar la descripción" : "Añadir descripción", icono: "parrafo", alPulsar: () => { if (con) { p.ayuda = ""; p._ayuda = false; cambio(); } else p._ayuda = true; repintar(p.id); requestAnimationFrame(() => tarjetaDe(p.id)?.querySelector(".tarjeta__ayuda-edit")?.focus()); } });
    }
    if (p.tipo === "varias") items.push({ texto: p._limite || p.minimo || p.maximo ? "Quitar el límite de elecciones" : "Limitar cuántas se eligen", icono: "varias", alPulsar: () => { if (p._limite || p.minimo || p.maximo) { p.minimo = 0; p.maximo = 0; p._limite = false; cambio(); } else p._limite = true; repintar(p.id); } });
    if (items.length) items.push("linea");
    items.push({ texto: "Subir", icono: "arriba", alPulsar: () => mover(p.id, -1) });
    items.push({ texto: "Bajar", icono: "abajo", alPulsar: () => mover(p.id, 1) });
    if (n === 0) items.splice(items.findIndex((i) => i.texto === "Subir"), 1);
    if (n === preguntas().length - 1) items.splice(items.findIndex((i) => i.texto === "Bajar"), 1);
    abrirMenu(b, items);
  });
  return b;
}

// ---------- el cuerpo de cada tipo ----------
function editorDeTipo(p) {
  if (CON_OPCIONES.includes(p.tipo)) return editorOpciones(p);
  if (p.tipo === "corta") {
    return h("div.tipo-corta",
      h("div.falsa-linea", "Texto de respuesta corta"),
      h("label.ajuste-linea", h("span", "Validar como"),
        h("select.entrada.entrada--pequena", { onchange: (e) => { p.validacion = e.target.value; cambio(); } },
          VALIDACIONES.map((v) => h("option", { value: v.id, selected: v.id === p.validacion }, v.nombre)))));
  }
  if (p.tipo === "parrafo") return h("div.falsa-linea.falsa-linea--larga", "Texto de respuesta larga");
  if (p.tipo === "escala") {
    const desde = h("select.entrada.entrada--pequena", { "aria-label": "Empieza en", onchange: (e) => { p.desde = Number(e.target.value); cambio(); repintar(p.id); } }, [0, 1].map((n) => h("option", { value: n, selected: n === p.desde }, n)));
    const hasta = h("select.entrada.entrada--pequena", { "aria-label": "Acaba en", onchange: (e) => { p.hasta = Number(e.target.value); cambio(); repintar(p.id); } }, [2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => h("option", { value: n, selected: n === p.hasta }, n)));
    const etiqueta = (clave, n) => h("label.ajuste-linea", h("span.cifra", n), h("input.entrada.entrada--linea", { placeholder: "Etiqueta (opcional)", maxlength: 60, value: p[clave], oninput: (e) => { p[clave] = e.target.value; cambio(); } }));
    return h("div.tipo-escala", h("div.ajuste-linea", desde, h("span", "a"), hasta), etiqueta("etiquetaDesde", p.desde), etiqueta("etiquetaHasta", p.hasta));
  }
  if (p.tipo === "valoracion") {
    return h("div.tipo-valoracion",
      campoRespuesta(p, undefined, { vistaPrevia: true }),
      h("label.ajuste-linea", h("span", "Puntos"), h("select.entrada.entrada--pequena", { onchange: (e) => { p.maximo = Number(e.target.value); cambio(); repintar(p.id); } },
        [3, 4, 5, 6, 7, 8, 9, 10].map((n) => h("option", { value: n, selected: n === p.maximo }, n)))));
  }
  if (p.tipo === "fecha") return h("div.falsa-linea", icono("fecha"), "Día, mes y año");
  if (p.tipo === "hora") return h("div.falsa-linea", icono("hora"), "Hora");
  return null;
}

function marcaOpcion(p, i) {
  if (p.tipo === "desplegable") return h("span.marca-num.cifra", `${i + 1}.`);
  return h(`span.opcion__marca${p.tipo === "varias" ? ".opcion__marca--caja" : ""}`, { "aria-hidden": "true" });
}

function editorOpciones(p) {
  const lista = h("ol.opciones-edit", { "aria-label": "Opciones" });
  const fila = (texto, i) => {
    const entrada = h("input.entrada.entrada--linea", { value: texto, maxlength: 300, "aria-label": `Opción ${i + 1}` });
    entrada.addEventListener("input", () => { p.opciones[i] = entrada.value; cambio(); });
    entrada.addEventListener("blur", () => {
      // Una opción vacía o repetida se rellena con su número, como hace el formulario al guardar.
      if (!entrada.value.trim()) { entrada.value = `Opción ${i + 1}`; p.opciones[i] = entrada.value; cambio(); }
    });
    entrada.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); nuevaOpcion(i + 1); }
      if (e.key === "Backspace" && !entrada.value && p.opciones.length > 1) { e.preventDefault(); quitarOpcion(i, true); }
      if (e.key === "ArrowDown") lista.querySelectorAll("input")[i + 1]?.focus();
      if (e.key === "ArrowUp") lista.querySelectorAll("input")[i - 1]?.focus();
    });
    entrada.addEventListener("paste", (e) => {
      // Pegar una lista (una opción por línea) crea todas las opciones de golpe.
      const lineas = e.clipboardData.getData("text").split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, "").trim()).filter(Boolean);
      if (lineas.length < 2) return;
      e.preventDefault();
      p.opciones.splice(i, 1, ...(entrada.value.trim() ? [entrada.value, ...lineas] : lineas));
      cambio();
      repintar(p.id);
      avisar(`${lineas.length} opciones pegadas`);
    });
    return h("li.opcion-edit", { "data-i": i },
      h("button.opcion-edit__asa", { type: "button", tabindex: -1, "aria-hidden": "true", title: "Arrastra para ordenar" }, icono("asa")),
      marcaOpcion(p, i), entrada,
      p.opciones.length > 1 ? h("button.icono-boton.icono-boton--pequeno", { type: "button", "aria-label": `Quitar la opción ${i + 1}`, title: "Quitar", onclick: () => quitarOpcion(i) }, icono("x")) : h("span.hueco-44"));
  };
  const nuevaOpcion = (en) => {
    if (p.opciones.length >= 100) return avisar("Como mucho 100 opciones.");
    let n = p.opciones.length + 1;
    while (p.opciones.includes(`Opción ${n}`)) n++;
    p.opciones.splice(en, 0, `Opción ${n}`);
    cambio();
    repintar(p.id);
    const nuevo = tarjetaDe(p.id)?.querySelectorAll(".opcion-edit input")[en];
    if (nuevo) { nuevo.focus(); nuevo.select(); entrar(nuevo.closest("li"), { y: -6, escala: 1 }); }
  };
  const quitarOpcion = async (i, enfocar) => {
    const li = lista.children[i];
    p.opciones.splice(i, 1);
    cambio();
    await salir(li, { duracion: 120 });
    repintar(p.id);
    if (enfocar) requestAnimationFrame(() => tarjetaDe(p.id)?.querySelectorAll(".opcion-edit input")[Math.max(0, i - 1)]?.focus());
  };
  p.opciones.forEach((o, i) => lista.append(fila(o, i)));
  ordenableOpciones(lista, p);
  const partes = [lista];
  if (p.otro) {
    partes.push(h("div.opcion-edit.opcion-edit--otro", h("span.hueco-asa"), marcaOpcion(p, 0), h("span.falsa-linea", "Otro…"),
      h("button.icono-boton.icono-boton--pequeno", { type: "button", "aria-label": "Quitar «Otro»", title: "Quitar", onclick: () => { p.otro = false; cambio(); repintar(p.id); } }, icono("x"))));
  }
  partes.push(h("div.opcion-edit.opcion-edit--nueva", h("span.hueco-asa"), marcaOpcion(p, p.opciones.length),
    h("button.anadir-opcion", { type: "button", onclick: () => nuevaOpcion(p.opciones.length) }, "Añadir opción"),
    p.tipo !== "desplegable" && !p.otro ? [h("span", { style: { color: "var(--tinta-3)" } }, " o "), h("button.anadir-opcion.anadir-opcion--otro", { type: "button", onclick: () => { p.otro = true; cambio(); repintar(p.id); } }, "añadir «Otro»")] : null));
  if (p.tipo === "varias" && (p._limite || p.minimo || p.maximo)) {
    const sel = (clave, etq) => h("label.ajuste-linea", h("span", etq), h("select.entrada.entrada--pequena", { onchange: (e) => { p[clave] = Number(e.target.value); if (p.maximo && p.minimo > p.maximo) p.minimo = p.maximo; cambio(); } },
      h("option", { value: 0, selected: !p[clave] }, clave === "minimo" ? "Sin mínimo" : "Sin tope"),
      p.opciones.map((_, i) => h("option", { value: i + 1, selected: p[clave] === i + 1 }, i + 1))));
    partes.push(h("div.limite-eleccion", sel("minimo", "Mínimo"), sel("maximo", "Máximo")));
  }
  return h("div", partes);
}

// ---------- añadir, duplicar, borrar, mover ----------
function anadir(t) {
  const lista = preguntas();
  if (lista.length >= 200) return avisar("Como mucho 200 preguntas en un formulario.");
  const actual = indice(st.activa);
  const p = nuevaPregunta(t);
  const en = actual === -1 ? lista.length : actual + 1;
  lista.splice(en, 0, p);
  cambio();
  insertarTarjeta(p, en);
}

function insertarTarjeta(p, en) {
  const columna = st.raiz.querySelector(".editor__columna");
  columna.querySelector(".editor__vacio")?.remove();
  const antes = st.activa;
  st.activa = p.id;
  if (antes) repintar(antes);
  const t = tarjeta(p);
  const siguiente = preguntas()[en + 1];
  columna.insertBefore(t, siguiente ? tarjetaDe(siguiente.id) : st.herramientas);
  if (p.tipo === "seccion") renumerarSecciones();
  entrar(t, { y: 18, escala: 0.95, duracion: 340 });
  recolocar();
  t.querySelector(".tarjeta__titulo-edit")?.focus({ preventScroll: true });
  const r = t.getBoundingClientRect();
  if (r.bottom > innerHeight - 80 || r.top < 80) t.scrollIntoView({ behavior: reducido() ? "auto" : "smooth", block: "center" });
}

function renumerarSecciones() {
  preguntas().filter((q) => q.tipo === "seccion").forEach((q) => { if (q.id !== st.activa) repintar(q.id); });
}

function duplicar(id) {
  const i = indice(id);
  const copia = JSON.parse(JSON.stringify(preguntas()[i]));
  copia.id = nuevoId();
  preguntas().splice(i + 1, 0, copia);
  cambio();
  insertarTarjeta(copia, i + 1);
}

async function quitar(id) {
  const i = indice(id);
  const [p] = preguntas().splice(i, 1);
  cambio();
  const t = tarjetaDe(id);
  const siguiente = preguntas()[i] || preguntas()[i - 1];
  st.activa = siguiente ? siguiente.id : "cabecera";
  await salir(t);
  repintar(st.activa);
  if (p.tipo === "seccion") renumerarSecciones();
  recolocar();
  avisar(p.tipo === "seccion" ? "Sección borrada" : "Pregunta borrada", {
    accion: "Deshacer", ms: 6000,
    alPulsar: () => {
      if (!st) return;
      const en = Math.min(i, preguntas().length);
      preguntas().splice(en, 0, p);
      cambio();
      insertarTarjeta(p, en);
    },
  });
}

function mover(id, paso, { foco = false } = {}) {
  const lista = preguntas();
  const i = indice(id);
  const j = i + paso;
  if (j < 0 || j >= lista.length) return;
  reordenar(i, j);
  if (foco) tarjetaDe(id)?.querySelector(".tarjeta__asa")?.focus();
}

function reordenar(desde, hasta) {
  if (desde === hasta) return;
  const lista = preguntas();
  const [p] = lista.splice(desde, 1);
  lista.splice(hasta, 0, p);
  cambio();
  const columna = st.raiz.querySelector(".editor__columna");
  flip(() => [...columna.querySelectorAll(".tarjeta")], () => {
    const t = tarjetaDe(p.id);
    const sig = lista[hasta + 1];
    columna.insertBefore(t, sig ? tarjetaDe(sig.id) : st.herramientas);
  });
  if (lista.some((q) => q.tipo === "seccion")) lista.filter((q) => q.tipo === "seccion").forEach((q) => repintar(q.id));
  requestAnimationFrame(recolocar);
}

// Arrastrar tarjetas por el asa: la tarjeta sigue al dedo y las demás se apartan.
function ordenable(columna) {
  columna.addEventListener("pointerdown", (e) => {
    const asa = e.target.closest(".tarjeta__asa");
    if (!asa || e.button !== 0) return;
    const t = asa.closest(".tarjeta");
    const id = t.dataset.id;
    e.preventDefault();
    const todas = [...columna.querySelectorAll(".tarjeta.pregunta")];
    const desde = todas.indexOf(t);
    const rects = todas.map((x) => x.getBoundingClientRect());
    const hueco = (rects[1]?.top ?? rects[0].bottom + 16) - (rects[0].bottom);
    const alto = rects[desde].height + Math.max(12, hueco);
    const y0 = e.clientY;
    let hasta = desde;
    let movido = false;
    t.setPointerCapture(e.pointerId);
    const mueve = (ev) => {
      const dy = ev.clientY - y0;
      if (!movido && Math.abs(dy) < 4) return;
      if (!movido) { movido = true; t.classList.add("tarjeta--arrastrando"); columna.classList.add("editor__columna--ordenando"); st.gota.style.opacity = "0"; }
      t.style.transform = `translateY(${dy}px) scale(1.015)`;
      const centro = rects[desde].top + rects[desde].height / 2 + dy;
      hasta = desde;
      rects.forEach((r, k) => {
        if (k < desde && centro < r.top + r.height / 2) hasta = Math.min(hasta, k);
        if (k > desde && centro > r.top + r.height / 2) hasta = Math.max(hasta, k);
      });
      todas.forEach((x, k) => {
        if (x === t) return;
        let mov = 0;
        if (desde < hasta && k > desde && k <= hasta) mov = -alto;
        if (desde > hasta && k >= hasta && k < desde) mov = alto;
        x.style.transform = mov ? `translateY(${mov}px)` : "";
      });
      if (ev.clientY < 70) scrollBy(0, -12);
      if (ev.clientY > innerHeight - 70) scrollBy(0, 12);
    };
    const suelta = () => {
      t.removeEventListener("pointermove", mueve);
      t.removeEventListener("pointerup", suelta);
      t.removeEventListener("pointercancel", suelta);
      if (!movido) { if (id !== st.activa) activar(id); return; }
      // Se anima desde donde se soltó hasta su sitio nuevo.
      const soltada = t.getBoundingClientRect();
      todas.forEach((x) => { x.style.transform = ""; });
      t.classList.remove("tarjeta--arrastrando");
      columna.classList.remove("editor__columna--ordenando");
      const i = indice(id);
      const j = i + (hasta - desde);
      if (j !== i) {
        const lista = preguntas();
        const [p] = lista.splice(i, 1);
        lista.splice(j, 0, p);
        cambio();
        const sig = lista[j + 1];
        columna.insertBefore(t, sig ? tarjetaDe(sig.id) : st.herramientas);
        if (lista.some((q) => q.tipo === "seccion")) lista.filter((q) => q.tipo === "seccion" && q.id !== id).forEach((q) => repintar(q.id));
      }
      const final = t.getBoundingClientRect();
      if (!reducido()) t.animate([{ transform: `translateY(${soltada.top - final.top}px) scale(1.015)` }, { transform: "none" }], { duration: 300, easing: "cubic-bezier(.34, 1.3, .64, 1)" });
      if (id !== st.activa) activar(id, { foco: false });
      else setTimeout(recolocar, 320);
      if (t.dataset.tipo === "seccion") repintar(id);
    };
    t.addEventListener("pointermove", mueve);
    t.addEventListener("pointerup", suelta);
    t.addEventListener("pointercancel", suelta);
  });
}

// Lo mismo para las opciones de una lista, dentro de su tarjeta.
function ordenableOpciones(lista, p) {
  lista.addEventListener("pointerdown", (e) => {
    const asa = e.target.closest(".opcion-edit__asa");
    if (!asa || e.button !== 0) return;
    e.preventDefault();
    const li = asa.closest("li");
    const filas = [...lista.children];
    const desde = filas.indexOf(li);
    const rects = filas.map((x) => x.getBoundingClientRect());
    const alto = rects[desde].height;
    const y0 = e.clientY;
    let hasta = desde;
    li.setPointerCapture(e.pointerId);
    li.classList.add("opcion-edit--arrastrando");
    const mueve = (ev) => {
      const dy = ev.clientY - y0;
      li.style.transform = `translateY(${dy}px)`;
      const centro = rects[desde].top + alto / 2 + dy;
      hasta = desde;
      rects.forEach((r, k) => {
        if (k < desde && centro < r.top + r.height / 2) hasta = Math.min(hasta, k);
        if (k > desde && centro > r.top + r.height / 2) hasta = Math.max(hasta, k);
      });
      filas.forEach((x, k) => {
        if (x === li) return;
        let mov = 0;
        if (desde < hasta && k > desde && k <= hasta) mov = -alto;
        if (desde > hasta && k >= hasta && k < desde) mov = alto;
        x.style.transform = mov ? `translateY(${mov}px)` : "";
      });
    };
    const suelta = () => {
      li.removeEventListener("pointermove", mueve);
      li.removeEventListener("pointerup", suelta);
      li.removeEventListener("pointercancel", suelta);
      filas.forEach((x) => { x.style.transform = ""; });
      li.classList.remove("opcion-edit--arrastrando");
      if (hasta !== desde) {
        const [o] = p.opciones.splice(desde, 1);
        p.opciones.splice(hasta, 0, o);
        cambio();
        repintar(p.id);
      }
    };
    li.addEventListener("pointermove", mueve);
    li.addEventListener("pointerup", suelta);
    li.addEventListener("pointercancel", suelta);
  });
}

// ================= ajustes =================

function pintarAjustes(main) {
  const { f } = st;
  const a = f.contenido.ajustes || (f.contenido.ajustes = {});
  const interruptor = (clave, texto, ayuda, defecto = false) => {
    const valor = a[clave] === undefined ? defecto : a[clave];
    return h("div.ajuste",
      h("div.ajuste__texto", h("strong", texto), ayuda ? h("p", ayuda) : null),
      h("label.interruptor", h("input", { type: "checkbox", checked: valor, "aria-label": texto, onchange: (e) => { a[clave] = e.target.checked; cambio({ inmediato: true }); } }), h("span.interruptor__canal")));
  };
  const texto = (clave, titulo, ayuda, defecto) => h("label.ajuste.ajuste--bloque",
    h("div.ajuste__texto", h("strong", titulo), ayuda ? h("p", ayuda) : null),
    h("textarea.entrada", { rows: 2, maxlength: 1000, value: a[clave] || defecto, oninput: (e) => { a[clave] = e.target.value; cambio(); } }));
  const aceptando = h("input", { type: "checkbox", checked: f.aceptando, "aria-label": "Aceptando respuestas", onchange: async (e) => {
    try { await guardarAceptando(e.target.checked); avisar(e.target.checked ? "Abierto: ya se puede responder" : "Cerrado: no entran más respuestas"); }
    catch (err) { e.target.checked = !e.target.checked; avisar(err.message); }
  } });
  const limite = h("input.entrada.entrada--pequena.cifra", { type: "number", min: 0, max: 100000, inputmode: "numeric", value: a.limite || "", placeholder: "Sin límite", "aria-label": "Límite de respuestas",
    oninput: (e) => { a.limite = Math.max(0, Math.min(100000, parseInt(e.target.value, 10) || 0)); cambio(); } });
  const columna = h("div.columna.ajustes",
    h("section.hoja.ajustes__grupo", { "aria-labelledby": "aj-respuestas" },
      h("h2#aj-respuestas.ajustes__titulo", "Respuestas"),
      h("div.ajuste", h("div.ajuste__texto", h("strong", "Aceptando respuestas"), h("p", "Si lo cierras, el enlace sigue funcionando pero enseña el mensaje de cerrado.")), h("label.interruptor", aceptando, h("span.interruptor__canal"))),
      interruptor("unaRespuesta", "Una respuesta por persona", "Se cuenta por navegador: quien vuelva a abrir el enlace en el mismo móvil u ordenador verá que ya respondió."),
      h("div.ajuste", h("div.ajuste__texto", h("strong", "Cerrar al llegar a"), h("p", "Útil para plazas limitadas. Vacío o 0, sin límite.")), h("div.ajuste-linea", limite, h("span", "respuestas")))),
    h("section.hoja.ajustes__grupo", { "aria-labelledby": "aj-presentacion" },
      h("h2#aj-presentacion.ajustes__titulo", "Presentación"),
      interruptor("progreso", "Barra de progreso", "Un hilo arriba que se va llenando según se contesta.", true),
      interruptor("otraRespuesta", "Enlace para enviar otra respuesta", "Al terminar, aparece un botón para empezar de nuevo.", true),
      texto("confirmacion", "Mensaje al enviar", null, "Hemos recibido tu respuesta."),
      texto("cerrado", "Mensaje cuando está cerrado", null, "Este formulario ya no admite respuestas.")),
    h("section.hoja.ajustes__grupo.ajustes__grupo--peligro", { "aria-labelledby": "aj-borrar" },
      h("h2#aj-borrar.ajustes__titulo", "Borrar el formulario"),
      h("div.ajuste", h("div.ajuste__texto", h("p", "Se borran las preguntas, todas las respuestas y el enlace deja de funcionar.")),
        h("button.boton.boton--peligro.boton--pequeno", { type: "button", onclick: borrarFormulario }, icono("papelera"), "Borrar"))));
  main.replaceChildren(columna);
  [...columna.children].forEach((c, i) => entrar(c, { retraso: i * 60 }));
}

async function borrarFormulario() {
  const { borrar } = await import("./app.js");
  const f = { ...st.f };
  st.sucio = false;
  if (await borrar(f)) location.hash = "#/";
}
