// Tipos de pregunta y su campo de respuesta. Lo usan el editor (vista previa), la página de responder
// y la vista de una respuesta (solo lectura).
import { h, icono, autoAltura } from "./util.js";

export const TIPOS = [
  { id: "corta", nombre: "Respuesta corta", icono: "corta" },
  { id: "parrafo", nombre: "Párrafo", icono: "parrafo" },
  "linea",
  { id: "unica", nombre: "Una opción", icono: "unica" },
  { id: "varias", nombre: "Varias opciones", icono: "varias" },
  { id: "desplegable", nombre: "Desplegable", icono: "desplegable" },
  "linea",
  { id: "escala", nombre: "Escala", icono: "escala" },
  { id: "valoracion", nombre: "Valoración", icono: "valoracion" },
  "linea",
  { id: "fecha", nombre: "Fecha", icono: "fecha" },
  { id: "hora", nombre: "Hora", icono: "hora" },
];
export const tipo = (id) => TIPOS.find((t) => t.id === id) || { id, nombre: id, icono: "corta" };
export const CON_OPCIONES = ["unica", "varias", "desplegable"];
export const SIN_RESPUESTA = ["seccion", "texto"];

export const VALIDACIONES = [
  { id: "ninguna", nombre: "Cualquier texto" },
  { id: "correo", nombre: "Correo" },
  { id: "numero", nombre: "Número" },
  { id: "telefono", nombre: "Teléfono" },
  { id: "url", nombre: "Enlace web" },
];

export const COLORES = [
  { id: "agua", nombre: "Agua" }, { id: "rosa", nombre: "Rosa" }, { id: "lila", nombre: "Lila" },
  { id: "menta", nombre: "Menta" }, { id: "melocoton", nombre: "Melocotón" }, { id: "limon", nombre: "Limón" },
];

export function nuevoId() {
  const a = new Uint8Array(4);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function nuevaPregunta(t = "unica") {
  const base = { id: nuevoId(), tipo: t, titulo: "", ayuda: "" };
  if (SIN_RESPUESTA.includes(t)) return base;
  const p = { ...base, obligatoria: false };
  if (CON_OPCIONES.includes(t)) { p.opciones = ["Opción 1"]; if (t !== "desplegable") p.otro = false; }
  if (t === "varias") { p.minimo = 0; p.maximo = 0; }
  if (t === "corta") p.validacion = "ninguna";
  if (t === "escala") Object.assign(p, { desde: 1, hasta: 5, etiquetaDesde: "", etiquetaHasta: "" });
  if (t === "valoracion") p.maximo = 5;
  return p;
}

// Al cambiar de tipo se conserva lo que tenga sentido (las opciones pasan de un tipo de lista a otro).
export function cambiarTipo(p, t) {
  const n = nuevaPregunta(t);
  n.id = p.id; n.titulo = p.titulo; n.ayuda = p.ayuda;
  if ("obligatoria" in n) n.obligatoria = !!p.obligatoria;
  if (CON_OPCIONES.includes(t) && p.opciones?.length) n.opciones = [...p.opciones];
  if (t !== "desplegable" && "otro" in n) n.otro = !!p.otro;
  return n;
}

const vacia = (v) => v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length) || (typeof v === "object" && !Array.isArray(v) && !String(v.otro ?? "").trim());
export const estaVacia = vacia;

let grupo = 0;

