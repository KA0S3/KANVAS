import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle, XCircle, Loader2, Mail } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuthStore } from '@/stores/authStore'

type ConfirmationStatus = 'loading' | 'success' | 'error' | 'already_confirmed'

interface ConfirmationData {
  status: ConfirmationStatus
  message: string
  email?: string
  shouldRedirect?: boolean
}

export default function AuthConfirm() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [confirmationData, setConfirmationData] = useState<ConfirmationData>({
    status: 'loading',
    message: 'Verifying your account...',
  })
  const [redirectCountdown, setRedirectCountdown] = useState(5)
  
  // Get redirectTo parameter from URL, fallback to '/'
  const redirectTo = searchParams.get('redirectTo') || '/'

  const { setVerificationPending } = useAuthStore()

  useEffect(() => {
    const handleConfirmation = async () => {
      try {
        // Get token_hash and type from URL parameters
        const tokenHash = searchParams.get('token_hash')
        const type = searchParams.get('type')
        
        if (!tokenHash) {
          setConfirmationData({
            status: 'error',
            message: 'Invalid confirmation link. Missing verification token.',
          })
          return
        }

        // Use supabase.auth.exchangeCodeForSession to exchange token_hash for a real session
        const { data, error } = await supabase.auth.exchangeCodeForSession(tokenHash)

        if (error) {
          console.error('Verification error:', error)
          let errorMessage = 'Email verification failed. Please try again or contact support.'
          
          if (error.message.includes('expired')) {
            errorMessage = 'The confirmation link has expired. Please request a new verification email.'
          } else if (error.message.includes('invalid')) {
            errorMessage = 'Invalid confirmation link. Please try signing up again.'
          }
          
          setConfirmationData({
            status: 'error',
            message: errorMessage,
          })
          return
        }

        if (data?.user) {
          const email = data.user.email
          
          // Check if email is confirmed
          if (data.user.email_confirmed_at) {
            setConfirmationData({
              status: 'success',
              message: 'Email confirmed successfully! Welcome to KANVAS!',
              email,
              shouldRedirect: true,
            })
            
            // Clear verification pending state
            setVerificationPending(false, undefined)
          } else {
            setConfirmationData({
              status: 'error',
              message: 'Email confirmation failed. Please try again or contact support.',
              email,
            })
          }
        } else {
          setConfirmationData({
            status: 'error',
            message: 'Unable to confirm email. The link may have expired. Please request a new confirmation email.',
          })
        }
      } catch (error) {
        console.error('Email confirmation error:', error)
        setConfirmationData({
          status: 'error',
          message: 'An unexpected error occurred during email confirmation. Please try again.',
        })
      }
    }

    handleConfirmation()
  }, [searchParams, setVerificationPending])

  // Handle countdown redirect
  useEffect(() => {
    if (confirmationData.status === 'success' && confirmationData.shouldRedirect) {
      const timer = setInterval(() => {
        setRedirectCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer)
            navigate(redirectTo)
            return 0
          }
          return prev - 1
        })
      }, 1000)

      return () => clearInterval(timer)
    }
  }, [confirmationData.status, confirmationData.shouldRedirect, navigate])

  const handleManualRedirect = () => {
    navigate(redirectTo)
  }

  const handleRetrySignup = () => {
    navigate('/')
  }

  const renderContent = () => {
    switch (confirmationData.status) {
      case 'loading':
        return (
          <div className="flex flex-col items-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-center text-muted-foreground">
              {confirmationData.message}
            </p>
          </div>
        )

      case 'success':
        return (
          <div className="flex flex-col items-center space-y-4">
            <div className="rounded-full bg-green-100 p-3 dark:bg-green-900/20">
              <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold text-green-600 dark:text-green-400">
                Success!
              </h3>
              <p className="text-muted-foreground">
                {confirmationData.message}
              </p>
              {confirmationData.email && (
                <p className="text-sm text-muted-foreground">
                  Welcome, {confirmationData.email}!
                </p>
              )}
              {confirmationData.shouldRedirect && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Redirecting to app in {redirectCountdown} seconds...
                  </p>
                  <Button 
                    onClick={handleManualRedirect}
                    variant="outline"
                    size="sm"
                  >
                    Go to App Now
                  </Button>
                </div>
              )}
            </div>
          </div>
        )

      case 'error':
        return (
          <div className="flex flex-col items-center space-y-4">
            <div className="rounded-full bg-red-100 p-3 dark:bg-red-900/20">
              <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold text-red-600 dark:text-red-400">
                Verification Failed
              </h3>
              <p className="text-muted-foreground">
                {confirmationData.message}
              </p>
              <div className="space-y-2">
                <Button 
                  onClick={handleRetrySignup}
                  variant="outline"
                  size="sm"
                >
                  Try Signing Up Again
                </Button>
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
            <Mail className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-xl">
            Email Confirmation
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          {renderContent()}
        </CardContent>
      </Card>
    </div>
  )
}
