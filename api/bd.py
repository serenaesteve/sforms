"""Acceso a SBD para sforms.

Dos modos, con la misma interfaz:
  · local:    SBD dentro del proceso, en una carpeta de datos (desarrollo y pruebas).
  · servidor: un servidor de SBD por su API, con una clave de API (producción). Se activa con
              datos/sbd.json → {"url": "http://127.0.0.1:8090", "clave": "sbd_k…", "base": "sforms"}.

Las peticiones se atienden de una en una sobre la base (un cerrojo por proceso): cada orden y cada
transacción ven datos coherentes, y las transacciones remotas no se pisan entre sí.
"""

import json
import threading
from contextlib import contextmanager
from pathlib import Path

import sbd
from sbd.cliente import Cliente

BASE = "sforms"
DIR_MIGRACIONES = Path(__file__).with_name("migraciones")


def migraciones():
    return sorted((int(r.name[:3]), r) for r in DIR_MIGRACIONES.glob("[0-9][0-9][0-9]_*.sbd"))


class Conexion:
    """Lo que usa la app: ejecutar, consultar, una, valor y transaccion."""

    def __init__(self, ejecutor):
        self._e = ejecutor

    def ejecutar(self, orden, params=()):
        return self._e(orden, list(params))

    def consultar(self, orden, params=()):
        return self.ejecutar(orden, params).dicts()

    def una(self, orden, params=()):
        filas = self.consultar(orden, params)
        return filas[0] if filas else None

    def valor(self, orden, params=()):
        return self.ejecutar(orden, params).scalar()

    @contextmanager
    def transaccion(self):
        self.ejecutar("empezar")
        try:
            yield self
        except BaseException:
            self.ejecutar("deshacer")
            raise
        self.ejecutar("confirmar")


class ConexionRemota(Conexion):
    """Fuera de una transacción, cada orden va sola. Dentro, se abre una sesión del servidor para que
    «empezar», las órdenes y «confirmar» vayan juntas."""

    def __init__(self, cliente):
        self._cli = cliente
        self._sesion = None
        super().__init__(lambda orden, params: (self._sesion or self._cli).ejecutar(orden, params))

    @contextmanager
    def transaccion(self):
        if self._sesion is not None:
            yield self
            return
        self._sesion = Cliente(self._cli.url, self._cli.clave, self._cli.base, self._cli.tiempo)
        self._sesion.abrir_sesion()
        try:
            self._sesion.ejecutar("empezar")
            try:
                yield self
            except BaseException:
                self._sesion.ejecutar("deshacer")
                raise
            self._sesion.ejecutar("confirmar")
        finally:
            try:
                self._sesion.cerrar_sesion()
            finally:
                self._sesion = None


class BaseDatos:
    """SBD dentro del proceso."""

    remota = False

    def __init__(self, directorio):
        self.directorio = Path(directorio).resolve()
        self.directorio.mkdir(parents=True, exist_ok=True)
        self._cerrojo = threading.RLock()
        self._servidor = sbd.servidor(str(self.directorio))
        self.descripcion = f"SBD local en {self.directorio / (BASE + '.base')}"

    @contextmanager
    def conexion(self, quien="sforms"):
        with self._cerrojo:
            sesion = sbd.Sesion(self._servidor, BASE, etiqueta=quien)
            try:
                yield Conexion(sesion.ejecutar)
            finally:
                sesion.cerrar()

    def _crear_base_si_falta(self):
        if not self._servidor.existe(BASE):
            self._servidor.crear(BASE)

    def preparar(self):
        """Crea la base si no existe y aplica las migraciones pendientes, cada una en su transacción."""
        with self._cerrojo:
            self._crear_base_si_falta()
            with self.conexion("sforms · migraciones") as con:
                tablas = {fila[0] for fila in con.ejecutar("tablas").rows}
                version = 0
                if "ajustes" in tablas:
                    v = con.valor('buscar ajustes donde clave = "version_esquema" mostrar valor')
                    version = int(v) if v else 0
                for numero, ruta in migraciones():
                    if numero <= version:
                        continue
                    with con.transaccion():
                        con.ejecutar(ruta.read_text(encoding="utf-8"))
                        con.ejecutar('insertar o actualizar en ajustes { clave: "version_esquema", valor: ? }', [str(numero)])

    def copia_diaria(self, conservar=14):
        with self._cerrojo:
            return self._servidor.copia_diaria(conservar)

    def cerrar(self):
        with self._cerrojo:
            self._servidor.cerrar()


class BaseDatosRemota(BaseDatos):
    """Un servidor de SBD por su API. La base la crea quien administra SBD: la clave de esta app solo
    llega a su base. Las copias diarias las hace el propio servidor de SBD."""

    remota = True

    def __init__(self, url, clave, base):
        self.url, self.base = url.rstrip("/"), base
        self._cerrojo = threading.RLock()
        self._cliente = Cliente(self.url, clave, base, tiempo=30)
        self.descripcion = f"servidor SBD {self.url}, base «{base}»"

    @contextmanager
    def conexion(self, quien="sforms"):
        with self._cerrojo:
            yield ConexionRemota(self._cliente)

    def _crear_base_si_falta(self):
        pass

    def copia_diaria(self, conservar=14):
        return None

    def cerrar(self):
        pass


def abrir(directorio):
    """La base que toca: el servidor de SBD si hay datos/sbd.json; si no, SBD local en la carpeta."""
    ruta = Path(directorio) / "sbd.json"
    if ruta.exists():
        cfg = json.loads(ruta.read_text(encoding="utf-8"))
        return BaseDatosRemota(cfg["url"], cfg["clave"], cfg.get("base") or BASE)
    return BaseDatos(directorio)
