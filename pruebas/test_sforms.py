"""Pruebas del servidor de sforms, contra un SBD local temporal.

    python3 -m unittest discover -s pruebas -t .
"""

import json
import os
import shutil
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

os.environ.setdefault("SFORMS_ITERACIONES", "1000")
os.environ.setdefault("SFORMS_SILENCIO", "1")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import servidor  # noqa: E402
from api import formularios as fm  # noqa: E402


class Cliente:
    def __init__(self, base):
        self.base, self.cookies = base, {}

    def pedir(self, metodo, ruta, datos=None, cabecera=True):
        cuerpo = json.dumps(datos).encode() if datos is not None else None
        req = urllib.request.Request(self.base + ruta, data=cuerpo, method=metodo)
        if cabecera:
            req.add_header("X-Sforms", "1")
        if cuerpo:
            req.add_header("Content-Type", "application/json")
        if self.cookies:
            req.add_header("Cookie", "; ".join(f"{k}={v}" for k, v in self.cookies.items()))
        try:
            r = urllib.request.urlopen(req)
            estado = r.status
        except urllib.error.HTTPError as err:
            r, estado = err, err.code
        for c in r.headers.get_all("Set-Cookie") or []:
            k, v = c.split(";")[0].split("=", 1)
            if v:
                self.cookies[k] = v
            else:
                self.cookies.pop(k, None)
        texto = r.read().decode("utf-8")
        try:
            return estado, json.loads(texto)
        except ValueError:
            return estado, texto


def formulario_prueba():
    return {
        "titulo": "Prueba",
        "color": "lila",
        "contenido": {
            "descripcion": "Desc",
            "preguntas": [
                {"id": "nombre01", "tipo": "corta", "titulo": "Nombre", "obligatoria": True},
                {"id": "correo01", "tipo": "corta", "titulo": "Correo", "validacion": "correo"},
                {"id": "color001", "tipo": "unica", "titulo": "Color", "opciones": ["Rojo", "Azul"], "otro": True},
                {"id": "dias0001", "tipo": "varias", "titulo": "Días", "opciones": ["L", "M", "X"], "minimo": 1, "maximo": 2},
                {"id": "nota0001", "tipo": "escala", "titulo": "Nota", "desde": 0, "hasta": 10},
                {"id": "secc0001", "tipo": "seccion", "titulo": "Parte 2"},
                {"id": "fecha001", "tipo": "fecha", "titulo": "Fecha"},
                {"id": "hora0001", "tipo": "hora", "titulo": "Hora"},
            ],
            "ajustes": {"unaRespuesta": False},
        },
    }


