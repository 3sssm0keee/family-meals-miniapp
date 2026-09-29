-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(64) NOT NULL,
    `wechat_app_id` VARCHAR(64) NOT NULL,
    `openid` VARCHAR(128) NOT NULL,
    `display_name` VARCHAR(40) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_wechat_app_id_openid_key`(`wechat_app_id`, `openid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `family` (
    `id` VARCHAR(64) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `family_member` (
    `id` VARCHAR(64) NOT NULL,
    `family_id` VARCHAR(64) NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `role` ENUM('ADMIN', 'MEMBER', 'GUEST') NOT NULL,
    `status` ENUM('ACTIVE', 'LEFT', 'REMOVED') NOT NULL DEFAULT 'ACTIVE',
    `joined_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `family_member_family_id_status_role_idx`(`family_id`, `status`, `role`),
    UNIQUE INDEX `family_member_family_id_user_id_key`(`family_id`, `user_id`),
    UNIQUE INDEX `family_member_family_id_id_key`(`family_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `meal_session` (
    `id` VARCHAR(64) NOT NULL,
    `family_id` VARCHAR(64) NOT NULL,
    `service_date` DATE NOT NULL,
    `meal_type` ENUM('LUNCH', 'DINNER') NOT NULL,
    `review_version` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `meal_session_family_id_id_key`(`family_id`, `id`),
    UNIQUE INDEX `meal_session_family_id_service_date_meal_type_key`(`family_id`, `service_date`, `meal_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `file_asset` (
    `id` VARCHAR(64) NOT NULL,
    `family_id` VARCHAR(64) NOT NULL,
    `uploader_member_id` VARCHAR(64) NOT NULL,
    `storage_key` VARCHAR(512) NOT NULL,
    `mime_type` VARCHAR(40) NOT NULL,
    `size_bytes` INTEGER NOT NULL,
    `sha256` CHAR(64) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `file_asset_family_id_created_at_idx`(`family_id`, `created_at`),
    UNIQUE INDEX `file_asset_family_id_id_key`(`family_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `dish` (
    `id` VARCHAR(64) NOT NULL,
    `family_id` VARCHAR(64) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `normalized_name` VARCHAR(60) NOT NULL,
    `description` TEXT NOT NULL DEFAULT (''),
    `image_file_id` VARCHAR(64) NULL,
    `is_available` BOOLEAN NOT NULL,
    `kind` ENUM('PERMANENT', 'TEMPORARY') NOT NULL,
    `origin_session_id` VARCHAR(64) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `deleted_at` DATETIME(3) NULL,
    `active_name_key` VARCHAR(160) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `dish_family_id_kind_deleted_at_created_at_idx`(`family_id`, `kind`, `deleted_at`, `created_at`),
    UNIQUE INDEX `dish_family_id_id_key`(`family_id`, `id`),
    UNIQUE INDEX `dish_family_id_active_name_key_key`(`family_id`, `active_name_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `dish_variant` (
    `id` VARCHAR(64) NOT NULL,
    `family_id` VARCHAR(64) NOT NULL,
    `dish_id` VARCHAR(64) NOT NULL,
    `name` VARCHAR(40) NOT NULL,
    `normalized_name` VARCHAR(40) NOT NULL,
    `portion_description` VARCHAR(200) NOT NULL,
    `description` VARCHAR(500) NOT NULL DEFAULT '',
    `is_available` BOOLEAN NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `deleted_at` DATETIME(3) NULL,
    `active_name_key` VARCHAR(40) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `dish_variant_family_id_id_key`(`family_id`, `id`),
    UNIQUE INDEX `dish_variant_dish_id_active_name_key_key`(`dish_id`, `active_name_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `cart` (
    `id` VARCHAR(64) NOT NULL,
    `family_id` VARCHAR(64) NOT NULL,
    `session_id` VARCHAR(64) NOT NULL,
    `member_id` VARCHAR(64) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `cart_family_id_id_key`(`family_id`, `id`),
    UNIQUE INDEX `cart_session_id_member_id_key`(`session_id`, `member_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `cart_item` (
    `id` VARCHAR(64) NOT NULL,
    `family_id` VARCHAR(64) NOT NULL,
    `cart_id` VARCHAR(64) NOT NULL,
    `variant_id` VARCHAR(64) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `cart_item_cart_id_variant_id_key`(`cart_id`, `variant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `personal_menu` (
    `id` VARCHAR(64) NOT NULL,
    `family_id` VARCHAR(64) NOT NULL,
    `session_id` VARCHAR(64) NOT NULL,
    `member_id` VARCHAR(64) NOT NULL,
    `note` VARCHAR(500) NOT NULL DEFAULT '',
    `version` INTEGER NOT NULL DEFAULT 1,
    `submitted_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `personal_menu_family_id_id_key`(`family_id`, `id`),
    UNIQUE INDEX `personal_menu_session_id_member_id_key`(`session_id`, `member_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `personal_menu_item` (
    `id` VARCHAR(64) NOT NULL,
    `family_id` VARCHAR(64) NOT NULL,
    `personal_menu_id` VARCHAR(64) NOT NULL,
    `family_menu_item_id` VARCHAR(64) NOT NULL,
    `variant_id` VARCHAR(64) NOT NULL,
    `dish_name` VARCHAR(60) NOT NULL,
    `variant_name` VARCHAR(40) NOT NULL,
    `portion_description` VARCHAR(200) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `personal_menu_item_family_menu_item_id_idx`(`family_menu_item_id`),
    UNIQUE INDEX `personal_menu_item_personal_menu_id_variant_id_key`(`personal_menu_id`, `variant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `family_menu_item` (
    `id` VARCHAR(64) NOT NULL,
    `family_id` VARCHAR(64) NOT NULL,
    `session_id` VARCHAR(64) NOT NULL,
    `dish_id` VARCHAR(64) NOT NULL,
    `variant_id` VARCHAR(64) NOT NULL,
    `dish_name` VARCHAR(60) NOT NULL,
    `variant_name` VARCHAR(40) NOT NULL,
    `portion_description` VARCHAR(200) NOT NULL,
    `dish_kind` ENUM('PERMANENT', 'TEMPORARY') NOT NULL,
    `decision` ENUM('UNREVIEWED', 'CONFIRMED', 'CANCELLED') NOT NULL DEFAULT 'UNREVIEWED',
    `planned_quantity` DECIMAL(4, 1) NULL,
    `reason` VARCHAR(200) NOT NULL DEFAULT '',
    `demand_version` INTEGER NOT NULL DEFAULT 1,
    `reviewed_demand_version` INTEGER NOT NULL DEFAULT 0,
    `last_reviewed_participant_count` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `family_menu_item_family_id_id_key`(`family_id`, `id`),
    UNIQUE INDEX `family_menu_item_session_id_variant_id_key`(`session_id`, `variant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `review_batch` (
    `id` VARCHAR(64) NOT NULL,
    `family_id` VARCHAR(64) NOT NULL,
    `session_id` VARCHAR(64) NOT NULL,
    `actor_member_id` VARCHAR(64) NOT NULL,
    `from_version` INTEGER NOT NULL,
    `to_version` INTEGER NOT NULL,
    `snapshot` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `review_batch_family_id_id_key`(`family_id`, `id`),
    UNIQUE INDEX `review_batch_session_id_to_version_key`(`session_id`, `to_version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `menu_operation` (
    `id` VARCHAR(64) NOT NULL,
    `family_id` VARCHAR(64) NOT NULL,
    `session_id` VARCHAR(64) NULL,
    `actor_member_id` VARCHAR(64) NOT NULL,
    `actor_name` VARCHAR(40) NOT NULL,
    `action` VARCHAR(40) NOT NULL,
    `resource_id` VARCHAR(64) NOT NULL,
    `reason` VARCHAR(200) NOT NULL DEFAULT '',
    `summary` VARCHAR(500) NOT NULL DEFAULT '',
    `before_value` JSON NULL,
    `after_value` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `menu_operation_family_id_created_at_id_idx`(`family_id`, `created_at`, `id`),
    INDEX `menu_operation_session_id_created_at_idx`(`session_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `invite` (
    `id` VARCHAR(64) NOT NULL,
    `family_id` VARCHAR(64) NOT NULL,
    `creator_member_id` VARCHAR(64) NOT NULL,
    `code_hash` CHAR(64) NOT NULL,
    `role` ENUM('MEMBER', 'GUEST') NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `invite_code_hash_key`(`code_hash`),
    INDEX `invite_family_id_created_at_idx`(`family_id`, `created_at`),
    UNIQUE INDEX `invite_family_id_id_key`(`family_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `invite_redemption` (
    `id` VARCHAR(64) NOT NULL,
    `family_id` VARCHAR(64) NOT NULL,
    `invite_id` VARCHAR(64) NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `member_id` VARCHAR(64) NOT NULL,
    `redeemed_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `invite_redemption_invite_id_user_id_key`(`invite_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `subscription_event` (
    `id` VARCHAR(64) NOT NULL,
    `family_id` VARCHAR(64) NOT NULL,
    `member_id` VARCHAR(64) NOT NULL,
    `template_id` VARCHAR(200) NOT NULL,
    `result` ENUM('ACCEPT', 'REJECT', 'BAN') NOT NULL,
    `recorded_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `subscription_event_family_id_member_id_recorded_at_idx`(`family_id`, `member_id`, `recorded_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `notification` (
    `id` VARCHAR(64) NOT NULL,
    `family_id` VARCHAR(64) NOT NULL,
    `batch_id` VARCHAR(64) NOT NULL,
    `member_id` VARCHAR(64) NOT NULL,
    `channel` ENUM('WECHAT_SUBSCRIBE') NOT NULL,
    `status` ENUM('PENDING', 'SENT', 'FAILED', 'SKIPPED', 'UNKNOWN') NOT NULL,
    `reason_code` VARCHAR(40) NULL,
    `attempt_count` INTEGER NOT NULL DEFAULT 0,
    `next_attempt_at` DATETIME(3) NULL,
    `sent_at` DATETIME(3) NULL,
    `provider_message_id` VARCHAR(200) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `notification_status_next_attempt_at_idx`(`status`, `next_attempt_at`),
    UNIQUE INDEX `notification_batch_id_member_id_channel_key`(`batch_id`, `member_id`, `channel`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `idempotency_record` (
    `id` VARCHAR(64) NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `family_id` VARCHAR(64) NULL,
    `scope_hash` CHAR(64) NOT NULL,
    `key` VARCHAR(128) NOT NULL,
    `request_hash` CHAR(64) NOT NULL,
    `status` ENUM('PROCESSING', 'COMPLETED') NOT NULL,
    `http_status` INTEGER NULL,
    `response_ciphertext` MEDIUMBLOB NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idempotency_record_expires_at_idx`(`expires_at`),
    UNIQUE INDEX `idempotency_record_user_id_scope_hash_key_key`(`user_id`, `scope_hash`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- AddForeignKey
ALTER TABLE `family_member` ADD CONSTRAINT `family_member_family_id_fkey` FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `family_member` ADD CONSTRAINT `family_member_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `meal_session` ADD CONSTRAINT `meal_session_family_id_fkey` FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `file_asset` ADD CONSTRAINT `file_asset_family_id_fkey` FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `file_asset` ADD CONSTRAINT `file_asset_family_id_uploader_member_id_fkey` FOREIGN KEY (`family_id`, `uploader_member_id`) REFERENCES `family_member`(`family_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `dish` ADD CONSTRAINT `dish_family_id_fkey` FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `dish` ADD CONSTRAINT `dish_family_id_image_file_id_fkey` FOREIGN KEY (`family_id`, `image_file_id`) REFERENCES `file_asset`(`family_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `dish` ADD CONSTRAINT `dish_family_id_origin_session_id_fkey` FOREIGN KEY (`family_id`, `origin_session_id`) REFERENCES `meal_session`(`family_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `dish_variant` ADD CONSTRAINT `dish_variant_family_id_fkey` FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `dish_variant` ADD CONSTRAINT `dish_variant_family_id_dish_id_fkey` FOREIGN KEY (`family_id`, `dish_id`) REFERENCES `dish`(`family_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `cart` ADD CONSTRAINT `cart_family_id_fkey` FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `cart` ADD CONSTRAINT `cart_family_id_session_id_fkey` FOREIGN KEY (`family_id`, `session_id`) REFERENCES `meal_session`(`family_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `cart` ADD CONSTRAINT `cart_family_id_member_id_fkey` FOREIGN KEY (`family_id`, `member_id`) REFERENCES `family_member`(`family_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `cart_item` ADD CONSTRAINT `cart_item_family_id_fkey` FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `cart_item` ADD CONSTRAINT `cart_item_family_id_cart_id_fkey` FOREIGN KEY (`family_id`, `cart_id`) REFERENCES `cart`(`family_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `cart_item` ADD CONSTRAINT `cart_item_family_id_variant_id_fkey` FOREIGN KEY (`family_id`, `variant_id`) REFERENCES `dish_variant`(`family_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `personal_menu` ADD CONSTRAINT `personal_menu_family_id_fkey` FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `personal_menu` ADD CONSTRAINT `personal_menu_family_id_session_id_fkey` FOREIGN KEY (`family_id`, `session_id`) REFERENCES `meal_session`(`family_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `personal_menu` ADD CONSTRAINT `personal_menu_family_id_member_id_fkey` FOREIGN KEY (`family_id`, `member_id`) REFERENCES `family_member`(`family_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `personal_menu_item` ADD CONSTRAINT `personal_menu_item_family_id_fkey` FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `personal_menu_item` ADD CONSTRAINT `personal_menu_item_family_id_personal_menu_id_fkey` FOREIGN KEY (`family_id`, `personal_menu_id`) REFERENCES `personal_menu`(`family_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `personal_menu_item` ADD CONSTRAINT `personal_menu_item_family_id_family_menu_item_id_fkey` FOREIGN KEY (`family_id`, `family_menu_item_id`) REFERENCES `family_menu_item`(`family_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `personal_menu_item` ADD CONSTRAINT `personal_menu_item_family_id_variant_id_fkey` FOREIGN KEY (`family_id`, `variant_id`) REFERENCES `dish_variant`(`family_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `family_menu_item` ADD CONSTRAINT `family_menu_item_family_id_fkey` FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `family_menu_item` ADD CONSTRAINT `family_menu_item_family_id_session_id_fkey` FOREIGN KEY (`family_id`, `session_id`) REFERENCES `meal_session`(`family_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `family_menu_item` ADD CONSTRAINT `family_menu_item_family_id_dish_id_fkey` FOREIGN KEY (`family_id`, `dish_id`) REFERENCES `dish`(`family_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `family_menu_item` ADD CONSTRAINT `family_menu_item_family_id_variant_id_fkey` FOREIGN KEY (`family_id`, `variant_id`) REFERENCES `dish_variant`(`family_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `review_batch` ADD CONSTRAINT `review_batch_family_id_fkey` FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `review_batch` ADD CONSTRAINT `review_batch_family_id_session_id_fkey` FOREIGN KEY (`family_id`, `session_id`) REFERENCES `meal_session`(`family_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `review_batch` ADD CONSTRAINT `review_batch_family_id_actor_member_id_fkey` FOREIGN KEY (`family_id`, `actor_member_id`) REFERENCES `family_member`(`family_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `menu_operation` ADD CONSTRAINT `menu_operation_family_id_fkey` FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `menu_operation` ADD CONSTRAINT `menu_operation_family_id_session_id_fkey` FOREIGN KEY (`family_id`, `session_id`) REFERENCES `meal_session`(`family_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `menu_operation` ADD CONSTRAINT `menu_operation_family_id_actor_member_id_fkey` FOREIGN KEY (`family_id`, `actor_member_id`) REFERENCES `family_member`(`family_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `invite` ADD CONSTRAINT `invite_family_id_fkey` FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `invite` ADD CONSTRAINT `invite_family_id_creator_member_id_fkey` FOREIGN KEY (`family_id`, `creator_member_id`) REFERENCES `family_member`(`family_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `invite_redemption` ADD CONSTRAINT `invite_redemption_family_id_fkey` FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `invite_redemption` ADD CONSTRAINT `invite_redemption_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `invite_redemption` ADD CONSTRAINT `invite_redemption_family_id_invite_id_fkey` FOREIGN KEY (`family_id`, `invite_id`) REFERENCES `invite`(`family_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `invite_redemption` ADD CONSTRAINT `invite_redemption_family_id_member_id_fkey` FOREIGN KEY (`family_id`, `member_id`) REFERENCES `family_member`(`family_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `subscription_event` ADD CONSTRAINT `subscription_event_family_id_fkey` FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `subscription_event` ADD CONSTRAINT `subscription_event_family_id_member_id_fkey` FOREIGN KEY (`family_id`, `member_id`) REFERENCES `family_member`(`family_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `notification` ADD CONSTRAINT `notification_family_id_fkey` FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `notification` ADD CONSTRAINT `notification_family_id_batch_id_fkey` FOREIGN KEY (`family_id`, `batch_id`) REFERENCES `review_batch`(`family_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `notification` ADD CONSTRAINT `notification_family_id_member_id_fkey` FOREIGN KEY (`family_id`, `member_id`) REFERENCES `family_member`(`family_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `idempotency_record` ADD CONSTRAINT `idempotency_record_family_id_fkey` FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `idempotency_record` ADD CONSTRAINT `idempotency_record_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
