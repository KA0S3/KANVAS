/**
 * MSW handlers for API mocking
 */

import { http, HttpResponse } from 'msw';
import { mockPermissionService, mockEffectiveLimits, mockWebhookEvent } from '../utils/mockServices';

// Supabase function handlers
export const handlers = [
  // User permissions endpoint
  http.post('https://test.supabase.co/functions/v1/user-permissions', ({ request }) => {
    // Parse request body to determine user type if needed
    return HttpResponse.json(mockPermissionService.free);
  }),

  // Effective limits endpoint
  http.post('https://test.supabase.co/functions/v1/compute-effective-limits', ({ request }) => {
    return HttpResponse.json(mockEffectiveLimits.free);
  }),

  // Owner key validation endpoint
  http.post('https://test.supabase.co/functions/v1/validate-owner-key', ({ request }) => {
    return HttpResponse.json({
      isValid: true,
      scopes: {
        ads: false,
        max_storage_bytes: 2 * 1024 * 1024 * 1024,
        import_export: true,
      },
      userId: 'test-user-id',
    });
  }),

  // Asset upload endpoints
  http.post('https://test.supabase.co/functions/v1/get-upload-urls', ({ request }) => {
    return HttpResponse.json({
      uploadUrls: [
        {
          asset_id: 'test-asset-id',
          signedUrl: 'https://test-storage-url.com/upload',
          path: 'test/path/asset.jpg',
        },
      ],
    });
  }),

  http.post('https://test.supabase.co/functions/v1/complete-upload', ({ request }) => {
    return HttpResponse.json({
      success: true,
      assetId: 'test-asset-id',
    });
  }),

  // Webhook endpoints
  http.post('https://test.supabase.co/functions/v1/paystack-webhook', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({
      success: true,
      processed: true,
    });
  }),

  // Reconciliation endpoint
  http.post('https://test.supabase.co/functions/v1/reconcileStorageUsage', ({ request }) => {
    return HttpResponse.json({
      success: true,
      users_processed: 10,
      users_corrected: 2,
      total_drift_bytes: 1024 * 1024,
      details: [
        {
          user_id: 'test-user-1',
          recorded_usage: 100 * 1024 * 1024,
          actual_usage: 101 * 1024 * 1024,
          drift_bytes: 1024 * 1024,
          corrected: true,
        },
      ],
    });
  }),

  // Monitoring endpoints
  http.post('https://test.supabase.co/functions/v1/webhook-monitoring', ({ request }) => {
    return HttpResponse.json({
      success: true,
      webhook_health: 'healthy',
      failure_rate: 0.02,
    });
  }),

  http.post('https://test.supabase.co/functions/v1/permission-monitoring', ({ request }) => {
    return HttpResponse.json({
      success: true,
      denial_rate: 0.05,
      unusual_patterns: [],
    });
  }),

  // Storage endpoints
  http.get('https://test.supabase.co/storage/v1/object/public/test/path/*', () => {
    return new HttpResponse(null, { status: 200 });
  }),

  http.post('https://test.supabase.co/storage/v1/object/test/path/*', () => {
    return new HttpResponse(null, { status: 200 });
  }),

  http.delete('https://test.supabase.co/storage/v1/object/test/path/*', () => {
    return new HttpResponse(null, { status: 200 });
  }),

  // Database query endpoints (mocked)
  http.get('https://test.supabase.co/rest/v1/users', ({ request }) => {
    const url = new URL(request.url);
    const userId = url.searchParams.get('id');
    
    if (userId === 'test-free-user') {
      return HttpResponse.json([
        {
          id: 'test-free-user',
          plan_type: 'free',
          storage_usage: 50 * 1024 * 1024,
          created_at: new Date().toISOString(),
        },
      ]);
    }
    
    return HttpResponse.json([]);
  }),

  http.get('https://test.supabase.co/rest/v1/assets', ({ request }) => {
    return HttpResponse.json([
      {
        id: 'test-asset-1',
        user_id: 'test-free-user',
        file_size: 1024 * 1024,
        created_at: new Date().toISOString(),
      },
    ]);
  }),

  http.post('https://test.supabase.co/rest/v1/users', ({ request }) => {
    return HttpResponse.json({
      id: 'test-new-user',
      plan_type: 'free',
    });
  }),

  http.patch('https://test.supabase.co/rest/v1/users/*', ({ request }) => {
    return HttpResponse.json({
      updated: true,
    });
  }),

  // Auth endpoints
  http.post('https://test.supabase.co/auth/v1/token', ({ request }) => {
    return HttpResponse.json({
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      expires_in: 3600,
      user: {
        id: 'test-free-user',
        email: 'free@test.com',
      },
    });
  }),

  http.get('https://test.supabase.co/auth/v1/user', ({ request }) => {
    return HttpResponse.json({
      id: 'test-free-user',
      email: 'free@test.com',
      aud: 'authenticated',
      role: 'authenticated',
    });
  }),

  http.post('https://test.supabase.co/auth/v1/logout', () => {
    return new HttpResponse(null, { status: 204 });
  }),
];

// Helper functions for dynamic handlers
export const createDynamicHandler = (endpoint: string, response: any, status = 200) => {
  return http.post(endpoint, () => HttpResponse.json(response, { status }));
};

export const createErrorHandler = (endpoint: string, errorMessage: string, status = 500) => {
  return http.post(endpoint, () => {
    return HttpResponse.json(
      { error: errorMessage },
      { status }
    );
  });
};

export const createDelayHandler = (endpoint: string, response: any, delayMs: number) => {
  return http.post(endpoint, async () => {
    await new Promise(resolve => setTimeout(resolve, delayMs));
    return HttpResponse.json(response);
  });
};
