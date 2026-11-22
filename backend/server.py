import asyncio
import csv
import io
import json
import math
import random
import sqlite3
import time
from collections import deque
from contextlib import asynccontextmanager
from typing import Any, Dict, List

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

ALLOWED_ACTUATORS = {
    "throttle": (float, 0.0, 100.0),
    "mixture": (float, 0.0, 100.0),
    "propPitch": (float, 0.0, 100.0),
    "flaps": (float, 0.0, 40.0),
    "fuelSelector": (str, {"BOTH", "LEFT", "RIGHT", "OFF"}),
    "carbHeat": (bool, None),
    "antiIce": (bool, None),
    "generatorSwitch": (bool, None),
    "autopilot": (bool, None),
    "gearDown": (bool, None),
    "avionicsFan": (bool, None),
    "hydPump": (bool, None),
}

ALLOWED_WEATHER = {"CLEAR", "DUSK", "STORM", "SNOW_ICING"}
ALLOWED_FLIGHT_MODES = {"LOITER", "WAYPOINT_NAV", "MANUAL_PILOT", "EMERGENCY_RTB"}

DB_PATH = "blackbox.db"
MAX_DB_ROWS = 12_000


class PredictiveForecaster:
    """Computes real-time 60-second linear trend forecasts & Weibull survival probabilities."""

    def __init__(self, window: int = 45):
        self.cht_hist = deque(maxlen=window)
        self.oil_hist = deque(maxlen=window)
        self.volt_hist = deque(maxlen=window)

    @staticmethod
    def _slope_per_sec(series: deque) -> float:
        n = len(series)
        if n < 6 or (series[-1][0] - series[0][0]) < 0.5:
            return 0.0
        t0 = series[0][0]
        xs = [p[0] - t0 for p in series]
        ys = [p[1] for p in series]
        mean_x = sum(xs) / n
        mean_y = sum(ys) / n
        denom = sum((x - mean_x) ** 2 for x in xs)
        if denom < 1e-6:
            return 0.0
        return sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys)) / denom

    def update(self, now: float, max_cht: float, oil_press: float, voltage: float, rul_hours: float) -> Dict[str, Any]:
        self.cht_hist.append((now, max_cht))
        self.oil_hist.append((now, oil_press))
        self.volt_hist.append((now, voltage))

        cht_rate = self._slope_per_sec(self.cht_hist)
        oil_rate = self._slope_per_sec(self.oil_hist)
        volt_rate = self._slope_per_sec(self.volt_hist)

        pred_cht_60 = max(60.0, min(320.0, max_cht + cht_rate * 60.0))
        pred_oil_60 = max(0.0, min(6.5, oil_press + oil_rate * 60.0))
        pred_volt_60 = max(14.0, min(28.5, voltage + volt_rate * 60.0))

        # Estimate seconds until thermal redline (240 C) if climbing
        if max_cht >= 240.0:
            sec_to_redline = 0
        elif cht_rate > 0.08:
            sec_to_redline = int(min(9999, (240.0 - max_cht) / cht_rate))
        else:
            sec_to_redline = None

        # Weibull-inspired 1-hour mission survival probability
        hazard = max(0.001, 1.0 / max(0.08, rul_hours))
        survival_1h = round(max(1.0, min(99.9, math.exp(-hazard * 1.0) * 100.0)), 1)

        return {
            "chtRatePerMin": round(cht_rate * 60.0, 1),
            "oilRatePerMin": round(oil_rate * 60.0, 2),
            "voltRatePerMin": round(volt_rate * 60.0, 2),
            "predCht60s": round(pred_cht_60, 1),
            "predOil60s": round(pred_oil_60, 2),
            "predVolt60s": round(pred_volt_60, 1),
            "secToThermalRedline": sec_to_redline,
            "missionSurvivalPct": survival_1h,
        }


