from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
import threading
import webbrowser

PORT = 8000

# Always serve the folder where run.py is located
project_folder = Path(__file__).resolve().parent
os.chdir(project_folder)

url = f"http://localhost:{PORT}/index.html"

server = ThreadingHTTPServer(
    ("localhost", PORT),
        SimpleHTTPRequestHandler
)

print(f"OrbitWatch running at {url}")
print("Press Ctrl+C to stop.")

# Open the browser shortly after the server starts
threading.Timer(
        0.7,
        lambda: webbrowser.open(url)
).start()

try:
        serveserve_forever()
)