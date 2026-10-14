import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { useFiltroUbicacion } from '@/auth/filtro-ubicacion';
import { esGlobal, useUsuario } from '@/auth/sesion';
import {
  Cargando,
  EncabezadoPagina,
  EstadoVacio,
  Pagina,
  Panel,
  PanelError,
} from '@/components/pagina';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, query } from '@/lib/api';
import type { ReporteActivos as Reporte } from '@/lib/dominio';
import { formatearFecha, formatearMoneda } from '@/lib/formato';

function hoyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function TablaGrupos({
  titulo,
  filas,
  totales,
}: {
  titulo: string;
  filas: {
    id: string;
    nombre: string;
    cantidad: number;
    costo: string;
    depreciacionAcumulada: string;
    valorEnLibros: string;
  }[];
  totales: Reporte['totales'];
}) {
  return (
    <Panel>
      <h2 className="m-0 border-b border-borde px-4 py-3 text-seccion font-semibold">{titulo}</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              {titulo.replace('Por ', '').replace(/^\w/, (c) => c.toUpperCase())}
            </TableHead>
            <TableHead numerico>Activos</TableHead>
            <TableHead numerico>Costo</TableHead>
            <TableHead numerico>Dep. acumulada</TableHead>
            <TableHead numerico>Valor en libros</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.map((f) => (
            <TableRow key={f.id}>
              <TableCell>{f.nombre}</TableCell>
              <TableCell numerico>{f.cantidad}</TableCell>
              <TableCell numerico className="whitespace-nowrap">
                {formatearMoneda(f.costo)}
              </TableCell>
              <TableCell numerico className="whitespace-nowrap">
                {formatearMoneda(f.depreciacionAcumulada)}
              </TableCell>
              <TableCell numerico className="font-semibold whitespace-nowrap">
                {formatearMoneda(f.valorEnLibros)}
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="bg-fondo font-semibold hover:bg-fondo">
            <TableCell>Total</TableCell>
            <TableCell numerico>{totales.cantidad}</TableCell>
            <TableCell numerico className="whitespace-nowrap">
              {formatearMoneda(totales.costo)}
            </TableCell>
            <TableCell numerico className="whitespace-nowrap">
              {formatearMoneda(totales.depreciacionAcumulada)}
            </TableCell>
            <TableCell numerico className="whitespace-nowrap">
              {formatearMoneda(totales.valorEnLibros)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Panel>
  );
}

/** RF-31: valor en libros a una fecha, por ubicación y por categoría, con su depreciación acumulada. */
export function ReporteActivos() {
  const usuario = useUsuario();
  const { ubicacionId } = useFiltroUbicacion();
  const [fecha, setFecha] = useState(hoyLocal());
  const consulta = useQuery({
    queryKey: ['activos', 'reporte', fecha, ubicacionId],
    queryFn: () =>
      api.get<Reporte>(
        `/activos/reporte${query({ fecha, ubicacionId: esGlobal(usuario) ? ubicacionId : undefined })}`,
      ),
    enabled: fecha !== '',
  });
  const r = consulta.data;

  return (
    <Pagina>
      <EncabezadoPagina
        titulo="Reporte de activos fijos"
        descripcion="Valor en libros a la fecha elegida. Cada activo aparece en la ubicación que tenía ese día."
        acciones={
          <Button asChild>
            <Link to="/activos">Ver activos</Link>
          </Button>
        }
      />
      <Panel className="mb-6">
        <div className="flex flex-wrap items-end gap-4 p-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="fecha">Fecha de corte</Label>
            <Input
              id="fecha"
              type="date"
              className="w-44"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
          {r && (
            <p className="m-0 pb-2 text-denso">
              Valor en libros al {formatearFecha(r.fecha)}:{' '}
              <span className="text-seccion font-semibold tabular-nums">
                {formatearMoneda(r.totales.valorEnLibros)}
              </span>
            </p>
          )}
        </div>
      </Panel>
      {consulta.isPending ? (
        <Panel>
          <Cargando />
        </Panel>
      ) : consulta.error ? (
        <Panel>
          <PanelError error={consulta.error} onReintentar={() => void consulta.refetch()} />
        </Panel>
      ) : r && r.activos.length === 0 ? (
        <Panel>
          <EstadoVacio texto="No había activos registrados a esa fecha." />
        </Panel>
      ) : (
        r && (
          <div className="flex flex-col gap-6">
            <div className="grid gap-6 xl:grid-cols-2">
              <TablaGrupos
                titulo="Por ubicación"
                filas={r.porUbicacion.map((g) => ({
                  ...g,
                  id: g.ubicacion.id,
                  nombre: g.ubicacion.nombre,
                }))}
                totales={r.totales}
              />
              <TablaGrupos
                titulo="Por categoría"
                filas={r.porCategoria.map((g) => ({
                  ...g,
                  id: g.categoria.id,
                  nombre: g.categoria.nombre,
                }))}
                totales={r.totales}
              />
            </div>
            <Panel>
              <h2 className="m-0 border-b border-borde px-4 py-3 text-seccion font-semibold">
                Detalle por activo
              </h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Activo</TableHead>
                    <TableHead>Ubicación</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead numerico>Meses</TableHead>
                    <TableHead numerico>Costo</TableHead>
                    <TableHead numerico>Dep. acumulada</TableHead>
                    <TableHead numerico>Valor en libros</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.activos.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <Link to={`/activos/${a.id}`} className="font-semibold text-verde-botica">
                          {a.codigo}
                        </Link>
                        <span className="block text-meta text-texto-secundario">
                          {a.descripcion}
                        </span>
                      </TableCell>
                      <TableCell>{a.ubicacion.nombre}</TableCell>
                      <TableCell>{a.categoria.nombre}</TableCell>
                      <TableCell numerico>
                        {a.mesesDepreciados}/{a.vidaUtilMeses}
                      </TableCell>
                      <TableCell numerico className="whitespace-nowrap">
                        {formatearMoneda(a.costo)}
                      </TableCell>
                      <TableCell numerico className="whitespace-nowrap">
                        {formatearMoneda(a.depreciacionAcumulada)}
                      </TableCell>
                      <TableCell numerico className="font-semibold whitespace-nowrap">
                        {formatearMoneda(a.valorEnLibros)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>
          </div>
        )
      )}
    </Pagina>
  );
}
