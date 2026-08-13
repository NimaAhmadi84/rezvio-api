import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import 'dotenv/config';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 شروع فرآیند Seed کردن دیتابیس Rezvio...');
  console.log('');

  // ═══════════════════════════════════════════════════════════════
  // 🎭 ساخت ادمین کل سیستم
  // ═══════════════════════════════════════════════════════════════
  const adminEmail = 'mrnima2920@gmail.com';
  const adminPassword = 'NimaAhmadi$_84';
  const adminName = 'Nima Ahmadi';

  console.log('👑 ساخت ادمین کل:');
  console.log(`   📧 ایمیل: ${adminEmail}`);
  console.log(`   👤 نام: ${adminName}`);
  console.log(`   🔐 رمز: ${adminPassword}`);
  console.log('');

  const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: adminName,
      password: hashedAdminPassword,
      role: 'ADMIN',
    },
    create: {
      email: adminEmail,
      name: adminName,
      password: hashedAdminPassword,
      role: 'ADMIN',
    },
  });

  console.log('✅ ادمین کل با موفقیت ساخته شد!');
  console.log(`   ID: ${admin.id}`);
  console.log('');

  // ═══════════════════════════════════════════════════════════════
  // 📋 خلاصه Seed
  // ═══════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════');
  console.log('🎉 Seed با موفقیت انجام شد!');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log('📌 کاربران ایجاد شده:');
  console.log(`   • ادمین کل: ${adminEmail}`);
  console.log('');
  console.log('💡 نکته: بقیه کاربران (CUSTOMER و OWNER) از طریق فرم');
  console.log('   ثبت‌نام عمومی در /auth ساخته می‌شن.');
  console.log('');
  console.log('🏢 برای ارتقا CUSTOMER به OWNER، در داشبورد باید');
  console.log('   دکمه "ایجاد کسب‌وکار" پیاده‌سازی بشه (فاز بعدی).');
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ خطا در فرآیند Seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
