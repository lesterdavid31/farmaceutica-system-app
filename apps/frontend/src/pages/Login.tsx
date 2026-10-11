import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { z } from 'zod';
import { useSesion } from '@/auth/sesion';
import { Logo } from '@/components/Logo';
import { Campo, mensajeDeError } from '@/components/pagina';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const esquema = z.object({
  email: z.email('Ingrese un correo electrónico válido').trim().toLowerCase(),
  password: z.string().min(1, 'Ingrese su contraseña'),
});
type Datos = z.infer<typeof esquema>;

export function Login() {
  const { sesion, iniciarSesion } = useSesion();
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Datos>({ resolver: zodResolver(esquema) });

  if (sesion.estado === 'autenticado') {
    return <Navigate to="/" replace />;
  }
  const destino = (ubicacion.state as { desde?: string } | null)?.desde ?? '/';
  const aviso = sesion.estado === 'anonimo' ? sesion.motivo : undefined;

  const enviar = handleSubmit(async ({ email, password }) => {
    setError(null);
    try {
      await iniciarSesion(email, password);
      navegar(destino, { replace: true });
    } catch (e) {
      setError(mensajeDeError(e));
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-fondo px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <form
          onSubmit={enviar}
          noValidate
          className="rounded-panel border border-borde bg-superficie p-6"
        >
          <h1 className="m-0 text-seccion font-semibold">Iniciar sesión</h1>
          <p className="m-0 mt-1 mb-6 text-denso text-texto-secundario">
            Ingrese con el correo y la contraseña de su usuario.
          </p>

          {(error ?? aviso) && (
            <p
              role="alert"
              className={
                error
                  ? 'm-0 mb-4 rounded-control bg-ladrillo-fondo px-3 py-2 text-denso text-ladrillo'
                  : 'm-0 mb-4 rounded-control bg-ambar-fondo px-3 py-2 text-denso text-ambar'
              }
            >
              {error ?? aviso}
            </p>
          )}

          <div className="flex flex-col gap-4">
            <Campo id="email" etiqueta="Correo electrónico" error={errors.email?.message}>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                autoFocus
                aria-invalid={!!errors.email}
                {...register('email')}
              />
            </Campo>
            <Campo id="password" etiqueta="Contraseña" error={errors.password?.message}>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={!!errors.password}
                {...register('password')}
              />
            </Campo>
          </div>

          <Button type="submit" variant="primario" className="mt-6 w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Iniciando sesión...' : 'Iniciar sesión'}
          </Button>
        </form>
      </div>
    </div>
  );
}
