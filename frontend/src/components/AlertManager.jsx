import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, ShieldCheck, X } from 'lucide-react';
import { useTelemetryStore } from '../store/useTelemetryStore';

export function AlertManager({ sendCommand }) {
  const { telemetry } = useTelemetryStore();
  const [criticalAlert, setCriticalAlert] = useState(null);
  const dismissedAlerts = useRef(new Set());

  useEffect(() => {
    if (!telemetry) return;

    const candidates = [];

    if (telemetry.faults?.oilLineRupture || telemetry.oilPressure < 1.0) {
      candidates.push({
        id: 'OIL_RUPTURE',
        title: 'CRITICAL OIL PRESSURE LOSS',
        component: 'LUBRICATION SYSTEM',
        reading: `OIL PRESSURE: ${telemetry.oilPressure.toFixed(2)} BAR`,
        copilot: ['1. Throttle down to 25% immediately.', '2. Initiate emergency RTB profile.'],
        action: 'AUTO-MITIGATE (THR 25%)',
        mitigateCommands: [{ type: 'setActuator', payload: { key: 'throttle', value: 25.0 } }],
      });
    }
    if (telemetry.faults?.cyl2Overheat || telemetry.chts?.[1] > 240) {
      candidates.push({
        id: 'CYL2_OVERHEAT',
        title: 'THERMAL RUNAWAY DETECTED',
        component: 'CYLINDER 2 HEAD',
        reading: `CHT2: ${telemetry.chts[1].toFixed(1)} °C`,
        copilot: ['1. Enrich mixture to 100%.', '2. Reduce throttle to 40%.'],
        action: 'RICH MIXTURE & REDUCE PWR',
        mitigateCommands: [
          { type: 'setActuator', payload: { key: 'mixture', value: 100.0 } },
          { type: 'setActuator', payload: { key: 'throttle', value: 40.0 } },
        ],
      });
    }
    if (telemetry.faults?.hydLeak || telemetry.hydPressure < 1600) {
      candidates.push({
        id: 'HYD_LEAK',
        title: 'HYDRAULIC PRESSURE DROP',
        component: 'HYDRAULIC POWER UNIT',
        reading: `HYD: ${telemetry.hydPressure.toFixed(0)} PSI`,
        copilot: ['1. Engage backup hydraulic pump.', '2. Restrict high-G control inputs.'],
        action: 'CYCLE HYD PUMP',
        mitigateCommands: [{ type: 'setActuator', payload: { key: 'hydPump', value: true } }],
      });
    }
    if (telemetry.faults?.alternatorFailure || telemetry.batteryVoltage < 22) {
      candidates.push({
        id: 'ELEC_FAIL',
        title: 'ELECTRICAL BUS UNDERVOLTAGE',
        component: 'ALTERNATOR / MAIN BUS',
        reading: `BATTERY: ${telemetry.batteryVoltage.toFixed(1)} V`,
        copilot: ['1. Shed anti-ice & non-essential loads.', '2. Verify generator switch state.'],
        action: 'SHED LOADS',
        mitigateCommands: [
          { type: 'setActuator', payload: { key: 'antiIce', value: false } },
          { type: 'setActuator', payload: { key: 'generatorSwitch', value: true } },
        ],
      });
    }

    const activeIds = new Set(candidates.map((c) => c.id));
    for (const id of [...dismissedAlerts.current]) {
      if (!activeIds.has(id)) dismissedAlerts.current.delete(id);
    }

    const next = candidates.find((c) => !dismissedAlerts.current.has(c.id)) || null;
    setCriticalAlert((prev) =>
      prev?.id === next?.id ? (next ? { ...prev, reading: next.reading } : null) : next
    );
  }, [telemetry]);

  const handleMitigate = () => {
    criticalAlert?.mitigateCommands?.forEach((cmd) => sendCommand(cmd));
    handleDismiss();
  };

  const handleDismiss = () => {
    if (criticalAlert) {
      dismissedAlerts.current.add(criticalAlert.id);
      setCriticalAlert(null);
    }
  };

  return (
    <div className="fixed top-16 right-4 z-[100] flex flex-col gap-3 pointer-events-none">
      <AnimatePresence>
        {criticalAlert && (
          <motion.div
            key={criticalAlert.id}
            initial={{ opacity: 0, x: 40, scale: 0.94 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
            className="w-[380px] bg-slate-950/92 backdrop-blur-xl border border-rose-500/70 shadow-[0_0_32px_rgba(244,63,94,0.3)] rounded-lg overflow-hidden pointer-events-auto"
          >
            <div className="bg-rose-500/15 px-3.5 py-2.5 border-b border-rose-500/30 flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="text-rose-400 animate-pulse shrink-0" size={20} />
                <div>
                  <h2 className="text-rose-300 font-bold text-xs tracking-wider uppercase">{criticalAlert.title}</h2>
                  <p className="text-rose-200/70 text-[10px]">{criticalAlert.component} • {criticalAlert.reading}</p>
                </div>
              </div>
              <button onClick={handleDismiss} className="text-slate-400 hover:text-white cursor-pointer">
                <X size={15} />
              </button>
            </div>

            <div className="p-3.5 text-xs">
              <div className="text-cyan-300 mb-1.5 text-[10px] uppercase tracking-widest flex items-center gap-1">
                <ShieldCheck size={12} /> AI Copilot Recommendations
              </div>
              <div className="bg-slate-900/80 p-2.5 border border-white/5 rounded-md space-y-1 mb-3 text-slate-300">
                {criticalAlert.copilot.map((step, i) => (
                  <p key={i}>{step}</p>
                ))}
              </div>
              <button
                onClick={handleMitigate}
                className="w-full py-2 rounded-md bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/60 text-rose-200 font-bold tracking-wider transition-all cursor-pointer"
              >
                EXECUTE: {criticalAlert.action}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
