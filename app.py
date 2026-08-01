"""
NVIDIA-GPU-PowerMonitor - Real-time NVIDIA GPU Monitoring
Copyright (c) 2026 Aditya Guha
Licensed under the MIT License. See LICENSE file in the project root for full license information.

Flask + SocketIO backend that streams GPU metrics via WebSocket.
"""

import os
import subprocess
import random
import time
from flask import Flask, render_template
from flask_socketio import SocketIO, emit

# ---------------------------------------------------------------------------
# App Configuration
# ---------------------------------------------------------------------------
app = Flask(__name__)
app.config["SECRET_KEY"] = "gpu-power-monitor-secret"
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet")

# Enable mock data when nvidia-smi is unavailable (set GPU_MONITOR_MOCK=1)
MOCK_MODE = os.environ.get("GPU_MONITOR_MOCK", "0") == "1"

# nvidia-smi query fields
# Uses enforced.power.limit (works on laptops where power.limit may be [N/A])
NVIDIA_SMI_CMD = [
    "nvidia-smi",
    "--query-gpu=power.draw,enforced.power.limit,power.max_limit,"
    "memory.used,memory.total,name,temperature.gpu,utilization.gpu",
    "--format=csv,noheader,nounits",
]


# ---------------------------------------------------------------------------
# GPU Data Collection
# ---------------------------------------------------------------------------
def safe_float(value, default=0.0):
    """Parse a float from nvidia-smi output, returning default for [N/A] or errors."""
    value = value.strip()
    if value in ("[N/A]", "N/A", "[Not Supported]", "Not Supported", ""):
        return default
    try:
        return float(value)
    except (ValueError, TypeError):
        return default


def safe_int(value, default=0):
    """Parse an int from nvidia-smi output, returning default for [N/A] or errors."""
    return int(safe_float(value, float(default)))


def query_gpu_data():
    """
    Run nvidia-smi and parse the CSV output into a list of GPU dicts.
    Returns a list where each element represents one GPU.
    """
    try:
        result = subprocess.run(
            NVIDIA_SMI_CMD,
            capture_output=True,
            text=True,
            timeout=5,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        if result.returncode != 0:
            print(f"[ERROR] nvidia-smi returned code {result.returncode}: {result.stderr.strip()}")
            return None

        gpus = []
        for line in result.stdout.strip().split("\n"):
            parts = [p.strip() for p in line.split(",")]
            if len(parts) < 8:
                continue

            # Use enforced power limit; fall back to max limit if also N/A
            power_limit = safe_float(parts[1])
            if power_limit == 0.0:
                power_limit = safe_float(parts[2])  # power.max_limit fallback

            power_max_limit = safe_float(parts[2])  # Absolute max TGP
            if power_max_limit == 0.0:
                power_max_limit = power_limit  # Fallback to enforced limit

            gpus.append(
                {
                    "power_draw": safe_float(parts[0]),
                    "power_limit": power_limit,          # Current enforced limit
                    "power_max_limit": power_max_limit,  # Absolute max TGP
                    "vram_used": safe_float(parts[3]),    # MiB
                    "vram_total": safe_float(parts[4]),   # MiB
                    "gpu_name": parts[5].strip(),
                    "temperature": safe_int(parts[6]),
                    "gpu_utilization": safe_int(parts[7]),
                }
            )
        return gpus if gpus else None

    except FileNotFoundError:
        print("[ERROR] nvidia-smi not found. Is the NVIDIA driver installed?")
        return None
    except subprocess.TimeoutExpired:
        print("[ERROR] nvidia-smi timed out.")
        return None
    except Exception as e:
        print(f"[ERROR] Unexpected error querying GPU: {e}")
        return None


def generate_mock_data():
    """Generate realistic-looking mock GPU data for development/testing."""
    base_power = 85.0
    power_jitter = random.uniform(-15, 40)
    return [
        {
            "power_draw": round(base_power + power_jitter, 2),
            "power_limit": 250.0,
            "power_max_limit": 300.0,
            "vram_used": round(random.uniform(500, 6500), 1),  # MiB
            "vram_total": 8192.0,                              # MiB
            "gpu_name": "NVIDIA GeForce RTX 3070 (Mock)",
            "temperature": random.randint(35, 78),
            "gpu_utilization": random.randint(0, 100),
        }
    ]


# ---------------------------------------------------------------------------
# Background Thread — streams GPU data every second
# ---------------------------------------------------------------------------
def gpu_monitor_thread():
    """Continuously poll GPU metrics and emit to all connected clients."""
    print("[INFO] GPU monitor thread started.")
    if MOCK_MODE:
        print("[INFO] Running in MOCK mode — generating synthetic data.")

    while True:
        if MOCK_MODE:
            data = generate_mock_data()
        else:
            data = query_gpu_data()

        if data is not None:
            socketio.emit("gpu_data", data)
        else:
            # Emit an error event so the frontend can inform the user
            socketio.emit("gpu_error", {"message": "Unable to read GPU data."})

        socketio.sleep(0.5)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    """Serve the main dashboard page."""
    return render_template("index.html")


# ---------------------------------------------------------------------------
# SocketIO Events
# ---------------------------------------------------------------------------
@socketio.on("connect")
def handle_connect():
    """Notify the client that the connection is established."""
    emit("connected", {"status": "ok"})
    print("[INFO] Client connected.")


@socketio.on("disconnect")
def handle_disconnect():
    print("[INFO] Client disconnected.")


# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    # Start the background monitor thread
    socketio.start_background_task(gpu_monitor_thread)

    print("=" * 50)
    print("  NVIDIA-GPU-PowerMonitor")
    print("  Open http://localhost:5000 in your browser")
    print("=" * 50)

    socketio.run(app, host="0.0.0.0", port=5000, debug=False)
