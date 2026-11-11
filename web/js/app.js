// El panel: portada, cuenta y rutas. El editor y las respuestas viven en sus módulos.
import { api, h, icono, avisar, abrirMenu, dialogo, confirmar, haceCuanto, plural, entrar, salir, reducido, cambiarTema, temaActual } from "./util.js";
import { PLANTILLAS } from "./plantillas.js";
import { COLORES } from "./tipos.js";
import { abrirEditor, cerrarEditor } from "./editor.js";

const raiz = document.getElementById("app");
export const estado = { yo: null, registro: true };

// ---------- rutas ----------
function ruta() {
  const partes = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  return partes;
}

let vistaActual = "";
async function navegar() {
  const [a, b, c] = ruta();
  const cambiarDeVista = (nombre) => {
    if (vistaActual !== nombre) cerrarEditor();
    vistaActual = nombre;
  };
  if (!estado.yo) {
    cambiarDeVista("acceso");
    return pantallaAcceso(a === "registro" ? "registro" : "entrar");
  }
  if (a === "f" && /^\d+$/.test(b || "")) {
    const nueva = vistaActual !== `f${b}`;
    vistaActual = `f${b}`;
    return abrirEditor(raiz, Number(b), ["respuestas", "ajustes"].includes(c) ? c : "preguntas", { nueva, barra: barraSuperior });
  }
  cambiarDeVista("inicio");
  if (location.hash && location.hash !== "#/") history.replaceState(null, "", "#/");
  return portada();
}

export function ir(hash) {
  if (location.hash === hash) navegar();
  else location.hash = hash;
}

// ---------- barra superior ----------
export function barraSuperior(...centro) {
  const iniciales = (estado.yo?.nombre || "?").split(/\s+/).map((t) => t[0]).slice(0, 2).join("").toUpperCase();
  const avatar = h("button.avatar", { type: "button", "aria-label": `Tu cuenta: ${estado.yo?.nombre}`, "aria-haspopup": "menu", "aria-expanded": "false" }, iniciales);
  avatar.addEventListener("click", () => abrirMenu(avatar, [
    h("div.menu__cabeza", h("strong", estado.yo.nombre), h("span", estado.yo.correo)),
    "linea",
    { texto: temaActual() === "oscuro" ? "Tema claro" : "Tema oscuro", icono: temaActual() === "oscuro" ? "sol" : "luna", alPulsar: cambiarTema },
    { texto: "Tu cuenta", icono: "usuario", alPulsar: dialogoCuenta },
    "linea",
    { texto: "Salir", icono: "salir", alPulsar: salirDeCuenta },
  ]));
  return h("header.barra.cristal",
    centro.length ? centro : [h("a.marca", { href: "#/", "aria-label": "sforms, inicio" }, "sforms"), h("span.barra__hueco")],
    avatar);
}

async function salirDeCuenta() {
  await api("/api/salir", { metodo: "POST" }).catch(() => {});
  estado.yo = null;
  ir("#/entrar");
}

function dialogoCuenta() {
  const nombre = h("input.entrada", { value: estado.yo.nombre, maxlength: 80, autocomplete: "name" });
  const actual = h("input.entrada", { type: "password", autocomplete: "current-password" });
  const nueva = h("input.entrada", { type: "password", autocomplete: "new-password", minlength: 8 });
  const error = h("p.error-campo", { hidden: true, role: "alert" });
  dialogo({
    titulo: "Tu cuenta",
    cuerpo: h("div", { style: { display: "grid", gap: "var(--e4)" } },
      h("p", { style: { color: "var(--tinta-3)", fontSize: "var(--t-s)" } }, `Entras con ${estado.yo.correo}.`),
      h("label.campo", h("span", "Nombre"), nombre),
      h("details.plegable", h("summary", "Cambiar la contraseña"),
        h("div", { style: { display: "grid", gap: "var(--e3)", marginTop: "var(--e3)" } },
          h("label.campo", h("span", "Contraseña actual"), actual),
          h("label.campo", h("span", "Contraseña nueva"), nueva, h("span.ayuda-campo", "8 caracteres como mínimo.")))),
      error,
      h("button.enlace-peligro", { type: "button", onclick: borrarCuenta }, "Borrar mi cuenta y todos mis formularios")),
    botones: [
      { texto: "Cancelar", clase: "boton--fantasma" },
      {
        texto: "Guardar", clase: "boton--tinta", alPulsar: async () => {
          try {
            await api("/api/yo", { metodo: "PUT", datos: { nombre: nombre.value, ...(nueva.value ? { actual: actual.value, nueva: nueva.value } : {}) } });
            estado.yo.nombre = nombre.value.trim();
            avisar("Cuenta guardada");
            navegar();
          } catch (err) {
            error.hidden = false;
            error.replaceChildren(icono("aviso"), err.message);
            return false;
          }
        },
      },
    ],
  });
}

