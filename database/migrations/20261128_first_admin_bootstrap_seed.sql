USE `labadahub`;

-- Run only after the table migration succeeds or an existing table is verified.
INSERT IGNORE INTO first_admin_bootstrap_state (singleton_id) VALUES (1);
