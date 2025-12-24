import React, { useState, useEffect } from 'react';
import { Brain } from 'lucide-react';

const STEPS = [
    "Analyse du sujet...",
    "Exploration des sources (Presse & Recherche)...",
    "Vérification de la fiabilité des données...",
    "Structuration de la réponse..."
];

export default function ReasoningLoader() {
    const [currentStep, setCurrentStep] = useState(0);
    const [fadeKey, setFadeKey] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentStep((prev) => {
                // Stop at the last step or cycle? 
                // Request implies sequential, likely cycle or hold if it takes long.
                // Let's cycle for now to keep it alive.
                return (prev + 1) % STEPS.length;
            });
            setFadeKey((prev) => prev + 1);
        }, 1500);

        return () => clearInterval(interval);
    }, []);

    return (
        <div className="flex flex-col items-center justify-center py-6 space-y-4">
            {/* Icon with pulsing animation */}
            <div className="relative flex items-center justify-center">
                <div className="absolute h-8 w-8 animate-ping rounded-full bg-[#2C98A0] opacity-20"></div>
                <Brain className="h-6 w-6 text-[#2C98A0] animate-pulse" />
            </div>

            {/* Rotating Text */}
            <div className="h-6 overflow-hidden">
                <p
                    key={fadeKey}
                    className="text-sm font-serif text-gray-700 dark:text-gray-300 italic animate-in fade-in slide-in-from-bottom-2 duration-500"
                >
                    {STEPS[currentStep]}
                </p>
            </div>
        </div>
    );
}
