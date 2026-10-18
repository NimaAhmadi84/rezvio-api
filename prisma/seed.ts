import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import 'dotenv/config';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ═══════════════════════════════════════════════════════════════
// 📂 دسته‌بندی‌های پیش‌فرض کسب‌وکارها (نسخه نهایی - 2026-10-18)
// ═══════════════════════════════════════════════════════════════
const defaultCategories = [
  // ──── زیبایی و سلامت ────
  { name: 'آرایشگاه مردانه', slug: 'barber', icon: '✂️', sortOrder: 1 },
  { name: 'سالن زیبایی زنانه', slug: 'beauty-salon', icon: '💇‍♀️', sortOrder: 2 },
  { name: 'ماساژ و اسپا', slug: 'spa', icon: '💆', sortOrder: 3 },
  { name: 'ورزش و تناسب اندام', slug: 'fitness', icon: '🏋️', sortOrder: 4 },

  // ──── پزشکی و سلامت ────
  { name: 'کلینیک و مطب پزشکی', slug: 'clinic', icon: '🏥', sortOrder: 5 },
  { name: 'دندانپزشکی', slug: 'dental', icon: '🦷', sortOrder: 6 },
  { name: 'فیزیوتراپی و توانبخشی', slug: 'physiotherapy', icon: '🩺', sortOrder: 7 },
  { name: 'دامپزشکی و خدمات حیوانات', slug: 'veterinary', icon: '🐾', sortOrder: 8 },

  // ──── آموزش، مشاوره و حقوقی ────
  { name: 'آموزشگاه و تدریس خصوصی', slug: 'education', icon: '📚', sortOrder: 9 },
  { name: 'مشاوره و روانشناسی', slug: 'consulting', icon: '💼', sortOrder: 10 },
  { name: 'حقوقی و وکالت', slug: 'legal', icon: '⚖️', sortOrder: 11 },

  // ──── خدمات فنی و خودرویی ────
  { name: 'تعمیرات و خدمات فنی', slug: 'repair', icon: '🔧', sortOrder: 12 },
  { name: 'خودرو و خدمات خودرویی', slug: 'automotive', icon: '🚗', sortOrder: 13 },

  // ────food & beverage ────
  { name: 'رستوران و کافه', slug: 'restaurant', icon: '🍽️', sortOrder: 14 },

  // ────creative & other───
  { name: 'عکاسی و فیلمبرداری', slug: 'photography', icon: '📷', sortOrder: 15 },
  { name: 'سایر', slug: 'other', icon: '📌', sortOrder: 99 },
];

async function main() {
  console.log('🌱 شروع فرآیند Seed کردن دیتابیس Rezvio...');
  console.log('');

  // ═══════════════════════════════════════════════════════════════
  // 📂 Seed دسته‌بندی‌ها (نسخه جدید)
  // ═══════════════════════════════════════════════════════════════
  console.log('📂 ساخت/به‌روزرسانی دسته‌بندی‌های پیش‌فرض:');
  let categoriesCreated = 0;
  let categoriesUpdated = 0;

  for (const cat of defaultCategories) {
    const existing = await prisma.category.findUnique({ where: { slug: cat.slug } });
    if (existing) {
      await prisma.category.update({
        where: { slug: cat.slug },
        data: { name: cat.name, icon: cat.icon, sortOrder: cat.sortOrder },
      });
      console.log(`   ♻️  ${cat.icon} ${cat.name} (${cat.slug}) — به‌روزرسانی شد`);
      categoriesUpdated++;
    } else {
      await prisma.category.create({ data: cat });
      console.log(`   ✅ ${cat.icon} ${cat.name} (${cat.slug}) — ایجاد شد`);
      categoriesCreated++;
    }
  }

  console.log('');
  console.log(`📊 ${categoriesCreated} دسته جدید، ${categoriesUpdated} دسته به‌روزرسانی شد`);

  // ═══════════════════════════════════════════════════════════════
  // 👑 ساخت ادمین کل (فقط اگر وجود نداشته باشد)
  // ═══════════════════════════════════════════════════════════════
  const adminEmail = 'mrnima2920@gmail.com';
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (!existingAdmin) {
    console.log('');
    console.log('👑 ساخت ادمین کل:');
    console.log(`   📧 ایمیل: ${adminEmail}`);

    const hashedPassword = await bcrypt.hash('NimaAhmadi$_84', 10);
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        name: 'Nima Ahmadi',
        password: hashedPassword,
        role: 'ADMIN',
      },
    });

    console.log('✅ ادمین کل با موفقیت ساخته شد!');
    console.log(`   ID: ${admin.id}`);
  } else {
    console.log('');
    console.log('ℹ️  ادمین کل از قبل وجود دارد.');
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('🎉 Seed با موفقیت انجام شد!');
  console.log('═══════════════════════════════════════════════════════');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
