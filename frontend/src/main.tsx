import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { AuthProvider } from '@/lib/auth';
import { OnlineStatusProvider } from '@/lib/online-status';
import { queryClient } from '@/lib/query-client';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <QueryClientProvider client={queryClient}>
        <OnlineStatusProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </OnlineStatusProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
