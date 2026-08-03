import { Module } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { BusinessesModule } from '../businesses/businesses.module';
import { AvailabilityModule } from '../availability/availability.module';

@Module({
  imports: [BusinessesModule, AvailabilityModule],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
