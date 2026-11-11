"""Cuenta de ejemplo con tres formularios y respuestas inventadas, para probar sforms en local.
Solo se crea si no hay ninguna cuenta. Nada de esto es de nadie real."""

import json
import random
from datetime import datetime, timedelta

from api import formularios as fm

CORREO = "demo@sforms.local"
CLAVE = "sforms-demo"

NOMBRES = ["Lucía", "Martín", "Noa", "Hugo", "Vera", "Leo", "Alba", "Pablo", "Irene", "Dani", "Carla", "Mateo",
           "Sara", "Íker", "Julia", "Álex", "Nerea", "Bruno", "Elsa", "Gael", "Olivia", "Marco", "Inés", "Teo"]
APELLIDOS = ["García", "Navarro", "Ruiz", "Ortega", "Molina", "Serrano", "Blasco", "Ferrer", "Vidal", "Pastor", "Soler", "Marín"]


def _p(tipo, titulo, **extra):
    return {"id": fm.nuevo_id(), "tipo": tipo, "titulo": titulo, **extra}


def formularios():
    return [
        {
            "titulo": "Taller de cerámica de otoño",
            "color": "melocoton",
            "contenido": {
                "descripcion": "Cuatro sábados de torno y esmaltes en el local de la asociación. Plazas limitadas: te escribimos para confirmar.",
                "preguntas": [
                    _p("corta", "Nombre y apellidos", obligatoria=True),
                    _p("corta", "Correo", obligatoria=True, validacion="correo", ayuda="Te mandamos ahí la confirmación."),
                    _p("unica", "¿Has trabajado antes con barro?", obligatoria=True,
                       opciones=["Nunca", "Alguna vez", "Bastante"], otro=False),
                    _p("varias", "¿Qué sábados puedes venir?", obligatoria=True, minimo=1,
                       opciones=["8 de noviembre", "15 de noviembre", "22 de noviembre", "29 de noviembre"]),
                    _p("desplegable", "¿Cómo te has enterado?", opciones=["Cartel del barrio", "Instagram", "Me lo contó alguien", "Otra edición"]),
                    _p("seccion", "Un par de cosas más", ayuda="Para preparar el material."),
                    _p("parrafo", "¿Alguna alergia o algo que debamos saber?"),
                    _p("valoracion", "¿Cuántas ganas tienes?", maximo=5),
                ],
                "ajustes": {"confirmacion": "¡Apuntada la plaza! Te escribimos esta semana para confirmarla.", "unaRespuesta": True},
            },
        },
        {
            "titulo": "¿Qué tal el curso?",
            "color": "agua",
            "contenido": {
                "descripcion": "Cinco minutos y anónima. Lo leemos todo y nos sirve para preparar el siguiente.",
                "preguntas": [
                    _p("escala", "¿Lo recomendarías a alguien?", obligatoria=True, desde=0, hasta=10,
                       etiquetaDesde="Nada", etiquetaHasta="Sin dudarlo"),
                    _p("varias", "¿Qué es lo que más te ha servido?",
                       opciones=["Las prácticas", "Los apuntes", "Las tutorías", "El grupo"], otro=True),
                    _p("valoracion", "Nota para el ritmo de las clases", obligatoria=True, maximo=5),
                    _p("unica", "¿Te apuntarías al nivel 2?", obligatoria=True, opciones=["Sí", "Puede", "No"]),
                    _p("parrafo", "¿Qué cambiarías?"),
                ],
                "ajustes": {"confirmacion": "Gracias, de verdad. Lo leemos todo."},
            },
        },
        {
            "titulo": "Camisetas de fin de curso",
            "color": "lila",
            "contenido": {
                "descripcion": "Hacemos el pedido el viernes. 12 € cada una, se pagan al recogerlas.",
                "preguntas": [
                    _p("corta", "Tu nombre", obligatoria=True),
                    _p("desplegable", "Talla", obligatoria=True, opciones=["XS", "S", "M", "L", "XL"]),
                    _p("unica", "Color", obligatoria=True, opciones=["Blanca", "Lila", "Negra"]),
                    _p("corta", "¿Cuántas?", obligatoria=True, validacion="numero"),
                    _p("fecha", "¿Qué día te viene bien recogerla?"),
                ],
                "ajustes": {"confirmacion": "Pedido apuntado. Te avisamos cuando lleguen."},
            },
        },
    ]


def _respuestas(contenido, n, azar):
    """Respuestas verosímiles: las primeras opciones salen más, como pasa en los formularios de verdad."""
    salida = []
    for i in range(n):
        nombre = f"{azar.choice(NOMBRES)} {azar.choice(APELLIDOS)}"
        v = {}
        for p in fm.con_respuesta(contenido):
            if not p.get("obligatoria") and azar.random() < 0.3:
                continue
            t = p["tipo"]
            if t == "corta":
                v[p["id"]] = {"correo": f"{nombre.split()[0].lower()}{i}@correo.example",
                              "numero": str(azar.choice([1, 1, 1, 2, 2, 3]))}.get(p.get("validacion"), nombre)
            elif t == "parrafo":
                v[p["id"]] = azar.choice(["Más horas de práctica.", "Nada, me ha encantado.", "Que empiece un poco más tarde.",
                                          "Soy alérgica al látex.", "Más ejemplos reales en clase.", "Todo bien."])
            elif t in ("unica", "desplegable"):
                pesos = [len(p["opciones"]) - k + 1 for k in range(len(p["opciones"]))]
                v[p["id"]] = azar.choices(p["opciones"], pesos)[0]
            elif t == "varias":
                elegidas = [o for o in p["opciones"] if azar.random() < 0.55] or [p["opciones"][0]]
                if p.get("otro") and azar.random() < 0.15:
                    elegidas.append({"otro": "Los descansos con café"})
                v[p["id"]] = elegidas
            elif t == "escala":
                v[p["id"]] = max(p["desde"], min(p["hasta"], round(azar.gauss(8, 1.6))))
            elif t == "valoracion":
                v[p["id"]] = max(1, min(p["maximo"], round(azar.gauss(4, 0.9))))
            elif t == "fecha":
                v[p["id"]] = f"2026-11-{azar.choice([20, 21, 24, 25]):02d}"
            elif t == "hora":
                v[p["id"]] = azar.choice(["10:00", "17:30"])
        salida.append(fm.validar_respuesta(contenido, v))
    return salida


def sembrar(app):
    with app.bd.conexion() as con:
        if con.valor("buscar usuarios mostrar contar()"):
            return None
    app.registrar({"correo": CORREO, "nombre": "Serena", "contrasena": CLAVE})
    with app.bd.conexion() as con:
        yo = con.una("buscar usuarios donde correo = ? mostrar id, correo, nombre", [CORREO])
    azar = random.Random(11)
    base = datetime.now() - timedelta(days=9)
    for f, n in zip(formularios(), (23, 41, 17)):
        creado = app.crear(yo, f)
        contenido = creado["contenido"]
        with app.bd.conexion("demo") as con:
            with con.transaccion():
                for k, valores in enumerate(_respuestas(contenido, n, azar)):
                    momento = base + timedelta(minutes=k * azar.randint(40, 300))
                    con.ejecutar("insertar en respuestas { formulario_id: ?, enviada_en: ?, valores: ? }",
                                 [creado["id"], momento.strftime("%Y-%m-%d %H:%M:%S"), json.dumps(valores, ensure_ascii=False)])
    return CORREO, CLAVE
