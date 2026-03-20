// Simple API client for admin operations
// Replace direct Supabase queries with these calls

const API_BASE_URL = '/api/admin'

interface ApiResponse<T> {
  data?: T
  error?: string
}

// Admin Users API
export const fetchAdminUsers = async (): Promise<ApiResponse<any[]>> => {
  try {
    const response = await fetch(`${API_BASE_URL}/users`)
    const result = await response.json()
    return result
  } catch (error) {
    console.error('Failed to fetch admin users:', error)
    return { error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

// Admin Promo Codes API
export const fetchAdminPromoCodes = async (): Promise<ApiResponse<any[]>> => {
  try {
    const response = await fetch(`${API_BASE_URL}/promo-codes`)
    const result = await response.json()
    return result
  } catch (error) {
    console.error('Failed to fetch promo codes:', error)
    return { error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

// Admin Owner Keys API
export const fetchAdminOwnerKeys = async (): Promise<ApiResponse<any[]>> => {
  try {
    const response = await fetch(`${API_BASE_URL}/owner-keys`)
    const result = await response.json()
    return result
  } catch (error) {
    console.error('Failed to fetch owner keys:', error)
    return { error: error instanceof Error ? error.message : 'Unknown error' }
  }
}
