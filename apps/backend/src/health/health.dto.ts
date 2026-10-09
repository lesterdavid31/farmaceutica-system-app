import { ApiProperty } from '@nestjs/swagger';

export type EstadoBaseDatos = 'ok' | 'error' | 'sin_configurar';

// Los tipos se declaran explícitamente en @ApiProperty: el compilador que usa Vercel no
// genera los metadatos de tipos literales y uniones igual que tsc, y Swagger falla al leerlos.
export class EstadoSalud {
  @ApiProperty({ type: String, enum: ['ok'], example: 'ok' })
  estado!: 'ok';

  @ApiProperty({ type: String, example: 'api-farmacias' })
  servicio!: string;

  @ApiProperty({ type: String, example: '0.1.0' })
  version!: string;

  @ApiProperty({ type: String, example: 'production' })
  entorno!: string;

  @ApiProperty({ type: String, format: 'date-time', example: '2026-10-09T15:00:00.000Z' })
  fecha!: string;

  @ApiProperty({ type: String, enum: ['ok', 'error', 'sin_configurar'] })
  baseDatos!: EstadoBaseDatos;
}
