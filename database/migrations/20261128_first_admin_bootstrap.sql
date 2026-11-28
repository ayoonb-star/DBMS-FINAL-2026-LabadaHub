USE `labadahub`;

-- One-time migration: if this table already exists, stop and inspect its
-- columns, constraints, engine, and indexes before deciding how to proceed.
CREATE TABLE first_admin_bootstrap_state (
  singleton_id TINYINT UNSIGNED NOT NULL DEFAULT 1,
  verification_code_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  verification_expires_at DATETIME NULL,
  failed_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  last_requested_at DATETIME NULL,
  completed_at DATETIME NULL,
  admin_user_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (singleton_id),
  UNIQUE KEY uq_first_admin_bootstrap_admin_user (admin_user_id),
  CONSTRAINT fk_first_admin_bootstrap_admin_user
    FOREIGN KEY (admin_user_id) REFERENCES users (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_first_admin_bootstrap_singleton
    CHECK (singleton_id = 1),
  CONSTRAINT chk_first_admin_bootstrap_attempts
    CHECK (failed_attempts <= 5),
  CONSTRAINT chk_first_admin_bootstrap_code_expiry
    CHECK (
      (verification_code_hash IS NULL AND verification_expires_at IS NULL)
      OR (verification_code_hash IS NOT NULL AND verification_expires_at IS NOT NULL)
    ),
  CONSTRAINT chk_first_admin_bootstrap_completion
    CHECK (
      (completed_at IS NULL AND admin_user_id IS NULL)
      OR (completed_at IS NOT NULL AND admin_user_id IS NOT NULL)
    ),
  CONSTRAINT chk_first_admin_bootstrap_consumed
    CHECK (completed_at IS NULL OR verification_code_hash IS NULL)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
