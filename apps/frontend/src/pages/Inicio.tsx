import { Link } from 'react-router';
import { useUsuario } from '@/auth/sesion';
import { EncabezadoPagina, Pagina, Panel } from '@/components/pagina';
import { ROLES } from '@/lib/dominio';
import { navegacionPara } from '@/layout/navegacion';

/**
 * Pantalla de inicio del cajero y del operador: su alcance y accesos directos a sus módulos.
 * ADMIN, AUDITOR y GERENTE ven en su lugar el dashboard (RF-32, RF-37).
 */
export function Inicio() {
  const usuario = useUsuario();
  const accesos = navegacionPara(usuario)
    .flatMap((s) => s.items)
    .filter((i) => i.ruta !== '/');

  return (
    <Pagina>
      <EncabezadoPagina
        titulo={`Hola, ${usuario.nombre.split(' ')[0]}`}
        descripcion={`${ROLES[usuario.rol]} · ${usuario.ubicacion?.nombre ?? 'Todas las ubicaciones'}`}
      />
      <Panel className="max-w-3xl">
        <h2 className="m-0 border-b border-borde px-4 py-3 text-seccion font-semibold">
          Sus módulos
        </h2>
        {accesos.length === 0 ? (
          <p className="m-0 px-4 py-4 text-denso text-texto-secundario">
            Los módulos de su rol estarán disponibles en las próximas versiones del sistema.
          </p>
        ) : (
          <ul className="m-0 list-none p-0">
            {accesos.map((item) => (
              <li key={item.ruta} className="border-b border-borde last:border-b-0">
                <Link
                  to={item.ruta}
                  className="flex h-11 items-center gap-3 px-4 text-denso text-texto no-underline hover:bg-salvia/50"
                >
                  <item.icono
                    size={18}
                    strokeWidth={1.75}
                    className="text-verde-botica"
                    aria-hidden="true"
                  />
                  {item.etiqueta}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </Pagina>
  );
}
