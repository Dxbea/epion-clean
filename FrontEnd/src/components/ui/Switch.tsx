import React from 'react';

interface SwitchProps {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    disabled?: boolean;
}

export function Switch({ checked, onCheckedChange, disabled = false }: SwitchProps) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => !disabled && onCheckedChange(!checked)}
            className={`
        relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent 
        transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 
        focus-visible:ring-[#00dc82] focus-visible:ring-offset-2 focus-visible:ring-offset-white 
        dark:focus-visible:ring-offset-neutral-950
        ${checked ? 'bg-[#00dc82]' : 'bg-gray-200 dark:bg-neutral-700'}
        ${disabled ? 'cursor-not-allowed opacity-50' : ''}
      `}
        >
            <span className="sr-only">Toggle</span>
            <span
                className={`
          pointer-events-none block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 
          transition duration-200 ease-in-out
          ${checked ? 'translate-x-5' : 'translate-x-0'}
        `}
            />
        </button>
    );
}
