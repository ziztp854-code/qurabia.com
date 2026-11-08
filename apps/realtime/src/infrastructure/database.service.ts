import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPrismaClient, type DatabaseClient } from '@tahaddi/database';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly client: DatabaseClient;

  constructor(config: ConfigService) {
    const connectionString = config.get<string>('DATABASE_URL');
    if (!connectionString) {
      throw new Error('DATABASE_URL is required by the realtime service.');
    }
    this.client = createPrismaClient(connectionString);
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
