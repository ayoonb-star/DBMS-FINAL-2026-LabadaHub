-- Repeatable catalog and promotion seed for database labadahub.
-- This file does not create users, accounts, or passwords.
-- Existing records are left unchanged when their stable codes already exist.

USE labadahub;

INSERT INTO services
  (service_code, name, description, pricing_unit, unit_price, is_active)
VALUES
  ('wash', 'Wash, Dry & Fold',
   'Everyday clothes, towels and gym wear', 'per_kilo', 35.00, TRUE),
  ('bedding', 'Bedding & Heavy Care',
   'Comforters, duvets and blankets', 'per_kilo', 65.00, TRUE),
  ('dry-clean', 'Premium Dry Clean',
   'Barong, suits, gowns and delicates', 'per_item', 120.00, TRUE),
  ('ironing', 'Steam Ironing',
   'Crisp press for uniforms and office wear', 'per_kilo', 25.00, TRUE)
ON DUPLICATE KEY UPDATE service_code = VALUES(service_code);

INSERT INTO addons
  (addon_code, name, description, pricing_unit, unit_price, is_active)
VALUES
  ('downy-antibac', 'Downy Antibac',
   'Antibacterial fabric softener', 'per_order', 20.00, TRUE),
  ('color-safe-bleach', 'Color-safe bleach',
   'Color-safe bleach treatment', 'per_order', 25.00, TRUE),
  ('hypoallergenic-soap', 'Hypoallergenic soap',
   'Hypoallergenic detergent', 'per_order', 30.00, TRUE)
ON DUPLICATE KEY UPDATE addon_code = VALUES(addon_code);

INSERT INTO discounts
  (discount_code, name, description, discount_type, discount_value,
   service_id, is_active)
SELECT
  'wash-monday-wednesday-10',
  'Wash-Dry-Fold Monday/Wednesday promotion',
  '10% off Wash, Dry & Fold service subtotal on Mondays and Wednesdays.',
  'percent',
  10.00,
  s.id,
  TRUE
FROM services AS s
WHERE s.service_code = 'wash'
ON DUPLICATE KEY UPDATE discount_code = VALUES(discount_code);

INSERT INTO discount_weekdays (discount_id, weekday)
SELECT d.id, days.weekday
FROM discounts AS d
CROSS JOIN (
  SELECT 1 AS weekday
  UNION ALL
  SELECT 3 AS weekday
) AS days
WHERE d.discount_code = 'wash-monday-wednesday-10'
ON DUPLICATE KEY UPDATE weekday = VALUES(weekday);
