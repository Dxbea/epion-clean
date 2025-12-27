import React, { useState, useEffect } from 'react';
import { Loader2, CheckCircle2, Circle } from 'lucide-react';
import { getEpionBrandGradient } from '../../lib/color-utils';

const STEPS = [
    { id: 1, label: "Initialisation des agents de recherche..." },
    { id: 2, label: "Scan des sources & Vérification technique..." },
    { id: 3, label: "Audit Zero Trust (Editorial, UX, Ads.txt)..." },
    { id: 4, label: "Rédaction et mise en forme..." }
];

export function ThinkingProcess() {
    const [currentStep, setCurrentStep] = useState(0);

    useEffect(() => {
        // Change d'étape toutes les 1.5s pour simuler le travail
        const interval = setInterval(() => {
            setCurrentStep(prev => (prev < STEPS.length - 1 ? prev + 1 : prev));
        }, 1500);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="bg-white dark:bg-[#1a1a1a] border border-gray-100 dark:border-gray-800 rounded-xl p-6 shadow-sm mb-4">
            <div className="space-y-4">
                {STEPS.map((step, index) => {
                    const isActive = index === currentStep;
                    const isCompleted = index < currentStep;

                    return (
                        <div key={step.id} className="flex items-center space-x-3">
                            <div className="flex-shrink-0">
                                {isActive ? (
                                    <Loader2 className="w-5 h-5 animate-spin text-teal-500" />
                                ) : isCompleted ? (
                                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                ) : (
                                    <Circle className="w-5 h-5 text-gray-200 dark:text-gray-700" />
                                )}
                            </div>
                            <span
                                className={`text-sm font-medium transition-colors duration-300 ${isActive
                                        ? 'text-transparent bg-clip-text font-bold'
                                        : isCompleted ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400'
                                    }`}
                                style={isActive ? { backgroundImage: getEpionBrandGradient() } : {}}
                            >
                                {step.label}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
