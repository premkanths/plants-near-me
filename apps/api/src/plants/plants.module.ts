import { Module } from '@nestjs/common';
import { PlantsController } from './plants.controller';

@Module({ controllers: [PlantsController] })
export class PlantsModule {}
