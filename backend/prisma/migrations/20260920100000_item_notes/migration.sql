ALTER TABLE `cart_item` ADD COLUMN `note` VARCHAR(500) NOT NULL DEFAULT '';
ALTER TABLE `personal_menu_item` ADD COLUMN `note` VARCHAR(500) NOT NULL DEFAULT '', ADD COLUMN `note_updated_at` DATETIME(3) NULL, ADD COLUMN `note_updated_after_review` BOOLEAN NOT NULL DEFAULT false;
