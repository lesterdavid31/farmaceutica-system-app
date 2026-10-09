import { createBrowserRouter, Outlet, RouterProvider } from 'react-router';
import { Logo } from '@/components/Logo';
import { EstadoSistema } from '@/pages/EstadoSistema';

function Layout() {
  return (
    <div className="min-h-screen bg-fondo">
      <header className="border-b border-borde bg-superficie">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center px-4 sm:px-8">
          <Logo />
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [{ index: true, element: <EstadoSistema /> }],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
