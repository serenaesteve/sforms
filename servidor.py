#!/usr/bin/env python3
"""sforms: crea formularios, comparte el enlace y mira las respuestas.

    python3 servidor.py                          # http://127.0.0.1:8106, datos en ./datos
    python3 servidor.py --demo                   # con una cuenta y formularios de ejemplo (inventados)
    python3 servidor.py --datos /srv/sforms/datos --publico

Sin dependencias: Python 3.10+ y SBD (copiado en ./sbd). Si existe datos/sbd.json, usa un servidor
de SBD en vez de la base local.
"""

import argparse
import hashlib
import json
import mimetypes
import os
import re
import signal
import sys
import threading
import time
import unicodedata
from collections import defaultdict, deque
from datetime import datetime, timedelta
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, urlsplit
from zoneinfo import ZoneInfo

RAIZ = Path(__file__).resolve().parent
WEB = RAIZ / "web"
sys.path.insert(0, str(RAIZ))

from api import formularios as fm, seguridad  # noqa: E402
from api.bd import abrir as abrir_bd  # noqa: E402
from sbd import SBDError  # noqa: E402

COOKIE = "sforms_sesion"
COOKIE_QUIEN = "sforms_quien"          # navegador que responde (para «una respuesta por persona»)
ZONA = ZoneInfo("Europe/Madrid")
DURACION_SESION = timedelta(days=30)
MAX_CUERPO = 512 * 1024
MAX_RESPUESTAS_LISTA = 10_000
MAX_FORMULARIOS = 500                  # por cuenta
ITERACIONES = int(os.environ.get("SFORMS_ITERACIONES", "0")) or None
ESTATICOS = ("index.html", "f.html", "css", "js", "fuentes", "favicon.svg", "privacidad.html", "404.html")
ENLACE = r"[A-Za-z0-9]{6,16}"

mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("font/woff2", ".woff2")
mimetypes.add_type("image/svg+xml", ".svg")


def ahora():
    return datetime.now(ZONA).strftime("%Y-%m-%d %H:%M:%S")


def normalizar_correo(texto):
    t = unicodedata.normalize("NFC", str(texto or "")).strip().lower()
    return t


class Limitador:
    """Ventana deslizante por IP: frena a quien prueba contraseñas o manda respuestas en bucle."""

    def __init__(self, maximo, segundos):
        self.maximo, self.segundos = maximo, segundos
        self._golpes = defaultdict(deque)
        self._cerrojo = threading.Lock()

    def permitir(self, clave, anotar=True):
        limite = time.monotonic() - self.segundos
        with self._cerrojo:
            cola = self._golpes[clave]
            while cola and cola[0] < limite:
                cola.popleft()
            if len(cola) >= self.maximo:
                return False
            if anotar:
                cola.append(time.monotonic())
            return True

    def anotar(self, clave):
        with self._cerrojo:
            self._golpes[clave].append(time.monotonic())


class ErrorApi(Exception):
    def __init__(self, estado, mensaje, campo=None):
        super().__init__(mensaje)
        self.estado, self.mensaje, self.campo = estado, mensaje, campo


def entero(valor, nombre="El número"):
    try:
        return int(valor)
    except (TypeError, ValueError):
        raise ErrorApi(400, f"{nombre} no es válido.") from None


