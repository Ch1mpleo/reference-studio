ALTER TABLE settings ADD COLUMN url_image_mode TEXT NOT NULL DEFAULT 'hotlink' CHECK (url_image_mode IN ('hotlink', 'store'));
ALTER TABLE "references" ADD COLUMN preview_image_url TEXT CHECK (preview_image_url IS NULL OR kind = 'link');
