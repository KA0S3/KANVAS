/**
 * Mock services for integration testing
 */

import { vi } from 'vitest';
import { TEST_USERS, createMockUser, createMockWebhookEvent } from './testFixtures';

// Mock Supabase client
export const mockSupabase = {
  auth: {
    getSession: vi.fn(),
    getUser: vi.fn(),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
  },
  functions: {
    invoke: vi.fn(),
  },
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
      single: vi.fn(),
      then: vi.fn(),
    })),
    gte: vi.fn(() => ({
      order: vi.fn(() => ({
        data: [],
        error: null,
      })),
    })),
    })),
  })),
  storage: {
    from: vi.fn(() => ({
      upload: vi.fn(),
      getPublicUrl: vi.fn(),
      remove: vi.fn(),
    })),
  },
};

// Mock fetch for API calls
export const mockFetch = vi.fn();

// Mock environment variables
export const mockEnv = {
  VITE_SUPABASE_URL: 'https://test.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
};

// Setup mocks for tests
export const setupMocks = () => {
  // Mock Supabase
  vi.mock('@/lib/supabase', () => ({
    supabase: mockSupabase,
  }));

  // Mock fetch
  global.fetch = mockFetch;

  // Mock environment variables
  vi.stubEnv('VITE_SUPABASE_URL', mockEnv.VITE_SUPABASE_URL);
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', mockEnv.VITE_SUPABASE_ANON_KEY);

  // Default successful auth session
  mockSupabase.auth.getSession.mockResolvedValue({
    data: { 
      session: {
        user: createMockUser(TEST_USERS.free),
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expires_in: 3600,
      }
    },
    error: null,
  });

  // Default successful function invoke
  mockSupabase.functions.invoke.mockResolvedValue({
    data: {},
    error: null,
  });

  // Default successful fetch
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({}),
    status: 200,
    statusText: 'OK',
  });
};

// Mock permission service responses
export const mockPermissionService = {
  free: {
    canExportZip: false,
    canExportJson: false,
    canImportZip: false,
    canImportJson: false,
    canCreateBook: true,
    canBulkExport: false,
    planType: 'free',
  },
  pro: {
    canExportZip: true,
    canExportJson: true,
    canImportZip: true,
    canImportJson: true,
    canCreateBook: true,
    canBulkExport: true,
    planType: 'pro',
  },
  lifetime: {
    canExportZip: true,
    canExportJson: true,
    canImportZip: true,
    canImportJson: true,
    canCreateBook: true,
    canBulkExport: true,
    planType: 'lifetime',
  },
};

// Mock effective limits responses
export const mockEffectiveLimits = {
  guest: {
    quotaBytes: 0,
    maxBooks: 1,
    adsEnabled: true,
    importExportEnabled: false,
    source: { plan: 'guest' },
  },
  free: {
    quotaBytes: 100 * 1024 * 1024,
    maxBooks: 2,
    adsEnabled: true,
    importExportEnabled: false,
    source: { plan: 'free' },
  },
  pro: {
    quotaBytes: 10 * 1024 * 1024 * 1024,
    maxBooks: 50,
    adsEnabled: false,
    importExportEnabled: true,
    source: { plan: 'pro' },
  },
  lifetime: {
    quotaBytes: 50 * 1024 * 1024 * 1024,
    maxBooks: -1,
    adsEnabled: false,
    importExportEnabled: true,
    source: { plan: 'lifetime' },
  },
};

// Helper to mock specific user authentication
export const mockAuthUser = (userType: keyof typeof TEST_USERS) => {
  const user = TEST_USERS[userType];
  const mockUser = createMockUser(user);
  
  mockSupabase.auth.getSession.mockResolvedValue({
    data: { 
      session: {
        user: mockUser,
        access_token: `token-${userType}`,
        refresh_token: `refresh-${userType}`,
        expires_in: 3600,
      }
    },
    error: null,
  });

  mockSupabase.auth.getUser.mockResolvedValue({
    data: { user: mockUser },
    error: null,
  });

  return mockUser;
};

// Helper to mock permission service response
export const mockPermissionsResponse = (planType: string) => {
  const permissions = mockPermissionService[planType as keyof typeof mockPermissionService];
  mockSupabase.functions.invoke
    .mockResolvedValueOnce({ data: permissions, error: null });
};

// Helper to mock effective limits response
export const mockEffectiveLimitsResponse = (planType: string) => {
  const limits = mockEffectiveLimits[planType as keyof typeof mockEffectiveLimits];
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(limits),
    status: 200,
    statusText: 'OK',
  });
};

// Helper to mock webhook events
export const mockWebhookEvent = (eventType: string, data?: any) => {
  const event = createMockWebhookEvent(eventType, data);
  return event;
};

// Helper to mock database responses
export const mockDatabaseResponse = (data: any, error: any = null) => {
  return {
    data,
    error,
  };
};

// Helper to mock upload service
export const mockUploadService = {
  getUploadUrls: vi.fn(),
  uploadFile: vi.fn(),
  completeUpload: vi.fn(),
};

// Helper to mock asset creation
export const mockAssetCreation = (overrides: any = {}) => {
  return {
    id: `asset_${Math.random().toString(36).substr(2, 9)}`,
    project_id: `project_${Math.random().toString(36).substr(2, 9)}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    file_size: 1024 * 1024,
    mime_type: 'image/jpeg',
    ...overrides,
  };
};

// Cleanup utilities
export const cleanupMocks = () => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
};

// Race condition testing utilities
export const createRaceConditionTest = async (
  operations: Array<() => Promise<any>>,
  maxConcurrency: number = 5
) => {
  const results = [];
  const chunks = [];
  
  // Split operations into chunks
  for (let i = 0; i < operations.length; i += maxConcurrency) {
    chunks.push(operations.slice(i, i + maxConcurrency));
  }
  
  // Execute chunks concurrently
  for (const chunk of chunks) {
    const chunkResults = await Promise.allSettled(
      chunk.map(op => op())
    );
    results.push(...chunkResults);
  }
  
  return results;
};

// Performance testing utilities
export const measurePerformance = async (operation: () => Promise<any>, iterations: number = 100) => {
  const times = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await operation();
    const end = performance.now();
    times.push(end - start);
  }
  
  return {
    average: times.reduce((a, b) => a + b, 0) / times.length,
    min: Math.min(...times),
    max: Math.max(...times),
    median: times.sort((a, b) => a - b)[Math.floor(times.length / 2)],
    p95: times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)],
    p99: times.sort((a, b) => a - b)[Math.floor(times.length * 0.99)],
  };
};
