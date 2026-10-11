import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ProveedorSesion } from './auth/sesion';
import { Toaster } from './components/ui/toaster';
import { ErrorApi } from './lib/api';
import './styles/index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      // Los errores 4xx (permisos, validación, no encontrado) no se reintentan.
      retry: (intentos, error) =>
        !(error instanceof ErrorApi && error.statusCode >= 400 && error.statusCode < 500) &&
        intentos < 2,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ProveedorSesion>
        <App />
        <Toaster />
      </ProveedorSesion>
    </QueryClientProvider>
  </StrictMode>,
);
