import React from "react";

type ToggleRowProps = {
  label: string;
  sublabel?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
};

export default function ToggleRow({ label, sublabel, value, onChange, disabled }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-6">
      <div className="min-w-0">
        <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{label}</div>
        {sublabel && <div className="text-sm text-neutral-600 dark:text-neutral-400">{sublabel}</div>}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-disabled={disabled || undefined}
        onClick={() => !disabled && onChange(!value)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none
          focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-blue
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${value ? 'bg-brand-blue' : 'bg-neutral-300 dark:bg-neutral-700'}`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white transition
            ${value ? 'translate-x-5' : 'translate-x-1'}`}
        />
      </button>
    </div>
  );
}
