const sharp = require('sharp');
const path = require('path');

// ورودی از فایل jpg جدید
const SRC = path.resolve(__dirname, '../../rezvio-web/brand/original.jpg');
const OUT_ICON = path.resolve(__dirname, '../../rezvio-web/src/app/icon.png');
const OUT_APPLE = path.resolve(__dirname, '../../rezvio-web/src/app/apple-icon.png');
const OUT_MARK = path.resolve(__dirname, '../../rezvio-web/public/logo/brand-mark.png');

(async () => {
  const meta = await sharp(SRC).metadata();
  
  // برش مربعی از مرکز تصویر (در صورتی که عکس دقیقاً مربع نباشد)
  const minDim = Math.min(meta.width, meta.height);
  const left = Math.floor((meta.width - minDim) / 2);
  const top = Math.floor((meta.height - minDim) / 2);

  const square = await sharp(SRC)
    .extract({ left, top, width: minDim, height: minDim })
    .toBuffer();

  // خروجی‌ها را با فرمت png ذخیره می‌کنیم تا در سایت بهترین کیفیت را داشته باشند
  await sharp(square).resize(512, 512).png().toFile(OUT_MARK);
  await sharp(square).resize(256, 256).png().toFile(OUT_ICON);
  await sharp(square).resize(180, 180).png().toFile(OUT_APPLE);

  console.log('✅ Logo assets generated successfully from original.jpg');
  console.log('   source: ' + meta.width + 'x' + meta.height);
})().catch((err) => {
  console.error('❌ Failed: ' + err.message);
  process.exit(1);
});
