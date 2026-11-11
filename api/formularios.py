"""Formularios y respuestas: limpieza del contenido que llega del editor, validación de lo que envía
quien responde y exportación a CSV. Sin base de datos: aquí solo hay reglas."""

import csv
import io
import re
import secrets
from datetime import date

TIPOS = ("corta", "parrafo", "unica", "varias", "desplegable", "escala", "valoracion", "fecha", "hora", "seccion", "texto")
SIN_RESPUESTA = ("seccion", "texto")
CON_OPCIONES = ("unica", "varias", "desplegable")
COLORES = ("agua", "rosa", "lila", "menta", "melocoton", "limon")
VALIDACIONES = ("ninguna", "correo", "numero", "telefono", "url")

MAX_PREGUNTAS = 200
MAX_OPCIONES = 100
MAX_CORTA = 500
MAX_PARRAFO = 5000
MAX_CONTENIDO = 300_000      # caracteres del JSON del formulario

ID_VALIDO = re.compile(r"^[a-z0-9]{4,16}$")
CORREO = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
NUMERO = re.compile(r"^-?\d+(?:[.,]\d+)?$")
TELEFONO = re.compile(r"^\+?[\d\s().-]{6,20}$")
URL = re.compile(r"^https?://\S+\.\S+$", re.I)
FECHA = re.compile(r"^\d{4}-\d{2}-\d{2}$")
HORA = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


class ErrorFormulario(ValueError):
    """Un fallo que se le puede contar a quien escribe: va con la pregunta a la que afecta."""

    def __init__(self, mensaje, pregunta=None):
        super().__init__(mensaje)
        self.mensaje, self.pregunta = mensaje, pregunta


def nuevo_enlace():
    return secrets.token_urlsafe(9)[:12].replace("-", "x").replace("_", "y")


def nuevo_id():
    return secrets.token_hex(4)


def _txt(valor, largo):
    valor = "" if valor is None else str(valor)
    return valor.strip()[:largo]


def _entero(valor, defecto, minimo, maximo):
    try:
        n = int(valor)
    except (TypeError, ValueError):
        return defecto
    return max(minimo, min(maximo, n))


def limpiar_pregunta(p, vistos):
    if not isinstance(p, dict):
        return None
    tipo = p.get("tipo") if p.get("tipo") in TIPOS else "corta"
    pid = str(p.get("id") or "")
    if not ID_VALIDO.match(pid) or pid in vistos:
        pid = nuevo_id()
        while pid in vistos:
            pid = nuevo_id()
    vistos.add(pid)
    q = {"id": pid, "tipo": tipo, "titulo": _txt(p.get("titulo"), 500), "ayuda": _txt(p.get("ayuda"), 2000)}
    if tipo in SIN_RESPUESTA:
        return q
    q["obligatoria"] = bool(p.get("obligatoria"))
    if tipo in CON_OPCIONES:
        opciones, repetidas = [], set()
        for o in (p.get("opciones") or [])[:MAX_OPCIONES]:
            o = _txt(o, 300)
            if o and o not in repetidas:
                repetidas.add(o)
                opciones.append(o)
        q["opciones"] = opciones
        if tipo != "desplegable":
            q["otro"] = bool(p.get("otro"))
        if tipo == "varias":
            q["minimo"] = _entero(p.get("minimo"), 0, 0, MAX_OPCIONES)
            q["maximo"] = _entero(p.get("maximo"), 0, 0, MAX_OPCIONES)     # 0 = sin tope
            if q["maximo"] and q["minimo"] > q["maximo"]:
                q["minimo"] = q["maximo"]
    elif tipo == "corta":
        q["validacion"] = p.get("validacion") if p.get("validacion") in VALIDACIONES else "ninguna"
    elif tipo == "escala":
        q["desde"] = _entero(p.get("desde"), 1, 0, 1)
        q["hasta"] = _entero(p.get("hasta"), 5, 2, 10)
        q["etiquetaDesde"] = _txt(p.get("etiquetaDesde"), 60)
        q["etiquetaHasta"] = _txt(p.get("etiquetaHasta"), 60)
    elif tipo == "valoracion":
        q["maximo"] = _entero(p.get("maximo"), 5, 3, 10)
    return q


def limpiar_contenido(contenido):
    """Lo que manda el editor, reducido a lo que se sabe guardar. Nunca falla por un campo raro: lo quita."""
    if not isinstance(contenido, dict):
        contenido = {}
    vistos = set()
    preguntas = [q for q in (limpiar_pregunta(p, vistos) for p in (contenido.get("preguntas") or [])[:MAX_PREGUNTAS]) if q]
    a = contenido.get("ajustes") if isinstance(contenido.get("ajustes"), dict) else {}
    ajustes = {
        "confirmacion": _txt(a.get("confirmacion"), 1000) or "Hemos recibido tu respuesta.",
        "cerrado": _txt(a.get("cerrado"), 1000) or "Este formulario ya no admite respuestas.",
        "unaRespuesta": bool(a.get("unaRespuesta")),
        "otraRespuesta": a.get("otraRespuesta", True) is not False,
        "progreso": a.get("progreso", True) is not False,
        "limite": _entero(a.get("limite"), 0, 0, 100_000),           # 0 = sin límite de respuestas
    }
    return {"descripcion": _txt(contenido.get("descripcion"), 4000), "preguntas": preguntas, "ajustes": ajustes}


def con_respuesta(contenido):
    return [p for p in contenido.get("preguntas", []) if p["tipo"] not in SIN_RESPUESTA]


def _vacia(valor):
    return valor is None or valor == "" or valor == [] or (isinstance(valor, dict) and not _txt(valor.get("otro"), MAX_CORTA))


