import { Module } from '@nestjs/common';
import { BusinessImagesService } from './business-images.service';
import { BusinessImagesController } from './business-images.controller';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [UploadModule],
  controllers: [BusinessImagesController],
  providers: [BusinessImagesService],
  exports: [BusinessImagesService],
})
export class BusinessImagesModule {}