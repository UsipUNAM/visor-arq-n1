#!/bin/bash
# Visor 3D en Mac: doble clic. Levanta el servidor local (python3 viene con las herramientas de macOS) y abre el navegador.
cd "$(dirname "$0")"
exec python3 servidor.py
