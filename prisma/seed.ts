import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import 'dotenv/config';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 شروع فرآیند Seed کردن دیتابیس...');

  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@reservino.ir' },
    update: {},
    create: {
      email: 'admin@reservino.ir',
      name: 'Admin User',
      password: adminPassword,
      role: 'ADMIN',
    },
  });

  const ownerPassword = await bcrypt.hash('owner123', 10);
  const owner = await prisma.user.upsert({
    where: { email: 'owner@reservino.ir' },
    update: {},
    create: {
      email: 'owner@reservino.ir',
      name: 'علی احمدی',
      password: ownerPassword,
      role: 'OWNER',
    },
  });

  const business = await prisma.business.upsert({
    where: { slug: 'ali-barbershop' },
    update: {},
    create: {
      name: 'آرایشگاه علی',
      slug: 'ali-barbershop',
      address: 'تهران، خیابان ولیعصر',
      phone: '02112345678',
      ownerId: owner.id,
    },
  });

  console.log('✅ عملیات Seed با موفقیت انجام شد!');
  console.log({ admin, owner, business });
}

main()
  .catch((e) => {
    console.error('❌ خطا در فرآیند Seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });