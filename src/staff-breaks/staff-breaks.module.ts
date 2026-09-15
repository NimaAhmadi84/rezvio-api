import { Module } from '@nestjs/common';
import { StaffBreaksService } from './staff-breaks.service';
import { StaffBreaksController } from './staff-breaks.controller';

@Module({
  controllers: [StaffBreaksController],
  providers: [StaffBreaksService],
  exports: [StaffBreaksService],
})
export class StaffBreaksModule {}