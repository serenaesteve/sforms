# sforms · formularios gota a gota

Crea formularios, comparte el enlace y mira las respuestas con sus gráficas. Quien responde no necesita cuenta.

- **Preguntas:** respuesta corta (con validación de correo, número, teléfono o enlace), párrafo, una opción, varias opciones (con «Otro» y límite de elecciones), desplegable, escala, valoración con gotas, fecha y hora. También títulos con texto y secciones, que parten el formulario en páginas.
- **Editor:** se guarda solo. Puedes arrastrar las preguntas y las opciones (o moverlas con las flechas), pegar una lista para crear todas las opciones de golpe, duplicar, y borrar con «Deshacer». Hay 6 colores y 5 plantillas.
- **Respuestas:** resumen con gráficas, vista «una a una», descarga en CSV para Excel, abrir o cerrar el formulario y límite de respuestas.
- **Quien responde:** barra de progreso, avisos en cada campo, borrador guardado en su navegador, «una respuesta por persona» y vista previa para quien crea el formulario.
- Modo claro y oscuro, móvil y escritorio.

## En local

```bash
python3 servidor.py --demo          # http://127.0.0.1:8106 · demo@sforms.local / sforms-demo
```

Sin dependencias: Python 3.10+ y SBD, copiado en `sbd/`. Los datos van a `./datos`, en la base `sforms`. Si existe `datos/sbd.json`, usa un servidor de SBD en vez de la base local.

## Pruebas

```bash
python3 -m unittest discover -s pruebas -t .                 # servidor (15)
/root/life-dashboard/.venv/bin/python pruebas/navegador.py   # de punta a punta en Chromium (18)
```

## Publicar en sforms.serenaesteve.com

```bash
sudo bash despliegue/integrar-sbd.sh   # solo la primera vez: copia de SBD, base «sforms», usuario sforms_app y clave
sudo bash despliegue/desplegar.sh      # cada vez que cambie el código; no toca los datos
```

Servicio `sforms.service` (usuario `sforms`, 127.0.0.1:8106, `--publico`), código en /srv/sforms/app y clave de SBD en /srv/sforms/datos/sbd.json.

## Cómo está hecho

- `servidor.py`: HTTP, cuentas y API. `api/formularios.py`: limpieza del formulario, validación de cada respuesta y CSV. `api/migraciones/*.sbd`: el esquema, en el lenguaje de SBD.
- Las preguntas se guardan juntas como JSON en `formularios.contenido`. Cada respuesta guarda sus valores por id de pregunta, así que borrar o cambiar una pregunta no hace perder respuestas: siguen en el CSV.
- `web/js`: módulos sin compilar. `tipos.js` pinta cada tipo de pregunta y lo usan el editor, la página de responder y la vista de cada respuesta.
- Seguridad: contraseñas con PBKDF2 y sesión en cookie HttpOnly. Todo lo que cambia algo lleva la cabecera `X-Sforms` (contra CSRF). Hay frenos por IP en el acceso, el registro y el envío. Cada cuenta solo ve lo suyo. El CSV neutraliza las fórmulas (`=`, `+`, `-`, `@`).
