CREATE TABLE promo_code_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    promo_code_id UUID NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    used_at TIMESTAMP DEFAULT NOW(),
    original_price INTEGER,
    discount_amount INTEGER,
    final_price INTEGER,
    product_key TEXT,
    UNIQUE(promo_code_id, user_id)
);

CREATE INDEX idx_promo_code_usage_promo_code_id ON promo_code_usage(promo_code_id);
CREATE INDEX idx_promo_code_usage_user_id ON promo_code_usage(user_id);
CREATE INDEX idx_promo_code_usage_used_at ON promo_code_usage(used_at);