def validar_respuesta(contenido, enviado):
    """Comprueba lo que manda quien responde contra las preguntas y devuelve solo lo válido.
    Falla con la primera pregunta mal contestada, para que la página pueda señalarla."""
    if not isinstance(enviado, dict):
        raise ErrorFormulario("No ha llegado ninguna respuesta.")
    limpio = {}
    for p in con_respuesta(contenido):
        pid, tipo = p["id"], p["tipo"]
        valor = enviado.get(pid)
        if _vacia(valor):
            if p.get("obligatoria"):
                raise ErrorFormulario("Esta pregunta es obligatoria.", pid)
            continue
        if tipo in ("corta", "parrafo"):
            if not isinstance(valor, (str, int, float)):
                raise ErrorFormulario("La respuesta no es un texto.", pid)
            largo = MAX_CORTA if tipo == "corta" else MAX_PARRAFO
            valor = str(valor).strip()
            if len(valor) > largo:
                raise ErrorFormulario(f"Como mucho {largo} caracteres.", pid)
            if not valor:
                if p.get("obligatoria"):
                    raise ErrorFormulario("Esta pregunta es obligatoria.", pid)
                continue
            v = p.get("validacion", "ninguna")
            if v == "correo" and not CORREO.match(valor):
                raise ErrorFormulario("Escribe un correo con @ y dominio, como nombre@ejemplo.es.", pid)
            if v == "numero" and not NUMERO.match(valor):
                raise ErrorFormulario("Aquí va un número (por ejemplo, 12 o 3,5).", pid)
            if v == "telefono" and not TELEFONO.match(valor):
                raise ErrorFormulario("Ese teléfono no parece válido.", pid)
            if v == "url" and not URL.match(valor):
                raise ErrorFormulario("Escribe la dirección entera, empezando por https://", pid)
            limpio[pid] = valor
        elif tipo in ("unica", "desplegable"):
            if isinstance(valor, dict) and p.get("otro"):
                limpio[pid] = {"otro": _txt(valor.get("otro"), MAX_CORTA)}
            elif isinstance(valor, str) and valor in p["opciones"]:
                limpio[pid] = valor
            else:
                raise ErrorFormulario("Esa opción no está en la lista.", pid)
        elif tipo == "varias":
            if not isinstance(valor, list):
                raise ErrorFormulario("La respuesta no es una lista de opciones.", pid)
            elegidas = []
            for v in valor:
                if isinstance(v, dict) and p.get("otro"):
                    otro = _txt(v.get("otro"), MAX_CORTA)
                    if otro:
                        elegidas.append({"otro": otro})
                elif isinstance(v, str) and v in p["opciones"]:
                    if v not in elegidas:
                        elegidas.append(v)
                else:
                    raise ErrorFormulario("Una de las opciones no está en la lista.", pid)
            if not elegidas:
                if p.get("obligatoria"):
                    raise ErrorFormulario("Esta pregunta es obligatoria.", pid)
                continue
            if p.get("minimo") and len(elegidas) < p["minimo"]:
                raise ErrorFormulario(f"Elige {p['minimo']} como mínimo.", pid)
            if p.get("maximo") and len(elegidas) > p["maximo"]:
                raise ErrorFormulario(f"Elige {p['maximo']} como máximo.", pid)
            limpio[pid] = elegidas
        elif tipo in ("escala", "valoracion"):
            desde, hasta = (p["desde"], p["hasta"]) if tipo == "escala" else (1, p["maximo"])
            if isinstance(valor, bool) or not isinstance(valor, (int, str)) or not str(valor).isdigit() or not desde <= int(valor) <= hasta:
                raise ErrorFormulario(f"Elige un valor del {desde} al {hasta}.", pid)
            limpio[pid] = int(valor)
        elif tipo == "fecha":
            try:
                if not isinstance(valor, str) or not FECHA.match(valor):
                    raise ValueError
                date.fromisoformat(valor)
            except ValueError:
                raise ErrorFormulario("Esa fecha no existe.", pid) from None
            limpio[pid] = valor
        elif tipo == "hora":
            if not isinstance(valor, str) or not HORA.match(valor):
                raise ErrorFormulario("Escribe la hora como 09:30.", pid)
            limpio[pid] = valor
    return limpio


def como_texto(valor):
    if valor is None:
        return ""
    if isinstance(valor, list):
        return "; ".join(como_texto(v) for v in valor)
    if isinstance(valor, dict):
        return f"Otro: {valor.get('otro', '')}"
    return str(valor)


def _sin_formula(celda):
    """Que una hoja de cálculo no ejecute lo que alguien escribió en el formulario (=, +, -, @)."""
    return "'" + celda if celda[:1] in ("=", "+", "-", "@", "\t", "\r") else celda


def csv_respuestas(contenido, filas):
    preguntas = con_respuesta(contenido)
    ids_actuales = {p["id"] for p in preguntas}
    # Respuestas a preguntas que ya se han borrado: van al final, para no perder nada.
    antiguas = []
    for f in filas:
        for k in f["valores"]:
            if k not in ids_actuales and k not in antiguas:
                antiguas.append(k)
    salida = io.StringIO()
    escritor = csv.writer(salida, delimiter=";")
    escritor.writerow(["Enviada"] + [p["titulo"] or "Pregunta sin título" for p in preguntas] + [f"(pregunta borrada {k})" for k in antiguas])
    for f in filas:
        escritor.writerow([f["enviada_en"]] + [_sin_formula(como_texto(f["valores"].get(k))) for k in [p["id"] for p in preguntas] + antiguas])
    return "﻿" + salida.getvalue()     # la marca del principio hace que Excel lo lea en UTF-8
