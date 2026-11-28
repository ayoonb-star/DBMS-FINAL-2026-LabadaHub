USE `labadahub`;

-- Additive migration for email-approved Admin applications.
CREATE TABLE admin_applications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NULL,
  status ENUM(
    'pending_approval',
    'pending_verification',
    'rejected',
    'expired',
    'email_failed',
    'completed'
  ) NOT NULL DEFAULT 'pending_approval',
  active_email VARCHAR(100)
    GENERATED ALWAYS AS (
      CASE
        WHEN status IN ('pending_approval', 'pending_verification') THEN email
        ELSE NULL
      END
    ) STORED,
  approval_token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  approval_expires_at DATETIME NULL,
  approved_at DATETIME NULL,
  rejected_at DATETIME NULL,
  verification_code_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  verification_expires_at DATETIME NULL,
  verification_deadline_at DATETIME NULL,
  verification_failed_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  verification_resend_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
  verification_last_sent_at DATETIME NULL,
  completed_at DATETIME NULL,
  admin_user_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_applications_active_email (active_email),
  UNIQUE KEY uq_admin_applications_approval_token (approval_token_hash),
  UNIQUE KEY uq_admin_applications_verification_code (verification_code_hash),
  UNIQUE KEY uq_admin_applications_admin_user (admin_user_id),
  KEY idx_admin_applications_email_created (email, created_at),
  KEY idx_admin_applications_status_approval_expiry (status, approval_expires_at),
  KEY idx_admin_applications_status_verification_expiry (status, verification_deadline_at),
  CONSTRAINT fk_admin_applications_admin_user
    FOREIGN KEY (admin_user_id) REFERENCES users (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_admin_applications_attempts
    CHECK (verification_failed_attempts <= 5),
  CONSTRAINT chk_admin_applications_resends
    CHECK (verification_resend_count <= 3),
  CONSTRAINT chk_admin_applications_approval_token_expiry
    CHECK (
      (approval_token_hash IS NULL AND approval_expires_at IS NULL)
      OR (approval_token_hash IS NOT NULL AND approval_expires_at IS NOT NULL)
    ),
  CONSTRAINT chk_admin_applications_verification_code_expiry
    CHECK (
      (verification_code_hash IS NULL AND verification_expires_at IS NULL)
      OR (verification_code_hash IS NOT NULL AND verification_expires_at IS NOT NULL)
    ),
  CONSTRAINT chk_admin_applications_completion
    CHECK (
      (status = 'completed' AND completed_at IS NOT NULL AND admin_user_id IS NOT NULL)
      OR (status <> 'completed' AND admin_user_id IS NULL)
    )
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
