import React from 'react';

export function Magnifier({ className }: { className?: string }) {
  return (
    <svg 
      viewBox="30 30 125 125" 
      fill="none" 
      stroke="url(#epion-magnifier-grad)" 
      strokeWidth="8"
      strokeLinecap="round"
      className={className}
    >
      <circle cx="80" cy="80" r="45" />
      <line x1="111.82" y1="111.82" x2="150" y2="150" />
    </svg>
  );
}

export function MagnifierDefs() {
  return (
    <svg className="w-0 h-0 absolute pointer-events-none">
      <defs>
        <linearGradient id="epion-magnifier-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38A6A6" />
          <stop offset="50%" stopColor="#38a6a6" />
          <stop offset="100%" stopColor="#78dce3" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function MagnifierBackground() {
  return (
    <div className="absolute inset-0 z-0 bg-[#FAFAF5] dark:bg-[#0b0c0c] pointer-events-none">
      <MagnifierDefs />
    </div>
  );
}
