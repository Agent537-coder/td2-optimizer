"""Local static review server. No production account or admin API."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        path = urlsplit(self.path).path
        if path in ('/', '/build', '/build/'):
            self.path = '/dashboard_build.html' + ('?' + self.path.split('?', 1)[1] if '?' in self.path else '')
        elif path.startswith(('/forum', '/api/')):
            self.send_error(404, 'Standalone planner: production APIs are not included')
            return
        super().do_GET()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent / 'web'
    server = ThreadingHTTPServer(('127.0.0.1', args.port), partial(Handler, directory=str(root)))
    print(f'Planner: http://127.0.0.1:{args.port}/build/', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
