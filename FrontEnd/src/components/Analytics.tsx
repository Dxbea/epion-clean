import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

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
        if (typeof window.gtag === 'function') {
            window.gtag('config', 'G-NX59W4PKLR', {
                page_path: location.pathname + location.search,
            });
        }
    }, [location]);

    return null; // Ce composant ne rend rien visuellement
};

export default Analytics;