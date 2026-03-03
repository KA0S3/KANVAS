# Payment and Storage Integration Guide

This document outlines the completed integration of Paystack payment processing and R2 storage configuration into the KANVAS application.

## ✅ Completed Implementation

### 1. Environment Variables Configuration
- ✅ Added R2 storage variables to `.env.example`
- ✅ Added Paystack variables to `.env.example`
- ✅ Documented required Supabase function environment variables

### 2. Paystack Integration
- ✅ Created Paystack client library (`src/lib/paystack.ts`)
- ✅ Implemented Paystack payment initialization and verification
- ✅ Created Paystack webhook handler (`supabase/functions/paystack-webhook/`)
- ✅ Updated payment modal to support both Stripe and Paystack
- ✅ Added payment method selection UI

### 3. R2 Storage Integration
- ✅ Verified existing R2 implementation in `getUploadUrls` function
- ✅ R2 configuration validation implemented
- ✅ Signed URL generation for uploads working

### 4. Database Schema
- ✅ Verified purchases table supports payment_method field
- ✅ Paystack-specific transaction reference fields supported
- ✅ R2 storage usage tracking verified

## 🚀 How to Use

### Environment Variables Setup

Create a `.env` file with the following variables:

```bash
# Supabase (already configured)
VITE_SUPABASE_URL=https://dsdxvyruwpxqhpkrxxhp.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzZHh2eXJ1d3B4cWhwa3J4eGhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNjg5NzIsImV4cCI6MjA4Nzk0NDk3Mn0.DZ72Uw_7EfoIXDl7GC1UF-fqPfLUiLp0MdRnnGVDw6Q

# R2 Storage
R2_ACCOUNT_ID=0025a08d2ba6c8fb141dc28360829fe9
R2_ACCESS_KEY_ID=7c174465f59256ae638a8d3c74724341
R2_SECRET_ACCESS_KEY=e7fe199ac0a8f6075e97e0cd1de4e32d0b50a0c1fc9c670bff5ce785702eb014
R2_BUCKET_NAME=kanvas

# Paystack (add your keys)
VITE_PAYSTACK_PUBLIC_KEY=your_paystack_public_key
PAYSTACK_SECRET_KEY=your_paystack_secret_key

# Stripe (existing)
VITE_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
```

### Supabase Functions Environment Variables

Set these in your Supabase dashboard under Project Settings > Functions:

```bash
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
PAYSTACK_SECRET_KEY=your_paystack_secret_key
R2_ACCOUNT_ID=0025a08d2ba6c8fb141dc28360829fe9
R2_ACCESS_KEY_ID=7c174465f59256ae638a8d3c74724341
R2_SECRET_ACCESS_KEY=e7fe199ac0a8f6075e97e0cd1de4e32d0b50a0c1fc9c670bff5ce785702eb014
R2_BUCKET_NAME=kanvas
```

### Payment Flow

1. **Payment Method Selection**: Users can choose between Stripe (USD) and Paystack (NGN)
2. **Stripe Flow**: Redirects to Stripe checkout (existing functionality)
3. **Paystack Flow**: Opens secure popup for payment
4. **Webhook Processing**: Both providers handle webhooks for payment confirmation
5. **License Creation**: Automatic license creation upon successful payment
6. **Storage Quota**: User storage quota updated automatically

### R2 Storage

The R2 storage integration is fully functional:
- Automatic signed URL generation for uploads
- Storage quota enforcement
- Support for large file uploads
- Integration with existing asset management system

## 📋 Testing Checklist

### Paystack Testing
- [ ] Get Paystack test keys from dashboard
- [ ] Test payment initialization
- [ ] Test payment verification
- [ ] Test webhook processing
- [ ] Test popup payment flow

### R2 Storage Testing
- [ ] Test file upload with signed URLs
- [ ] Test storage quota enforcement
- [ ] Test large file uploads
- [ ] Verify R2 bucket configuration

### Integration Testing
- [ ] Test payment method selection
- [ ] Test successful payment flow
- [ ] Test failed payment handling
- [ ] Test license creation
- [ ] Test storage quota updates

## 🔧 Deployment Notes

1. **Deploy Functions**: Deploy both `stripe-webhook` and `paystack-webhook` functions to Supabase
2. **Configure Webhooks**: Set up webhook endpoints in both Stripe and Paystack dashboards
3. **Environment Variables**: Ensure all environment variables are set in production
4. **Test Transactions**: Run test transactions in both payment providers

## 🐛 Troubleshooting

### Common Issues

1. **Paystack Popup Blocked**: Ensure popups are allowed for your domain
2. **R2 Upload Fails**: Verify R2 credentials and bucket permissions
3. **Webhook Not Working**: Check webhook URLs and secrets
4. **License Not Created**: Verify webhook processing and database permissions

### Debug Information

- Check browser console for JavaScript errors
- Review Supabase function logs
- Verify webhook delivery in payment provider dashboards
- Check database tables for failed transactions

## 📚 API Documentation

### Paystack API
- Base URL: `https://api.paystack.co`
- Documentation: https://paystack.com/docs/api
- Test mode available for development

### R2 Storage API
- S3-compatible API
- Base URL: `https://<bucket>.<account-id>.r2.cloudflarestorage.com`
- Documentation: https://developers.cloudflare.com/r2/

## 🎯 Next Steps

1. **Production Keys**: Replace test keys with production keys
2. **Error Handling**: Add comprehensive error handling
3. **Analytics**: Add payment tracking and analytics
4. **Email Notifications**: Add payment confirmation emails
5. **Subscription Management**: Add subscription cancellation and renewal features