class PruebaServidor(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = tempfile.mkdtemp(prefix="sforms-test-")
        cls.srv, cls.app, cls.bd = servidor.crear_servidor(cls.dir, puerto=0)
        # En las pruebas todas las peticiones vienen de la misma IP: sin frenos.
        for limite in (cls.app.limite_registro, cls.app.limite_acceso, cls.app.limite_envio):
            limite.maximo = 10_000
        cls.hilo = threading.Thread(target=cls.srv.serve_forever, daemon=True)
        cls.hilo.start()
        cls.base = f"http://127.0.0.1:{cls.srv.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.bd.cerrar()
        shutil.rmtree(cls.dir, ignore_errors=True)

    def cuenta(self, correo):
        c = Cliente(self.base)
        estado, _ = c.pedir("POST", "/api/registro", {"nombre": "Ana", "correo": correo, "contrasena": "contraseña-larga"})
        self.assertEqual(estado, 200)
        return c

    def nuevo(self, c, datos=None):
        estado, r = c.pedir("POST", "/api/formularios", datos or formulario_prueba())
        self.assertEqual(estado, 200, r)
        return r

    # ---- cuentas ----
    def test_registro_y_entrada(self):
        c = Cliente(self.base)
        self.assertEqual(c.pedir("POST", "/api/registro", {"nombre": "A", "correo": "mal", "contrasena": "12345678"})[1]["campo"], "correo")
        self.assertEqual(c.pedir("POST", "/api/registro", {"nombre": "A", "correo": "a@b.es", "contrasena": "corta"})[1]["campo"], "contrasena")
        self.assertEqual(c.pedir("POST", "/api/registro", {"nombre": "A", "correo": "Uno@Ejemplo.es", "contrasena": "12345678"})[0], 200)
        self.assertEqual(c.pedir("GET", "/api/yo")[1]["usuario"]["correo"], "uno@ejemplo.es")
        self.assertEqual(Cliente(self.base).pedir("POST", "/api/registro", {"nombre": "B", "correo": "uno@ejemplo.es", "contrasena": "12345678"})[0], 409)
        c.pedir("POST", "/api/salir")
        self.assertIsNone(c.pedir("GET", "/api/yo")[1]["usuario"])
        self.assertEqual(c.pedir("POST", "/api/entrar", {"correo": "uno@ejemplo.es", "contrasena": "malamala"})[0], 401)
        self.assertEqual(c.pedir("POST", "/api/entrar", {"correo": " UNO@ejemplo.es ", "contrasena": "12345678"})[0], 200)

    def test_sin_cabecera_no_cambia_nada(self):
        c = self.cuenta("cabecera@ejemplo.es")
        estado, _ = c.pedir("POST", "/api/formularios", formulario_prueba(), cabecera=False)
        self.assertEqual(estado, 403)

    def test_sin_sesion(self):
        self.assertEqual(Cliente(self.base).pedir("GET", "/api/formularios")[0], 401)

    # ---- formularios ----
    def test_cada_cuenta_ve_solo_lo_suyo(self):
        ana, bea = self.cuenta("ana@ejemplo.es"), self.cuenta("bea@ejemplo.es")
        f = self.nuevo(ana)
        for metodo, ruta in (("GET", f"/api/formularios/{f['id']}"), ("PUT", f"/api/formularios/{f['id']}"),
                             ("DELETE", f"/api/formularios/{f['id']}"), ("GET", f"/api/formularios/{f['id']}/respuestas"),
                             ("GET", f"/api/formularios/{f['id']}/respuestas.csv"), ("DELETE", f"/api/formularios/{f['id']}/respuestas")):
            self.assertEqual(bea.pedir(metodo, ruta, {} if metodo == "PUT" else None)[0], 404, ruta)
        self.assertEqual(bea.pedir("GET", "/api/formularios")[1], [])
        self.assertEqual(len(ana.pedir("GET", "/api/formularios")[1]), 1)

    def test_limpieza_del_contenido(self):
        c = self.cuenta("limpia@ejemplo.es")
        datos = formulario_prueba()
        datos["contenido"]["preguntas"] += [
            {"id": "nombre01", "tipo": "corta", "titulo": "Id repetido"},
            {"id": "x", "tipo": "inventado", "titulo": "Tipo raro", "extra": "<script>"},
            {"id": "opc00001", "tipo": "unica", "opciones": ["A", "A", "", "B"]},
            {"id": "esc00001", "tipo": "escala", "desde": 7, "hasta": 99},
        ]
        f = self.nuevo(c, datos)
        ps = f["contenido"]["preguntas"]
        self.assertEqual(len({p["id"] for p in ps}), len(ps))
        raro = ps[-3]
        self.assertEqual(raro["tipo"], "corta")
        self.assertNotIn("extra", raro)
        self.assertEqual(ps[-2]["opciones"], ["A", "B"])
        self.assertEqual((ps[-1]["desde"], ps[-1]["hasta"]), (1, 10))

    def test_autoguardado_parcial_y_color(self):
        c = self.cuenta("guarda@ejemplo.es")
        f = self.nuevo(c)
        self.assertEqual(c.pedir("PUT", f"/api/formularios/{f['id']}", {"color": "verde"})[0], 400)
        self.assertEqual(c.pedir("PUT", f"/api/formularios/{f['id']}", {"titulo": "  ", "color": "menta"})[0], 200)
        g = c.pedir("GET", f"/api/formularios/{f['id']}")[1]
        self.assertEqual((g["titulo"], g["color"]), ("Formulario sin título", "menta"))
        self.assertEqual(len(g["contenido"]["preguntas"]), 8)

    def test_duplicar_y_borrar(self):
        c = self.cuenta("dup@ejemplo.es")
        f = self.nuevo(c)
        copia = c.pedir("POST", f"/api/formularios/{f['id']}/copia")[1]
        self.assertNotEqual(copia["enlace"], f["enlace"])
        lista = c.pedir("GET", "/api/formularios")[1]
        self.assertIn("Copia de Prueba", [x["titulo"] for x in lista])
        self.assertEqual(c.pedir("DELETE", f"/api/formularios/{f['id']}")[0], 200)
        self.assertEqual(Cliente(self.base).pedir("GET", f"/api/f/{f['enlace']}")[0], 404)

    # ---- responder ----
    def test_responder_valida_todo(self):
        c = self.cuenta("valida@ejemplo.es")
        f = self.nuevo(c)
        anon = Cliente(self.base)
        enviar = lambda v: anon.pedir("POST", f"/api/f/{f['enlace']}", {"valores": v})
        casos = [
            ({}, "nombre01"),
            ({"nombre01": "Ana", "correo01": "sin-arroba"}, "correo01"),
            ({"nombre01": "Ana", "color001": "Verde"}, "color001"),
            ({"nombre01": "Ana", "dias0001": ["L", "M", "X"]}, "dias0001"),
            ({"nombre01": "Ana", "dias0001": ["J"]}, "dias0001"),
            ({"nombre01": "Ana", "nota0001": 11}, "nota0001"),
            ({"nombre01": "Ana", "nota0001": True}, "nota0001"),
            ({"nombre01": "Ana", "fecha001": "2026-02-30"}, "fecha001"),
            ({"nombre01": "Ana", "hora0001": "25:00"}, "hora0001"),
            ({"nombre01": "x" * 501}, "nombre01"),
        ]
        for valores, campo in casos:
            estado, r = enviar(valores)
            self.assertEqual((estado, r.get("campo")), (400, campo), valores)
        estado, r = enviar({"nombre01": " Ana ", "correo01": "ana@ejemplo.es", "color001": {"otro": "Verde"}, "dias0001": ["L", "X"],
                            "nota0001": 0, "fecha001": "2026-11-20", "hora0001": "09:30", "inventada": "fuera"})
        self.assertEqual(estado, 200, r)
        guardada = c.pedir("GET", f"/api/formularios/{f['id']}/respuestas")[1]["respuestas"][0]["valores"]
        self.assertEqual(guardada["nombre01"], "Ana")
        self.assertEqual(guardada["nota0001"], 0)
        self.assertNotIn("inventada", guardada)

    def test_una_respuesta_por_persona_y_cerrado(self):
        c = self.cuenta("una@ejemplo.es")
        datos = formulario_prueba()
        datos["contenido"]["ajustes"] = {"unaRespuesta": True, "cerrado": "Ya no, lo siento."}
        f = self.nuevo(c, datos)
        anon = Cliente(self.base)
        self.assertFalse(anon.pedir("GET", f"/api/f/{f['enlace']}")[1]["yaRespondido"])
        self.assertEqual(anon.pedir("POST", f"/api/f/{f['enlace']}", {"valores": {"nombre01": "A"}})[0], 200)
        self.assertEqual(anon.pedir("POST", f"/api/f/{f['enlace']}", {"valores": {"nombre01": "A"}})[1]["campo"], "repetida")
        publico = anon.pedir("GET", f"/api/f/{f['enlace']}")[1]
        self.assertTrue(publico["yaRespondido"])
        self.assertNotIn("preguntas", publico)
        # otro navegador sí puede
        self.assertEqual(Cliente(self.base).pedir("POST", f"/api/f/{f['enlace']}", {"valores": {"nombre01": "B"}})[0], 200)
        # cerrado
        c.pedir("PUT", f"/api/formularios/{f['id']}", {"aceptando": False})
        otro = Cliente(self.base)
        cerrado = otro.pedir("GET", f"/api/f/{f['enlace']}")[1]
        self.assertEqual((cerrado["abierto"], cerrado["mensaje"]), (False, "Ya no, lo siento."))
        self.assertEqual(otro.pedir("POST", f"/api/f/{f['enlace']}", {"valores": {"nombre01": "C"}})[0], 409)
        # quien lo creó lo ve entero en la vista previa aunque esté cerrado
        vista = c.pedir("GET", f"/api/f/{f['enlace']}?vista=1")[1]
        self.assertTrue(vista["vistaPrevia"])
        self.assertEqual(len(vista["preguntas"]), 8)

    def test_limite_de_respuestas(self):
        c = self.cuenta("limite@ejemplo.es")
        datos = formulario_prueba()
        datos["contenido"]["ajustes"] = {"limite": 2}
        f = self.nuevo(c, datos)
        for i in range(2):
            self.assertEqual(Cliente(self.base).pedir("POST", f"/api/f/{f['enlace']}", {"valores": {"nombre01": str(i)}})[0], 200)
        self.assertEqual(Cliente(self.base).pedir("POST", f"/api/f/{f['enlace']}", {"valores": {"nombre01": "3"}})[0], 409)
        self.assertFalse(Cliente(self.base).pedir("GET", f"/api/f/{f['enlace']}")[1]["abierto"])

    def test_csv_sin_formulas_y_con_preguntas_borradas(self):
        c = self.cuenta("csv@ejemplo.es")
        f = self.nuevo(c)
        Cliente(self.base).pedir("POST", f"/api/f/{f['enlace']}", {"valores": {"nombre01": "=HYPERLINK(\"x\")", "dias0001": ["L", "M"]}})
        contenido = f["contenido"]
        contenido["preguntas"] = contenido["preguntas"][2:]          # se borra «Nombre»
        c.pedir("PUT", f"/api/formularios/{f['id']}", {"contenido": contenido})
        estado, texto = c.pedir("GET", f"/api/formularios/{f['id']}/respuestas.csv")
        self.assertEqual(estado, 200)
        self.assertTrue(texto.startswith("﻿Enviada;"))
        self.assertIn("(pregunta borrada nombre01)", texto)
        self.assertIn("'=HYPERLINK", texto)
        self.assertIn("L; M", texto)

    def test_borrar_cuenta_lo_borra_todo(self):
        c = self.cuenta("baja@ejemplo.es")
        f = self.nuevo(c)
        self.assertEqual(c.pedir("DELETE", "/api/yo", {"contrasena": "mala"})[0], 401)
        self.assertEqual(c.pedir("DELETE", "/api/yo", {"contrasena": "contraseña-larga"})[0], 200)
        self.assertEqual(Cliente(self.base).pedir("GET", f"/api/f/{f['enlace']}")[0], 404)

    def test_estaticos(self):
        anon = Cliente(self.base)
        for ruta in ("/", "/f/abcdef123456", "/js/app.js", "/css/sforms.css", "/favicon.svg", "/privacidad.html"):
            self.assertEqual(anon.pedir("GET", ruta)[0], 200, ruta)
        for ruta in ("/../servidor.py", "/api/../servidor.py", "/sbd/cliente.py", "/datos/sforms.base"):
            estado, cuerpo = anon.pedir("GET", ruta)
            self.assertIn(estado, (401, 404), ruta)          # nunca sirve el fichero
            self.assertNotIn("import", str(cuerpo))


class PruebaReglas(unittest.TestCase):
    def test_enlaces_distintos(self):
        self.assertEqual(len({fm.nuevo_enlace() for _ in range(500)}), 500)

    def test_otro_vacio_no_cuenta(self):
        contenido = fm.limpiar_contenido({"preguntas": [{"id": "abcd", "tipo": "unica", "opciones": ["a"], "otro": True, "obligatoria": True}]})
        with self.assertRaises(fm.ErrorFormulario):
            fm.validar_respuesta(contenido, {"abcd": {"otro": "  "}})


if __name__ == "__main__":
    unittest.main()
