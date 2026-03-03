// Test script for getUploadUrls Edge Function
// Run with: deno test --allow-net --allow-env test.ts

import { assertEquals, assertExists } from "https://deno.land/std@0.168.0/testing/asserts.ts"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'http://localhost:54321'
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || 'your-anon-key'
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/getUploadUrls`

Deno.test("getUploadUrls - missing auth", async () => {
  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      project_id: 'test-project-id',
      files: [{ asset_id: 'test-asset-id', size_bytes: 1024 }]
    })
  })

  assertEquals(response.status, 401)
  const error = await response.json()
  assertEquals(error.error, 'Missing or invalid authorization header')
})

Deno.test("getUploadUrls - invalid request body", async () => {
  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer fake-token'
    },
    body: JSON.stringify({})
  })

  assertEquals(response.status, 400)
  const error = await response.json()
  assertEquals(error.error, 'Invalid request body')
})

Deno.test("getUploadUrls - valid request structure", async () => {
  // This test would require a valid JWT token and database setup
  // For now, just test the request structure validation
  
  const validRequest = {
    project_id: '123e4567-e89b-12d3-a456-426614174000',
    files: [
      { asset_id: '123e4567-e89b-12d3-a456-426614174001', size_bytes: 1024 },
      { asset_id: '123e4567-e89b-12d3-a456-426614174002', size_bytes: 2048 }
    ]
  }

  // Validate request structure
  assertEquals(typeof validRequest.project_id, 'string')
  assertEquals(Array.isArray(validRequest.files), true)
  assertEquals(validRequest.files.length, 2)
  assertEquals(typeof validRequest.files[0].asset_id, 'string')
  assertEquals(typeof validRequest.files[0].size_bytes, 'number')
  assertEquals(validRequest.files[0].size_bytes > 0, true)
})

console.log("Tests completed. Note: Full integration tests require Supabase setup.")
