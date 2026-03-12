import { createClient } from '@supabase/supabase-js'
import type { AuthError } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  throw new Error('VITE_SUPABASE_URL environment variable is missing')
}

if (!supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_ANON_KEY environment variable is missing')
}

// Enhanced Supabase client with auth configuration
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: false, // Changed to false to prevent session persistence conflicts
    detectSessionInUrl: true, // Important for email confirmation
    flowType: 'pkce', // Recommended for web apps
    storage: localStorage, // Explicit storage reference
  },
})

// Auth utility functions
export const authUtils = {
  // Get the current redirect URL for auth flows
  getRedirectUrl: (path: string = '/auth/confirm') => {
    const baseUrl = import.meta.env.VITE_APP_URL || window.location.origin
    return `${baseUrl}${path}`
  },

  // Handle email confirmation errors
  handleAuthError: (error: AuthError): string => {
    switch (error.message) {
      case 'Invalid token':
        return 'The confirmation link has expired or is invalid. Please request a new one.'
      case 'Email not confirmed':
        return 'Please check your email and click the confirmation link.'
      case 'Invalid login credentials':
        return 'Incorrect email or password.'
      case 'User already registered':
        return 'An account with this email already exists.'
      case 'Password should be at least 6 characters':
        return 'Password must be at least 6 characters long.'
      default:
        return error.message || 'An authentication error occurred.'
    }
  },

  // Check if current URL is an auth callback
  isAuthCallback: (): boolean => {
    const hashParams = new URLSearchParams(window.location.hash.substring(1))
    const searchParams = new URLSearchParams(window.location.search)
    return (
      hashParams.has('access_token') ||
      hashParams.has('refresh_token') ||
      searchParams.has('code') ||
      searchParams.has('error') ||
      window.location.pathname === '/auth/confirm'
    )
  },

  // Extract auth tokens from URL
  getAuthTokens: () => {
    const hashParams = new URLSearchParams(window.location.hash.substring(1))
    const searchParams = new URLSearchParams(window.location.search)
    
    return {
      accessToken: hashParams.get('access_token') || searchParams.get('access_token'),
      refreshToken: hashParams.get('refresh_token') || searchParams.get('refresh_token'),
      error: searchParams.get('error'),
      errorDescription: searchParams.get('error_description'),
    }
  },
}

export default supabase