class MultivariateAnomalyEngine:
    """Physics-residual + EWMA Z-score anomaly detector with Explainable AI attribution."""

    def __init__(self):
        self.ewma_score = 0.03

    def evaluate(self, sim: "EngineSimulation") -> Dict[str, Any]:
        rpm_norm = sim.rpm / 5500.0
        expected_cht = 100.0 + rpm_norm * 115.0
        expected_oil = 1.0 + rpm_norm * 4.0
        expected_crank = 0.8 + rpm_norm * 0.6

        max_cht = max(sim.chts)
        cht_spread = max(sim.chts) - min(sim.chts)

        residuals = {
            "CYLINDER THERMAL": max(0.0, (max_cht - max(expected_cht + 22.0, 185.0)) / 18.0)
            + max(0.0, (cht_spread - 18.0) / 14.0),
            "OIL LUBRICATION": max(0.0, (expected_oil - sim.oilPressure - 0.6) / 0.65)
            if sim.rpm > 400
            else 0.0,
            "CRANKCASE / BEARINGS": max(0.0, (sim.crankcasePressure - expected_crank - 0.12) / 0.12),
            "HYDRAULIC BUS": max(0.0, (2400.0 - sim.hydPressure) / 550.0) if sim.hydPump else 0.0,
            "ELECTRICAL 28V BUS": max(0.0, (23.5 - sim.batteryVoltage) / 1.5),
            "AVIONICS THERMAL": max(0.0, (sim.avionicsTemp - 52.0) / 10.0),
            "ATMOSPHERIC ICING": max(0.0, (sim.iceRisk - 0.35) / 0.2),
            "PROP / GOVERNOR": (2.8 if sim.faults["propGovernorFail"] else 0.0)
            + (4.5 if sim.faults["propStrike"] else 0.0),
        }

        vals = list(residuals.values())
        peak = max(vals) if vals else 0.0
        rms = math.sqrt(sum(v * v for v in vals) / max(1, len(vals)))
        raw_z = 0.68 * peak + 0.32 * rms

        target_score = 1.0 / (1.0 + math.exp(-1.45 * (raw_z - 1.75)))
        target_score = max(0.02, min(0.99, target_score + random.uniform(-0.008, 0.008)))
        self.ewma_score = self.ewma_score * 0.8 + target_score * 0.2

        contributors = [
            {
                "subsystem": name,
                "zScore": round(z, 2),
                "impactPct": round(min(100.0, (z / 3.5) * 100.0), 1),
                "severity": "CRITICAL" if z >= 2.2 else "WARNING" if z >= 1.0 else "NOMINAL",
            }
            for name, z in sorted(residuals.items(), key=lambda kv: kv[1], reverse=True)
        ][:5]

        top = contributors[0]
        confidence = round(min(99.5, 92.0 + min(7.5, raw_z * 2.1)), 1)

        return {
            "score": round(self.ewma_score, 4),
            "confidence": confidence,
            "model": "AEGIS Physics-Residual + EWMA Z-Score v4",
            "primaryCause": top["subsystem"] if top["severity"] != "NOMINAL" else "NOMINAL ENVELOPE",
            "recommendation": self._recommend(top["subsystem"], top["severity"]),
            "contributors": contributors,
        }

    @staticmethod
    def _recommend(subsystem: str, severity: str) -> str:
        if severity == "NOMINAL":
            return "All telemetry vectors within nominal operating envelope. Continue mission."
        mapping = {
            "OIL LUBRICATION": "Reduce throttle <=25%, switch to EMERGENCY_RTB, deploy MAINT-01 on landing.",
            "CYLINDER THERMAL": "Enrich mixture to 100%, reduce throttle 15-20%, verify coolant loop.",
            "CRANKCASE / BEARINGS": "Cap RPM below 3800; schedule immediate main bearing teardown.",
            "HYDRAULIC BUS": "Verify hydraulic pump breaker; avoid >1.8G bank maneuvers.",
            "ELECTRICAL 28V BUS": "Shed anti-ice & non-essential loads; confirm generator ON.",
            "AVIONICS THERMAL": "Engage avionics bay cooling fan and lower payload compute duty.",
            "ATMOSPHERIC ICING": "Activate Carb Heat & Anti-Ice; descend out of freezing cloud layer.",
            "PROP / GOVERNOR": "Cut throttle / feather prop if strike detected; inspect governor oil feed.",
        }
        return mapping.get(subsystem, "Inspect highlighted subsystem in H.I.L. diagnostics.")


