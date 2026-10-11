import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginacionDto } from '../common/paginacion';

export class FiltroBitacoraDto extends PaginacionDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  usuarioId?: string;

  @ApiPropertyOptional({ type: String, example: 'Usuario' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  entidad?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  entidadId?: string;

  @ApiPropertyOptional({ type: String, example: 'ACTUALIZAR' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  accion?: string;

  @ApiPropertyOptional({ type: String, format: 'date', example: '2026-10-01' })
  @IsOptional()
  @IsDateString()
  desde?: string;

  @ApiPropertyOptional({ type: String, format: 'date', example: '2026-10-31' })
  @IsOptional()
  @IsDateString()
  hasta?: string;
}
