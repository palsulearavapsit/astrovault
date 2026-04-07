import http.server
import socketserver
import os
import sys
import webbrowser
from threading import Timer

# ===== AstroVault Configuration Sync =====
def sync_env_to_config():
    """Reads .env and generates config.js so browser can access keys."""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    env_path = os.path.join(base_dir, ".env")
    config_path = os.path.join(base_dir, "config.js")
    
    if not os.path.exists(env_path):
        print("⚠️ Warning: .env file not found. Mission control may fail without keys.")
        return

    # Load .env into a dictionary
    env_vars = {}
    try:
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                # Skip empty lines and comments
                if not line or line.startswith("#"): continue
                # Split only on the first '=' to handle values containing '='
                if "=" in line:
                    key, val = line.split("=", 1)
                    env_vars[key.strip()] = val.strip().strip('"').strip("'")
    except Exception as e:
        print(f"❌ Error reading .env: {e}")
        return

    # Mapping .env keys to the APP_CONFIG structure
    config_template = f"""// ⚡ AUTO-GENERATED from .env — DO NOT EDIT MANUALLY
// Last synced: {os.popen('date /t' if os.name == 'nt' else 'date').read().strip()}
const APP_CONFIG = {{
  FIREBASE: {{
    apiKey: "{env_vars.get('FIREBASE_API_KEY', '')}",
    authDomain: "{env_vars.get('FIREBASE_AUTH_DOMAIN', '')}",
    projectId: "{env_vars.get('FIREBASE_PROJECT_ID', '')}",
    storageBucket: "{env_vars.get('FIREBASE_STORAGE_BUCKET', '')}",
    messagingSenderId: "{env_vars.get('FIREBASE_MESSAGING_SENDER_ID', '')}",
    appId: "{env_vars.get('FIREBASE_APP_ID', '')}",
    measurementId: "{env_vars.get('FIREBASE_MEASUREMENT_ID', '')}"
  }},
  IMGBB_API_KEY: "{env_vars.get('IMGBB_API_KEY', '')}",
  GOOGLE_VISION_API_KEY: "{env_vars.get('GOOGLE_VISION_API_KEY', '')}",
  HF_TOKEN: "{env_vars.get('HF_TOKEN', '')}",
  GEMINI_API_KEY: "{env_vars.get('GEMINI_API_KEY', '')}",
  AWS_ACCESS_KEY_ID: "{env_vars.get('AWS_ACCESS_KEY_ID', '')}",
  AWS_SECRET_ACCESS_KEY: "{env_vars.get('AWS_SECRET_ACCESS_KEY', '')}",
  AWS_REGION: "{env_vars.get('AWS_REGION', '')}",
  AWS_S3_BUCKET: "{env_vars.get('AWS_S3_BUCKET', '')}"
}};
"""
    try:
        with open(config_path, "w", encoding="utf-8") as f:
            f.write(config_template)
        print("✨ AstroVault: Synced .env to config.js successfully.")
    except Exception as e:
        print(f"❌ Error syncing config: {e}")

# ===== AstroVault Server Configuration =====
PORT = int(os.environ.get("ASTROVAULT_PORT", "5000"))
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
    # Ensure config.js is fresh before starting
    sync_env_to_config()
    
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