class EngineSimulation:
    def __init__(self):
        self.ai_engine = MultivariateAnomalyEngine()
        self.forecaster = PredictiveForecaster()
        self.reset()

    def reset(self):
        self.throttle = 55.0
        self.mixture = 60.0
        self.propPitch = 85.0
        self.fuelSelector = "BOTH"
        self.carbHeat = False
        self.antiIce = False
        self.generatorSwitch = True
        self.autopilot = True
        self.flaps = 0.0
        self.gearDown = False
        self.avionicsFan = True
        self.hydPump = True

        self.weatherMode = "CLEAR"
        self.flightMode = "LOITER"
        self.manualControl = {"pitch": 0.0, "roll": 0.0}
        self.activeWaypoint = {"id": "WPT-2", "lat": 37.7860, "lon": -122.4050, "alt": 8500.0}

        self.faults = {
            "cyl2Overheat": False,
            "oilLineRupture": False,
            "mainBearingWear": False,
            "propGovernorFail": False,
            "carbIcingEvent": False,
            "alternatorFailure": False,
            "coolantLeakMajor": False,
            "propStrike": False,
            "hydLeak": False,
            "avionicsOverheat": False,
        }

        self.rpm = 3100.0
        self.chts = [148.0, 150.0, 147.0, 149.0]
        self.egts = [490.0, 495.0, 488.0, 492.0]
        self.oilPressure = 3.8
        self.oilTemp = 86.0
        self.crankcasePressure = 1.1
        self.hydPressure = 3000.0
        self.hydTemp = 54.0
        self.avionicsTemp = 34.0
        self.batteryVoltage = 27.6
        self.batteryAmps = 18.0
        self.generatorLoad = 42.0
        self.turboBoostPressure = 4.2
        self.intercoolerTemp = 44.0

        self.ambientTemp = -1.8
        self.ambientPressure = 738.0
        self.densityAltitude = 8500.0
        self.verticalSpeed = 0.0
        self.windSpeed = 12.0
        self.windDir = 275.0
        self.iceRisk = 0.08

        self.pitchAngle = 1.5
        self.rollAngle = 0.0
        self.yawRate = 0.4
        self.latitude = 37.7749
        self.longitude = -122.4194
        self.heading = 45.0
        self.groundSpeed = 95.0
        self.gLoad = 1.05

        self.fuelLevelL = 50.0
        self.fuelLevelR = 50.0
        self.fuelUsedTotal = 0.0

        self.anomalyScore = 0.03
        self.rulHours = 1420.0
        self.aiDiagnostics = {}
        self.forecast = {}
        self.componentWear = {
            "cyl1": 0.012,
            "cyl2": 0.015,
            "cyl3": 0.011,
            "cyl4": 0.013,
            "oilPump": 0.024,
            "alternator": 0.018,
            "turbo": 0.031,
            "propGovernor": 0.015,
            "bearings": 0.048,
            "fuelPump": 0.022,
            "hydraulics": 0.019,
            "avionics": 0.009,
        }
        self.last_update = time.time()

    def apply_actuator(self, key: str, val: Any):
        if key not in ALLOWED_ACTUATORS:
            return
        spec = ALLOWED_ACTUATORS[key]
        expected_type = spec[0]
        try:
            if expected_type is float:
                setattr(self, key, max(spec[1], min(spec[2], float(val))))
            elif expected_type is bool:
                setattr(self, key, bool(val))
            elif expected_type is str and val in spec[1]:
                setattr(self, key, val)
        except (TypeError, ValueError):
            pass

    def trigger_scenario(self, name: str):
        scenario = (name or "").upper()
        if scenario == "NOMINAL":
            self.reset()
        elif scenario == "STORM_ICING":
            self.weatherMode = "SNOW_ICING"
            self.faults["carbIcingEvent"] = True
            self.antiIce = False
            self.carbHeat = False
            self.throttle = 72.0
        elif scenario == "ENGINE_CASCADE":
            self.weatherMode = "STORM"
            self.faults["cyl2Overheat"] = True
            self.faults["oilLineRupture"] = True
            self.throttle = 88.0
        elif scenario == "EMERGENCY_RTB":
            self.flightMode = "EMERGENCY_RTB"
            self.throttle = 40.0
            self.mixture = 90.0
            self.flaps = 10.0

    def update(self):
        now = time.time()
        dt = min(0.5, max(0.01, now - self.last_update))
        self.last_update = now

        # 1. Engine RPM physics
        target_rpm = (self.throttle / 100.0) * 5500.0
        if self.fuelSelector == "OFF" or (self.fuelLevelL <= 0 and self.fuelLevelR <= 0):
            target_rpm = 0.0
        elif self.faults["propStrike"]:
            target_rpm = 0.0
        else:
            if self.faults["propGovernorFail"]:
                target_rpm = min(6200.0, target_rpm * 1.18)
            else:
                target_rpm *= 0.25 + 0.75 * (self.propPitch / 100.0)

            if self.faults["carbIcingEvent"] and not self.carbHeat:
                target_rpm *= max(0.35, 1.0 - self.iceRisk * 0.55)

        self.rpm += (target_rpm - self.rpm) * min(1.0, 2.2 * dt)

        # 2. Thermal physics
        base_cht = 100.0 + (self.rpm / 5500.0) * 115.0
        if self.faults["coolantLeakMajor"]:
            base_cht += 95.0
        if self.mixture > 75.0:
            base_cht -= (self.mixture - 75.0) * 0.45

        base_egt = 200.0 + (self.rpm / 5500.0) * 580.0 + (1.0 - abs(self.mixture - 50.0) / 100.0) * 110.0
        for i in range(4):
            self.chts[i] += (base_cht - self.chts[i]) * min(1.0, 0.35 * dt) + random.uniform(-0.35, 0.35)
            self.egts[i] += (base_egt - self.egts[i]) * min(1.0, 0.6 * dt) + random.uniform(-1.5, 1.5)
        if self.faults["cyl2Overheat"]:
            self.chts[1] = min(265.0, self.chts[1] + 8.5 * dt)

        # 3. Oil & Crankcase
        target_oil = 0.25 if self.faults["oilLineRupture"] else 1.0 + (self.rpm / 5500.0) * 4.0
        self.oilPressure = max(0.0, self.oilPressure + (target_oil - self.oilPressure) * min(1.0, 2.0 * dt) + random.uniform(-0.03, 0.03))
        self.oilTemp += ((sum(self.chts) / 4.0 - 48.0) - self.oilTemp) * min(1.0, 0.25 * dt)
        target_crank = 0.8 + (self.rpm / 5500.0) * 0.6 + (0.48 if self.faults["mainBearingWear"] else 0.0)
        self.crankcasePressure = max(0.5, self.crankcasePressure + (target_crank - self.crankcasePressure) * min(1.0, 1.0 * dt) + random.uniform(-0.015, 0.015))

        # 4. Electrical
        load_draw = 28.0 + (12.0 if self.antiIce else 0.0) + (8.0 if self.hydPump else 0.0) + (5.0 if self.avionicsFan else 0.0)
        if self.faults["alternatorFailure"] or not self.generatorSwitch:
            self.batteryVoltage = max(16.0, self.batteryVoltage - (0.08 + load_draw * 0.002) * dt)
            self.generatorLoad = 0.0
            self.batteryAmps = -load_draw * 0.4
        else:
            self.batteryVoltage = min(28.0, self.batteryVoltage + 0.35 * dt)
            self.generatorLoad = load_draw + random.uniform(-1.5, 1.5)
            self.batteryAmps = self.generatorLoad * 0.45

        # 5. Turbo & Fuel
        target_boost = (self.rpm / 5500.0) * 12.0 * (self.mixture / 100.0)
        self.turboBoostPressure += (target_boost - self.turboBoostPressure) * min(1.0, 1.2 * dt)
        self.intercoolerTemp += ((30.0 + (self.turboBoostPressure / 12.0) * 42.0) - self.intercoolerTemp) * min(1.0, 0.6 * dt)

        fuel_rate = (self.rpm / 5500.0) * 0.012 * dt
        if self.fuelSelector == "BOTH":
            dl, dr = min(self.fuelLevelL, fuel_rate / 2), min(self.fuelLevelR, fuel_rate / 2)
            self.fuelLevelL, self.fuelLevelR = max(0.0, self.fuelLevelL - dl), max(0.0, self.fuelLevelR - dr)
            self.fuelUsedTotal += dl + dr
        elif self.fuelSelector == "LEFT":
            dl = min(self.fuelLevelL, fuel_rate)
            self.fuelLevelL = max(0.0, self.fuelLevelL - dl)
            self.fuelUsedTotal += dl
        elif self.fuelSelector == "RIGHT":
            dr = min(self.fuelLevelR, fuel_rate)
            self.fuelLevelR = max(0.0, self.fuelLevelR - dr)
            self.fuelUsedTotal += dr

        # 6. Hydraulics & Avionics
        target_hyd = 220.0 if self.faults["hydLeak"] else (3000.0 if self.hydPump and self.batteryVoltage > 20.0 else 0.0)
        self.hydPressure = max(0.0, self.hydPressure + (target_hyd - self.hydPressure) * min(1.0, 1.8 * dt) + random.uniform(-8, 8))
        self.hydTemp += ((40.0 + (self.hydPressure / 3000.0) * 20.0) - self.hydTemp) * min(1.0, 0.6 * dt)
        target_av = 86.0 if self.faults["avionicsOverheat"] else (54.0 if not self.avionicsFan else 33.0)
        self.avionicsTemp += (target_av - self.avionicsTemp) * min(1.0, 0.45 * dt) + random.uniform(-0.1, 0.1)

        # 7. Dynamic Weather & Atmosphere
        weather_wind = {"CLEAR": 12.0, "DUSK": 16.0, "STORM": 38.0, "SNOW_ICING": 26.0}.get(self.weatherMode, 12.0)
        weather_temp_bias = {"CLEAR": 0.0, "DUSK": -2.5, "STORM": -4.0, "SNOW_ICING": -9.5}.get(self.weatherMode, 0.0)
        turbulence = 2.6 if self.weatherMode == "STORM" else (1.4 if self.weatherMode == "SNOW_ICING" else 0.35)

        self.windSpeed = max(0.0, self.windSpeed + (weather_wind - self.windSpeed) * 0.06 + random.uniform(-0.4, 0.4) * turbulence)
        self.windDir = (self.windDir + random.uniform(-0.8, 0.8) * turbulence) % 360

        # 8. Flight Dynamics: MANUAL_PILOT / WAYPOINT_NAV / EMERGENCY_RTB / LOITER
        prev_alt = self.densityAltitude
        if self.rpm > 1200:
            target_gs = 45.0 + (self.rpm / 5500.0) * 98.0 - (self.flaps * 0.5) - (12.0 if self.gearDown else 0.0)
            self.groundSpeed += (max(25.0, target_gs) - self.groundSpeed) * min(1.0, 0.6 * dt)

            if self.flightMode == "MANUAL_PILOT":
                target_pitch = max(-22.0, min(22.0, self.manualControl["pitch"] * 18.0))
                target_roll = max(-35.0, min(35.0, self.manualControl["roll"] * 30.0))
                self.yawRate = target_roll * 0.45
                self.heading = (self.heading + self.yawRate * dt) % 360
                self.densityAltitude = max(1200.0, min(22000.0, self.densityAltitude + target_pitch * 45.0 * dt))
            elif self.flightMode in ("WAYPOINT_NAV", "EMERGENCY_RTB"):
                t_lat = 37.7749 if self.flightMode == "EMERGENCY_RTB" else self.activeWaypoint["lat"]
                t_lon = -122.4194 if self.flightMode == "EMERGENCY_RTB" else self.activeWaypoint["lon"]
                t_alt = 3200.0 if self.flightMode == "EMERGENCY_RTB" else self.activeWaypoint["alt"]
                desired_hdg = (math.degrees(math.atan2(t_lon - self.longitude, t_lat - self.latitude)) + 360.0) % 360.0
                hdg_err = ((desired_hdg - self.heading + 540.0) % 360.0) - 180.0
                target_roll = max(-26.0, min(26.0, hdg_err * 0.55))
                self.yawRate = target_roll * 0.42
                self.heading = (self.heading + self.yawRate * dt) % 360
                alt_err = t_alt - self.densityAltitude
                target_pitch = max(-10.0, min(10.0, alt_err * 0.008))
                self.densityAltitude += max(-900.0, min(900.0, alt_err * 0.4)) * dt
            else:
                self.heading = (self.heading + 6.5 * dt) % 360
                target_roll = 13.5 + math.sin(now * 0.35) * 4.5 + random.uniform(-turbulence, turbulence)
                target_pitch = 1.8 * math.cos(now * 0.25) + random.uniform(-turbulence * 0.5, turbulence * 0.5)
                self.yawRate = 6.5
                self.densityAltitude = 8500.0 + math.sin(now * 0.08) * 180.0

            rad = math.radians(self.heading)
            meters_step = self.groundSpeed * 1.45 * dt
            self.latitude += (meters_step * math.cos(rad)) / 111320.0
            self.longitude += (meters_step * math.sin(rad)) / (111320.0 * math.cos(math.radians(37.7749)))
            target_g = 1.0 + abs(self.rollAngle) / 52.0 + abs(self.pitchAngle) / 75.0 + random.uniform(-0.04, 0.04) * turbulence
            self.gLoad = max(0.4, min(4.2, self.gLoad + (target_g - self.gLoad) * 0.14))
        else:
            self.groundSpeed *= 0.92
            target_roll, target_pitch = 0.0, 0.0
            self.yawRate = 0.0
            self.gLoad += (1.0 - self.gLoad) * 0.15

        self.pitchAngle += (target_pitch - self.pitchAngle) * 0.14
        self.rollAngle += (target_roll - self.rollAngle) * 0.14
        self.verticalSpeed = ((self.densityAltitude - prev_alt) / dt) * 60.0  # ft/min

        self.ambientTemp = 15.0 - (self.densityAltitude / 1000.0) * 1.98 + weather_temp_bias + random.uniform(-0.08, 0.08)
        self.ambientPressure = 1013.25 * math.pow(max(0.1, 1 - 2.25577e-5 * self.densityAltitude), 5.25588) + random.uniform(-0.3, 0.3)

        target_ice = 0.85 if self.faults["carbIcingEvent"] else (0.72 if self.weatherMode == "SNOW_ICING" else (0.28 if self.weatherMode == "STORM" else 0.08))
        if self.antiIce:
            target_ice *= 0.25
        self.iceRisk = min(1.0, max(0.0, self.iceRisk + (target_ice - self.iceRisk) * 0.08))

        # 9. AI Diagnostics, RUL & 60s Predictive Forecast
        self.aiDiagnostics = self.ai_engine.evaluate(self)
        self.anomalyScore = self.aiDiagnostics["score"]

        max_wear = max(self.componentWear.values())
        emergency_ttf = max(0.0, 1420.0 * (1.0 - max_wear))
        if self.faults["propStrike"]:
            emergency_ttf = 0.0
        if self.faults["oilLineRupture"] or (self.rpm > 500 and self.oilPressure < 1.2):
            emergency_ttf = min(emergency_ttf, max(0.02, (self.oilPressure / 4.0) * 0.12))
            self.componentWear["bearings"] = min(1.0, self.componentWear["bearings"] + 0.002 * dt)
            self.componentWear["oilPump"] = min(1.0, self.componentWear["oilPump"] + 0.002 * dt)
        if self.faults["coolantLeakMajor"]:
            emergency_ttf = min(emergency_ttf, 0.25)
            for c in ("cyl1", "cyl2", "cyl3", "cyl4"):
                self.componentWear[c] = min(1.0, self.componentWear[c] + 0.0015 * dt)
        if self.faults["cyl2Overheat"] or self.chts[1] > 230:
            emergency_ttf = min(emergency_ttf, 0.22)
            self.componentWear["cyl2"] = min(1.0, self.componentWear["cyl2"] + 0.002 * dt)
        if self.faults["carbIcingEvent"] and not self.carbHeat:
            emergency_ttf = min(emergency_ttf, 0.18)
        if self.faults["avionicsOverheat"] or self.avionicsTemp > 75.0:
            emergency_ttf = min(emergency_ttf, 0.40)
            self.componentWear["avionics"] = min(1.0, self.componentWear["avionics"] + 0.002 * dt)
        if self.faults["hydLeak"] or (self.hydPressure < 1000.0 and self.hydPump):
            emergency_ttf = min(emergency_ttf, 0.65)
            self.componentWear["hydraulics"] = min(1.0, self.componentWear["hydraulics"] + 0.002 * dt)
        if self.faults["alternatorFailure"] or not self.generatorSwitch:
            emergency_ttf = min(emergency_ttf, max(0.03, ((self.batteryVoltage - 18.0) / 10.0) * 0.75))
            self.componentWear["alternator"] = min(1.0, self.componentWear["alternator"] + 0.0015 * dt)
        if self.faults["propGovernorFail"]:
            emergency_ttf = min(emergency_ttf, 6.0)
            self.componentWear["propGovernor"] = min(1.0, self.componentWear["propGovernor"] + 0.0015 * dt)
        if self.faults["mainBearingWear"]:
            emergency_ttf = min(emergency_ttf, 14.5)
            self.componentWear["bearings"] = min(1.0, self.componentWear["bearings"] + 0.001 * dt)

        rate = 4.0 if emergency_ttf < self.rulHours else 1.5
        self.rulHours = max(0.0, min(1420.0, self.rulHours + (emergency_ttf - self.rulHours) * min(1.0, rate * dt)))
        self.forecast = self.forecaster.update(now, max(self.chts), self.oilPressure, self.batteryVoltage, self.rulHours)

    def get_state(self) -> dict:
        return {
            "timestamp": time.time(),
            "rpm": self.rpm,
            "chts": self.chts,
            "egts": self.egts,
            "oilPressure": self.oilPressure,
            "oilTemp": self.oilTemp,
            "crankcasePressure": self.crankcasePressure,
            "hydPressure": self.hydPressure,
            "hydTemp": self.hydTemp,
            "avionicsTemp": self.avionicsTemp,
            "batteryVoltage": self.batteryVoltage,
            "batteryAmps": self.batteryAmps,
            "generatorLoad": self.generatorLoad,
            "turboBoostPressure": self.turboBoostPressure,
            "intercoolerTemp": self.intercoolerTemp,
            "ambientTemp": self.ambientTemp,
            "ambientPressure": self.ambientPressure,
            "densityAltitude": self.densityAltitude,
            "verticalSpeed": self.verticalSpeed,
            "windSpeed": self.windSpeed,
            "windDir": self.windDir,
            "iceRisk": self.iceRisk,
            "weatherMode": self.weatherMode,
            "flightMode": self.flightMode,
            "pitchAngle": self.pitchAngle,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "heading": self.heading,
            "groundSpeed": self.groundSpeed,
            "rollAngle": self.rollAngle,
            "yawRate": self.yawRate,
            "gLoad": self.gLoad,
            "fuelLevelL": self.fuelLevelL,
            "fuelLevelR": self.fuelLevelR,
            "fuelUsedTotal": self.fuelUsedTotal,
            "anomalyScore": self.anomalyScore,
            "healthIndex": max(0.0, min(100.0, (1.0 - self.anomalyScore) * 100.0)),
            "rulHours": self.rulHours,
            "aiDiagnostics": self.aiDiagnostics,
            "forecast": self.forecast,
            "componentWear": self.componentWear,
            "faults": self.faults,
            "actuators": {
                "throttle": self.throttle,
                "mixture": self.mixture,
                "propPitch": self.propPitch,
                "fuelSelector": self.fuelSelector,
                "carbHeat": self.carbHeat,
                "antiIce": self.antiIce,
                "generatorSwitch": self.generatorSwitch,
                "autopilot": self.autopilot,
                "flaps": self.flaps,
                "gearDown": self.gearDown,
                "avionicsFan": self.avionicsFan,
                "hydPump": self.hydPump,
            },
        }


