const BASE_URL = '/api/dashboard';
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

export async function fetchApi(endpoint, options = {}) {
  if (USE_MOCK) {
    return getMockData(endpoint);
  }

  const token = localStorage.getItem('ehr_token');
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options?.headers,
    },
  });

  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    throw new Error(`API Error: ${res.status}`);
  }

  return res.json();
}

function getMockData(endpoint) {
  return new Promise((resolve) => {
    setTimeout(() => {
      if (endpoint.includes('/agents/')) {
        resolve({
          health: 'ONLINE',
          metrics: {
            runs: 1432,
            successRate: 99.8,
            averageLatency: 245,
            fallbackRate: 0.1,
            activeVisits: 45,
            prescriptions: 120,
            activePatients: 30,
            vitalsRecorded: 400,
            dispensed: 115,
            failedTransactions: 2,
            reports: 89,
            uploads: 89,
            toolCalls: 543,
            humanReviewRate: 5,
            approved: 50,
            rejected: 2,
            humanReviewRequired: 4
          },
          chartData: Array.from({ length: 24 }).map((_, i) => ({
            time: `${i}:00`,
            runs: Math.floor(Math.random() * 100),
            latency: 200 + Math.floor(Math.random() * 100)
          })),
          events: [
            { id: 1, type: 'INFO', message: 'Processed patient record', timestamp: new Date().toISOString() },
            { id: 2, type: 'WARNING', message: 'High latency detected', timestamp: new Date(Date.now() - 60000).toISOString() }
          ],
          aiProps: {
            modelUsed: 'gemini-1.5-pro',
            agentVersion: 'v2.4.1',
            governanceOutcome: 'APPROVED'
          }
        });
      }
      resolve({});
    }, 500);
  });
}
