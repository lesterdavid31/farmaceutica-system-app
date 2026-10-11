import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  NotEquals,
} from 'class-validator';
import { BusquedaDto, PaginacionDto } from '../common/paginacion';
import { TipoMovimientoInventario } from '../generated/prisma/enums';
import { aBooleano } from '../ubicaciones/ubicaciones.dto';

export class FiltroExistenciasDto extends BusquedaDto {
  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description: 'Obligatoria en la práctica para gerentes y cajeros (se usa la suya)',
  })
  @IsOptional()
  @IsUUID()
  ubicacionId?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoriaId?: string;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Solo productos con existencia mayor que cero',
  })
  @IsOptional()
  @Transform(aBooleano)
  @IsBoolean()
  conExistencia?: boolean;

  @ApiPropertyOptional({ type: Boolean, description: 'Solo productos por debajo del stock mínimo' })
  @IsOptional()
  @Transform(aBooleano)
  @IsBoolean()
  bajoMinimo?: boolean;
}

export class FiltroKardexDto extends PaginacionDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('all', { message: 'Seleccione un producto' })
  productoId!: string;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  ubicacionId?: string;

  @ApiPropertyOptional({
    type: String,
    enum: TipoMovimientoInventario,
    enumName: 'TipoMovimientoInventario',
  })
  @IsOptional()
  @IsEnum(TipoMovimientoInventario)
  tipo?: TipoMovimientoInventario;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @IsDateString()
  desde?: string;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @IsDateString()
  hasta?: string;
}

export class FiltroUbicacionDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  ubicacionId?: string;
}

export class AjusteDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('all', { message: 'Seleccione la ubicación' })
  ubicacionId!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('all', { message: 'Seleccione el lote' })
  loteId!: string;

  @ApiProperty({
    type: Number,
    example: -2,
    description: 'Con signo: positivo suma unidades, negativo las resta',
  })
  @Type(() => Number)
  @IsInt({ message: 'La cantidad debe ser un número entero' })
  @NotEquals(0, { message: 'La cantidad del ajuste no puede ser cero' })
  @Min(-100000)
  @Max(100000)
  cantidad!: number;

  @ApiProperty({ type: String, example: 'Conteo físico: 2 cajas dañadas por humedad' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(5, { message: 'Explique el motivo del ajuste (mínimo 5 caracteres)' })
  @MaxLength(250)
  motivo!: string;
}

export class BajaDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('all', { message: 'Seleccione la ubicación' })
  ubicacionId!: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description:
      'Lote a dar de baja. Si se omite, se dan de baja todos los lotes vencidos de la ubicación',
  })
  @IsOptional()
  @IsUUID()
  loteId?: string;
}

export class StockMinimoDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('all', { message: 'Seleccione la ubicación' })
  ubicacionId!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('all', { message: 'Seleccione el producto' })
  productoId!: string;

  @ApiProperty({ type: Number, example: 20, description: '0 elimina el stock mínimo' })
  @Type(() => Number)
  @IsInt({ message: 'El stock mínimo debe ser un número entero' })
  @Min(0, { message: 'El stock mínimo no puede ser negativo' })
  @Max(100000)
  cantidadMinima!: number;
}

export class ProductoIdDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  productoId!: string;
}