function borrarCuenta() {
  const clave = h("input.entrada", { type: "password", autocomplete: "current-password" });
  const error = h("p.error-campo", { hidden: true, role: "alert" });
  document.querySelector("dialog[open]")?.close();
  dialogo({
    titulo: "¿Borrar tu cuenta?",
    cuerpo: h("div", { style: { display: "grid", gap: "var(--e4)" } },
      h("p", "Se borran tu cuenta, todos tus formularios y todas sus respuestas. Los enlaces que hayas compartido dejarán de funcionar. No se puede deshacer."),
      h("label.campo", h("span", "Escribe tu contraseña para confirmarlo"), clave), error),
    botones: [
      { texto: "Cancelar", clase: "boton--fantasma" },
      {
        texto: "Borrar todo", clase: "boton--peligro", alPulsar: async () => {
          try {
            await api("/api/yo", { metodo: "DELETE", datos: { contrasena: clave.value } });
            estado.yo = null;
            avisar("Cuenta borrada. Hasta pronto.");
            ir("#/entrar");
          } catch (err) {
            error.hidden = false;
            error.replaceChildren(icono("aviso"), err.message);
            return false;
          }
        },
      },
    ],
  });
}

// ---------- acceso ----------
function pantallaAcceso(modo) {
  document.documentElement.removeAttribute("data-color");
  document.title = modo === "registro" ? "Crear cuenta · sforms" : "Entrar · sforms";
  const registro = modo === "registro";
  const error = h("p.error-campo", { hidden: true, role: "alert" });
  const campos = {
    nombre: h("input.entrada", { name: "nombre", autocomplete: "name", required: true, maxlength: 80 }),
    correo: h("input.entrada", { name: "correo", type: "email", autocomplete: "email", required: true, maxlength: 120 }),
    contrasena: h("input.entrada", { name: "contrasena", type: "password", autocomplete: registro ? "new-password" : "current-password", required: true, minlength: registro ? 8 : undefined }),
  };
  const boton = h("button.boton.boton--tinta", { type: "submit", style: { width: "100%" } }, registro ? "Crear mi cuenta" : "Entrar");
  const form = h("form.acceso__formulario", {
    novalidate: true,
    onsubmit: async (e) => {
      e.preventDefault();
      Object.values(campos).forEach((c) => c.removeAttribute("aria-invalid"));
      error.hidden = true;
      boton.disabled = true;
      boton.textContent = registro ? "Creando…" : "Entrando…";
      try {
        await api(registro ? "/api/registro" : "/api/entrar", { metodo: "POST", datos: { nombre: campos.nombre.value, correo: campos.correo.value, contrasena: campos.contrasena.value } });
        const yo = await api("/api/yo");
        estado.yo = yo.usuario;
        ir("#/");
      } catch (err) {
        error.hidden = false;
        error.replaceChildren(icono("aviso"), err.message);
        const c = campos[err.campo];
        if (c) { c.setAttribute("aria-invalid", "true"); c.focus(); }
        boton.disabled = false;
        boton.textContent = registro ? "Crear mi cuenta" : "Entrar";
      }
    },
  },
    h("h2.titulo-gota", registro ? "Crea tu cuenta" : "Hola de nuevo"),
    registro ? h("label.campo", h("span", "Cómo te llamas"), campos.nombre) : null,
    h("label.campo", h("span", "Correo"), campos.correo),
    h("label.campo", h("span", "Contraseña"), campos.contrasena, registro ? h("span.ayuda-campo", "8 caracteres como mínimo.") : null),
    error, boton,
    h("p.acceso__cambio", registro ? "¿Ya tienes cuenta? " : "¿Primera vez? ",
      estado.registro || !registro ? h("a", { href: registro ? "#/entrar" : "#/registro" }, registro ? "Entra" : "Crea una cuenta gratis") : null));

  // Tres formularios de muestra que flotan: así se ve lo que se hace aquí antes de leer nada.
  const muestra = (color, titulo, filas, clase) => h(`div.muestra.${clase}`, { "data-color": color, "aria-hidden": "true" },
    h("div.muestra__titulo", titulo), filas.map((f) => h("div.muestra__fila", h("span.muestra__punto"), f)));

  raiz.replaceChildren(h("main#contenido.acceso",
    h("section.acceso__texto",
      h("a.marca.marca--grande", { href: "#/entrar", "aria-label": "sforms" }, "sforms"),
      h("h1.titulo-gota.acceso__lema", "Pregunta, comparte el enlace y mira cómo caen las respuestas."),
      h("p.acceso__sub", "Formularios, encuestas e inscripciones con gráficas al momento y descarga para Excel. Sin anuncios, y quien responde no necesita cuenta."),
      h("div.acceso__muestras",
        muestra("melocoton", "Taller de cerámica", ["Nunca", "Alguna vez", "Bastante"], "muestra--1"),
        muestra("agua", "¿Qué tal el curso?", ["Sí", "Puede", "No"], "muestra--2"),
        muestra("lila", "Camisetas", ["XS", "S", "M"], "muestra--3"))),
    h("section.acceso__tarjeta.cristal", form)));
  const primero = registro ? campos.nombre : campos.correo;
  if (matchMedia("(min-width: 900px)").matches) primero.focus();
  [...raiz.querySelectorAll(".acceso__texto > *, .acceso__tarjeta")].forEach((el, i) => entrar(el, { retraso: i * 70, y: 14 }));
}

