CREATE TABLE `file_cleanup_task` (
    `id` VARCHAR(64) NOT NULL,
    `family_id` VARCHAR(64) NOT NULL,
    `file_id` VARCHAR(64) NOT NULL,
    `storage_key` VARCHAR(512) NOT NULL,
    `requested_by_member_id` VARCHAR(64) NOT NULL,
    `requested_by_name` VARCHAR(40) NOT NULL,
    `status` ENUM('PENDING', 'DELETING', 'OBJECT_DELETED', 'FAILED', 'SKIPPED', 'COMPLETED') NOT NULL DEFAULT 'PENDING',
    `attempt_count` INTEGER NOT NULL DEFAULT 0,
    `lease_until` DATETIME(3) NULL,
    `last_error_code` VARCHAR(40) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `file_cleanup_task_family_id_file_id_key`(`family_id`, `file_id`),
    INDEX `file_cleanup_task_status_lease_until_idx`(`status`, `lease_until`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

ALTER TABLE `file_cleanup_task` ADD CONSTRAINT `file_cleanup_task_family_id_fkey`
    FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
