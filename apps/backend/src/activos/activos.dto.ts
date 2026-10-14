import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { BusquedaDto } from '../common/paginacion';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const aBooleano = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;
const MONTO = { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false };

export class CrearActivoDto {
  @ApiProperty({ type: String, example: 'AF-XELA-0003' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z0-9][A-Z0-9-]{1,29}$/, {
    message: 'El código admite letras, números y guiones (máximo 30)',
  })
  codigo!: string;

  @ApiProperty({ type: String, example: 'Refrigerador vertical para vacunas' })
  @Transform(recortar)
  @IsString()
  @MinLength(3, { message: 'Describa el activo' })
  @MaxLength(200)
  descripcion!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('all', { message: 'Seleccione la categoría' })
  categoriaId!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('all', { message: 'Seleccione la ubicación' })
  ubicacionId!: string;

  @ApiProperty({ type: String, format: 'date' })
  @IsDateString({}, { message: 'Ingrese la fecha de adquisición' })
  fechaAdquisicion!: string;

  @ApiProperty({ type: Number, example: 12500 })
  @Type(() => Number)
  @IsNumber(MONTO, { message: 'El costo debe tener máximo 2 decimales' })
  @Min(0.01, { message: 'El costo debe ser mayor que cero' })
  @Max(100_000_000)
  costo!: number;

  @ApiPropertyOptional({ type: Number, example: 1250, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(MONTO, { message: 'El valor residual debe tener máximo 2 decimales' })
  @Min(0, { message: 'El valor residual no puede ser negativo' })
  valorResidual?: number;

  @ApiPropertyOptional({
    type: Number,
    example: 60,
    description: 'Por defecto, la vida útil de la categoría (RN-25)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La vida útil se indica en meses enteros' })
  @Min(1, { message: 'La vida útil debe ser de al menos un mes' })
  @Max(1200)
  vidaUtilMeses?: number;
}

/** La ubicación no se edita: se cambia con un traslado para que quede en el historial (RN-26). */
export class ActualizarActivoDto extends PartialType(OmitType(CrearActivoDto, ['ubicacionId'])) {
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class TrasladarActivoDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('all', { message: 'Seleccione la ubicación de destino' })
  ubicacionDestinoId!: string;

  @ApiProperty({ type: String, example: 'Apertura del stand de Zacapa' })
  @Transform(recortar)
  @IsString({ message: 'Explique el motivo del traslado' })
  @MinLength(5, { message: 'Explique el motivo del traslado (mínimo 5 caracteres)' })
  @MaxLength(250)
  motivo!: string;
}

export class FiltroActivosDto extends BusquedaDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoriaId?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  ubicacionId?: string;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(aBooleano)
  @IsBoolean()
  activo?: boolean;
}

export class ReporteActivosDto {
  @ApiPropertyOptional({
    type: String,
    format: 'date',
    description: 'Fecha de corte; por defecto, hoy',
  })
  @IsOptional()
  @IsDateString()
  fecha?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  ubicacionId?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoriaId?: string;
}

export class ActualizarCategoriaActivoDto {
  @ApiProperty({ type: Number, example: 60 })
  @Type(() => Number)
  @IsInt({ message: 'La vida útil se indica en meses enteros' })
  @Min(1)
  @Max(1200)
  vidaUtilMeses!: number;
}
