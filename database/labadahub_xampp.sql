-- LabadaHub fresh-install schema for XAMPP MySQL/MariaDB.
-- Target database: labadahub.
-- Safe behavior: CREATE DATABASE/TABLE IF NOT EXISTS never drops or replaces data.
-- If this target database already contains tables, inspect their definitions first:
-- IF NOT EXISTS does not alter an existing table or migrate it to this schema.
-- Import this file first, then optionally import labadahub_xampp_seed.sql.
-- No users, demo accounts, passwords, or seed records are created here.

CREATE DATABASE IF NOT EXISTS labadahub
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE labadahub;

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('customer', 'staff', 'admin') NOT NULL DEFAULT 'customer',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role_active (role, is_active)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS staff_invitations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  invited_email VARCHAR(100) NULL,
  role ENUM('staff', 'admin') NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  redeemed_by BIGINT UNSIGNED NULL,
  expires_at DATETIME NOT NULL,
  redeemed_at DATETIME NULL,
  revoked_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_staff_invitations_code_hash (code_hash),
  KEY idx_staff_invitations_pending (role, expires_at, redeemed_at, revoked_at),
  KEY idx_staff_invitations_email (invited_email),
  CONSTRAINT fk_staff_invitations_created_by
    FOREIGN KEY (created_by) REFERENCES users (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_staff_invitations_redeemed_by
    FOREIGN KEY (redeemed_by) REFERENCES users (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_staff_invitations_redeemed
    CHECK (redeemed_at IS NULL OR redeemed_by IS NOT NULL)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS services (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  service_code VARCHAR(40) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(500) NULL,
  pricing_unit ENUM('per_kilo', 'per_item') NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_services_code (service_code),
  KEY idx_services_active_name (is_active, name),
  CONSTRAINT chk_services_unit_price CHECK (unit_price > 0)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS addons (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  addon_code VARCHAR(40) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(500) NULL,
  pricing_unit ENUM('per_order', 'per_kilo', 'per_item') NOT NULL DEFAULT 'per_order',
  unit_price DECIMAL(10,2) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_addons_code (addon_code),
  KEY idx_addons_active_name (is_active, name),
  CONSTRAINT chk_addons_unit_price CHECK (unit_price > 0)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS time_slots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slot_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  max_bookings SMALLINT UNSIGNED NOT NULL DEFAULT 5,
  is_open TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_time_slots_date_start (slot_date, start_time),
  KEY idx_time_slots_open_date (is_open, slot_date, start_time),
  CONSTRAINT chk_time_slots_capacity CHECK (max_bookings BETWEEN 1 AND 100),
  CONSTRAINT chk_time_slots_time CHECK (end_time > start_time)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS discounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  discount_code VARCHAR(50) NOT NULL,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500) NULL,
  discount_type ENUM('percent', 'fixed') NOT NULL,
  discount_value DECIMAL(10,2) NOT NULL,
  service_id BIGINT UNSIGNED NULL,
  valid_from DATE NULL,
  valid_until DATE NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_discounts_code (discount_code),
  KEY idx_discounts_active_dates (is_active, valid_from, valid_until),
  KEY idx_discounts_service (service_id),
  CONSTRAINT fk_discounts_service
    FOREIGN KEY (service_id) REFERENCES services (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_discounts_value CHECK (
    discount_value > 0 AND
    (discount_type <> 'percent' OR discount_value <= 100)
  ),
  CONSTRAINT chk_discounts_dates CHECK (
    valid_from IS NULL OR valid_until IS NULL OR valid_until >= valid_from
  )
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS discount_weekdays (
  discount_id BIGINT UNSIGNED NOT NULL,
  weekday TINYINT UNSIGNED NOT NULL COMMENT 'ISO weekday: Monday=1 through Sunday=7',
  PRIMARY KEY (discount_id, weekday),
  CONSTRAINT fk_discount_weekdays_discount
    FOREIGN KEY (discount_id) REFERENCES discounts (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_discount_weekdays_value CHECK (weekday BETWEEN 1 AND 7)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_no VARCHAR(20) NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  service_id BIGINT UNSIGNED NOT NULL,
  slot_id BIGINT UNSIGNED NOT NULL,
  status ENUM(
    'booked',
    'received',
    'washing',
    'drying',
    'folding',
    'ready',
    'picked_up',
    'cancelled'
  ) NOT NULL DEFAULT 'booked',
  estimated_quantity DECIMAL(8,2) NOT NULL,
  verified_quantity DECIMAL(8,2) NULL,
  pricing_unit_snapshot ENUM('per_kilo', 'per_item') NOT NULL,
  unit_price_snapshot DECIMAL(10,2) NOT NULL,
  estimated_service_total DECIMAL(10,2) NOT NULL,
  estimated_addons_total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  estimated_discount_total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  estimated_total DECIMAL(10,2) NOT NULL,
  final_service_total DECIMAL(10,2) NULL,
  final_addons_total DECIMAL(10,2) NULL,
  final_discount_total DECIMAL(10,2) NULL,
  final_total DECIMAL(10,2) NULL,
  notes VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_order_no (order_no),
  KEY idx_orders_customer_created (customer_id, created_at),
  KEY idx_orders_slot_status (slot_id, status),
  KEY idx_orders_status_created (status, created_at),
  KEY idx_orders_service (service_id),
  CONSTRAINT fk_orders_customer
    FOREIGN KEY (customer_id) REFERENCES users (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_orders_service
    FOREIGN KEY (service_id) REFERENCES services (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_orders_slot
    FOREIGN KEY (slot_id) REFERENCES time_slots (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_orders_estimated_quantity CHECK (estimated_quantity > 0),
  CONSTRAINT chk_orders_verified_quantity CHECK (
    verified_quantity IS NULL OR verified_quantity > 0
  ),
  CONSTRAINT chk_orders_unit_price CHECK (unit_price_snapshot > 0),
  CONSTRAINT chk_orders_estimated_amounts CHECK (
    estimated_service_total > 0 AND
    estimated_addons_total >= 0 AND
    estimated_discount_total >= 0 AND
    estimated_discount_total <= estimated_service_total AND
    estimated_total = estimated_service_total + estimated_addons_total - estimated_discount_total
  ),
  CONSTRAINT chk_orders_final_amounts CHECK (
    (final_total IS NULL AND final_service_total IS NULL AND
     final_addons_total IS NULL AND final_discount_total IS NULL)
    OR
    (final_total IS NOT NULL AND final_service_total IS NOT NULL AND
     final_addons_total IS NOT NULL AND final_discount_total IS NOT NULL AND
     final_service_total >= 0 AND final_addons_total >= 0 AND
     final_discount_total >= 0 AND final_discount_total <= final_service_total AND
     final_total = final_service_total + final_addons_total - final_discount_total)
  )
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_addons (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  addon_id BIGINT UNSIGNED NOT NULL,
  addon_name_snapshot VARCHAR(100) NOT NULL,
  pricing_unit_snapshot ENUM('per_order', 'per_kilo', 'per_item') NOT NULL,
  unit_price_snapshot DECIMAL(10,2) NOT NULL,
  estimated_quantity DECIMAL(8,2) NOT NULL,
  estimated_total DECIMAL(10,2) NOT NULL,
  final_quantity DECIMAL(8,2) NULL,
  final_total DECIMAL(10,2) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_order_addons_order_addon (order_id, addon_id),
  KEY idx_order_addons_addon (addon_id),
  CONSTRAINT fk_order_addons_order
    FOREIGN KEY (order_id) REFERENCES orders (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_order_addons_addon
    FOREIGN KEY (addon_id) REFERENCES addons (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_order_addons_estimated CHECK (
    unit_price_snapshot > 0 AND estimated_quantity > 0 AND estimated_total >= 0
  ),
  CONSTRAINT chk_order_addons_final CHECK (
    (final_quantity IS NULL AND final_total IS NULL)
    OR
    (final_quantity IS NOT NULL AND final_total IS NOT NULL AND
     final_quantity > 0 AND final_total >= 0)
  )
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_discounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  discount_id BIGINT UNSIGNED NOT NULL,
  discount_name_snapshot VARCHAR(120) NOT NULL,
  discount_type_snapshot ENUM('percent', 'fixed') NOT NULL,
  discount_value_snapshot DECIMAL(10,2) NOT NULL,
  estimated_amount DECIMAL(10,2) NOT NULL,
  final_amount DECIMAL(10,2) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_order_discounts_order_discount (order_id, discount_id),
  KEY idx_order_discounts_discount (discount_id),
  CONSTRAINT fk_order_discounts_order
    FOREIGN KEY (order_id) REFERENCES orders (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_order_discounts_discount
    FOREIGN KEY (discount_id) REFERENCES discounts (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_order_discounts_amounts CHECK (
    discount_value_snapshot > 0 AND estimated_amount >= 0 AND
    (final_amount IS NULL OR final_amount >= 0)
  )
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_status_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  previous_status ENUM(
    'booked',
    'received',
    'washing',
    'drying',
    'folding',
    'ready',
    'picked_up',
    'cancelled'
  ) NULL,
  status ENUM(
    'booked',
    'received',
    'washing',
    'drying',
    'folding',
    'ready',
    'picked_up',
    'cancelled'
  ) NOT NULL,
  changed_by BIGINT UNSIGNED NULL,
  remarks VARCHAR(255) NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_order_status_history_order_time (order_id, changed_at),
  KEY idx_order_status_history_actor_time (changed_by, changed_at),
  CONSTRAINT fk_order_status_history_order
    FOREIGN KEY (order_id) REFERENCES orders (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_order_status_history_actor
    FOREIGN KEY (changed_by) REFERENCES users (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_method ENUM('cash', 'gcash', 'maya') NOT NULL,
  payment_status ENUM('pending', 'paid', 'failed', 'refunded') NOT NULL DEFAULT 'paid',
  amount_tendered DECIMAL(10,2) NULL,
  change_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  receipt_no VARCHAR(30) NULL,
  reference_no VARCHAR(60) NULL,
  recorded_by BIGINT UNSIGNED NOT NULL,
  paid_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payments_receipt (receipt_no),
  KEY idx_payments_order_created (order_id, created_at),
  KEY idx_payments_status_paid (payment_status, paid_at),
  KEY idx_payments_recorded_by (recorded_by),
  CONSTRAINT fk_payments_order
    FOREIGN KEY (order_id) REFERENCES orders (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_payments_recorded_by
    FOREIGN KEY (recorded_by) REFERENCES users (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_payments_amount CHECK (amount > 0),
  CONSTRAINT chk_payments_cash_change CHECK (
    change_amount >= 0 AND
    ((amount_tendered IS NULL AND change_amount = 0) OR
     (amount_tendered IS NOT NULL AND amount_tendered >= amount AND
      change_amount = amount_tendered - amount))
  )
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS feedback (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  rating TINYINT UNSIGNED NOT NULL,
  comment VARCHAR(500) NULL,
  submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_feedback_order (order_id),
  KEY idx_feedback_customer_submitted (customer_id, submitted_at),
  CONSTRAINT fk_feedback_order
    FOREIGN KEY (order_id) REFERENCES orders (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_feedback_customer
    FOREIGN KEY (customer_id) REFERENCES users (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_feedback_rating CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id BIGINT UNSIGNED NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NULL,
  entity_id BIGINT UNSIGNED NULL,
  details JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_activity_logs_actor_time (actor_user_id, created_at),
  KEY idx_activity_logs_entity (entity_type, entity_id),
  KEY idx_activity_logs_created (created_at),
  CONSTRAINT fk_activity_logs_actor
    FOREIGN KEY (actor_user_id) REFERENCES users (id)
    ON UPDATE RESTRICT ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  refresh_token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  last_used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_auth_sessions_token_hash (refresh_token_hash),
  KEY idx_auth_sessions_user_expiry (user_id, expires_at, revoked_at),
  CONSTRAINT fk_auth_sessions_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
