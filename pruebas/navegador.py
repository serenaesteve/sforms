"""Prueba de punta a punta en un navegador de verdad (Chromium con Playwright).

    python pruebas/navegador.py [carpeta-capturas]     # por defecto, pruebas/capturas

Arranca sforms en un puerto libre con una base temporal y datos de ejemplo, y recorre lo que haría
una persona: crear cuenta, crear un formulario, editarlo, compartirlo, responderlo y ver el resumen.
Falla (código 1) a la primera comprobación que no se cumpla o si la consola tiene errores.
"""

import os
import re
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from playwright.sync_api import sync_playwright, expect

RAIZ = Path(__file__).resolve().parent.parent
CAPTURAS = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent / "capturas"
CAPTURAS.mkdir(parents=True, exist_ok=True)


def puerto_libre():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


PUERTO = puerto_libre()
U = f"http://127.0.0.1:{PUERTO}"
datos = tempfile.mkdtemp(prefix="sforms-prueba-")
proc = subprocess.Popen([sys.executable, str(RAIZ / "servidor.py"), "--demo", "--puerto", str(PUERTO), "--datos", datos, "--sin-copias"],
                        env={**os.environ, "SFORMS_ITERACIONES": "1000", "SFORMS_SILENCIO": "1"}, stdout=subprocess.DEVNULL)
for _ in range(50):
    try:
        socket.create_connection(("127.0.0.1", PUERTO), timeout=0.2).close()
        break
    except OSError:
        time.sleep(0.1)

errores = []
pasos = 0


def ok(texto):
    global pasos
    pasos += 1
    print(f"  ✓ {texto}")


def captura(pg, nombre, entera=False):
    pg.screenshot(path=str(CAPTURAS / f"{nombre}.png"), full_page=entera)


