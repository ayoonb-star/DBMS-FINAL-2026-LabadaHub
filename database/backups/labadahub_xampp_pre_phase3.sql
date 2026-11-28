-- LabadaHub database setup for XAMPP (MariaDB/MySQL)
-- Import in phpMyAdmin or run:
-- C:\xampp\mysql\bin\mysql.exe -u root -e "SOURCE C:/.../labadahub_xampp.sql"

CREATE DATABASE IF NOT EXISTS labadahub
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE labadahub;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS activity_logs;
DROP TABLE IF EXISTS feedback;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS order_status_history;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS time_slots;
DROP TABLE IF EXISTS services;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'staff', 'customer') NOT NULL DEFAULT 'customer',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

CREATE TABLE services (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  pricing_type ENUM('per_kilo', 'per_item') NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  description VARCHAR(500) NULL,
  is_addon BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id),
  CONSTRAINT chk_services_price CHECK (price > 0)
) ENGINE=InnoDB;

CREATE TABLE time_slots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slot_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  max_bookings INT NOT NULL DEFAULT 5,
  is_open BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id),
  UNIQUE KEY uq_time_slots_date_start (slot_date, start_time),
  CONSTRAINT chk_time_slots_capacity CHECK (max_bookings BETWEEN 1 AND 100),
  CONSTRAINT chk_time_slots_time CHECK (end_time > start_time)
) ENGINE=InnoDB;

CREATE TABLE orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_no VARCHAR(20) NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  service_id BIGINT UNSIGNED NOT NULL,
  slot_id BIGINT UNSIGNED NOT NULL,
  est_weight DECIMAL(6,2) NOT NULL,
  actual_weight DECIMAL(6,2) NULL,
  total_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  status ENUM(
    'Booked',
    'Received',
    'Washing',
    'Drying',
    'Ironing and Folding',
    'Ready for Claim',
    'Completed',
    'Cancelled'
  ) NOT NULL DEFAULT 'Booked',
  notes VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_order_no (order_no),
  KEY idx_orders_customer (customer_id),
  KEY idx_orders_slot (slot_id),
  KEY idx_orders_service (service_id),
  CONSTRAINT chk_orders_est_weight CHECK (est_weight > 0),
  CONSTRAINT chk_orders_actual_weight CHECK (actual_weight IS NULL OR actual_weight > 0),
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id)
    REFERENCES users(id),
  CONSTRAINT fk_orders_service FOREIGN KEY (service_id)
    REFERENCES services(id),
  CONSTRAINT fk_orders_slot FOREIGN KEY (slot_id)
    REFERENCES time_slots(id)
) ENGINE=InnoDB;

CREATE TABLE order_status_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(30) NOT NULL,
  updated_by BIGINT UNSIGNED NULL,
  remarks VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_history_order (order_id),
  CONSTRAINT fk_history_order FOREIGN KEY (order_id)
    REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_history_user FOREIGN KEY (updated_by)
    REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_method VARCHAR(20) NOT NULL DEFAULT 'cash',
  payment_status VARCHAR(20) NOT NULL DEFAULT 'paid',
  receipt_no VARCHAR(30) NULL,
  reference_no VARCHAR(60) NULL,
  paid_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payments_receipt (receipt_no),
  KEY idx_payments_order (order_id),
  CONSTRAINT chk_payments_amount CHECK (amount > 0),
  CONSTRAINT fk_payments_order FOREIGN KEY (order_id)
    REFERENCES orders(id)
) ENGINE=InnoDB;

CREATE TABLE feedback (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  rating INT NOT NULL,
  comment VARCHAR(500) NULL,
  submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_feedback_order (order_id),
  KEY idx_feedback_customer (customer_id),
  CONSTRAINT chk_feedback_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT fk_feedback_order FOREIGN KEY (order_id)
    REFERENCES orders(id),
  CONSTRAINT fk_feedback_customer FOREIGN KEY (customer_id)
    REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE activity_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  action VARCHAR(100) NOT NULL,
  table_affected VARCHAR(50) NULL,
  record_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_activity_user (user_id),
  CONSTRAINT fk_activity_user FOREIGN KEY (user_id)
    REFERENCES users(id)
) ENGINE=InnoDB;

INSERT INTO services (name, pricing_type, price, description, is_addon, is_active) VALUES
  ('Wash-Dry-Fold', 'per_kilo', 60.00, 'Complete wash, dry, and fold service', FALSE, TRUE),
  ('Dry Cleaning', 'per_item', 150.00, 'Professional dry cleaning', FALSE, TRUE),
  ('Ironing', 'per_kilo', 40.00, 'Pressing and ironing service', FALSE, TRUE),
  ('Comforter Cleaning', 'per_item', 200.00, 'Comforter and blanket cleaning', FALSE, TRUE);

INSERT INTO time_slots (slot_date, start_time, end_time, max_bookings)
SELECT CURDATE() + INTERVAL day_offset DAY, '08:00:00', '10:00:00', 5 FROM (
  SELECT 0 AS day_offset UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
  UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6
) days
UNION ALL
SELECT CURDATE() + INTERVAL day_offset DAY, '10:00:00', '12:00:00', 5 FROM (
  SELECT 0 AS day_offset UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
  UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6
) days
UNION ALL
SELECT CURDATE() + INTERVAL day_offset DAY, '13:00:00', '15:00:00', 5 FROM (
  SELECT 0 AS day_offset UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
  UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6
) days
UNION ALL
SELECT CURDATE() + INTERVAL day_offset DAY, '15:00:00', '17:00:00', 5 FROM (
  SELECT 0 AS day_offset UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
  UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6
) days;
