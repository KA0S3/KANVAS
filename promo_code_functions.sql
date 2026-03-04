-- Atomic function to increment promo code usage
CREATE OR REPLACE FUNCTION increment_promo_code_usage(promo_code_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE promo_codes 
    SET uses = uses + 1 
    WHERE id = promo_code_id 
    AND (max_uses IS NULL OR uses < max_uses);
END;
$$ LANGUAGE plpgsql;

-- Atomic function to decrement promo code usage (for rollback)
CREATE OR REPLACE FUNCTION decrement_promo_code_usage(promo_code_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE promo_codes 
    SET uses = GREATEST(uses - 1, 0) 
    WHERE id = promo_code_id;
END;
$$ LANGUAGE plpgsql;