class Aplicacion:
    def __init__(self, bd, publico=False):
        self.bd = bd
        self.publico = publico
        self.registro = True
        self.limite_acceso = Limitador(10, 600)
        self.limite_registro = Limitador(5, 3600)
        self.limite_envio = Limitador(30, 600)

    # ================= cuentas =================

    def usuario_de(self, token):
        if not token:
            return None
        with self.bd.conexion() as con:
            return con.una(
                """buscar sesiones como s unir usuarios como u en u.id = s.usuario_id
                   donde s.token_hash = ? y s.expira_en > ?
                   mostrar u.id como id, u.correo como correo, u.nombre como nombre""",
                [seguridad.huella_token(token), ahora()])

    def _abrir_sesion(self, con, uid):
        token = seguridad.nuevo_token()
        limite = (datetime.now(ZONA) + DURACION_SESION).strftime("%Y-%m-%d %H:%M:%S")
        con.ejecutar("borrar de sesiones donde expira_en < ?", [ahora()])
        con.ejecutar("insertar en sesiones { token_hash: ?, usuario_id: ?, expira_en: ? }", [seguridad.huella_token(token), uid, limite])
        con.ejecutar("actualizar usuarios poner ultimo_acceso = ? donde id = ?", [ahora(), uid])
        return token

    def registrar(self, datos):
        if not self.registro:
            raise ErrorApi(403, "Ahora mismo no se pueden crear cuentas nuevas.")
        correo = normalizar_correo(datos.get("correo"))
        nombre = str(datos.get("nombre") or "").strip()
        contrasena = str(datos.get("contrasena") or "")
        if not nombre:
            raise ErrorApi(400, "Dinos cómo te llamas: sale arriba en tus formularios.", "nombre")
        if len(nombre) > 80:
            raise ErrorApi(400, "El nombre es demasiado largo (80 caracteres como mucho).", "nombre")
        if len(correo) > 120 or not fm.CORREO.match(correo):
            raise ErrorApi(400, "Ese correo no parece válido: falta la @ o el dominio.", "correo")
        if len(contrasena) < 8:
            raise ErrorApi(400, "La contraseña necesita 8 caracteres como mínimo.", "contrasena")
        resumen = seguridad.cifrar_contrasena(contrasena, ITERACIONES)
        with self.bd.conexion("registro") as con:
            with con.transaccion():
                if con.una("buscar usuarios donde correo = ? mostrar id", [correo]):
                    raise ErrorApi(409, "Ya hay una cuenta con ese correo. Entra con tu contraseña.", "correo")
                uid = con.ejecutar("insertar en usuarios { correo: ?, nombre: ?, hash_contrasena: ?, creado_en: ? } devolver id",
                                   [correo, nombre, resumen, ahora()]).scalar()
                return self._abrir_sesion(con, uid)

    def entrar(self, datos):
        correo = normalizar_correo(datos.get("correo"))
        contrasena = str(datos.get("contrasena") or "")
        with self.bd.conexion("acceso") as con:
            fila = con.una("buscar usuarios donde correo = ? mostrar id, hash_contrasena", [correo])
            ok = seguridad.comprobar_contrasena(contrasena, fila["hash_contrasena"] if fila else seguridad.hash_senuelo())
            if not fila or not ok:
                raise ErrorApi(401, "El correo o la contraseña no coinciden.")
            with con.transaccion():
                return self._abrir_sesion(con, fila["id"])

    def salir(self, token):
        if token:
            with self.bd.conexion() as con:
                con.ejecutar("borrar de sesiones donde token_hash = ?", [seguridad.huella_token(token)])

    def cambiar_cuenta(self, yo, datos):
        with self.bd.conexion("cuenta") as con:
            if "nombre" in datos:
                nombre = str(datos.get("nombre") or "").strip()
                if not nombre or len(nombre) > 80:
                    raise ErrorApi(400, "El nombre lleva de 1 a 80 caracteres.", "nombre")
                con.ejecutar("actualizar usuarios poner nombre = ? donde id = ?", [nombre, yo["id"]])
            if datos.get("nueva"):
                resumen = con.valor("buscar usuarios donde id = ? mostrar hash_contrasena", [yo["id"]])
                if not seguridad.comprobar_contrasena(str(datos.get("actual") or ""), resumen):
                    raise ErrorApi(401, "La contraseña actual no es correcta.", "actual")
                if len(str(datos["nueva"])) < 8:
                    raise ErrorApi(400, "La contraseña nueva necesita 8 caracteres como mínimo.", "nueva")
                con.ejecutar("actualizar usuarios poner hash_contrasena = ? donde id = ?",
                             [seguridad.cifrar_contrasena(str(datos["nueva"]), ITERACIONES), yo["id"]])
        return {"ok": True}

    def borrar_cuenta(self, yo, datos):
        with self.bd.conexion("baja") as con:
            resumen = con.valor("buscar usuarios donde id = ? mostrar hash_contrasena", [yo["id"]])
            if not seguridad.comprobar_contrasena(str(datos.get("contrasena") or ""), resumen):
                raise ErrorApi(401, "La contraseña no es correcta: no se ha borrado nada.", "contrasena")
            # En cascada: formularios, sus respuestas y las sesiones.
            con.ejecutar("borrar de usuarios donde id = ?", [yo["id"]])
        return {"borrada": True}

    # ================= formularios =================

    def mis_formularios(self, yo):
        with self.bd.conexion() as con:
            filas = con.consultar("""buscar formularios donde usuario_id = ? ordenar cambiado_en desc
                                     mostrar id, enlace, titulo, color, aceptando, creado_en, cambiado_en""", [yo["id"]])
            cuentas = {f["fid"]: f for f in con.consultar(
                """buscar respuestas como r unir formularios como f en f.id = r.formulario_id donde f.usuario_id = ?
                   agrupar r.formulario_id mostrar r.formulario_id como fid, contar() como total, maximo(r.enviada_en) como ultima""",
                [yo["id"]])}
        for f in filas:
            c = cuentas.get(f["id"])
            f["respuestas"] = c["total"] if c else 0
            f["ultima"] = c["ultima"] if c else None
        return filas

    def _mio(self, con, yo, fid):
        f = con.una("buscar formularios donde id = ? y usuario_id = ?", [fid, yo["id"]])
        if not f:
            raise ErrorApi(404, "Ese formulario no existe o no es tuyo.")
        f["contenido"] = json.loads(f["contenido"])
        return f

    def formulario(self, yo, fid):
        with self.bd.conexion() as con:
            f = self._mio(con, yo, fid)
            f["respuestas"] = con.valor("buscar respuestas donde formulario_id = ? mostrar contar()", [fid])
        return f

    @staticmethod
    def _titulo(datos):
        titulo = str(datos.get("titulo") or "").strip()[:200]
        return titulo or "Formulario sin título"

    @staticmethod
    def _color(datos, defecto="agua"):
        c = datos.get("color") or defecto
        if c not in fm.COLORES:
            raise ErrorApi(400, "Ese color no existe.")
        return c

    @staticmethod
    def _contenido(datos):
        contenido = fm.limpiar_contenido(datos.get("contenido"))
        texto = json.dumps(contenido, ensure_ascii=False, separators=(",", ":"))
        if len(texto) > fm.MAX_CONTENIDO:
            raise ErrorApi(413, "El formulario es demasiado grande para guardarlo. Quita alguna pregunta o acorta los textos.")
        return contenido, texto

    def crear(self, yo, datos):
        contenido, texto = self._contenido(datos)
        with self.bd.conexion("formularios") as con:
            if con.valor("buscar formularios donde usuario_id = ? mostrar contar()", [yo["id"]]) >= MAX_FORMULARIOS:
                raise ErrorApi(409, f"Tienes {MAX_FORMULARIOS} formularios: borra alguno antes de crear otro.")
            momento = ahora()
            for _ in range(5):
                enlace = fm.nuevo_enlace()
                if not con.una("buscar formularios donde enlace = ? mostrar id", [enlace]):
                    break
            fid = con.ejecutar("""insertar en formularios { usuario_id: ?, enlace: ?, titulo: ?, color: ?, contenido: ?, creado_en: ?, cambiado_en: ? }
                                  devolver id""", [yo["id"], enlace, self._titulo(datos), self._color(datos), texto, momento, momento]).scalar()
        return {"id": fid, "enlace": enlace, "contenido": contenido}

    def guardar(self, yo, fid, datos):
        """Autoguardado del editor: solo cambia lo que llega."""
        cambios, valores = [], []
        resultado = {}
        if "titulo" in datos:
            cambios.append("titulo = ?")
            valores.append(self._titulo(datos))
        if "color" in datos:
            cambios.append("color = ?")
            valores.append(self._color(datos))
        if "contenido" in datos:
            contenido, texto = self._contenido(datos)
            cambios.append("contenido = ?")
            valores.append(texto)
            resultado["contenido"] = contenido
        if "aceptando" in datos:
            cambios.append("aceptando = ?")
            valores.append(bool(datos["aceptando"]))
        momento = ahora()
        with self.bd.conexion("formularios") as con:
            self._mio(con, yo, fid)
            if cambios:
                con.ejecutar(f"actualizar formularios poner {', '.join(cambios)}, cambiado_en = ? donde id = ?", valores + [momento, fid])
        return {"ok": True, "cambiado_en": momento, **resultado}

    def duplicar(self, yo, fid):
        with self.bd.conexion() as con:
            f = self._mio(con, yo, fid)
        return self.crear(yo, {"titulo": f"Copia de {f['titulo']}"[:200], "color": f["color"], "contenido": f["contenido"]})

    def borrar(self, yo, fid):
        with self.bd.conexion("formularios") as con:
            self._mio(con, yo, fid)
            con.ejecutar("borrar de formularios donde id = ?", [fid])     # en cascada, sus respuestas
        return {"ok": True}

    # ================= respuestas (de quien crea) =================

    def respuestas(self, yo, fid):
        with self.bd.conexion() as con:
            f = self._mio(con, yo, fid)
            filas = con.consultar("""buscar respuestas donde formulario_id = ? ordenar id limite ?
                                     mostrar id, enviada_en, valores""", [fid, MAX_RESPUESTAS_LISTA])
        for r in filas:
            r["valores"] = json.loads(r["valores"])
        return {"formulario": f, "respuestas": filas}

    def borrar_respuesta(self, yo, fid, rid):
        with self.bd.conexion("respuestas") as con:
            self._mio(con, yo, fid)
            con.ejecutar("borrar de respuestas donde id = ? y formulario_id = ?", [rid, fid])
        return {"ok": True}

    def borrar_respuestas(self, yo, fid):
        with self.bd.conexion("respuestas") as con:
            self._mio(con, yo, fid)
            con.ejecutar("borrar de respuestas donde formulario_id = ?", [fid])
        return {"ok": True}

    def csv(self, yo, fid):
        datos = self.respuestas(yo, fid)
        return datos["formulario"], fm.csv_respuestas(datos["formulario"]["contenido"], datos["respuestas"])

    # ================= quien responde (sin cuenta) =================

    @staticmethod
    def _huella(quien, enlace):
        return hashlib.sha256(f"{quien}:{enlace}".encode()).hexdigest() if quien else None

    def publico_formulario(self, enlace, quien, yo=None):
        with self.bd.conexion() as con:
            f = con.una("buscar formularios donde enlace = ? mostrar id, usuario_id, titulo, color, contenido, aceptando", [enlace])
            if not f:
                raise ErrorApi(404, "Este formulario no existe o lo han borrado.")
            contenido = json.loads(f["contenido"])
            total = con.valor("buscar respuestas donde formulario_id = ? mostrar contar()", [f["id"]])
            ya = False
            huella = self._huella(quien, enlace)
            if huella and contenido["ajustes"].get("unaRespuesta"):
                ya = bool(con.valor("buscar respuestas donde formulario_id = ? y huella = ? mostrar contar()", [f["id"], huella]))
        a = contenido["ajustes"]
        if yo and yo["id"] == f["usuario_id"]:
            # Vista previa de quien lo creó: el formulario entero aunque esté cerrado.
            return {"titulo": f["titulo"], "color": f["color"], "abierto": True, "yaRespondido": False, "vistaPrevia": True,
                    "descripcion": contenido["descripcion"], "preguntas": contenido["preguntas"], "ajustes": a}
        abierto = f["aceptando"] and not (a.get("limite") and total >= a["limite"])
        salida = {"titulo": f["titulo"], "color": f["color"], "abierto": abierto, "yaRespondido": ya,
                  "ajustes": {k: a[k] for k in ("progreso", "otraRespuesta", "unaRespuesta")}}
        if abierto and not ya:
            salida["descripcion"] = contenido["descripcion"]
            salida["preguntas"] = contenido["preguntas"]
        else:
            salida["mensaje"] = a["cerrado"] if not abierto else "Ya has respondido a este formulario."
            salida["descripcion"] = contenido["descripcion"]
        return salida

    def enviar(self, enlace, quien, datos):
        with self.bd.conexion("respuesta") as con:
            f = con.una("buscar formularios donde enlace = ? mostrar id, contenido, aceptando", [enlace])
            if not f:
                raise ErrorApi(404, "Este formulario no existe o lo han borrado.")
            contenido = json.loads(f["contenido"])
            a = contenido["ajustes"]
            if not f["aceptando"]:
                raise ErrorApi(409, a["cerrado"], "cerrado")
            try:
                valores = fm.validar_respuesta(contenido, datos.get("valores"))
            except fm.ErrorFormulario as err:
                raise ErrorApi(400, err.mensaje, err.pregunta) from None
            huella = self._huella(quien, enlace)
            with con.transaccion():
                if a.get("limite") and con.valor("buscar respuestas donde formulario_id = ? mostrar contar()", [f["id"]]) >= a["limite"]:
                    raise ErrorApi(409, a["cerrado"], "cerrado")
                if a.get("unaRespuesta") and huella and con.valor(
                        "buscar respuestas donde formulario_id = ? y huella = ? mostrar contar()", [f["id"], huella]):
                    raise ErrorApi(409, "Ya has respondido a este formulario.", "repetida")
                con.ejecutar("insertar en respuestas { formulario_id: ?, enviada_en: ?, valores: ?, huella: ? }",
                             [f["id"], ahora(), json.dumps(valores, ensure_ascii=False, separators=(",", ":")), huella])
        return {"ok": True, "confirmacion": a["confirmacion"], "otraRespuesta": a["otraRespuesta"] and not a["unaRespuesta"]}


