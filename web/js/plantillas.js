// Formularios de partida. Los textos son de ejemplo y se cambian en el editor.
import { nuevaPregunta } from "./tipos.js";

const p = (tipo, titulo, extra = {}) => ({ ...nuevaPregunta(tipo), titulo, ...extra });

export const PLANTILLAS = [
  {
    id: "blanco", nombre: "En blanco", color: "agua", resumen: "Empieza con una pregunta",
    crear: () => ({ titulo: "Formulario sin título", contenido: { descripcion: "", preguntas: [p("unica", "", { opciones: ["Opción 1"] })] } }),
  },
  {
    id: "inscripcion", nombre: "Inscripción", color: "melocoton", resumen: "Taller, excursión, evento",
    crear: () => ({
      titulo: "Inscripción",
      contenido: {
        descripcion: "Cuéntanos quién eres y te guardamos la plaza.",
        preguntas: [
          p("corta", "Nombre y apellidos", { obligatoria: true }),
          p("corta", "Correo", { obligatoria: true, validacion: "correo" }),
          p("corta", "Teléfono", { validacion: "telefono" }),
          p("unica", "¿A qué sesión vienes?", { obligatoria: true, opciones: ["Mañana", "Tarde"] }),
          p("parrafo", "¿Algo que debamos saber?", { ayuda: "Alergias, accesibilidad, si vienes con alguien…" }),
        ],
        ajustes: { confirmacion: "¡Plaza apuntada! Te escribimos para confirmarla.", unaRespuesta: true },
      },
    }),
  },
  {
    id: "opinion", nombre: "Opinión", color: "lila", resumen: "Encuesta de satisfacción",
    crear: () => ({
      titulo: "¿Qué te ha parecido?",
      contenido: {
        descripcion: "Son dos minutos y nos ayuda mucho.",
        preguntas: [
          p("valoracion", "En general, ¿qué nota le pones?", { obligatoria: true }),
          p("escala", "¿Lo recomendarías?", { desde: 0, hasta: 10, etiquetaDesde: "Nada", etiquetaHasta: "Sin dudarlo" }),
          p("varias", "¿Qué te ha gustado más?", { opciones: ["El trato", "La rapidez", "El precio"], otro: true }),
          p("parrafo", "¿Qué mejorarías?"),
        ],
        ajustes: { confirmacion: "Gracias por contárnoslo." },
      },
    }),
  },
  {
    id: "pedido", nombre: "Pedido", color: "menta", resumen: "Encargos y reservas",
    crear: () => ({
      titulo: "Pedido",
      contenido: {
        descripcion: "Haz tu encargo y te avisamos cuando esté listo.",
        preguntas: [
          p("corta", "Tu nombre", { obligatoria: true }),
          p("desplegable", "Producto", { obligatoria: true, opciones: ["Producto 1", "Producto 2", "Producto 3"] }),
          p("corta", "Cantidad", { obligatoria: true, validacion: "numero" }),
          p("fecha", "¿Para cuándo lo necesitas?"),
          p("hora", "¿A qué hora pasas a recogerlo?"),
        ],
        ajustes: { confirmacion: "Pedido recibido. Te avisamos cuando esté listo." },
      },
    }),
  },
  {
    id: "votacion", nombre: "Votación", color: "rosa", resumen: "Elegir entre varias ideas",
    crear: () => ({
      titulo: "Votación",
      contenido: {
        descripcion: "Un voto por persona. El resultado lo compartimos al cerrar.",
        preguntas: [p("unica", "¿Qué opción prefieres?", { obligatoria: true, opciones: ["Idea A", "Idea B", "Idea C"] })],
        ajustes: { confirmacion: "Voto contado. ¡Gracias!", unaRespuesta: true },
      },
    }),
  },
];
