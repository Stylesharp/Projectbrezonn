# 🛸 UAV-TWIN // P1 (Project Obrezonn)
### Cyber-Physical Digital Twin & AI Prognostics Suite for Aerospace Propulsion

<div align="center">

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/Frontend-React%2019-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Three.js](https://img.shields.io/badge/3D%20Engine-Three.js-black?style=for-the-badge&logo=three.js)](https://threejs.org/)
[![Vite](https://img.shields.io/badge/Build-Vite%208-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![WebSockets](https://img.shields.io/badge/Telemetry-10Hz%20WebSocket-blue?style=for-the-badge)](https://websockets.readthedocs.io/)
[![Tailwind CSS](https://img.shields.io/badge/UI-Tailwind%20v4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-black?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com/)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

<br/>

**A mission-grade cyber-physical ground control station (GCS) and digital twin combining thermodynamic propulsion modeling, high-frequency telemetry streaming, interactive 3D WebGL visualization, and AI predictive maintenance (PdM).**

[Explore Architecture](#-system-architecture) • [9 Tactical Tabs](#-tactical-dashboard-breakdown) • [Quick Start](#-quick-start-local-setup) • [Vercel Deployment](#-deploy-on-vercel-frontend) • [Manual Upload Guide](#-manual-github-upload-guide)

</div>

---

## 📌 Executive Summary

**UAV-TWIN** models a high-performance 4-cylinder FADEC aero-propulsion system operating within active atmospheric flight dynamics. Rather than relying on rigid, calendar-based maintenance schedules, UAV-TWIN continuously monitors real-time thermodynamic, mechanical, and fluid-dynamic vectors via a **10Hz bidirectional WebSocket bus**. 

Its onboard AI copilot predicts mechanical degradation, evaluates **Remaining Useful Life (R.U.L.)** under multi-fault compounding stresses, and executes automatic emergency mitigations before in-flight catastrophic airframe loss occurs.

---

## ⚡ Core Innovations & Capabilities

* **🌐 Interactive 3D Digital Twin**: WebGL/Three.js interactive airframe with orbit controls, dynamic thermal hotspots, and RPM-driven prop spin.
* **📡 10Hz Low-Latency Telemetry Bus**: Bidirectional WebSocket connection pushing state payloads with sub-5ms UI synchronization.
* **🧠 8-Axis Engine Health Radar**: Multi-dimensional normalized health scoring across Thermal, Mechanical, Lubrication, Fuel, Electrical, Structural, Vibration, and Environmental vectors.
* **⏳ Dynamic R.U.L. Prognostics**: Dual-mode Remaining Useful Life engine tracking cumulative operational wear in cruise while instantly calculating emergency Time-to-Failure (TTF) under active faults.
* **🚨 10-Mode Hardware-in-the-Loop (H.I.L.) Fault Injector**: Real-time stress simulator injecting Cylinder 2 Overheat, Oil Line Rupture, Bearing Wear, Carb Icing, Prop Strike, Alternator Failure, Coolant Leaks, and more.
* **✈️ Synthetic Vision Primary Flight Display (PFD)**: Military-standard artificial horizon, pitch ladder, roll pointer, airspeed tape, altimeter tape, and compass rose.
* **🛡️ Autonomous AI Copilot Mitigations**: Closed-loop fail-safe actions (automatic power shed, throttle reduction on oil loss, automatic mixture enrichment on thermal runaway).
* **💾 MIL-STD-1553B Flight Recorder**: Circular telemetry ring buffer with one-click IEEE-754 compliant JSONL flight log export.

---

## 🖥️ Tactical Dashboard Breakdown

The Ground Control Station features 9 specialized, military-spec holographic panels:

| Tab | Name | Primary Function |
| :---: | :--- | :--- |
| `0` | **Live Propulsion Telemetry** | Master RPM gauge, 4× CHT & EGT cylinder thermal banks, oil pressure/temperature, and electrical bus loads. |
| `1` | **3D Digital Twin Viewer** | Full-screen interactive WebGL 3D airframe rendering component heatmaps and propeller rotation. |
| `2` | **AI Prognostics & Health Radar** | 8-Axis Engine Health Radar, Isolation Forest Anomaly stream, composite State of Health (SoH) gauge, and dynamic R.U.L. countdown. |
| `3` | **H.I.L. Simulator** | Primary actuator sliders (Throttle, Mixture, Prop Pitch), aerodynamic surfaces (Flaps, Landing Gear), and 10 real-time fault switches. |
| `4` | **Logs & Reliability** | Filterable structured alarm event feed, IEEE-754 Blackbox JSONL flight recorder, and MIL-STD-1553B diagnostic terminal. |
| `5` | **Atmospheric & ISA Profile** | True ISA standard atmosphere profile (0–30,000 ft), OAT, density altitude power loss estimator, and wind/icing hazard vector. |
| `6` | **Mission Planning** | Aerodynamic V-n structural envelope diagram, Thrust vs. Drag power curve, fuel mass endurance calculator, and waypoint router. |
| `7` | **Flight Dynamics & Synthetic Vision** | Primary Flight Display (PFD) with artificial horizon, dynamic pitch ladder, airspeed tape, altimeter tape, and compass heading. |
| `8` | **Tactical Geospatial Radar** | 360° sweeping geospatial radar tracking UAV GPS coordinates (WGS84 Datum), ground speed vector, and GCS home base locator. |

---

## 🏗️ System Architecture

```
┌────────────────────────────────────────────────────────┐
│               Python / FastAPI Backend                 │
│  - EngineSimulation Physics Loop (10Hz)               │
│  - FADEC 4-Cylinder Thermodynamics & ISA Atmosphere    │
│  - H.I.L. Multi-Fault Emergency TTF Evaluator          │
│  - SQLite Blackbox Event Queue Logger                  │
└──────────────────────────┬─────────────────────────────┘
                           │ 10Hz WebSocket (/ws/twin)
┌──────────────────────────▼─────────────────────────────┐
│               React 19 + Vite Frontend                 │
│  - Zustand Telemetry Store (Zero-re-render slice)      │
│  - Three.js / React Three Fiber 3D Airframe Twin       │
│  - Recharts Holographic HUD & 8-Axis Radar             │
│  - Synthetic Vision Primary Flight Display (PFD)       │
│  - Interactive Diagnostic Terminal & Alarm Log         │
└────────────────────────────────────────────────────────┘
```

---

## 📂 Repository File Structure

```
Prozectobrezonn/
├── backend/
│   ├── server.py              # FastAPI application, physics loop, and WebSocket server
│   ├── requirements.txt       # Pinned backend Python dependencies
│   └── blackbox.db            # Local flight telemetry database (auto-generated)
├── frontend/
│   ├── public/                # Static web assets
│   ├── src/
│   │   ├── assets/            # SVG icons and visual media
│   │   ├── components/        # HUD panels, GaugeArc, HoloPanel, AlertManager, 3D viewer
│   │   ├── store/             # Zustand telemetry state store (useTelemetryStore.js)
│   │   ├── tabs/              # All 9 tactical operational tabs
│   │   ├── App.jsx            # Master layout & WebSocket event listener
│   │   ├── index.css          # Tailwind CSS v4 design tokens and scanlines
│   │   └── main.jsx           # React root entrypoint
│   ├── .oxlintrc.json         # Linter configuration
│   ├── index.html             # HTML5 canvas entrypoint
│   ├── package.json           # Frontend dependencies & npm scripts
│   ├── package-lock.json      # Deterministic dependency lock
│   ├── vercel.json            # Vercel SPA route rewrite rules
│   └── vite.config.js         # Vite bundler configuration
├── .gitignore                 # Production Git ignore patterns
├── vercel.json                # Root Vercel build configuration
└── README.md                  # Comprehensive project documentation
```

---

## 📋 Manual GitHub Upload Guide

If you are manually copying and uploading files into your GitHub repository via the web browser, **follow this checklist**:

### ✅ Files & Folders to Upload:
* `backend/`
  * `server.py`
  * `requirements.txt`
* `frontend/`
  * `public/` (all contents)
  * `src/` (all components, tabs, store, assets, App.jsx, main.jsx, index.css)
  * `index.html`
  * `package.json`
  * `package-lock.json`
  * `vite.config.js`
  * `vercel.json`
  * `.oxlintrc.json`
* `.gitignore`
* `vercel.json`
* `README.md`

### ❌ DO NOT Upload (Keep Excluded):
* 🚫 `frontend/node_modules/` *(Contains thousands of local packages; GitHub will freeze)*
* 🚫 `frontend/dist/` *(Auto-generated build folder)*
* 🚫 `backend/venv/` *(Local Python virtual environment)*
* 🚫 `backend/blackbox.db` *(Large binary database file; exceeds GitHub upload limits)*
* 🚫 `backend/session.jsonl` *(Large telemetry capture dump)*
* 🚫 `.vscode/` or local `.env` files

---

## 🚀 Quick Start (Local Setup)

### Prerequisites
* **Node.js** (v18 or higher)
* **Python** (3.10 or higher)

### 1. Backend Setup
```bash
# Navigate to backend directory
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows (PowerShell):
.\venv\Scripts\Activate.ps1
# macOS / Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the telemetry server
python -m uvicorn server:app --host 127.0.0.1 --port 8000 --reload
```
* **API Root**: [http://127.0.0.1:8000/](http://127.0.0.1:8000/)
* **Interactive API Documentation (Swagger)**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
* **WebSocket Endpoint**: `ws://127.0.0.1:8000/ws/twin`

### 2. Frontend Setup
In a new terminal window:
```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```
* Open your browser at: **[http://localhost:5173/](http://localhost:5173/)**

---

## 🌐 Deploy on Vercel (Frontend)

1. Push your repository to **GitHub**.
2. Go to **[vercel.com](https://vercel.com)** and sign in with GitHub.
3. Click **"Add New..."** ➔ **"Project"** and select your repository.
4. **Build & Output Settings**:
   * **Framework Preset**: `Vite`
   * **Root Directory**: Leave as `./` (the pre-configured root `vercel.json` automatically compiles the `frontend` directory).
5. *(Optional)* Add **Environment Variable**:
   * **Key**: `VITE_BACKEND_URL`
   * **Value**: Your live backend URL (e.g., `uav-backend.onrender.com` without `https://` or `wss://`).
6. Click **Deploy**. Your tactical dashboard will be live worldwide in ~30 seconds.

---

## 🛰️ Deploying the Backend on Render (Free WebSockets)

Because Vercel serverless functions do not maintain continuous persistent WebSockets, host the Python backend on a persistent container service such as **[Render.com](https://render.com)**:

1. Sign in to **Render** and click **"New +"** ➔ **"Web Service"**.
2. Connect your GitHub repository.
3. Configure the settings:
   * **Root Directory**: `backend`
   * **Environment**: `Python 3`
   * **Build Command**: `pip install -r requirements.txt`
   * **Start Command**: `uvicorn server:app --host 0.0.0.0 --port $PORT`
4. Click **Create Web Service**.
5. Copy your assigned domain (e.g. `uav-backend.onrender.com`) and paste it as `VITE_BACKEND_URL` in your Vercel project environment variables.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.
#   P r o j e c t b r e z o n n  
 #   P r o j e c t b r e z o n n  
 