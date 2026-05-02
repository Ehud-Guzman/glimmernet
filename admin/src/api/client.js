import axios from 'axios';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api/v1',
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    const status  = err.response?.status;
    const url     = err.config?.url;
    const method  = err.config?.method?.toUpperCase();
    const message = err.response?.data?.message || err.message;

    if (status === 401 && !url?.includes('/auth/login')) {
      localStorage.removeItem('admin_token');
      window.location.href = '/login';
    } else {
      // Log every non-401 API error so it's visible in DevTools
      console.error(`[API] ${method} ${url} → ${status ?? 'ERR'}: ${message}`);
    }

    return Promise.reject(err);
  }
);

export default client;
