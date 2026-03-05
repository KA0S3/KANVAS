-- Webhook logging table for monitoring and debugging
CREATE TABLE webhook_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(100) NOT NULL,
    reference VARCHAR(255) NOT NULL,
    signature VARCHAR(255) NOT NULL,
    processed BOOLEAN NOT NULL DEFAULT false,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes for performance
    INDEX idx_webhook_logs_event_type (event_type),
    INDEX idx_webhook_logs_reference (reference),
    INDEX idx_webhook_logs_processed (processed),
    INDEX idx_webhook_logs_created_at (created_at)
);

-- Add comments for documentation
COMMENT ON TABLE webhook_logs IS 'Logs all webhook events for monitoring and debugging purposes';
COMMENT ON COLUMN webhook_logs.event_type IS 'The type of webhook event (e.g., charge.success, validation_failed)';
COMMENT ON COLUMN webhook_logs.reference IS 'The transaction reference from the payment provider';
COMMENT ON COLUMN webhook_logs.signature IS 'The webhook signature for security tracking';
COMMENT ON COLUMN webhook_logs.processed IS 'Whether the webhook was successfully processed';
COMMENT ON COLUMN webhook_logs.error_message IS 'Error message if processing failed';
