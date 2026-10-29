"""Serve the suite on this computer and open its start page. Python stdlib only."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import webbrowser

def main():
    root = Path(__file__).resolve().parents[1]
    handler = partial(SimpleHTTPRequestHandler, directory=str(root))
    try:
        server = ThreadingHTTPServer(('127.0.0.1', 8000), handler)
    except OSError as error:
        raise SystemExit('Cannot start the suite on port 8000. Close any previous suite server and retry.\n' + str(error))
    address = 'http://localhost:8000/index.html'
    print('Sedano\'s Email Suite is running at ' + address)
    print('Keep this window open while using the suite. Press Ctrl+C to stop.')
    webbrowser.open(address)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nSuite server stopped.')
    finally:
        server.server_close()

if __name__ == '__main__':
    main()
