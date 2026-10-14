import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
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
import { BusquedaDto, PaginacionDto } from '../common/paginacion';
import { EstadoPlanilla, Puesto } from '../generated/prisma/enums';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const aBooleano = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;
const MONTO = { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false };

// ─── Empleados (RF-26) ────────────────────────────────────────────────────────

export class CrearEmpleadoDto {
  @ApiProperty({ type: String, example: 'Ana Lucía' })
  @Transform(recortar)
  @IsString()
  @MinLength(2, { message: 'Ingrese los nombres' })
  @MaxLength(80)
  nombres!: string;

  @ApiProperty({ type: String, example: 'Pérez García' })
  @Transform(recortar)
  @IsString()
  @MinLength(2, { message: 'Ingrese los apellidos' })
  @MaxLength(80)
  apellidos!: string;

  @ApiProperty({ type: String, example: '2456789010101', description: 'CUI de 13 dígitos' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/\s/g, '') : value,
  )
  @Matches(/^\d{13}$/, { message: 'El DPI debe tener 13 dígitos' })
  dpi!: string;

  @ApiProperty({ enum: Puesto })
  @IsEnum(Puesto, { message: 'Seleccione el puesto' })
  puesto!: Puesto;

  @ApiProperty({ type: Number, example: 4200 })
  @Type(() => Number)
  @IsNumber(MONTO, { message: 'El salario debe tener máximo 2 decimales' })
  @Min(1, { message: 'El salario base debe ser mayor que cero' })
  @Max(1_000_000)
  salarioBase!: number;

  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('all', { message: 'Seleccione la ubicación' })
  ubicacionId!: string;

  @ApiProperty({ type: String, format: 'date' })
  @IsDateString({}, { message: 'Ingrese la fecha de ingreso' })
  fechaIngreso!: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Usuario del sistema del empleado (los repartidores no tienen)',
  })
  @IsOptional()
  @IsUUID()
  usuarioId?: string | null;
}

export class ActualizarEmpleadoDto extends PartialType(CrearEmpleadoDto) {
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class FiltroEmpleadosDto extends BusquedaDto {
  @ApiPropertyOptional({ enum: Puesto })
  @IsOptional()
  @IsEnum(Puesto)
  puesto?: Puesto;

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

// ─── Planillas (RF-27, RF-28) ─────────────────────────────────────────────────

export class GenerarPlanillaDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('all', { message: 'Seleccione la ubicación' })
  ubicacionId!: string;

  @ApiProperty({ type: Number, example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  anio!: number;

  @ApiProperty({ type: Number, example: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'El mes debe estar entre 1 y 12' })
  @Max(12, { message: 'El mes debe estar entre 1 y 12' })
  mes!: number;
}

export class EditarLineaDto {
  @ApiPropertyOptional({ type: Number, example: 250 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(MONTO, { message: 'La bonificación debe tener máximo 2 decimales' })
  @Min(0, { message: 'La bonificación no puede ser negativa' })
  @Max(100_000)
  bonificacion?: number;

  @ApiPropertyOptional({ type: Number, example: 150, description: 'Anticipos, préstamos, etc.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(MONTO, { message: 'Los descuentos deben tener máximo 2 decimales' })
  @Min(0, { message: 'Los descuentos no pueden ser negativos' })
  @Max(1_000_000)
  otrosDescuentos?: number;
}

export class FiltroPlanillasDto extends PaginacionDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  ubicacionId?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  anio?: number;

  @ApiPropertyOptional({ enum: EstadoPlanilla })
  @IsOptional()
  @IsEnum(EstadoPlanilla)
  estado?: EstadoPlanilla;
}

export class ReportePlanillaDto {
  @ApiProperty({ type: Number, example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  anio!: number;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  ubicacionId?: string;
}