// ---------- portada ----------
let lista = [];
let filtro = "";

async function portada() {
  document.documentElement.removeAttribute("data-color");
  document.title = "Tus formularios · sforms";
  const buscador = h("input.entrada.buscador__entrada", { type: "search", placeholder: "Buscar por título", "aria-label": "Buscar tus formularios", value: filtro });
  const contenedor = h("div.lista", { "aria-busy": "true" }, [1, 2, 3].map(() => h("div.esqueleto", { style: { height: "84px" } })));
  const plantillas = h("div.plantillas", PLANTILLAS.map((pl, i) => {
    const b = h("button.plantilla", { type: "button", "data-color": pl.color, onclick: () => crearDesde(pl, b) },
      h("span.plantilla__hoja", { "aria-hidden": "true" },
        pl.id === "blanco" ? h("span.plantilla__mas", icono("mas")) : [h("span.plantilla__linea.plantilla__linea--titulo"), h("span.plantilla__linea"), h("span.plantilla__opcion"), h("span.plantilla__opcion"), h("span.plantilla__opcion")]),
      h("span.plantilla__nombre", pl.nombre), h("span.plantilla__resumen", pl.resumen));
    entrar(b, { retraso: 80 + i * 50, y: 16 });
    return b;
  }));
  raiz.replaceChildren(
    barraSuperior(),
    h("main#contenido.portada",
      h("section.empezar", { "aria-labelledby": "t-empezar" },
        h("div.empezar__texto",
          h("p.rotulo", `Hola, ${estado.yo.nombre.split(" ")[0]}`),
          h("h1#t-empezar.titulo-gota", "¿Qué quieres preguntar hoy?")),
        plantillas),
      h("section.tus", { "aria-labelledby": "t-tus" },
        h("div.tus__cabeza",
          h("h2#t-tus.tus__titulo", "Tus formularios", h("span.tus__cuenta.cifra")),
          h("label.buscador", icono("lupa"), buscador)),
        contenedor)));
  buscador.addEventListener("input", () => { filtro = buscador.value; pintarLista(contenedor); });
  try {
    lista = await api("/api/formularios");
  } catch (err) {
    contenedor.removeAttribute("aria-busy");
    contenedor.replaceChildren(h("p.vacio", err.message, " ", h("button.boton.boton--pequeno", { type: "button", onclick: portada }, "Reintentar")));
    return;
  }
  contenedor.removeAttribute("aria-busy");
  raiz.querySelector(".tus__cuenta").textContent = lista.length ? ` · ${lista.length}` : "";
  pintarLista(contenedor, true);
}

