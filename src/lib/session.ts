import { supabase } from './supabase'
import type { Session } from '@supabase/supabase-js'

/**
 * Session management utilities for strict user-ownership RLS compliance
 * 
 * This module provides helpers to ensure all database operations use the
 * authenticated user's session and follow RLS policies.
 */

/**
 * Get the current authenticated session
 * @returns Promise<Session | null>
 */
export async function getCurrentSession(): Promise<Session | null> {
  try {
    const { data: { session }, error } = await supabase.auth.getSession()
    
    if (error) {
      console.error('Error getting session:', error)
      return null
    }
    
    return session
  } catch (error) {
    console.error('Unexpected error getting session:', error)
    return null
  }
}

/**
 * Get the current authenticated user ID
 * @returns Promise<string | null>
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await getCurrentSession()
  return session?.user?.id || null
}

/**
 * Verify user is authenticated before performing database operations
 * @throws Error if user is not authenticated
 */
export async function requireAuth(): Promise<string> {
  const userId = await getCurrentUserId()
  
  if (!userId) {
    throw new Error('User not authenticated. Please sign in to continue.')
  }
  
  return userId
}

/**
 * Wrapper to ensure database operations include user_id filter
 * @param query - Supabase query builder
 * @param userId - User ID to filter by (optional, will fetch from session if not provided)
 * @returns Query with user_id filter applied
 */
export function withUserFilter<T extends any>(
  query: T,
  userId?: string
): T {
  // This is a type-safe wrapper that reminds developers to add user_id filters
  // The actual filtering should be done explicitly in each query
  console.warn('withUserFilter is a reminder - please add explicit .eq("user_id", userId) to your query')
  return query
}

/**
 * Session listener for auth state changes
 * @param callback - Function to call when auth state changes
 * @returns Unsubscribe function
 */
export function onAuthStateChange(
  callback: (event: string, session: Session | null) => void
) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(callback)
  
  return () => subscription.unsubscribe()
}

/**
 * Check if session is valid and not expired
 * @param session - Supabase session
 * @returns boolean
 */
export function isSessionValid(session: Session | null): boolean {
  if (!session || !session.user) {
    return false
  }
  
  const now = Math.floor(Date.now() / 1000)
  return session.expires_at ? session.expires_at > now : true
}

/**
 * Refresh the current session
 * @returns Promise<Session | null>
 */
export async function refreshSession(): Promise<Session | null> {
  try {
    const { data: { session }, error } = await supabase.auth.refreshSession()
    
    if (error) {
      console.error('Error refreshing session:', error)
      return null
    }
    
    return session
  } catch (error) {
    console.error('Unexpected error refreshing session:', error)
    return null
  }
}

/**
 * Sign out the current user
 * @returns Promise<boolean>
 */
export async function signOut(): Promise<boolean> {
  try {
    const { error } = await supabase.auth.signOut()
    
    if (error) {
      console.error('Error signing out:', error)
      return false
    }
    
    return true
  } catch (error) {
    console.error('Unexpected error signing out:', error)
    return false
  }
}
