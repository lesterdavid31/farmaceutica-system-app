import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Parámetros estándar de paginación: `?page=&limit=` (sección 7.2). */
export class PaginacionDto {
  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ type: Number, default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

/** Paginación con búsqueda de texto libre `?q=`. */
export class BusquedaDto extends PaginacionDto {
  @ApiPropertyOptional({ type: String, description: 'Texto a buscar' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export interface Pagina<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export function saltar({ page, limit }: PaginacionDto) {
  return { skip: (page - 1) * limit, take: limit };
}

export function pagina<T>(data: T[], total: number, { page, limit }: PaginacionDto): Pagina<T> {
  return { data, total, page, limit };
}