function pintarLista(contenedor, primera = false) {
  const q = filtro.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const filas = lista.filter((f) => !q || f.titulo.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").includes(q));
  if (!lista.length) {
    contenedor.replaceChildren(h("div.vacio.vacio--grande",
      h("h3.titulo-gota", "Aún no tienes formularios"),
      h("p", "Elige una plantilla de arriba o empieza en blanco. Cuando lo compartas, aquí verás cuántas respuestas llevan.")));
    return;
  }
  if (!filas.length) {
    contenedor.replaceChildren(h("p.vacio", `Ningún formulario se llama «${filtro}».`));
    return;
  }
  contenedor.replaceChildren(...filas.map((f, i) => {
    const fila = filaFormulario(f);
    if (primera) entrar(fila, { retraso: 120 + i * 40, y: 8 });
    return fila;
  }));
}

function filaFormulario(f) {
  const mas = h("button.icono-boton", { type: "button", "aria-label": `Más acciones de «${f.titulo}»`, "aria-haspopup": "menu", "aria-expanded": "false" }, icono("puntos"));
  const fila = h("article.fila", { "data-color": f.color },
    h("a.fila__enlace", { href: `#/f/${f.id}` },
      h("span.fila__cifra", { "aria-hidden": "true" }, h("span.cifra", f.respuestas > 999 ? "999+" : f.respuestas)),
      h("span.fila__texto",
        h("span.fila__titulo", f.titulo),
        h("span.fila__meta",
          plural(f.respuestas, "respuesta", "respuestas"),
          f.ultima ? ` · la última ${haceCuanto(f.ultima)}` : "",
          ` · editado ${haceCuanto(f.cambiado_en)}`)),
      h(`span.estado${f.aceptando ? ".estado--abierto" : ""}`, f.aceptando ? "Abierto" : "Cerrado")),
    h("button.icono-boton", { type: "button", "aria-label": `Copiar el enlace de «${f.titulo}»`, title: "Copiar enlace", onclick: () => copiarEnlace(f.enlace) }, icono("enlace")),
    mas);
  mas.addEventListener("click", () => abrirMenu(mas, [
    { texto: "Abrir", icono: "abrir", alPulsar: () => ir(`#/f/${f.id}`) },
    { texto: "Ver respuestas", icono: "grafica", alPulsar: () => ir(`#/f/${f.id}/respuestas`) },
    { texto: "Duplicar", icono: "copiar", alPulsar: () => duplicar(f) },
    "linea",
    { texto: "Borrar", icono: "papelera", peligro: true, alPulsar: () => borrar(f, fila) },
  ]));
  return fila;
}

export function urlPublica(enlace) { return `${location.origin}/f/${enlace}`; }

export async function copiarEnlace(enlace) {
  try {
    await navigator.clipboard.writeText(urlPublica(enlace));
    avisar("Enlace copiado. Ya puedes pegarlo donde quieras.");
  } catch {
    avisar(urlPublica(enlace), { ms: 8000 });
  }
}

async function crearDesde(pl, boton) {
  boton.disabled = true;
  try {
    const datos = pl.crear();
    const res = await api("/api/formularios", { metodo: "POST", datos: { ...datos, color: pl.color } });
    if (!reducido()) {
      // la plantilla se hincha como una gota antes de abrir el editor
      await boton.animate([{ transform: "none" }, { transform: "scale(1.06)", opacity: 1 }, { transform: "scale(.98)", opacity: 0 }], { duration: 260, easing: "cubic-bezier(.23, 1, .32, 1)" }).finished;
    }
    ir(`#/f/${res.id}`);
  } catch (err) {
    boton.disabled = false;
    avisar(err.message);
  }
}

async function duplicar(f) {
  try {
    const res = await api(`/api/formularios/${f.id}/copia`, { metodo: "POST" });
    avisar(`Duplicado: «Copia de ${f.titulo}»`, { accion: "Abrir", alPulsar: () => ir(`#/f/${res.id}`) });
    portada();
  } catch (err) { avisar(err.message); }
}

export async function borrar(f, fila) {
  const n = f.respuestas;
  if (!(await confirmar({ titulo: `¿Borrar «${f.titulo}»?`, texto: n ? `Se borran también sus ${plural(n, "respuesta", "respuestas")} y el enlace dejará de funcionar. No se puede deshacer.` : "El enlace dejará de funcionar. No se puede deshacer." }))) return false;
  try {
    await api(`/api/formularios/${f.id}`, { metodo: "DELETE" });
    lista = lista.filter((x) => x.id !== f.id);
    if (fila) {
      await salir(fila);
      const cuenta = raiz.querySelector(".tus__cuenta");
      if (cuenta) cuenta.textContent = lista.length ? ` · ${lista.length}` : "";
      if (!lista.length) pintarLista(raiz.querySelector(".lista"));
    }
    avisar("Formulario borrado");
    return true;
  } catch (err) { avisar(err.message); return false; }
}

export { COLORES };

// ---------- arranque ----------
async function arrancar() {
  try {
    const r = await api("/api/yo");
    estado.yo = r.usuario;
    estado.registro = r.registro;
  } catch {
    estado.yo = null;
  }
  window.addEventListener("hashchange", navegar);
  navegar();
}

arrancar();