class Manejador(BaseHTTPRequestHandler):
    server_version = "sforms/1"
    app: Aplicacion = None
    protocol_version = "HTTP/1.1"

    def log_message(self, formato, *args):
        if os.environ.get("SFORMS_SILENCIO"):
            return
        sys.stderr.write(f"{self.log_date_time_string()} {self.ip()} {formato % args}\n")

    def ip(self):
        if self.app.publico:
            reenviada = self.headers.get("X-Forwarded-For", "")
            if reenviada:
                return reenviada.split(",")[-1].strip()
        return self.client_address[0]

    def galleta(self, nombre):
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get("Cookie", ""))
        except Exception:  # noqa: BLE001 - una cookie rota de otra web no debe tumbar la petición
            return None
        return cookie[nombre].value if nombre in cookie else None

    def cabeceras_seguridad(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Content-Security-Policy",
                         "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; "
                         "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")

    def responder(self, estado, datos, tipo, cookies=(), cache="no-store", extra=None):
        self.send_response(estado)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(datos)))
        self.send_header("Cache-Control", cache)
        self.cabeceras_seguridad()
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        for c in cookies:
            self.send_header("Set-Cookie", c)
        self.end_headers()
        if self.command != "HEAD":
            try:
                self.wfile.write(datos)
            except (BrokenPipeError, ConnectionResetError):
                self.close_connection = True

    def json(self, estado, cuerpo, cookies=()):
        self.responder(estado, json.dumps(cuerpo, ensure_ascii=False, default=str).encode("utf-8"),
                       "application/json; charset=utf-8", cookies)

    def _segura(self):
        return "; Secure" if self.app.publico else ""

    def cookie_sesion(self, token):
        if token is None:
            return f"{COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax{self._segura()}"
        return f"{COOKIE}={token}; Path=/; Max-Age={int(DURACION_SESION.total_seconds())}; HttpOnly; SameSite=Lax{self._segura()}"

    def quien(self):
        """Identificador anónimo del navegador que responde. Si no lo tiene, se le da uno."""
        actual = self.galleta(COOKIE_QUIEN)
        if actual and re.fullmatch(r"[A-Za-z0-9_-]{20,64}", actual):
            return actual, []
        nuevo = seguridad.nuevo_token()
        return nuevo, [f"{COOKIE_QUIEN}={nuevo}; Path=/; Max-Age={400 * 86400}; HttpOnly; SameSite=Lax{self._segura()}"]

    def leer_crudo(self):
        try:
            largo = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            largo = 0
        self._crudo = b""
        self._demasiado = largo > MAX_CUERPO
        if self._demasiado:
            self.close_connection = True
            return
        if largo > 0:
            self._crudo = self.rfile.read(largo)

    def cuerpo(self):
        if getattr(self, "_demasiado", False):
            raise ErrorApi(413, "La petición es demasiado grande.")
        if not getattr(self, "_crudo", b""):
            return {}
        try:
            datos = json.loads(self._crudo.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            raise ErrorApi(400, "La petición no trae un JSON válido.") from None
        if not isinstance(datos, dict):
            raise ErrorApi(400, "La petición no trae un JSON válido.")
        return datos

    def do_GET(self):
        ruta = urlsplit(self.path).path
        if ruta.startswith("/api/"):
            return self.api("GET")
        if re.fullmatch(rf"/f/{ENLACE}/?", ruta):
            return self.estatico("/f.html")
        return self.estatico(ruta)

    do_HEAD = do_GET

    def do_POST(self):
        return self.api("POST")

    def do_PUT(self):
        return self.api("PUT")

    def do_DELETE(self):
        return self.api("DELETE")

    def api(self, metodo):
        self.leer_crudo()
        try:
            self._api(metodo)
        except ErrorApi as err:
            self.json(err.estado, {"error": err.mensaje, **({"campo": err.campo} if err.campo else {})})
        except SBDError as err:
            self.log_message("SBD: %s", err)
            if getattr(err, "tipo", None) == "conexion":
                return self.json(503, {"error": "No hay conexión con la base de datos. Vuelve a intentarlo en un momento."})
            self.json(500, {"error": "La base de datos no ha podido hacer el cambio. No se ha guardado nada."})

    def _api(self, metodo):
        ruta = urlsplit(self.path).path
        app = self.app
        # Lo que cambia algo lleva una cabecera propia: un formulario HTML de otra web no puede ponerla.
        if metodo != "GET" and self.headers.get("X-Sforms") != "1":
            raise ErrorApi(403, "Petición rechazada.")

        if ruta == "/api/estado" and metodo == "GET":
            return self.json(200, {"ok": True, "registro": app.registro})

        # ---- quien responde: sin cuenta ----
        m = re.fullmatch(rf"/api/f/({ENLACE})", ruta)
        if m:
            quien, cookies = self.quien()
            if metodo == "GET":
                yo = app.usuario_de(self.galleta(COOKIE)) if "vista=1" in (urlsplit(self.path).query or "") else None
                return self.json(200, app.publico_formulario(m.group(1), quien, yo), cookies)
            if metodo == "POST":
                if not app.limite_envio.permitir(self.ip()):
                    raise ErrorApi(429, "Has enviado muchas respuestas seguidas. Espera unos minutos.")
                return self.json(200, app.enviar(m.group(1), quien, self.cuerpo()), cookies)
            raise ErrorApi(405, "Método no permitido.")

        # ---- cuentas ----
        if ruta == "/api/registro" and metodo == "POST":
            # Solo cuentan las cuentas creadas de verdad: un correo mal escrito no gasta intentos.
            if not app.limite_registro.permitir(self.ip(), anotar=False):
                raise ErrorApi(429, "Se han creado varias cuentas desde aquí. Prueba dentro de un rato.")
            token = app.registrar(self.cuerpo())
            app.limite_registro.anotar(self.ip())
            return self.json(200, {"ok": True}, [self.cookie_sesion(token)])
        if ruta == "/api/entrar" and metodo == "POST":
            if not app.limite_acceso.permitir(self.ip()):
                raise ErrorApi(429, "Demasiados intentos. Espera unos minutos.")
            token = app.entrar(self.cuerpo())
            return self.json(200, {"ok": True}, [self.cookie_sesion(token)])
        if ruta == "/api/salir" and metodo == "POST":
            app.salir(self.galleta(COOKIE))
            return self.json(200, {"ok": True}, [self.cookie_sesion(None)])

        yo = app.usuario_de(self.galleta(COOKIE))
        if ruta == "/api/yo" and metodo == "GET":
            return self.json(200, {"usuario": yo, "registro": app.registro})
        if not yo:
            raise ErrorApi(401, "Tienes que entrar en tu cuenta.")
        if ruta == "/api/yo" and metodo == "PUT":
            return self.json(200, app.cambiar_cuenta(yo, self.cuerpo()))
        if ruta == "/api/yo" and metodo == "DELETE":
            res = app.borrar_cuenta(yo, self.cuerpo())
            return self.json(200, res, [self.cookie_sesion(None)])

        if ruta == "/api/formularios":
            if metodo == "GET":
                return self.json(200, app.mis_formularios(yo))
            if metodo == "POST":
                return self.json(200, app.crear(yo, self.cuerpo()))
        m = re.fullmatch(r"/api/formularios/(\d+)(/copia|/respuestas(?:/(\d+)|\.csv)?)?", ruta)
        if m:
            fid, sub, rid = int(m.group(1)), m.group(2), m.group(3)
            if sub is None:
                if metodo == "GET":
                    return self.json(200, app.formulario(yo, fid))
                if metodo == "PUT":
                    return self.json(200, app.guardar(yo, fid, self.cuerpo()))
                if metodo == "DELETE":
                    return self.json(200, app.borrar(yo, fid))
            elif sub == "/copia" and metodo == "POST":
                return self.json(200, app.duplicar(yo, fid))
            elif sub == "/respuestas.csv" and metodo == "GET":
                f, texto = app.csv(yo, fid)
                nombre = re.sub(r"[^\w\- ]+", "", f["titulo"]).strip()[:60] or "respuestas"
                return self.responder(200, texto.encode("utf-8"), "text/csv; charset=utf-8", extra={
                    "Content-Disposition": f"attachment; filename=\"respuestas.csv\"; filename*=UTF-8''{quote(nombre)}.csv"})
            elif sub == "/respuestas" and metodo == "GET":
                return self.json(200, app.respuestas(yo, fid))
            elif sub == "/respuestas" and metodo == "DELETE":
                return self.json(200, app.borrar_respuestas(yo, fid))
            elif rid and metodo == "DELETE":
                return self.json(200, app.borrar_respuesta(yo, fid, int(rid)))
        raise ErrorApi(404, "Esa dirección de la API no existe.")

    def estatico(self, ruta):
        if ruta in ("/", ""):
            ruta = "/index.html"
        partes = [p for p in ruta.split("/") if p]
        destino = None
        if partes and not any(p in ("..", ".") or "\\" in p for p in partes):
            destino = (WEB / Path(*partes)).resolve()
        valido = destino is not None and WEB in destino.parents and destino.is_file() and destino.relative_to(WEB).parts[0] in ESTATICOS
        if not valido:
            pagina = WEB / "404.html"
            return self.responder(404, pagina.read_bytes() if pagina.exists() else b"No encontrado", "text/html; charset=utf-8")
        tipo = mimetypes.guess_type(destino.name)[0] or "application/octet-stream"
        if tipo.startswith("text/") or tipo == "image/svg+xml":
            tipo += "; charset=utf-8"
        cache = "public, max-age=604800" if partes[0] == "fuentes" else "no-cache"
        self.responder(200, destino.read_bytes(), tipo, cache=cache)


def crear_servidor(dir_datos, host="127.0.0.1", puerto=8106, publico=False):
    Path(dir_datos).mkdir(parents=True, exist_ok=True)
    bd = abrir_bd(dir_datos)
    bd.preparar()
    app = Aplicacion(bd, publico)
    manejador = type("ManejadorSforms", (Manejador,), {"app": app})
    servidor = ThreadingHTTPServer((host, puerto), manejador)
    servidor.daemon_threads = True
    return servidor, app, bd


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--puerto", type=int, default=8106)
    parser.add_argument("--datos", default=str(RAIZ / "datos"), help="carpeta donde SBD guarda la base «sforms»")
    parser.add_argument("--publico", action="store_true", help="detrás de un proxy con HTTPS: cookies Secure y X-Forwarded-For")
    parser.add_argument("--demo", action="store_true", help="si no hay cuentas, crea una de ejemplo con formularios y respuestas inventadas")
    parser.add_argument("--sin-registro", action="store_true", help="no deja crear cuentas nuevas desde la web")
    parser.add_argument("--sin-copias", action="store_true", help="no hace la copia diaria de la base en datos/.copias")
    args = parser.parse_args()

    servidor, app, bd = crear_servidor(args.datos, args.host, args.puerto, args.publico)
    app.registro = not args.sin_registro
    if args.demo:
        from api import demo
        cuenta = demo.sembrar(app)
        if cuenta:
            print(f"Cuenta de ejemplo: {cuenta[0]} · contraseña: {cuenta[1]}", flush=True)

    parar = threading.Event()

    def copias():
        while not parar.is_set():
            try:
                bd.copia_diaria(14)
            except Exception as err:  # noqa: BLE001
                print(f"No se pudo hacer la copia diaria: {err}", file=sys.stderr, flush=True)
            parar.wait(6 * 3600)

    if not args.sin_copias and not bd.remota:
        threading.Thread(target=copias, daemon=True).start()

    def al_parar(*_):
        parar.set()
        threading.Thread(target=servidor.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, al_parar)
    signal.signal(signal.SIGINT, al_parar)
    print(f"sforms en http://{args.host}:{args.puerto} · {bd.descripcion}", flush=True)
    try:
        servidor.serve_forever()
    finally:
        bd.cerrar()


if __name__ == "__main__":
    main()
