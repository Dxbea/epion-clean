import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { frontendEnv } from '@/config/env';

// Déclaration de type pour Google Analytics gtag
declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
    dataLayer: unknown[];
  }
}

const Analytics = () => {
    const location = useLocation();

    useEffect(() => {
        // On envoie la vue à Google à chaque changement de 'location'
        if (frontendEnv.VITE_GA_ID && typeof window.gtag === 'function') {
            window.gtag('config', frontendEnv.VITE_GA_ID, {
                page_path: location.pathname + location.search,
            });
        }
    }, [location]);

    return null; // Ce composant ne rend rien visuellement
};

export default Analytics;