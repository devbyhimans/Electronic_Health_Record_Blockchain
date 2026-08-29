const trimTrailingSlash = (value) => value.replace(/\/+$/, '');

const browserHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

const defaultApiBaseUrl = `http://${browserHost}:4000`;
const defaultIpfsGatewayUrl = 'http://127.0.0.1:8080/ipfs';

export const API_BASE_URL = trimTrailingSlash(
  import.meta.env.VITE_API_BASE_URL || defaultApiBaseUrl
);

export const IPFS_GATEWAY_URL = trimTrailingSlash(
  import.meta.env.VITE_IPFS_GATEWAY_URL || defaultIpfsGatewayUrl
);
