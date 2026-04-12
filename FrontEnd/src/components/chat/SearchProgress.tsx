import React, { useState, useEffect, useRef } from 'react';
import { Loader2, ChevronDown, ChevronUp } from 'lucide-react';

export function SearchProgress({ actions }: { actions?: string[] }) {
    const [expanded, setExpanded] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (expanded && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [actions, expanded]);

    if (!actions || actions.length === 0) return null;

    const currentAction = actions[actions.length - 1];

    return (
        <div className="flex flex-col items-center w-full animate-in fade-in slide-in-from-bottom-2 duration-500">
            <button 
                onClick={() => setExpanded(!expanded)}
                className="inline-flex flex-row items-center gap-3 px-4 py-2 rounded-full bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 text-sm shadow-sm transition-all hover:bg-black/10 dark:hover:bg-white/20 group"
            >
                <Loader2 className="w-4 h-4 animate-spin text-teal-600 dark:text-teal-400" />
                <span className="text-gray-700 dark:text-gray-300 font-medium transition-opacity animate-in fade-in duration-300 pointer-events-none select-none">
                    {currentAction}
                </span>
                {expanded ? <ChevronUp className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 ml-1" /> : <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 ml-1" />}
            </button>

            {expanded && (
                <div 
                    ref={scrollRef}
                    className="mt-4 p-4 w-full max-w-md rounded-lg bg-gray-50 dark:bg-black/50 border border-gray-100 dark:border-gray-800 h-32 overflow-y-auto font-mono text-xs shadow-inner text-left animate-in fade-in slide-in-from-top-2"
                >
                    <div className="space-y-1">
                        {actions.map((log, i) => (
                            <div key={i} className="text-gray-500 dark:text-gray-400">
                                {'>'} {log}
                            </div>
                        ))}
                        <div className="animate-pulse text-teal-500">_</div>
                    </div>
                </div>
            )}
        </div>
    );
}
