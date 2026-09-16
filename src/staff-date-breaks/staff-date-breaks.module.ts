import { Module } from '@nestjs/common';
import { StaffDateBreaksService } from './staff-date-breaks.service';
import { StaffDateBreaksController } from './staff-date-breaks.controller';

@Module({
  controllers: [StaffDateBreaksController],
  providers: [StaffDateBreaksService],
  exports: [StaffDateBreaksService],
})
export class StaffDateBreaksModule {}