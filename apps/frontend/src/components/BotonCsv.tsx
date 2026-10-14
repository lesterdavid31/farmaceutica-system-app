import { Download } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

/** Botón "Exportar CSV" (RF-36). `exportar` puede ser asíncrono (por ejemplo, traer todas las páginas). */
export function BotonCsv({
  exportar,
  deshabilitado,
  tamano = 'md',
}: {
  exportar: () => void | Promise<void>;
  deshabilitado?: boolean;
  tamano?: 'sm' | 'md';
}) {
  const [exportando, setExportando] = useState(false);
  return (
    <Button
      size={tamano}
      disabled={deshabilitado || exportando}
      onClick={async () => {
        setExportando(true);
        try {
          await exportar();
        } catch {
          toast.error('No se pudo exportar. Intente de nuevo.');
        } finally {
          setExportando(false);
        }
      }}
    >
      <Download size={16} strokeWidth={1.75} aria-hidden="true" />
      {exportando ? 'Exportando...' : 'Exportar CSV'}
    </Button>
  );
}
