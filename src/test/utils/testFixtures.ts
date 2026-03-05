/**
 * Test fixtures and utilities for integration testing
 */

import { User } from '@supabase/supabase-js';

export interface TestUser {
  id: string;
  email: string;
  planType: 'guest' | 'free' | 'pro' | 'lifetime';
  storageQuota: number;
  maxBooks: number;
  adsEnabled: boolean;
  importExportEnabled: boolean;
}

export interface TestOwnerKey {
  token: string;
  userId: string;
  scopes: {
    ads?: boolean;
    max_storage_bytes?: number;
    max_books?: number;
    import_export?: boolean;
  };
  expiresAt?: string;
}

export interface TestLicense {
  id: string;
  userId: string;
  planType: string;
  features: {
    extra_quota_bytes?: number;
    max_books?: number;
    ads?: boolean;
    import_export?: boolean;
  };
  expiresAt?: string;
}

// Test account fixtures
export const TEST_USERS: Record<string, TestUser> = {
  guest: {
    id: 'test-guest-user',
    email: 'guest@test.com',
    planType: 'guest',
    storageQuota: 0,
    maxBooks: 1,
    adsEnabled: true,
    importExportEnabled: false,
  },
  free: {
    id: 'test-free-user',
    email: 'free@test.com',
    planType: 'free',
    storageQuota: 100 * 1024 * 1024, // 100MB
    maxBooks: 2,
    adsEnabled: true,
    importExportEnabled: false,
  },
  pro: {
    id: 'test-pro-user',
    email: 'pro@test.com',
    planType: 'pro',
    storageQuota: 10 * 1024 * 1024 * 1024, // 10GB
    maxBooks: 50,
    adsEnabled: false,
    importExportEnabled: true,
  },
  lifetime: {
    id: 'test-lifetime-user',
    email: 'lifetime@test.com',
    planType: 'lifetime',
    storageQuota: 50 * 1024 * 1024 * 1024, // 50GB
    maxBooks: -1, // unlimited
    adsEnabled: false,
    importExportEnabled: true,
  },
};

// Test owner key fixtures
export const TEST_OWNER_KEYS: Record<string, TestOwnerKey> = {
  freeWithOverrides: {
    token: 'test-owner-key-free-override',
    userId: TEST_USERS.free.id,
    scopes: {
      ads: false,
      max_storage_bytes: 2 * 1024 * 1024 * 1024, // 2GB
      max_books: 25,
      import_export: true,
    },
  },
  proWithExtraStorage: {
    token: 'test-owner-key-pro-storage',
    userId: TEST_USERS.pro.id,
    scopes: {
      max_storage_bytes: 20 * 1024 * 1024 * 1024, // 20GB
    },
  },
};

// Test license fixtures
export const TEST_LICENSES: Record<string, TestLicense> = {
  freeWithStorageAddon: {
    id: 'test-license-storage-addon',
    userId: TEST_USERS.free.id,
    planType: 'free',
    features: {
      extra_quota_bytes: 5 * 1024 * 1024 * 1024, // 5GB extra
      max_books: 10,
      ads: false,
    },
  },
  proWithFeatures: {
    id: 'test-license-pro-features',
    userId: TEST_USERS.pro.id,
    planType: 'pro',
    features: {
      extra_quota_bytes: 10 * 1024 * 1024 * 1024, // 10GB extra
      import_export: true,
    },
  },
};

// Mock Supabase user objects
export const createMockUser = (testUser: TestUser): User => ({
  id: testUser.id,
  email: testUser.email,
  email_confirmed_at: new Date().toISOString(),
  phone: '',
  phone_confirmed_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  app_metadata: {
    provider: 'email',
    plan: testUser.planType,
  },
  user_metadata: {},
  aud: 'authenticated',
  role: 'authenticated',
});

// Mock webhook event payloads
export const createMockWebhookEvent = (eventType: string, data: any = {}) => ({
  event: eventType,
  data: {
    id: Math.floor(Math.random() * 1000000),
    domain: 'test',
    status: 'success',
    reference: `test_ref_${Math.random().toString(36).substr(2, 9)}`,
    amount: 10000,
    ...data,
  },
  created_at: new Date().toISOString(),
});

// Mock asset data for upload tests
export const createMockAsset = (overrides: any = {}) => ({
  id: `asset_${Math.random().toString(36).substr(2, 9)}`,
  project_id: `project_${Math.random().toString(36).substr(2, 9)}`,
  user_id: TEST_USERS.free.id,
  original_filename: 'test-image.jpg',
  file_size: 1024 * 1024, // 1MB
  mime_type: 'image/jpeg',
  cloud_path: 'test/path/image.jpg',
  variants: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

// Helper functions for test setup
export const setupTestUser = (userType: keyof typeof TEST_USERS) => {
  const user = TEST_USERS[userType];
  return {
    user,
    mockUser: createMockUser(user),
    effectiveLimits: {
      quotaBytes: user.storageQuota,
      maxBooks: user.maxBooks,
      adsEnabled: user.adsEnabled,
      importExportEnabled: user.importExportEnabled,
      source: {
        plan: user.planType,
      },
    },
  };
};

export const setupOwnerKeyOverride = (keyType: keyof typeof TEST_OWNER_KEYS, baseUser: TestUser) => {
  const ownerKey = TEST_OWNER_KEYS[keyType];
  const overrides = ownerKey.scopes;
  
  return {
    ownerKey,
    effectiveLimits: {
      quotaBytes: overrides.max_storage_bytes || baseUser.storageQuota,
      maxBooks: overrides.max_books || baseUser.maxBooks,
      adsEnabled: overrides.ads !== undefined ? overrides.ads : baseUser.adsEnabled,
      importExportEnabled: overrides.import_export || baseUser.importExportEnabled,
      source: {
        plan: baseUser.planType,
        ownerKeyId: ownerKey.token,
      },
    },
  };
};

export const setupLicenseOverride = (licenseType: keyof typeof TEST_LICENSES, baseUser: TestUser) => {
  const license = TEST_LICENSES[licenseType];
  const features = license.features;
  
  const extraQuota = features.extra_quota_bytes || 0;
  const maxBooks = features.max_books || baseUser.maxBooks;
  
  return {
    license,
    effectiveLimits: {
      quotaBytes: baseUser.storageQuota + extraQuota,
      maxBooks,
      adsEnabled: features.ads !== undefined ? features.ads : baseUser.adsEnabled,
      importExportEnabled: features.import_export || baseUser.importExportEnabled,
      source: {
        plan: baseUser.planType,
        licenseId: license.id,
      },
    },
  };
};