try:
    with sync_playwright() as p:
        nav = p.chromium.launch()
        ctx = nav.new_context(viewport={"width": 1366, "height": 900})
        pg = ctx.new_page()
        # Los 4xx de la API son respuestas esperadas (la prueba manda datos mal a propósito).
        pg.on("console", lambda m: errores.append(m.text) if m.type == "error" and "status of 4" not in m.text else None)
        pg.on("pageerror", lambda e: errores.append(str(e)))

        # ---- cuenta nueva ----
        pg.goto(U + "/#/registro")
        pg.fill("input[name=nombre]", "Prueba Navegador")
        pg.fill("input[name=correo]", "no-vale")
        pg.fill("input[name=contrasena]", "12345678")
        pg.click("button[type=submit]")
        expect(pg.locator(".error-campo")).to_contain_text("correo")
        ok("el registro rechaza un correo mal escrito y lo dice")
        pg.fill("input[name=correo]", "prueba@ejemplo.test")
        pg.click("button[type=submit]")
        expect(pg.locator(".empezar h1")).to_be_visible()
        expect(pg.locator(".vacio--grande")).to_contain_text("Aún no tienes formularios")
        ok("cuenta creada: portada vacía con su explicación")

        # ---- crear desde plantilla ----
        pg.click(".plantilla:has-text('Inscripción')")
        expect(pg.locator(".cabecera__titulo-edit")).to_have_value("Inscripción")
        expect(pg.locator(".tarjeta.pregunta")).to_have_count(5)
        ok("plantilla «Inscripción» abierta con 5 preguntas")

        titulo = pg.locator(".cabecera__titulo-edit")
        titulo.fill("Excursión al Montgó")
        expect(pg.locator(".barra__titulo")).to_have_text("Excursión al Montgó")
        expect(pg.locator(".guardado")).to_have_attribute("data-estado", "ok", timeout=5000)
        ok("título cambiado y autoguardado")

        # añadir una pregunta y cambiarla de tipo
        pg.click(".tarjeta.pregunta >> nth=4")
        pg.click(".herramientas button[aria-label='Añadir pregunta']")
        expect(pg.locator(".tarjeta.pregunta")).to_have_count(6)
        nueva = pg.locator(".tarjeta--activa")
        nueva.locator(".tarjeta__titulo-edit").fill("¿Qué te traes de comer?")
        nueva.locator(".opcion-edit input").first.fill("Bocadillo")
        nueva.locator(".opcion-edit input").first.press("Enter")
        pg.keyboard.type("Ensalada")
        expect(pg.locator(".tarjeta--activa .opcion-edit input")).to_have_count(2)
        ok("pregunta nueva con dos opciones (Intro añade la siguiente)")
        pg.click(".tarjeta--activa .selector-tipo")
        pg.click(".menu__item:has-text('Varias opciones')")
        expect(pg.locator(".tarjeta--activa .selector-tipo")).to_contain_text("Varias opciones")
        expect(pg.locator(".tarjeta--activa .opcion-edit input").nth(1)).to_have_value("Ensalada")
        ok("cambiar a «Varias opciones» conserva las opciones")
        pg.click(".tarjeta--activa .anadir-opcion--otro")
        pg.click(".tarjeta--activa label.interruptor")
        expect(pg.locator(".tarjeta--activa .interruptor input")).to_be_checked()
        captura(pg, "01-editor")

        # mover con el teclado
        asa = pg.locator(".tarjeta--activa .tarjeta__asa")
        asa.focus()
        pg.keyboard.press("ArrowUp")
        expect(pg.locator(".tarjeta.pregunta").nth(4).locator(".tarjeta__asa")).to_have_attribute("aria-label", re.compile("comer"))
        ok("el asa mueve la pregunta con las flechas")

        # arrastrar la primera pregunta al final con el ratón
        primera = pg.locator(".tarjeta.pregunta").first
        primera.hover()
        caja = primera.locator(".tarjeta__asa").bounding_box()
        pg.mouse.move(caja["x"] + caja["width"] / 2, caja["y"] + caja["height"] / 2)
        pg.mouse.down()
        for paso in range(1, 25):
            pg.mouse.move(caja["x"] + caja["width"] / 2, caja["y"] + paso * 22)
        pg.mouse.up()
        pg.wait_for_timeout(500)
        expect(pg.locator(".tarjeta.pregunta").first.locator(".tarjeta__asa")).to_have_attribute("aria-label", re.compile("Correo"))
        orden = pg.eval_on_selector_all(".tarjeta.pregunta .tarjeta__asa", "els => els.map(e => e.getAttribute('aria-label'))")
        assert any("Nombre" in o for o in orden[2:]), orden
        ok("arrastrar una tarjeta la cambia de sitio")

        # borrar y deshacer
        pg.click(".tarjeta.pregunta >> nth=2")
        pg.click(".tarjeta--activa button[aria-label='Borrar']")
        expect(pg.locator(".tarjeta.pregunta")).to_have_count(5)
        pg.click(".tostada button:has-text('Deshacer')")
        expect(pg.locator(".tarjeta.pregunta")).to_have_count(6)
        ok("borrar una pregunta y deshacerlo")

        # color
        pg.click("button[aria-label='Color del formulario']")
        pg.click(".color[data-color='menta']")
        expect(pg.locator("html")).to_have_attribute("data-color", "menta")
        pg.keyboard.press("Escape")
        expect(pg.locator(".guardado")).to_have_attribute("data-estado", "ok", timeout=5000)

        # recargar: todo guardado
        pg.reload()
        expect(pg.locator(".tarjeta.pregunta")).to_have_count(6)
        expect(pg.locator(".cabecera__titulo-edit")).to_have_value("Excursión al Montgó")
        expect(pg.locator("html")).to_have_attribute("data-color", "menta")
        expect(pg.locator(".tarjeta.pregunta").nth(4)).to_contain_text("¿Qué te traes de comer?")
        ok("al recargar sigue todo: título, color, orden y preguntas")

        # compartir
        pg.click("button:has-text('Enviar')")
        enlace = pg.locator("dialog input[aria-label='Enlace del formulario']").input_value()
        assert "/f/" in enlace, enlace
        captura(pg, "02-compartir")
        pg.click("dialog button:has-text('Hecho')")
        ok("diálogo de compartir con el enlace")

        # ---- responder (otro navegador, sin cuenta) ----
        anon = nav.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        rp = anon.new_page()
        rp.on("pageerror", lambda e: errores.append(str(e)))
        rp.goto(enlace)
        expect(rp.locator("h1")).to_have_text("Excursión al Montgó")
        rp.click("text=Enviar respuestas")
        expect(rp.locator(".pregunta[data-error]").first).to_be_visible()
        ok("enviar vacío marca las obligatorias")
        rp.locator(".pregunta:has-text('Nombre y apellidos') input").fill("Ana Prueba")
        rp.locator(".pregunta:has-text('Correo') input").fill("ana@")
        rp.locator(".pregunta:has-text('Teléfono') input").focus()
        expect(rp.locator(".pregunta:has-text('Correo') .error-campo")).to_contain_text("correo")
        ok("el correo mal escrito se avisa al salir del campo")
        rp.locator(".pregunta:has-text('Correo') input").fill("ana@ejemplo.test")
        rp.click(".opcion:has-text('Mañana')")
        rp.click(".opcion:has-text('Bocadillo')")
        rp.click(".opcion--otro")
        rp.locator(".opcion__otro-texto").fill("Fruta")
        captura(rp, "03-responder-movil")
        rp.click("text=Enviar respuestas")
        expect(rp.locator(".final h1")).to_have_text("Excursión al Montgó", timeout=5000)
        ok("respuesta enviada desde el móvil")
        rp.wait_for_timeout(1300)
        captura(rp, "04-enviado-movil")
        rp.reload()
        expect(rp.locator(".pregunta")).to_contain_text("Ya has respondido")
        ok("«una respuesta por persona»: al volver, ya consta")

        # ---- resumen ----
        pg.click("a.pestana[data-p=respuestas]")
        expect(pg.locator(".resumen-cifra__n")).to_have_text("1")
        grafico = pg.locator(".grafico:has-text('¿Qué te traes de comer?')")
        grafico.scroll_into_view_if_needed()
        expect(grafico.locator(".barra-fila").first).to_contain_text("100 %")
        expect(grafico.locator(".textos")).to_contain_text("Fruta")
        pg.wait_for_timeout(1000)
        ancho = grafico.locator(".barra-fila__barra").first.bounding_box()["width"]
        assert ancho > 50, f"la barra no se ha llenado ({ancho}px)"
        ok("el resumen cuenta la respuesta, con «Otro» y la barra llena")
        captura(pg, "05-resumen")
        pg.click(".segmento:has-text('Una a una')")
        expect(pg.locator(".una__hojas")).to_contain_text("Ana Prueba")
        ok("la vista «una a una» enseña lo contestado")

        # ---- datos de ejemplo: gráficas con muchas respuestas, en oscuro ----
        pg.click("button.avatar"); pg.click(".menu__item:has-text('Salir')")
        pg.fill("input[name=correo]", "demo@sforms.local"); pg.fill("input[name=contrasena]", "sforms-demo"); pg.click("button[type=submit]")
        pg.click(".fila:has-text('¿Qué tal el curso?') .fila__enlace")
        pg.click("a.pestana[data-p=respuestas]")
        expect(pg.locator(".resumen-cifra__n")).to_have_text("41", timeout=5000)
        pg.click(".segmento:has-text('Resumen')")
        pg.locator(".columnas").first.scroll_into_view_if_needed()
        pg.wait_for_timeout(1200)
        captura(pg, "06-columnas")
        pg.emulate_media(color_scheme="dark")
        pg.wait_for_timeout(300)
        captura(pg, "07-oscuro")
        pg.emulate_media(color_scheme="light")

        # CSV
        with pg.expect_download() as descarga:
            pg.click("a:has-text('Descargar CSV')")
        texto = Path(descarga.value.path()).read_text(encoding="utf-8-sig")
        assert texto.count("\n") == 42, texto.count("\n")
        ok("el CSV trae la cabecera y las 41 respuestas")
        nav.close()
finally:
    proc.terminate()
    proc.wait(5)

if errores:
    print("Errores en la consola:", *errores, sep="\n  ")
    sys.exit(1)
print(f"\n{pasos} comprobaciones correctas · capturas en {CAPTURAS}")
