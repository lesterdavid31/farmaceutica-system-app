import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginacionDto } from '../common/paginacion';
import { TipoMovimientoInventario } from '../generated/prisma/enums';

export class FiltroDashboardDto {
  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Solo ADMIN y AUDITOR' })
  @IsOptional()
  @IsUUID()
  ubicacionId?: string;
}

export class RangoFechasDto {
  @ApiPropertyOptional({ type: String, format: 'date', description: 'Desde (fecha de Guatemala)' })
  @IsOptional()
  @IsDateString()
  desde?: string;

  @ApiPropertyOptional({ type: String, format: 'date', description: 'Hasta, inclusive' })
  @IsOptional()
  @IsDateString()
  hasta?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  ubicacionId?: string;
}

export class FiltroMovimientosDto extends PaginacionDto {
  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @IsDateString()
  desde?: string;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @IsDateString()
  hasta?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  ubicacionId?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  productoId?: string;

  @ApiPropertyOptional({ enum: TipoMovimientoInventario })
  @IsOptional()
  @IsEnum(TipoMovimientoInventario)
  tipo?: TipoMovimientoInventario;
}
