-- Historical menu rows keep the original dish and variant IDs as values.
-- Their names, portion details, decisions, and notes already live in snapshots.
-- Dropping only live-catalog FKs allows a dish and its variants to be removed
-- without erasing submitted or reviewed menu history.
ALTER TABLE `personal_menu_item` DROP FOREIGN KEY `personal_menu_item_family_id_variant_id_fkey`;
ALTER TABLE `family_menu_item` DROP FOREIGN KEY `family_menu_item_family_id_dish_id_fkey`;
ALTER TABLE `family_menu_item` DROP FOREIGN KEY `family_menu_item_family_id_variant_id_fkey`;

CREATE INDEX `personal_menu_item_family_id_variant_id_idx` ON `personal_menu_item`(`family_id`, `variant_id`);
CREATE INDEX `family_menu_item_family_id_dish_id_idx` ON `family_menu_item`(`family_id`, `dish_id`);
CREATE INDEX `family_menu_item_family_id_variant_id_idx` ON `family_menu_item`(`family_id`, `variant_id`);
