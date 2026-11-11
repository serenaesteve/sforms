// Antes de pintar nada: el tema claro u oscuro elegido a mano (si lo hay), para que no parpadee.
try {
  var t = localStorage.getItem("sforms-tema");
  if (t === "claro" || t === "oscuro") document.documentElement.dataset.tema = t;
} catch (e) { /* sin almacenamiento */ }
