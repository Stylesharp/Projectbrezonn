import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function HoloPanel({ children, className, scanline = false, title, titleIcon }) {
  return (
    <div className={twMerge("holo-panel corner-bracket corner-bracket-tr flex flex-col p-3.5 min-w-0 min-h-0", className)}>
      {scanline && <div className="absolute inset-0 bg-holo/5 animate-scanline pointer-events-none" />}

      {title && (
        <div className="flex items-center mb-2.5 shrink-0 select-none gap-2">
          <div className="h-1.5 w-1.5 bg-holo shadow-[0_0_6px_#00f0ff] rounded-xs shrink-0" />
          {titleIcon && <span className="text-holo shrink-0">{titleIcon}</span>}
          <h3 className="font-mono text-xs text-holo font-bold uppercase tracking-wider truncate">{title}</h3>
          <div className="flex-1 h-px bg-holo/20" />
        </div>
      )}

      <div className="flex-1 relative z-10 min-w-0 min-h-0 flex flex-col">
        {children}
      </div>
    </div>
  );
}