db_queue: List[tuple] = []
sim = EngineSimulation()
clients: List[WebSocket] = []


def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS telemetry (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp REAL,
                payload TEXT
            )
            """
        )


def flush_db_batch(batch: List[tuple]):
    with sqlite3.connect(DB_PATH) as conn:
        conn.executemany("INSERT INTO telemetry (timestamp, payload) VALUES (?, ?)", batch)
        conn.execute(
            f"DELETE FROM telemetry WHERE id NOT IN (SELECT id FROM telemetry ORDER BY id DESC LIMIT {MAX_DB_ROWS})"
        )


async def db_writer_loop():
    while True:
        if db_queue:
            batch = db_queue[:]
            db_queue.clear()
            try:
                await asyncio.to_thread(flush_db_batch, batch)
            except Exception as exc:
                print("DB flush error:", exc)
        await asyncio.sleep(2.0)


async def simulation_loop():
    while True:
        sim.update()
        state = sim.get_state()
        msg = json.dumps({"type": "telemetry", "payload": state})

        disconnected = []
        for client in list(clients):
            try:
                await client.send_text(msg)
            except Exception:
                disconnected.append(client)

        for client in disconnected:
            if client in clients:
                clients.remove(client)

        db_queue.append((state["timestamp"], msg))
        await asyncio.sleep(0.1)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    sim_task = asyncio.create_task(simulation_loop())
    db_task = asyncio.create_task(db_writer_loop())
    try:
        yield
    finally:
        sim_task.cancel()
        db_task.cancel()


app = FastAPI(title="UAV-TWIN // P1 AEGIS Telemetry & AI Engine", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"status": "online", "service": "UAV-TWIN // P1 AEGIS Engine v4.0", "ws": "/ws/twin"}


@app.get("/health")
def health():
    return {
        "status": "ok",
        "clients": len(clients),
        "rpm": round(sim.rpm, 1),
        "flightMode": sim.flightMode,
        "weatherMode": sim.weatherMode,
        "healthIndex": round((1.0 - sim.anomalyScore) * 100.0, 1),
    }


@app.get("/api/history")
def get_history(limit: int = 120):
    limit = max(1, min(500, limit))
    with sqlite3.connect(DB_PATH) as conn:
        rows = conn.execute("SELECT payload FROM telemetry ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return {"frames": [json.loads(r[0])["payload"] for r in reversed(rows)]}


@app.get("/api/export/csv", response_class=PlainTextResponse)
def export_csv(limit: int = 250):
    limit = max(1, min(1000, limit))
    with sqlite3.connect(DB_PATH) as conn:
        rows = conn.execute("SELECT payload FROM telemetry ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["timestamp", "rpm", "cht_max", "oil_bar", "voltage_v", "alt_ft", "gs_kts", "g_load", "anomaly", "rul_hrs"])
    for r in reversed(rows):
        p = json.loads(r[0])["payload"]
        writer.writerow([
            round(p.get("timestamp", 0), 2),
            round(p.get("rpm", 0), 1),
            round(max(p.get("chts", [0])), 1),
            round(p.get("oilPressure", 0), 2),
            round(p.get("batteryVoltage", 0), 2),
            round(p.get("densityAltitude", 0), 0),
            round(p.get("groundSpeed", 0), 1),
            round(p.get("gLoad", 1), 2),
            round(p.get("anomalyScore", 0), 3),
            round(p.get("rulHours", 0), 2),
        ])
    return buf.getvalue()


@app.post("/api/scenario/{name}")
def api_scenario(name: str):
    sim.trigger_scenario(name)
    return {"status": "triggered", "scenario": name}


@app.websocket("/ws/twin")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    clients.append(websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                cmd = json.loads(raw)
                cmd_type = cmd.get("type")
                payload = cmd.get("payload", {})

                if cmd_type == "setActuator":
                    sim.apply_actuator(payload.get("key"), payload.get("value"))
                elif cmd_type in ("setFault", "toggleFault"):
                    key = payload.get("key")
                    if key in sim.faults:
                        sim.faults[key] = bool(payload.get("value"))
                elif cmd_type == "setWeather":
                    mode = str(payload.get("mode", "")).upper()
                    if mode in ALLOWED_WEATHER:
                        sim.weatherMode = mode
                elif cmd_type == "setFlightMode":
                    mode = str(payload.get("mode", "")).upper()
                    if mode in ALLOWED_FLIGHT_MODES:
                        sim.flightMode = mode
                elif cmd_type == "setManualControl":
                    sim.manualControl["pitch"] = max(-1.0, min(1.0, float(payload.get("pitch", 0.0))))
                    sim.manualControl["roll"] = max(-1.0, min(1.0, float(payload.get("roll", 0.0))))
                elif cmd_type == "setPosition":
                    sim.latitude = float(payload.get("lat", sim.latitude))
                    sim.longitude = float(payload.get("lon", sim.longitude))
                    if "heading" in payload:
                        sim.heading = float(payload["heading"]) % 360.0
                elif cmd_type == "setWaypoint":
                    sim.activeWaypoint = {
                        "id": str(payload.get("id", "WPT")),
                        "lat": float(payload.get("lat", 37.78)),
                        "lon": float(payload.get("lon", -122.41)),
                        "alt": float(payload.get("alt", 8500.0)),
                    }
                    sim.flightMode = "WAYPOINT_NAV"
                elif cmd_type == "triggerScenario":
                    sim.trigger_scenario(str(payload.get("name", "NOMINAL")))
                elif cmd_type == "resetSimulation":
                    sim.reset()
            except (json.JSONDecodeError, ValueError, TypeError):
                pass
    except WebSocketDisconnect:
        if websocket in clients:
            clients.remove(websocket)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
