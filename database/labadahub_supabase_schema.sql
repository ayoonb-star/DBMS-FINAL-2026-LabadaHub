-- LabadaHub schema for Supabase (PostgreSQL)
-- Gi-convert gikan sa MySQL; gibase sa backend code (routes/seed.js) ug Day 1 Task 5.
-- Run sa Supabase Dashboard -> SQL Editor.

-- ===== USERS =====
CREATE TABLE users (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  full_name     VARCHAR(100) NOT NULL,
  email         VARCHAR(100) NOT NULL UNIQUE,
  phone         VARCHAR(20),
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(10) NOT NULL DEFAULT 'customer'
                CHECK (role IN ('admin','staff','customer')),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===== SERVICES =====
CREATE TABLE services (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         VARCHAR(100) NOT NULL,
  pricing_type VARCHAR(10) NOT NULL CHECK (pricing_type IN ('per_kilo','per_item')),
  price        NUMERIC(10,2) NOT NULL CHECK (price > 0),
  description  VARCHAR(500),
  is_addon     BOOLEAN NOT NULL DEFAULT FALSE,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE
);

-- ===== TIME SLOTS =====
CREATE TABLE time_slots (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slot_date    DATE NOT NULL,
  start_time   TIME NOT NULL,
  end_time     TIME NOT NULL,
  max_bookings INT  NOT NULL DEFAULT 5 CHECK (max_bookings BETWEEN 1 AND 100),
  is_open      BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (slot_date, start_time),
  CHECK (end_time > start_time)
);

-- ===== ORDERS =====
CREATE TABLE orders (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_no      VARCHAR(20) NOT NULL UNIQUE,
  customer_id   BIGINT NOT NULL REFERENCES users(id),
  service_id    BIGINT NOT NULL REFERENCES services(id),
  slot_id       BIGINT NOT NULL REFERENCES time_slots(id),
  est_weight    NUMERIC(6,2) NOT NULL CHECK (est_weight > 0),
  actual_weight NUMERIC(6,2) CHECK (actual_weight > 0),
  total_price   NUMERIC(10,2) NOT NULL DEFAULT 0,
  status        VARCHAR(30) NOT NULL DEFAULT 'Booked'
                CHECK (status IN ('Booked','Received','Washing','Drying',
                  'Ironing and Folding','Ready for Claim','Completed','Cancelled')),
  notes         VARCHAR(255),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_slot     ON orders(slot_id);

-- ===== ORDER STATUS HISTORY =====
CREATE TABLE order_status_history (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id   BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status     VARCHAR(30) NOT NULL,
  updated_by BIGINT REFERENCES users(id),
  remarks    VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_history_order ON order_status_history(order_id);

-- ===== PAYMENTS =====
CREATE TABLE payments (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id       BIGINT NOT NULL REFERENCES orders(id),
  amount         NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  payment_method VARCHAR(20) NOT NULL DEFAULT 'cash',
  payment_status VARCHAR(20) NOT NULL DEFAULT 'paid',
  receipt_no     VARCHAR(30) UNIQUE,
  reference_no   VARCHAR(60),
  paid_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===== FEEDBACK =====
CREATE TABLE feedback (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id     BIGINT NOT NULL REFERENCES orders(id),
  customer_id  BIGINT NOT NULL REFERENCES users(id),
  rating       INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment      VARCHAR(500),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===== ACTIVITY LOGS =====
CREATE TABLE activity_logs (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        BIGINT REFERENCES users(id),
  action         VARCHAR(100) NOT NULL,
  table_affected VARCHAR(50),
  record_id      BIGINT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===== SECURITY =====
-- Ang Supabase mo-expose sa tables pinaagi sa public REST API (anon key).
-- Ang imong Express backend mo-connect direkta sa Postgres, mao nga i-lock nato
-- ang tanan gikan sa API: RLS ON ug walay policies = anon key dili maka-access.
ALTER TABLE users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE services             ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_slots           ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders               ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback             ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs        ENABLE ROW LEVEL SECURITY;
