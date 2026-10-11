import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useUsuario } from '@/auth/sesion';
import { Cargando, EncabezadoPagina, Pagina, Panel, PanelError } from '@/components/pagina';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useMutacion } from '@/lib/consultas';
import type { ParametroConfiguracion } from '@/lib/dominio';

function FormularioConfiguracion({
  parametros,
  soloLectura,
}: {
  parametros: ParametroConfiguracion[];
  soloLectura: boolean;
}) {
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(parametros.map((p) => [p.clave, String(p.valor)])),
  );
  const guardar = useMutacion(
    (cambios: Record<string, number>) =>
      api.put<ParametroConfiguracion[]>('/configuracion', { valores: cambios }),
    { invalidar: [['configuracion']], exito: 'Configuración guardada' },
  );

  const cambios = Object.fromEntries(
    parametros
      .filter((p) => valores[p.clave] !== String(p.valor))
      .map((p) => [p.clave, Number(valores[p.clave])]),
  );
  const hayCambios = Object.keys(cambios).length > 0;

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (hayCambios) {
      guardar.mutate(cambios);
    }
  };

  return (
    <form onSubmit={enviar} noValidate>
      {guardar.error && <PanelError error={guardar.error} />}
      <ul className="m-0 list-none p-0">
        {parametros.map((p) => (
          <li
            key={p.clave}
            className="grid gap-3 border-b border-borde px-4 py-4 last:border-b-0 sm:grid-cols-[1fr_auto] sm:items-center"
          >
            <div>
              <Label htmlFor={p.clave}>{p.etiqueta}</Label>
              <p className="m-0 mt-1 text-meta text-texto-secundario">
                {p.descripcion} Valor por defecto: {p.porDefecto} {p.unidad}.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                id={p.clave}
                type="number"
                inputMode="decimal"
                min={p.minimo}
                max={p.maximo}
                step={p.decimales === 0 ? 1 : 1 / 10 ** p.decimales}
                disabled={soloLectura}
                value={valores[p.clave]}
                onChange={(e) => setValores((v) => ({ ...v, [p.clave]: e.target.value }))}
                className="w-32 text-right tabular-nums"
              />
              <span className="w-20 text-denso text-texto-secundario">{p.unidad}</span>
            </div>
          </li>
        ))}
      </ul>
      {!soloLectura && (
        <div className="flex justify-end gap-2 border-t border-borde px-4 py-3">
          <Button
            type="button"
            disabled={!hayCambios || guardar.isPending}
            onClick={() =>
              setValores(Object.fromEntries(parametros.map((p) => [p.clave, String(p.valor)])))
            }
          >
            Descartar cambios
          </Button>
          <Button type="submit" variant="primario" disabled={!hayCambios || guardar.isPending}>
            Guardar configuración
          </Button>
        </div>
      )}
    </form>
  );
}

export function Configuracion() {
  const soloLectura = useUsuario().rol !== 'ADMIN';
  const consulta = useQuery({
    queryKey: ['configuracion'],
    queryFn: () => api.get<ParametroConfiguracion[]>('/configuracion'),
  });

  return (
    <Pagina>
      <EncabezadoPagina
        titulo="Configuración"
        descripcion="Parámetros que usan las reglas de negocio del sistema."
      />
      <Panel className="max-w-4xl">
        {consulta.isPending ? (
          <Cargando />
        ) : consulta.error ? (
          <PanelError error={consulta.error} onReintentar={() => void consulta.refetch()} />
        ) : (
          // La clave fuerza a reiniciar el formulario cuando cambian los valores guardados.
          <FormularioConfiguracion
            key={consulta.data.map((p) => p.valor).join('|')}
            parametros={consulta.data}
            soloLectura={soloLectura}
          />
        )}
      </Panel>
    </Pagina>
  );
}
