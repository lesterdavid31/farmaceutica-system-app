import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  readonly configurada: boolean;

  constructor() {
    const connectionString = process.env.DATABASE_URL ?? '';
    super({ adapter: new PrismaPg({ connectionString }) });
    this.configurada = connectionString.length > 0;
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
