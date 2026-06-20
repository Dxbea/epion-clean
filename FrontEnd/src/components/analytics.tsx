import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { useTrackingConsent } from '@/lib/tracking-consent';
import { sendGoogleAnalyticsPageView } from '@/lib/tracking-services';

const Analytics = () => {
    const location = useLocation();
    const consent = useTrackingConsent();

    useEffect(() => {
        if (consent === 'granted') {
            sendGoogleAnalyticsPageView(location.pathname + location.search);
        }
    }, [consent, location]);

    return null;
};

export default Analytics;
