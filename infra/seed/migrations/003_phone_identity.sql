-- 003_phone_identity.sql
-- Adds normalized phone identity for inbound Vapi calls.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone_number_e164 TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_phone_number_e164
  ON users (phone_number_e164)
  WHERE phone_number_e164 IS NOT NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
