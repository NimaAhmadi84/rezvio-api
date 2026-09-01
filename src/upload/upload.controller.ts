import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  Request,
  HttpCode,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UploadService } from './upload.service';

/**
 * Multer file interface — inline definition to avoid @types/multer dependency
 * Matches Express.Multer.File structure used by NestJS FileInterceptor
 */
interface MulterFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
  fieldname: string;
  encoding: string;
  destination?: string;
  filename?: string;
  path?: string;
}

@ApiTags('Upload')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('business-logo')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: undefined,
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
        files: 1,
      },
      fileFilter: (req, file, cb) => {
        // Early filter by mimetype (will be re-validated with magic bytes)
        if (!file.mimetype.startsWith('image/')) {
          cb(new BadRequestException('فقط تصاویر مجاز هستند'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  @ApiOperation({
    summary: 'آپلود لوگو/تصویر کسب‌وکار (با بهینه‌سازی خودکار)',
    description: `
      آپلود تصویر با پردازش خودکار:
      - Auto-rotate از EXIF
      - تبدیل به WebP با quality 85
      - Smart resize (max 2048px)
      - حداقل ابعاد: 200×200 پیکسل
      - حداکثر حجم: 10MB
    `,
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'تصویر کسب‌وکار (JPEG/PNG/WebP)',
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'آپلود موفق',
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string', example: 'https://xxx.supabase.co/storage/...' },
        path: { type: 'string', example: 'user-id/1234567890-abc123.webp' },
        size: { type: 'number', example: 45678 },
        mimeType: { type: 'string', example: 'image/webp' },
        width: { type: 'number', example: 800 },
        height: { type: 'number', example: 800 },
        optimized: { type: 'boolean', example: true },
        originalSize: { type: 'number', example: 123456 },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'کیفیت پایین (زیر 200x200) یا فرمت نامعتبر',
  })
  @ApiResponse({ status: 401, description: 'نیاز به احراز هویت' })
  @ApiResponse({ status: 500, description: 'خطای سرور' })
  async uploadBusinessLogo(
    @UploadedFile() file: MulterFile,
    @Request() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('فایلی ارسال نشده است');
    }

    const userId = req.user?.sub || req.user?.id;
    if (!userId) {
      throw new BadRequestException('شناسه کاربر یافت نشد');
    }

    return this.uploadService.uploadBusinessLogo(file, userId);
  }
}
