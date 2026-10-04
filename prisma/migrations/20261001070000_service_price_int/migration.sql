-- services.price: Float → Int
-- ایران تومان است و هیچ اعشاری ندارد. Float باعث خطای جمع در income-stats میشد.
-- USING ROUND برای امنیت: اگه یه روز دیتای اعشاری وارد شده بود، گرد میشه (نه truncate).
ALTER TABLE "services" ALTER COLUMN "price" TYPE integer USING ROUND("price")::integer;
