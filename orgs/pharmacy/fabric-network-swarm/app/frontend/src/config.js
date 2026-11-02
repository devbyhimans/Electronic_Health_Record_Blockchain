const trimTrailingSlash = (value) => value.replace(/\/+$/, '');

const browserHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

const defaultApiBaseUrl = '/api/pharmacy';
const defaultIpfsGatewayUrl = 'http://127.0.0.1:8090/ipfs';

export const API_BASE_URL = trimTrailingSlash(
  import.meta.env.VITE_API_BASE_URL || defaultApiBaseUrl
);

export const IPFS_GATEWAY_URL = trimTrailingSlash(
  import.meta.env.VITE_IPFS_GATEWAY_URL || defaultIpfsGatewayUrl
);
