import { Mail, ArrowLeft, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface CheckEmailViewProps {
  email: string | null
  onResend: () => void
  isResending: boolean
  onBackToLogin: () => void
}

export function CheckEmailView({ 
  email, 
  onResend, 
  isResending, 
  onBackToLogin 
}: CheckEmailViewProps) {
  return (
    <div className="flex flex-col items-center space-y-6 p-6">
      {/* Email Icon */}
      <div className="relative">
        <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
          <Mail className="w-8 h-8 text-white" />
        </div>
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white dark:border-gray-900"></div>
      </div>

      {/* Main Content */}
      <div className="text-center space-y-3">
        <h3 className="text-xl font-semibold text-foreground">
          Check Your Email
        </h3>
        
        <p className="text-muted-foreground max-w-sm">
          We've sent a confirmation link to:
        </p>
        
        {email && (
          <div className="bg-muted/50 rounded-lg px-4 py-2 border">
            <p className="font-medium text-foreground">{email}</p>
          </div>
        )}
        
        <p className="text-sm text-muted-foreground max-w-sm">
          Click the link in the email to confirm your account. If you don't see it, check your spam folder.
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col space-y-3 w-full max-w-sm">
        <Button
          onClick={onResend}
          disabled={isResending}
          variant="outline"
          className="w-full"
        >
          {isResending ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Resending...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 mr-2" />
              Resend Email
            </>
          )}
        </Button>
        
        <Button
          onClick={onBackToLogin}
          variant="ghost"
          className="w-full"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Login
        </Button>
      </div>

      {/* Additional Info */}
      <div className="text-center space-y-2">
        <p className="text-xs text-muted-foreground">
          The confirmation link will expire in 24 hours.
        </p>
        <p className="text-xs text-muted-foreground">
          Having trouble? Contact support if you continue to experience issues.
        </p>
      </div>
    </div>
  )
}
