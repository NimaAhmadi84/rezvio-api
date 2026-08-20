import { IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SocialMediaLinkDto {
  @ApiProperty({
    example: 'instagram',
    description: 'پلتفرم (instagram, telegram, whatsapp, bale, eitaa, rubika, x, website)',
  })
  @IsString()
  @Matches(/^(instagram|telegram|whatsapp|bale|eitaa|rubika|x|website)$/, {
    message: 'پلتفرم نامعتبر است. مجازها: instagram, telegram, whatsapp, bale, eitaa, rubika, x, website',
  })
  platform!: string;

  @ApiProperty({ example: '@username یا https://...', description: 'یوزرنیم یا URL' })
  @IsString()
  @MinLength(1, { message: 'لینک شبکه اجتماعی نباید خالی باشد' })
  @MaxLength(500, { message: 'لینک شبکه اجتماعی نباید بیش از ۵۰۰ کاراکتر باشد' })
  value!: string;
}
