CREATE TABLE promo_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('percentage', 'free_plan', 'extra_storage')),
    value INTEGER NOT NULL,
    plan_target TEXT,
    expires_at TIMESTAMP,
    max_uses INTEGER,
    uses INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_promo_codes_code ON promo_codes(code);
