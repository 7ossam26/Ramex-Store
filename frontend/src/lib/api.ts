import axios from 'axios';

export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('ramex_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('ramex_token');
      if (location.pathname !== '/login') location.assign('/login');
    }
    return Promise.reject(err);
  },
);
