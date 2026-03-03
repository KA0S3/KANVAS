# Stripe Webhook Handler

This Supabase Edge Function handles Stripe webhook events for payment processing.

## Supported Events

- `checkout.session.completed` - Processes one-time payments
- `invoice.payment_succeeded` - Processes subscription renewals

## Environment Variables

Required environment variables must be set in your Supabase project:

```bash
STRIPE_SECRET_KEY=sk_test_...  # Your Stripe secret key
STRIPE_WEBHOOK_SECRET=whsec_... # Your webhook signing secret
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Functionality

### On Payment Success:

1. **Idempotency Check**: Verifies the transaction hasn't been processed before
2. **License Creation**: Creates or updates user license in the `licenses` table
3. **Purchase Record**: Inserts transaction record in the `purchases` table
4. **User Update**: Updates user's plan type and storage quota
5. **Storage Usage**: Ensures storage usage record exists

### Plan Configurations

- **Basic**: 1GB storage, 10 projects, 100 assets per project
- **Premium**: 5GB storage, 50 projects, 500 assets per project  
- **Enterprise**: 20GB storage, unlimited projects and assets

## Metadata Requirements

### Checkout Sessions
- `user_id` - UUID of the user
- `plan_type` - One of: basic, premium, enterprise

### Subscriptions
- `user_id` - UUID of the user
- `plan_type` - One of: basic, premium, enterprise

## Security Features

- **Signature Verification**: Validates all incoming webhooks using Stripe's signature
- **Idempotency**: Prevents duplicate processing of the same transaction
- **Error Handling**: Comprehensive error logging and appropriate HTTP responses

## Deployment

Deploy to Supabase using the CLI:

```bash
supabase functions deploy stripe-webhook
```

After deployment, configure the webhook URL in your Stripe dashboard:
```
https://your-project.supabase.co/functions/v1/stripe-webhook
```
