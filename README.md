# 🛸 UAV-TWIN // P1 (Project Obrezonn)
### Cyber-Physical Digital Twin & AI Prognostics Suite for Aerospace Propulsion

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/Frontend-React%2019-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Three.js](https://img.shields.io/badge/3D%20Engine-Three.js-black?style=flat-square&logo=three.js)](https://threejs.org/)
[![Vite](https://img.shields.io/badge/Build-Vite%208-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![WebSockets](https://img.shields.io/badge/Telemetry-10Hz%20WebSocket-blue?style=flat-square)](https://websockets.readthedocs.io/)
[![Tailwind CSS](https://img.shields.io/badge/UI-Tailwind%20v4-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

---

## 📌 Overview

**UAV-TWIN** is a real-time aerospace cyber-physical digital twin and ground control station (GCS). It bridges thermodynamic propulsion physics, high-speed telemetry streaming, interactive 3D WebGL visualization, and AI predictive maintenance (PdM).

The system continuously models a 4-cylinder general aviation/UAV engine under active atmospheric flight conditions, detecting non-linear degradation and thermal runaways before catastrophic airframe loss.

---

## ⚡ Key Capabilities

* **🌐 Interactive 3D Digital Twin**: Full WebGL 3D airframe rendering component heatmaps, propeller dynamics, and structural strain in real time.
* **📡 10Hz High-Speed Data Bus**: Low-latency bidirectional WebSocket connection streaming multi-bank telemetry (RPM, CHT/EGT, oil pressure, 28V electrical bus, hydraulics).
* **🧠 8-Axis Engine Health Radar**: Holistic multi-dimensional health scoring across Thermal, Mechanical, Lubrication, Fuel, Electrical, Structural, Vibration, and Environmental vectors.
* **⏳ Dynamic R.U.L. Prognostics**: Predictive Remaining Useful Life engine combining continuous operational wear with real-time emergency Time-to-Failure (TTF) countdowns.
* **🚨 Hardware-in-the-Loop (H.I.L.) Fault Injector**: 10 real-time injectible failure scenarios (Cylinder 2 Overheat, Oil Line Rupture, Bearing Wear, Carb Icing, Prop Strike, Alternator Failure, Coolant Leak, etc.).
* **✈️ Synthetic Vision / Primary Flight Display (PFD)**: Military-standard artificial horizon, pitch ladder, airspeed tape, altimeter tape, and compass rose.
* **🛡️ Autonomous AI Copilot Mitigations**: Immediate emergency response workflows (auto-throttle reduction on oil loss, automatic mixture enrichment on thermal runaway).
* **💾 MIL-STD-1553B Flight Recorder**: Circular telemetry ring buffer with one-click IEEE-754 compliant JSONL flight log export.

---

## 🏗️ System Architecture

```
┌────────────────────────────────────────────────────────┐
│               Python / FastAPI Backend                 │
│  - EngineSimulation Physics Loop (10Hz)               │
│  - FADEC 4-Cylinder Thermodynamics & ISA Atmosphere    │
│  - H.I.L. Fault Injection & Dynamic R.U.L. Engine      │
│  - SQLite Blackbox Event Logger                        │
└──────────────────────────┬─────────────────────────────┘
                           │ 10Hz WebSocket (/ws/twin)
┌──────────────────────────▼─────────────────────────────┐
│               React 19 + Vite Frontend                 │
│  - Zustand Telemetry State Store                       │
│  - Three.js / React Three Fiber 3D Airframe Twin       │
│  - Recharts Holographic HUD & 8-Axis Radar             │
│  - Synthetic Vision Primary Flight Display (PFD)       │
│  - Interactive Diagnostic Terminal & Alarm Log         │
└────────────────────────────────────────────────────────┘
```

---

## 📂 Repository Structure

```
Prozectobrezonn/
├── backend/
│   ├── server.py              # FastAPI app, physics engine, WebSocket server
│   ├── requirements.txt       # Python dependencies
│   └── blackbox.db            # Local flight telemetry database (auto-created)
├── frontend/
│   ├── src/
│   │   ├── components/        # HUD panels, gauges, 3D viewer, alert manager
│   │   ├── store/             # Zustand state management (useTelemetryStore)
│   │   ├── tabs/              # Telemetry, AI Analytics, HIL Simulator, PFD, etc.
│   │   ├── App.jsx            # Master tactical layout & WebSocket handler
│   │   └── main.jsx           # React DOM root entrypoint
│   ├── package.json           # Frontend dependencies & scripts
│   ├── vite.config.js         # Vite configuration
│   └── vercel.json            # Vercel SPA routing configuration
├── vercel.json                # Root Vercel build configuration
├── .gitignore                 # Optimized Git exclusions
└── README.md                  # Project documentation
```

---

## 🚀 Quick Start (Local Setup)

### Prerequisites
* **Node.js** (v18 or higher)
* **Python** (3.10 or higher)

### 1. Backend Setup
```bash
# Navigate to backend directory
cd backend

# Create a virtual environment
python -m venv venv

# Activate the virtual environment
# Windows (PowerShell):
.\venv\Scripts\Activate.ps1
# macOS / Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the telemetry server
python -m uvicorn server:app --host 127.0.0.1 --port 8000 --reload
```
* Backend API Root: `http://127.0.0.1:8000/`
* Interactive API Documentation (Swagger): `http://127.0.0.1:8000/docs`
* Telemetry WebSocket Endpoint: `ws://127.0.0.1:8000/ws/twin`

### 2. Frontend Setup
In a new terminal window:
```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start the Vite development server
npm run dev
```
* Open your browser at: **`http://localhost:5173/`**

---

## 🌐 Deployment Guide

### A. Deploy Frontend on Vercel

1. **Push your code to GitHub** (see steps below).
2. Go to **[vercel.com](https://vercel.com)** and sign in with GitHub.
3. Click **"Add New..."** → **"Project"**.
4. Import your **`Prozectobrezonn`** repository.
5. In the configuration settings:
   * **Framework Preset**: `Vite`
   * **Root Directory**: Leave as `./` (or select `frontend`)
   * **Build Command**: `npm run build`
   * **Output Directory**: `dist` (if root is `frontend`) or `frontend/dist`
6. *(Optional)* In **Environment Variables**, add:
   * **Key**: `VITE_BACKEND_URL`
   * **Value**: Your deployed backend domain (e.g., `uav-twin-backend.onrender.com` without `https://` or `wss://`).
7. Click **Deploy**. Your frontend is live in seconds!

---

### B. Deploy Backend on Render / Railway (For Live WebSockets)

Because Vercel serverless functions do not maintain persistent WebSockets, host the Python backend on a platform that supports continuous long-running processes:

#### Option 1: Render.com (Free Web Service)
1. Sign in to **[render.com](https://render.com)** and click **"New +"** → **"Web Service"**.
2. Connect your GitHub repository.
3. Configure the service:
   * **Root Directory**: `backend`
   * **Environment**: `Python 3`
   * **Build Command**: `pip install -r requirements.txt`
   * **Start Command**: `uvicorn server:app --host 0.0.0.0 --port $PORT`
4. Deploy the service. Copy your public domain (e.g. `uav-backend.onrender.com`).
5. Update your Vercel frontend environment variable:
   `VITE_BACKEND_URL = uav-backend.onrender.com`

#### Option 2: Railway.app
1. Create a **New Project** on **[railway.app](https://railway.app)** from your GitHub repo.
2. Set Root Directory to `/backend` and start command to `uvicorn server:app --host 0.0.0.0 --port $PORT`.
3. Add the generated domain to your Vercel `VITE_BACKEND_URL`.

---

## 🛠️ Environment Variables

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `VITE_BACKEND_URL` | `localhost:8000` | Hostname of the backend server (used by WebSocket client) |

---

## 📄 License
This project is open-source and available under the **MIT License**.
