import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsNumber, IsObject } from 'class-validator';
import { Auditar } from '../bitacora/auditar.decorator';
import { Roles } from '../common/decoradores';
import { Rol } from '../generated/prisma/enums';
import { ConfiguracionService } from './configuracion.service';

export class ActualizarConfiguracionDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    example: { DIAS_ALERTA_VENCIMIENTO: 60, TIEMPO_PREPARACION_MIN: 20 },
  })
  @IsObject()
  @IsNumber({}, { each: true, message: 'Cada valor debe ser un número' })
  valores!: Record<string, number>;
}

@ApiTags('Configuración')
@ApiBearerAuth()
@Controller('configuracion')
export class ConfiguracionController {
  constructor(private readonly configuracion: ConfiguracionService) {}

  @Get()
  @ApiOperation({ summary: 'Parámetros del sistema con su valor actual' })
  listar() {
    return this.configuracion.listar();
  }

  @Put()
  @Roles(Rol.ADMIN)
  @Auditar({ entidad: 'Configuracion' })
  @ApiBody({ type: ActualizarConfiguracionDto })
  @ApiOperation({ summary: 'Actualizar uno o varios parámetros (RF-03)' })
  actualizar(@Body() dto: ActualizarConfiguracionDto) {
    return this.configuracion.actualizar(dto.valores);
  }
}
