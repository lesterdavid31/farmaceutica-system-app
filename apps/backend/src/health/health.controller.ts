import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EstadoSalud } from './health.dto';
import { HealthService } from './health.service';

@ApiTags('Salud')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Estado de la API y de la conexión a la base de datos' })
  @ApiOkResponse({ type: EstadoSalud })
  obtenerEstado(): Promise<EstadoSalud> {
    return this.healthService.obtenerEstado();
  }
}