// p: pregunta; valor: lo contestado; alCambiar(valor) si se puede contestar
export function campoRespuesta(p, valor, { alCambiar, soloLectura = false, vistaPrevia = false } = {}) {
  const inerte = soloLectura || vistaPrevia;
  const nombre = `g${++grupo}-${p.id}`;
  const cambiar = (v) => alCambiar?.(v);
  const t = p.tipo;

  if (t === "corta" || t === "parrafo") {
    if (soloLectura) return h("p.respuesta-texto", vacia(valor) ? h("span.sin-respuesta", "Sin respuesta") : String(valor));
    if (t === "parrafo") {
      const ta = h("textarea.entrada.entrada--linea", { rows: 1, placeholder: "Tu respuesta", value: valor || "", disabled: vistaPrevia, "aria-labelledby": `t-${p.id}`, maxlength: 5000, oninput: (e) => cambiar(e.target.value) });
      autoAltura(ta);
      return ta;
    }
    const tipos = { correo: ["email", "email", "email"], numero: ["text", "decimal", "off"], telefono: ["tel", "tel", "tel"], url: ["url", "url", "url"] };
    const [type, inputmode, autocomplete] = tipos[p.validacion] || ["text", "text", "on"];
    return h("input.entrada.entrada--linea", { type, inputmode, autocomplete, placeholder: "Tu respuesta", value: valor || "", disabled: vistaPrevia, "aria-labelledby": `t-${p.id}`, maxlength: 500, oninput: (e) => cambiar(e.target.value) });
  }

  if (t === "unica" || t === "varias") {
    const varias = t === "varias";
    const elegidas = varias ? (Array.isArray(valor) ? valor : []) : (valor === undefined || valor === null ? [] : [valor]);
    const otro = elegidas.find((v) => typeof v === "object");
    const lista = h("div.opciones", { role: varias ? "group" : "radiogroup", "aria-labelledby": `t-${p.id}` });
    const leer = () => {
      const marcadas = [...lista.querySelectorAll("input[data-opcion]:checked")].map((i) => i.dataset.opcion === "\u0000otro" ? { otro: lista.querySelector(".opcion__otro-texto")?.value || "" } : i.dataset.opcion);
      cambiar(varias ? marcadas : marcadas[0]);
    };
    for (const o of p.opciones || []) {
      lista.append(h("label.opcion", h("input", { type: varias ? "checkbox" : "radio", name: nombre, "data-opcion": o, checked: elegidas.includes(o), disabled: inerte, onchange: leer }),
        h(`span.opcion__marca${varias ? ".opcion__marca--caja" : ""}`, varias ? icono("check") : null), h("span.opcion__texto", o)));
    }
    if (p.otro) {
      const caja = h("input", { type: varias ? "checkbox" : "radio", name: nombre, "data-opcion": "\u0000otro", checked: !!otro, disabled: inerte, onchange: leer, "aria-label": "Otro" });
      const texto = h("input.entrada.entrada--linea.opcion__otro-texto", {
        type: "text", value: otro?.otro || "", disabled: inerte, maxlength: 500, "aria-label": "Escribe otra respuesta", placeholder: soloLectura ? "" : "Escribe aquí",
        oninput: () => { caja.checked = true; leer(); },
      });
      lista.append(h("label.opcion.opcion--otro", caja, h(`span.opcion__marca${varias ? ".opcion__marca--caja" : ""}`, varias ? icono("check") : null), h("span.opcion__texto", "Otro:"), texto));
    }
    if (!varias && !inerte && !p.obligatoria) {
      const quitar = h("button.quitar-eleccion", { type: "button", hidden: !elegidas.length, onclick: () => { lista.querySelectorAll("input").forEach((i) => { if (i.type === "radio") i.checked = false; }); cambiar(undefined); quitar.hidden = true; } }, "Quitar la elección");
      lista.addEventListener("change", () => { quitar.hidden = !lista.querySelector("input:checked"); });
      return h("div", lista, quitar);
    }
    if (soloLectura && !elegidas.length) lista.append(h("span.sin-respuesta", "Sin respuesta"));
    return lista;
  }

  if (t === "desplegable") {
    if (soloLectura) return h("p.respuesta-texto", vacia(valor) ? h("span.sin-respuesta", "Sin respuesta") : String(valor));
    const s = h("select.entrada.entrada--desplegable", { disabled: vistaPrevia, "aria-labelledby": `t-${p.id}`, onchange: (e) => cambiar(e.target.value || undefined) },
      h("option", { value: "" }, "Elige una opción"),
      (p.opciones || []).map((o) => h("option", { value: o, selected: o === valor }, o)));
    return s;
  }

  if (t === "escala") {
    const fila = h("div.escala", { role: "radiogroup", "aria-labelledby": `t-${p.id}` });
    const valores = [];
    for (let n = p.desde; n <= p.hasta; n++) valores.push(n);
    fila.style.setProperty("--n", valores.length);
    const puntos = h("div.escala__puntos");
    for (const n of valores) {
      puntos.append(h("label.escala__punto", h("input", { type: "radio", name: nombre, value: n, checked: valor === n, disabled: inerte, onchange: () => cambiar(n) }), h("span", n)));
    }
    fila.append(p.etiquetaDesde ? h("span.escala__etiqueta", p.etiquetaDesde) : h("span.escala__etiqueta"), puntos, p.etiquetaHasta ? h("span.escala__etiqueta.escala__etiqueta--fin", p.etiquetaHasta) : h("span.escala__etiqueta"));
    return fila;
  }

  if (t === "valoracion") {
    const fila = h("div.valoracion", { role: "radiogroup", "aria-labelledby": `t-${p.id}` });
    const pintar = (hasta) => fila.querySelectorAll(".punto").forEach((g, i) => g.classList.toggle("punto--lleno", i < hasta));
    for (let n = 1; n <= p.maximo; n++) {
      const l = h("label.valoracion__punto", { title: `${n} de ${p.maximo}` },
        h("input", { type: "radio", name: nombre, value: n, checked: valor === n, disabled: inerte, "aria-label": `${n} de ${p.maximo}`, onchange: () => { cambiar(n); pintar(n); l.querySelector(".punto").animate?.([{ transform: "scale(1)" }, { transform: "scale(1.25, .85)" }, { transform: "scale(.95, 1.08)" }, { transform: "none" }], { duration: 420, easing: "ease-out" }); } }),
        h(`span.punto${typeof valor === "number" && n <= valor ? ".punto--lleno" : ""}`, { "aria-hidden": "true" }));
      if (!inerte) {
        l.addEventListener("pointerenter", () => pintar(n));
        l.addEventListener("pointerleave", () => pintar(Number(fila.querySelector("input:checked")?.value || 0)));
      }
      fila.append(l);
    }
    if (soloLectura) fila.append(h("span.valoracion__cifra", typeof valor === "number" ? `${valor} de ${p.maximo}` : "Sin respuesta"));
    return fila;
  }

  if (t === "fecha" || t === "hora") {
    if (soloLectura) {
      let txt = valor;
      if (t === "fecha" && valor) txt = new Date(valor + "T12:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
      return h("p.respuesta-texto", vacia(valor) ? h("span.sin-respuesta", "Sin respuesta") : txt);
    }
    return h("input.entrada.entrada--fecha", { type: t === "fecha" ? "date" : "time", value: valor || "", disabled: vistaPrevia, "aria-labelledby": `t-${p.id}`, oninput: (e) => cambiar(e.target.value || undefined) });
  }
  return h("span");
}

// Comprobación en el navegador (el servidor vuelve a comprobarlo todo)
export function errorDe(p, v) {
  if (SIN_RESPUESTA.includes(p.tipo)) return null;
  if (vacia(v) || (typeof v === "string" && !v.trim())) return p.obligatoria ? "Esta pregunta es obligatoria." : null;
  if (p.tipo === "corta") {
    const s = String(v).trim();
    if (p.validacion === "correo" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) return "Escribe un correo con @ y dominio, como nombre@ejemplo.es.";
    if (p.validacion === "numero" && !/^-?\d+(?:[.,]\d+)?$/.test(s)) return "Aquí va un número (por ejemplo, 12 o 3,5).";
    if (p.validacion === "telefono" && !/^\+?[\d\s().-]{6,20}$/.test(s)) return "Ese teléfono no parece válido.";
    if (p.validacion === "url" && !/^https?:\/\/\S+\.\S+$/i.test(s)) return "Escribe la dirección entera, empezando por https://";
  }
  if (p.tipo === "varias" && Array.isArray(v)) {
    const n = v.filter((x) => typeof x === "string" || String(x.otro || "").trim()).length;
    if (p.minimo && n < p.minimo) return `Elige ${p.minimo} como mínimo.`;
    if (p.maximo && n > p.maximo) return `Elige ${p.maximo} como máximo.`;
  }
  if ((p.tipo === "unica" || p.tipo === "varias") && [].concat(v).some((x) => typeof x === "object" && !String(x.otro || "").trim())) {
    return "Has marcado «Otro»: escribe qué.";
  }
  return null;
}

