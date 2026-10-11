import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BusquedaDto } from '../common/paginacion';
import { EstadoTraslado, MotivoTraslado } from '../generated/prisma/enums';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class DetalleSolicitudDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('all', { message: 'Seleccione el producto' })
  productoId!: string;

  @ApiProperty({ type: Number, example: 24 })
  @Type(() => Number)
  @IsInt({ message: 'La cantidad debe ser un número entero' })
  @Min(1, { message: 'La cantidad debe ser mayor que cero' })
  @Max(100000)
  cantidad!: number;
}

export class CrearTrasladoDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Ubicación que envía' })
  @IsUUID('all', { message: 'Seleccione la ubicación de origen' })
  origenId!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Ubicación que recibe' })
  @IsUUID('all', { message: 'Seleccione la ubicación de destino' })
  destinoId!: string;

  @ApiPropertyOptional({ enum: MotivoTraslado, default: MotivoTraslado.REABASTECIMIENTO })
  @IsOptional()
  @IsEnum(MotivoTraslado, { message: 'Motivo de traslado no válido' })
  motivo: MotivoTraslado = MotivoTraslado.REABASTECIMIENTO;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description: 'Solo con motivo PEDIDO_CLIENTE (RN-10)',
  })
  @IsOptional()
  @IsUUID()
  pedidoId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(500)
  observaciones?: string;

  @ApiProperty({ type: [DetalleSolicitudDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Agregue al menos un producto' })
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => DetalleSolicitudDto)
  detalles!: DetalleSolicitudDto[];
}

export class DetalleRecepcionDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Fila del traslado (un lote)' })
  @IsUUID()
  detalleId!: string;

  @ApiProperty({ type: Number, example: 24 })
  @Type(() => Number)
  @IsInt({ message: 'La cantidad recibida debe ser un número entero' })
  @Min(0, { message: 'La cantidad recibida no puede ser negativa' })
  cantidadRecibida!: number;
}

export class RecibirTrasladoDto {
  @ApiProperty({ type: [DetalleRecepcionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => DetalleRecepcionDto)
  detalles!: DetalleRecepcionDto[];

  @ApiPropertyOptional({
    type: String,
    description: 'Obligatorio si lo recibido difiere de lo despachado (RN-09)',
  })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(250)
  motivoDiferencia?: string;
}

export class CancelarTrasladoDto {
  @ApiProperty({ type: String, example: 'La sucursal ya se abasteció con una compra local' })
  @Transform(recortar)
  @IsString({ message: 'Explique el motivo de la cancelación' })
  @MinLength(5, { message: 'Explique el motivo de la cancelación (mínimo 5 caracteres)' })
  @MaxLength(250)
  motivo!: string;
}

export class FiltroTrasladosDto extends BusquedaDto {
  @ApiPropertyOptional({ enum: EstadoTraslado })
  @IsOptional()
  @IsEnum(EstadoTraslado)
  estado?: EstadoTraslado;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description: 'Traslados que salen de o llegan a esta ubicación',
  })
  @IsOptional()
  @IsUUID()
  ubicacionId?: string;

  @ApiPropertyOptional({
    enum: ['ENTRANTE', 'SALIENTE'],
    description: 'Con ubicación: solo los que llegan a ella o solo los que salen de ella',
  })
  @IsOptional()
  @IsIn(['ENTRANTE', 'SALIENTE'])
  direccion?: 'ENTRANTE' | 'SALIENTE';

  @ApiPropertyOptional({ type: String, format: 'date', description: 'Fecha de solicitud desde' })
  @IsOptional()
  @IsDateString()
  desde?: string;

  @ApiPropertyOptional({ type: String, format: 'date', description: 'Fecha de solicitud hasta' })
  @IsOptional()
  @IsDateString()
  hasta?: string;
}
