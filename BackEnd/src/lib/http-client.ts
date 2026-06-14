import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import axiosRetry from 'axios-retry';
import { logger } from './logger.js';

const RATE_LIMIT_RETRY_DELAY_MS = 15_000;
const MAX_429_RETRIES = 3;

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _epion429RetryCount?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const axiosInstance = axios.create({
  timeout: 30_000,
});

axiosRetry(axiosInstance, {
  retries: 3,
  shouldResetTimeout: true,
  retryDelay: (retryCount, error) => {
    const delay = axiosRetry.exponentialDelay(retryCount, error);
    logger.warn(`Axios retry scheduled in ${Math.round(delay / 1000)}s`, {
      module: 'HttpClient',
      url: error.config?.url,
      retryCount,
      status: error.response?.status,
    });
    return delay;
  },
  retryCondition: (error) => {
    const status = error.response?.status;

    // 429 is handled exclusively by the response interceptor below so we can
    // enforce a real 15s/30s/45s pause instead of axios-retry's short retries.
    if (status === 429) {
      return false;
    }

    return (
      axiosRetry.isNetworkError(error) ||
      (status !== undefined && status >= 500)
    );
  },
  onRetry: (retryCount, error, requestConfig) => {
    logger.warn(`Axios retry #${retryCount}`, {
      module: 'HttpClient',
      url: requestConfig.url,
      error: error.message,
      status: error.response?.status,
    });
  },
});

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetryableRequestConfig | undefined;
    const status = error.response?.status;

    if (!config || status !== 429) {
      return Promise.reject(error);
    }

    const retryCount = config._epion429RetryCount ?? 0;
    if (retryCount >= MAX_429_RETRIES) {
      logger.error('429 retry budget exhausted', {
        module: 'HttpClient',
        url: config.url,
        retryCount,
      });
      return Promise.reject(error);
    }

    const nextRetryCount = retryCount + 1;
    const delay = RATE_LIMIT_RETRY_DELAY_MS * nextRetryCount;
    config._epion429RetryCount = nextRetryCount;

    logger.warn(`429 detected - waiting ${delay / 1000}s before retry`, {
      module: 'HttpClient',
      url: config.url,
      retryCount: nextRetryCount,
    });

    await sleep(delay);

    logger.warn(`Retrying request after 429 (#${nextRetryCount})`, {
      module: 'HttpClient',
      url: config.url,
    });

    return axiosInstance.request(config);
  },
);

export default axiosInstance;
