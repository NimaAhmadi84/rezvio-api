import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('این ایمیل قبلاً ثبت شده است');
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        password: dto.password,
        role: dto.role,
      },
    });

    const { password, ...result } = user;
    return result;
  }

  /**
   * ساخت کاربر با پسورد از پیش هش شده (برای استفاده در AuthService)
   */
  async createWithHashedPassword(dto: {
    email: string;
    name: string;
    password: string;
    role: any;
  }) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('این ایمیل قبلاً ثبت شده است');
    }

    const user = await this.prisma.user.create({
      data: dto,
    });

    const { password, ...result } = user;
    return result;
  }

  async findAll() {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        phone: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return users;
  }

  /**
   * دریافت کاربر با ID
   * شامل nationalId و phone برای نمایش در /auth/me و صفحه پروفایل
   */
  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        nationalId: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('کاربر یافت نشد');
    }

    return user;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);

    if (dto.password) {
      dto.password = await bcrypt.hash(dto.password, 10);
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: dto,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return user;
  }

  async remove(id: string) {
    await this.findOne(id);

    await this.prisma.user.delete({
      where: { id },
    });

    return { message: 'کاربر با موفقیت حذف شد' };
  }

  /**
   * پیدا کردن کاربر با ایمیل یا شماره
   */
  async findByEmailOrPhone(identifier: string) {
    const isEmail = identifier.includes('@');
    if (isEmail) {
      return this.prisma.user.findUnique({ where: { email: identifier } });
    }
    return this.prisma.user.findUnique({ where: { phone: identifier } });
  }

  /**
   * ساخت کاربر جدید با حداقل اطلاعات (برای OTP auto-register)
   */
  async createMinimal(data: {
    email?: string;
    phone?: string;
    password?: string;
    name?: string;
    role?: any;
  }) {
    return this.prisma.user.create({ data: data as any });
  }

  /**
   * آپدیت user (برای اضافه کردن password/name بعداً)
   */
  async updateUser(id: string, data: any) {
    return this.prisma.user.update({ where: { id }, data });
  }

  /**
   * آپدیت پروفایل کاربر (فقط nationalId — یک‌بار ثبت، غیرقابل تغییر)
   */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('کاربر یافت نشد');
    }

    // اگر nationalId قبلاً ست شده، اجازه تغییر نده
    if (user.nationalId && dto.nationalId && user.nationalId !== dto.nationalId) {
      throw new BadRequestException(
        'کد ملی شما قبلاً در پروفایل ثبت شده است و قابل تغییر نیست.',
      );
    }

    // اعتبارسنجی checksum ایرانی
    if (dto.nationalId && !this.validateIranianNationalId(dto.nationalId)) {
      throw new BadRequestException('کد ملی نامعتبر است');
    }

    // آپدیت
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { nationalId: dto.nationalId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        nationalId: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    this.logger.log(`🆔 nationalId set for user ${userId} via profile update`);
    return updated;
  }

  /**
   * اعتبارسنجی کد ملی ایرانی (الگوریتم رسمی)
   */
  private validateIranianNationalId(nationalId: string): boolean {
    if (!/^\d{10}$/.test(nationalId)) return false;
    if (/^(\d)\1{9}$/.test(nationalId)) return false;

    const digits = nationalId.split('').map(Number);
    const check = digits[9];
    let sum = 0;

    for (let i = 0; i < 9; i++) {
      sum += digits[i] * (10 - i);
    }

    const remainder = sum % 11;
    return remainder < 2 ? check === remainder : check === 11 - remainder;
  }
}