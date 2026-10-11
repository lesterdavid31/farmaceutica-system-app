import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
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
import { CanalVenta, EstadoVenta, MetodoPago } from '../generated/prisma/enums';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ItemVentaDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID('all', { message: 'Seleccione el producto' })
  productoId!: string;

  @ApiProperty({ type: Number, example: 2 })
  @Type(() => Number)
  @IsInt({ message: 'La cantidad debe ser un número entero' })
  @Min(1, { message: 'La cantidad debe ser mayor que cero' })
  @Max(10_000)
  cantidad!: number;
}

export class PagoVentaDto {
  @ApiProperty({ enum: [MetodoPago.EFECTIVO, MetodoPago.TARJETA] })
  @IsEnum(MetodoPago, { message: 'Método de pago no válido' })
  metodo!: MetodoPago;

  @ApiProperty({
    type: Number,
    example: 75.5,
    description: 'Monto aplicado a la venta (sin cambio)',
  })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: 'El monto debe tener máximo 2 decimales' },
  )
  @Min(0.01, { message: 'El monto debe ser mayor que cero' })
  monto!: number;

  @ApiPropertyOptional({ type: String, example: 'Autorización 004512' })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(60)
  referencia?: string;
}

export class CrearVentaDto {
  @ApiProperty({ type: [ItemVentaDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Agregue al menos un producto' })
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ItemVentaDto)
  items!: ItemVentaDto[];

  @ApiProperty({ type: [PagoVentaDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Indique cómo paga el cliente' })
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => PagoVentaDto)
  pagos!: PagoVentaDto[];

  @ApiPropertyOptional({ type: String, example: 'CF', description: 'NIT del cliente o CF' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  nit?: string;
}

export class AnularVentaDto {
  @ApiProperty({ type: String, example: 'El cliente pagó con un billete falso' })
  @Transform(recortar)
  @IsString({ message: 'Explique el motivo de la anulación' })
  @MinLength(5, { message: 'Explique el motivo de la anulación (mínimo 5 caracteres)' })
  @MaxLength(250)
  motivo!: string;
}

export class FiltroVentasDto extends BusquedaDto {
  @ApiPropertyOptional({ enum: EstadoVenta })
  @IsOptional()
  @IsEnum(EstadoVenta)
  estado?: EstadoVenta;

  @ApiPropertyOptional({ enum: CanalVenta })
  @IsOptional()
  @IsEnum(CanalVenta)
  canal?: CanalVenta;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  ubicacionId?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  turnoCajaId?: string;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @IsDateString()
  desde?: string;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @IsDateString()
  hasta?: string;
}

export class BusquedaProductosVentaDto {
  @ApiPropertyOptional({ type: String, description: 'Nombre, SKU o principio activo' })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(100)
  q?: string;
}
