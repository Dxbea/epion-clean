import React, { useState, useRef, useEffect } from 'react';

type Option = { value: string; label: string; };

type Props = {
    label?: string;
    value: string;
    options: Option[];
    onChange: (val: string) => void;
    placeholder?: string;
    disabled?: boolean;
};

export default function EpionSelect({ label, value, options, onChange, placeholder = 'Select...', disabled = false }: Props) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Fermer si on clique ailleurs
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedLabel = options.find((o) => o.value === value)?.label || placeholder;

    return (
        <div className="relative w-full" ref={containerRef}>
            {label && (
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {label}
                </label>
            )}
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={`flex w-full items-center justify-between rounded-2xl border px-4 py-2.5 text-left text-sm transition-all duration-200
          ${isOpen ? 'border-black ring-1 ring-black dark:border-white dark:ring-white' : 'border-black/5 hover:border-black/20 hover:shadow-md dark:border-white/10 dark:hover:border-white/30'}
          bg-white dark:bg-neutral-900 shadow-sm
          ${disabled ? 'cursor-not-allowed opacity-50 bg-neutral-100 dark:bg-neutral-800 shadow-none' : ''}
        `}
            >
                <span className={!value ? 'opacity-50' : 'text-gray-900 dark:text-white'}>{selectedLabel}</span>
                <svg
                    className={`ml-2 h-4 w-4 opacity-50 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {isOpen && (
                <div className="absolute left-0 top-full z-50 mt-2 max-h-60 w-full overflow-auto rounded-2xl border border-black/5 bg-white shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] dark:border-white/5 dark:bg-neutral-900 p-1">
                    {options.map((opt) => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                                onChange(opt.value);
                                setIsOpen(false);
                            }}
                            className={`flex w-full items-center rounded-xl px-3 py-2 text-sm transition-colors
                ${opt.value === value ? 'bg-black/5 font-medium dark:bg-white/10' : 'hover:bg-black/5 dark:hover:bg-white/5'}
                text-gray-900 dark:text-white
              `}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
