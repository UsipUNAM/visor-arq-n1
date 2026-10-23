"""Servidor local del visor HERMES: sirve esta carpeta en http://localhost:8765 y abre el navegador.

Además de servir archivos, recibe las notas de auditoría (POST /guardar-notas) y las escribe en
visor/notas_auditoria.md; la versión anterior se guarda antes en visor/notas_respaldo/.
Uso: doble clic en abrir_visor.bat (o: python servidor.py [--sin-navegador]).
"""
import datetime
import http.server
import os
import shutil
import socket
import sys
import threading
import webbrowser

PUERTO = 8765
AQUI = os.path.dirname(os.path.abspath(__file__))
URL = f'http://localhost:{PUERTO}/'
NOTAS = os.path.join(AQUI, 'notas_auditoria.md')

TIPOS = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
         '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
         '.md': 'text/markdown; charset=utf-8', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary',
         '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml'}


class Manejador(http.server.SimpleHTTPRequestHandler):
    # Windows a veces registra .js como text/plain y el navegador rechaza los módulos: tipos fijos
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, **TIPOS}

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=AQUI, **kw)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def do_GET(self):
        if self.path.split('?')[0] == '/notas_auditoria.md' and not os.path.exists(NOTAS):
            self.send_response(204)                     # todavía no hay notas: sin error en la consola
            self.end_headers()
            return
        super().do_GET()

    def do_POST(self):
        if self.path != '/guardar-notas':
            self.send_error(404)
            return
        n = int(self.headers.get('Content-Length', 0))
        texto = self.rfile.read(n).decode('utf-8')
        if os.path.exists(NOTAS):
            dest = os.path.join(AQUI, 'notas_respaldo')
            os.makedirs(dest, exist_ok=True)
            sello = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
            shutil.copy2(NOTAS, os.path.join(dest, f'notas_auditoria_{sello}.md'))
        with open(NOTAS, 'w', encoding='utf-8', newline='\n') as f:
            f.write(texto)
        cuerpo = b'ok'
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.send_header('Content-Length', str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def log_message(self, fmt, *args):
        if args and '/guardar-notas' in str(args[0]):
            print('  notas guardadas en', NOTAS)


def ocupado():
    with socket.socket() as s:
        return s.connect_ex(('127.0.0.1', PUERTO)) == 0


def main():
    abrir = '--sin-navegador' not in sys.argv
    if ocupado():
        print(f'El visor ya está corriendo en {URL}; solo abro el navegador.')
        if abrir:
            webbrowser.open(URL)
        return
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', PUERTO), Manejador)
    print(f'Visor HERMES en {URL}')
    print('Deja esta ventana abierta mientras revisas; ciérrala para apagar el visor.')
    if abrir:
        threading.Timer(0.6, lambda: webbrowser.open(URL)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
