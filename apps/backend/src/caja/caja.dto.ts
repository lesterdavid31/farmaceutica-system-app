import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginacionDto } from '../common/paginacion';
import { EstadoTurnoCaja } from '../generated/prisma/enums';
import { TIPOS_MANUALES, type TipoManual } from './arqueo';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const aBooleano = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;
const MONTO = { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false };

export class AbrirTurnoDto {
  @ApiProperty({ type: Number, example: 500, description: 'Efectivo con el que inicia la gaveta' })
  @Type(() => Number)
  @IsNumber(MONTO, { message: 'El monto inicial debe tener máximo 2 decimales' })
  @Min(0, { message: 'El monto inicial no puede ser negativo' })
  @Max(1_000_000)
  montoInicial!: number;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(250)
  observaciones?: string;
}

export class MovimientoManualDto {
  @ApiProperty({ enum: TIPOS_MANUALES, description: 'GASTO y RETIRO restan; DEPOSITO suma' })
  @IsIn(TIPOS_MANUALES, { message: 'El tipo debe ser gasto, retiro o depósito' })
  tipo!: TipoManual;

  @ApiProperty({
    type: Number,
    example: 35.5,
    description: 'Siempre positivo; el tipo da el signo',
  })
  @Type(() => Number)
  @IsNumber(MONTO, { message: 'El monto debe tener máximo 2 decimales' })
  @Min(0.01, { message: 'El monto debe ser mayor que cero' })
  @Max(1_000_000)
  monto!: number;

  @ApiProperty({ type: String, example: 'Compra de bolsas plásticas' })
  @Transform(recortar)
  @IsString({ message: 'Describa el movimiento' })
  @MinLength(3, { message: 'Describa el movimiento (mínimo 3 caracteres)' })
  @MaxLength(250)
  descripcion!: string;
}

export class CerrarTurnoDto {
  @ApiProperty({ type: Number, example: 1835.25, description: 'Efectivo contado en la gaveta' })
  @Type(() => Number)
  @IsNumber(MONTO, { message: 'El efectivo contado debe tener máximo 2 decimales' })
  @Min(0, { message: 'El efectivo contado no puede ser negativo' })
  @Max(10_000_000)
  efectivoContado!: number;

  @ApiPropertyOptional({ type: String, description: 'Explicación de la diferencia, si la hay' })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(500)
  observaciones?: string;
}

export class FiltroTurnosDto extends PaginacionDto {
  @ApiPropertyOptional({ enum: EstadoTurnoCaja })
  @IsOptional()
  @IsEnum(EstadoTurnoCaja)
  estado?: EstadoTurnoCaja;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  ubicacionId?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  cajeroId?: string;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Solo turnos cerrados con sobrante o faltante',
  })
  @IsOptional()
  @Transform(aBooleano)
  @IsBoolean()
  conDiferencia?: boolean;

  @ApiPropertyOptional({ type: String, format: 'date', description: 'Apertura desde' })
  @IsOptional()
  @IsDateString()
  desde?: string;

  @ApiPropertyOptional({ type: String, format: 'date', description: 'Apertura hasta' })
  @IsOptional()
  @IsDateString()
  hasta?: string;
}
