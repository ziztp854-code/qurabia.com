import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service.js';
import { RedisService } from './redis.service.js';

@Module({
  providers: [RedisService, DatabaseService],
  exports: [RedisService, DatabaseService],
})
export class InfrastructureModule {}
