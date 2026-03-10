import { useState, useCallback } from 'react'
import { supabase, authUtils } from '@/lib/supabaseClient'
import { toast } from 'sonner'

interface UseAuthFlowReturn {
  isVerificationPending: boolean
  verificationEmail: string | null
  isResending: boolean
  handleSignUp: (email: string, password: string) => Promise<{error?: string; success?: boolean}>
  resendVerification: () => Promise<void>
  clearVerificationState: () => void
}

export const useAuthFlow = (): UseAuthFlowReturn => {
  const [isVerificationPending, setIsVerificationPending] = useState(false)
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null)
  const [isResending, setIsResending] = useState(false)

  const handleSignUp = useCallback(async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: authUtils.getRedirectUrl('/auth/confirm'),
          data: {
            email_confirmed: false, // Track confirmation status
          }
        }
      })

      if (error) {
        const errorMessage = authUtils.handleAuthError(error)
        toast.error(errorMessage)
        return { error: errorMessage }
      }

      // Check if user needs email confirmation
      if (data.user && !data.user.email_confirmed_at) {
        setIsVerificationPending(true)
        setVerificationEmail(email)
        toast.success('Account created! Please check your email to confirm your account.')
        return { success: true }
      } else if (data.user && data.user.email_confirmed_at) {
        // User is already confirmed (rare case)
        toast.success('Account created and confirmed successfully!')
        return { success: true }
      } else {
        // This shouldn't happen but handle gracefully
        toast.success('Account created! Please check your email to confirm your account.')
        return { success: true }
      }
    } catch (error) {
      console.error('Sign up error:', error)
      const errorMessage = 'An unexpected error occurred during sign up'
      toast.error(errorMessage)
      return { error: errorMessage }
    }
  }, [])

  const resendVerification = useCallback(async () => {
    if (!verificationEmail) {
      toast.error('No email address found to resend verification')
      return
    }

    setIsResending(true)
    
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: verificationEmail,
        options: {
          emailRedirectTo: authUtils.getRedirectUrl('/auth/confirm'),
        }
      })

      if (error) {
        const errorMessage = authUtils.handleAuthError(error)
        toast.error(errorMessage)
      } else {
        toast.success('Verification email resent! Please check your inbox.')
      }
    } catch (error) {
      console.error('Resend verification error:', error)
      toast.error('Failed to resend verification email')
    } finally {
      setIsResending(false)
    }
  }, [verificationEmail])

  const clearVerificationState = useCallback(() => {
    setIsVerificationPending(false)
    setVerificationEmail(null)
    setIsResending(false)
  }, [])

  return {
    isVerificationPending,
    verificationEmail,
    isResending,
    handleSignUp,
    resendVerification,
    clearVerificationState,
  }
}
