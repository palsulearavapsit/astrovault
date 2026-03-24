import http.server
import socketserver
import os
import sys
import webbrowser
from threading import Timer

# ===== AstroVault Server Configuration =====
PORT = 5000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class AstroHandler(http.server.SimpleHTTPRequestHandler):
    """Custom handler to serve the gallery with aesthetic logs."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def log_message(self, format, *args):
        sys.stderr.write("📡 [%s] %s\n" % (self.log_date_time_string(), format % args))

def open_browser():
    """Opens the local server URL in the default web browser."""
    webbrowser.open(f"http://localhost:{PORT}")

def start_server():
    """Initializes and starts the local web server."""
    try:
        # Change working directory to ensure we serve the right files
        os.chdir(DIRECTORY)
        
        with socketserver.TCPServer(("", PORT), AstroHandler) as httpd:
            print("=" * 60)
            print("✨ ASTROVAULT — Astronomy Cloud Gallery ✨")
            print("=" * 60)
            print(f"🚀 Mission Launch at: http://localhost:{PORT}")
            print("🔭 Press Ctrl+C to shut down mission control.")
            print("-" * 60)

            # Automatically open browser after a short delay
            Timer(1.2, open_browser).start()
            
            httpd.serve_forever()
            
    except OSError as e:
        if e.errno == 98 or e.errno == 10048:
            print(f"❌ Error: Port {PORT} already active.")
            print("💡 Close the existing process and retry.")
        else:
            print(f"❌ Mission failure: {e}")
    except KeyboardInterrupt:
        print("\n🛑 Ground control to Major Tom: Mission terminated.")
        sys.exit(0)

if __name__ == "__main__":
    start_server()
