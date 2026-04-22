-- =====================================================
-- PAYMENT WEBHOOK TABLES - Phase 4 Additions
-- Required for Paystack payment processing
-- =====================================================

-- =====================================================
-- TABLE: purchases
-- =====================================================
-- Tracks all payment transactions for audit and support
CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  license_id UUID REFERENCES licenses(id) ON DELETE SET NULL,
  
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  payment_method TEXT NOT NULL DEFAULT 'paystack',
  transaction_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, completed, failed, refunded
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for purchase queries
CREATE INDEX IF NOT EXISTS idx_purchases_user ON purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_purchases_transaction ON purchases(transaction_id);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases(status);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(purchased_at DESC);

-- RLS Policy
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_purchases" ON purchases;
CREATE POLICY "users_own_purchases"
ON purchases
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- TABLE: webhook_logs
-- =====================================================
-- Logs all Paystack webhook events for debugging and monitoring
CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  reference TEXT NOT NULL,
  signature TEXT NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for webhook log queries
CREATE INDEX IF NOT EXISTS idx_webhook_logs_event ON webhook_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_reference ON webhook_logs(reference);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_processed ON webhook_logs(processed);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_date ON webhook_logs(created_at DESC);

-- RLS Policy - Only service role can access webhook logs
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_webhook_logs" ON webhook_logs;
CREATE POLICY "service_role_webhook_logs"
ON webhook_logs
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- =====================================================
-- TABLE: promo_codes
-- =====================================================
-- Stores promotional codes for discounts
CREATE TABLE IF NOT EXISTS promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  
  discount_type TEXT NOT NULL, -- 'percentage' or 'fixed'
  discount_value DECIMAL(10,2) NOT NULL,
  
  max_uses INT,
  uses_count INT DEFAULT 0,
  
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ,
  
  applicable_plans TEXT[], -- Array of plan IDs this applies to, null = all
  min_purchase_amount DECIMAL(10,2),
  
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for promo code queries
CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);
CREATE INDEX IF NOT EXISTS idx_promo_codes_active ON promo_codes(is_active) WHERE is_active = true;

-- RLS Policy
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_promo_codes" ON promo_codes;
CREATE POLICY "public_read_promo_codes"
ON promo_codes
FOR SELECT
USING (is_active = true);

DROP POLICY IF EXISTS "service_role_manage_promo_codes" ON promo_codes;
CREATE POLICY "service_role_manage_promo_codes"
ON promo_codes
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- =====================================================
-- TABLE: promo_code_uses
-- =====================================================
-- Tracks which users have used which promo codes
CREATE TABLE IF NOT EXISTS promo_code_uses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id UUID NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purchase_id UUID REFERENCES purchases(id) ON DELETE SET NULL,
  
  used_at TIMESTAMPTZ DEFAULT now(),
  discount_amount DECIMAL(10,2) NOT NULL
);

-- Indexes for promo code use queries
CREATE INDEX IF NOT EXISTS idx_promo_code_uses_user ON promo_code_uses(user_id);
CREATE INDEX IF NOT EXISTS idx_promo_code_uses_code ON promo_code_uses(promo_code_id);
CREATE INDEX IF NOT EXISTS idx_promo_code_uses_purchase ON promo_code_uses(purchase_id);

-- Unique constraint to prevent double use
CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_code_uses_unique ON promo_code_uses(promo_code_id, user_id);

-- RLS Policy
ALTER TABLE promo_code_uses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_promo_uses" ON promo_code_uses;
CREATE POLICY "users_own_promo_uses"
ON promo_code_uses
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- SETUP COMPLETE
-- =====================================================
