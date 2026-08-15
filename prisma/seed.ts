import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import 'dotenv/config';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ═══════════════════════════════════════════════════════════════
// 📂 دسته‌بندی‌های پیش‌فرض کسب‌وکارها (Phase 15 Foundation)
// ═══════════════════════════════════════════════════════════════
const defaultCategories = [
  { name: 'آرایشگاه مردانه', slug: 'barber', icon: '✂️', sortOrder: 1 },
  { name: 'آرایشگاه زنانه', slug: 'beauty-salon', icon: '💇‍♀️', sortOrder: 2 },
  { name: 'کلینیک پزشکی', slug: 'clinic', icon: '🏥', sortOrder: 3 },
  { name: 'دندانپزشکی', slug: 'dental', icon: '🦷', sortOrder: 4 },
  { name: 'ماساژ و اسپا', slug: 'spa', icon: '💆', sortOrder: 5 },
  { name: 'ورزش و تناسب اندام', slug: 'fitness', icon: '🏋️', sortOrder: 6 },
  { name: 'آموزشگاه', slug: 'education', icon: '📚', sortOrder: 7 },
  { name: 'تعمیرات', slug: 'repair', icon: '🔧', sortOrder: 8 },
  { name: 'مشاوره', slug: 'consulting', icon: '💼', sortOrder: 9 },
  { name: 'عکاسی', slug: 'photography', icon: '📷', sortOrder: 10 },
  { name: 'حقوقی', slug: 'legal', icon: '⚖️', sortOrder: 11 },
  { name: 'سایر', slug: 'other', icon: '📌', sortOrder: 99 },
];

async function main() {
  console.log('🌱 شروع فرآیند Seed کردن دیتابیس Rezvio...');
  console.log('');

  // ═══════════════════════════════════════════════════════════════
  // 📂 Seed دسته‌بندی‌ها (Phase 15)
  // ═══════════════════════════════════════════════════════════════
  console.log('📂 ساخت دسته‌بندی‌های پیش‌فرض:');
  let categoriesCreated = 0;
  let categoriesExisted = 0;

  for (const cat of defaultCategories) {
    const result = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, icon: cat.icon, sortOrder: cat.sortOrder },
      create: cat,
    });
    // اگه createdAt و updatedAt یکی باشن یعنی تازه ساخته شده
    if (Math.abs(result.createdAt.getTime() - result.updatedAt.getTime()) < 1000) {
      console.log(`   ✅ ${cat.icon} ${cat.name} (${cat.slug})`);
      categoriesCreated++;
    } else {
      categoriesExisted++;
    }
  }
  console.log('');
  console.log(`📊 ${categoriesCreated} دسته جدید، ${categoriesExisted} از قبل وجود داشت`);
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
  console.log('📂 دسته‌بندی‌های پیش‌فرض:');
  console.log(`   • ${defaultCategories.length} دسته آماده استفاده`);
  console.log('');
  console.log('💡 نکته: بقیه کاربران (CUSTOMER و OWNER) از طریق فرم');
  console.log('   ثبت‌نام عمومی در /auth ساخته می‌شن.');
  console.log('');
  console.log('🏢 برای ارتقا CUSTOMER به OWNER، از داشبورد');
  console.log('   دکمه "ایجاد کسب‌وکار" استفاده کنید.');
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
