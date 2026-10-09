import { ApiProperty } from '@nestjs/swagger';

export type EstadoBaseDatos = 'ok' | 'error' | 'sin_configurar';

export class EstadoSalud {
  @ApiProperty({ example: 'ok' })
  estado!: 'ok';

  @ApiProperty({ example: 'api-farmacias' })
  servicio!: string;

  @ApiProperty({ example: '0.1.0' })
  version!: string;

  @ApiProperty({ example: 'production' })
  entorno!: string;

  @ApiProperty({ example: '2026-10-09T15:00:00.000Z' })
  fecha!: string;

  @ApiProperty({ enum: ['ok', 'error', 'sin_configurar'] })
  baseDatos!: EstadoBaseDatos;
}
