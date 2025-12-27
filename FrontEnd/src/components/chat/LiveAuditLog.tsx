import React, { useState, useEffect, useRef } from 'react';

const LOGS = [
    "> SYSTEM: Démarrage du moteur Epion v2.1...",
    "> SEARCH: Interrogation des index (Live Web)...",
    "> DETECT: 5 sources potentielles identifiées.",
    "> SECURITY: Vérification de conformité /ads.txt...",
    "> AUDIT: Analyse croisée Google Fact Check...",
    "> SCAN: Détection de biais sémantiques (Zero Trust)...",
    "> SCORE: Calcul des indicateurs de fiabilité...",
    "> WRITE: Synthèse de la réponse validée."
];

export function LiveAuditLog() {
    const [logs, setLogs] = useState<string[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let delay = 0;
        let mounted = true;

        LOGS.forEach((log) => {
            delay += Math.random() * 800 + 400; // Délai aléatoire entre 400ms et 1.2s
            setTimeout(() => {
                if (mounted) {
                    setLogs(prev => [...prev, log]);
                }
            }, delay);
        });

        return () => { mounted = false; };
    }, []);

    // Auto-scroll logic
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);

    return (
        <div
            ref={scrollRef}
            className="p-4 rounded-lg bg-gray-50 dark:bg-black/50 border border-gray-100 dark:border-gray-800 h-32 overflow-y-auto font-mono text-xs shadow-inner"
        >
            <div className="space-y-1">
                {logs.map((log, i) => (
                    <div key={i} className="text-gray-500 dark:text-gray-400">
                        {log}
                    </div>
                ))}
                <div className="animate-pulse text-teal-500">_</div>
            </div>
        </div>
    );
}
