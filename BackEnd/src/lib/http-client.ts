import axios from 'axios';
import axiosRetry from 'axios-retry';
import { logger } from './logger';

const axiosInstance = axios.create({
    timeout: 30000, // 30 secondes par défaut
});

axiosRetry(axiosInstance, {
    retries: 3,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) => {
        // Retry sur erreurs réseaux ou 5xx ou 429
        return (
            axiosRetry.isNetworkOrIdempotentRequestError(error) ||
            (error.response?.status !== undefined && error.response.status >= 500) ||
            error.response?.status === 429
        );
    },
    onRetry: (retryCount, error, requestConfig) => {
        logger.warn(`Axios Retry #${retryCount}`, {
            module: 'HttpClient',
            url: requestConfig.url,
            error: error.message,
            status: error.response?.status
        });
    }
});

export default axiosInstance;
