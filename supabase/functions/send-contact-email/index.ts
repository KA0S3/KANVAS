import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ContactFormData {
  name: string;
  email: string;
  subject?: string;
  message: string;
}

const handler = async (request: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY not found')
    }

    const { name, email, subject, message }: ContactFormData = await request.json()

    // Validate required fields
    if (!name || !email || !message) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: name, email, message' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Create email content
    const emailSubject = subject || 'New Contact Form Submission from KANVAS'
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">KANVAS Contact Form</h1>
          <p style="margin: 5px 0 0 0; opacity: 0.9;">New message from your application</p>
        </div>
        
        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
          <div style="margin-bottom: 20px;">
            <h3 style="margin: 0 0 10px 0; color: #333; font-size: 16px;">Contact Details</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef; font-weight: bold; color: #666; width: 100px;">Name:</td>
                <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;">${name}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef; font-weight: bold; color: #666;">Email:</td>
                <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;">${email}</td>
              </tr>
              ${subject ? `
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef; font-weight: bold; color: #666;">Subject:</td>
                <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;">${subject}</td>
              </tr>
              ` : ''}
            </table>
          </div>
          
          <div>
            <h3 style="margin: 0 0 10px 0; color: #333; font-size: 16px;">Message</h3>
            <div style="background: white; padding: 15px; border-radius: 5px; border-left: 4px solid #667eea;">
              <p style="margin: 0; line-height: 1.6; white-space: pre-wrap;">${message}</p>
            </div>
          </div>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; text-align: center; color: #666; font-size: 12px;">
            <p style="margin: 0;">This message was sent from the KANVAS contact form</p>
            <p style="margin: 5px 0 0 0;">Sent at: ${new Date().toLocaleString()}</p>
          </div>
        </div>
      </div>
    `

    // Send email using Resend API
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'onboarding@resend.dev', // For testing, change to your verified domain later
        to: ['shadek392@gmail.com'], // Your Gmail address
        subject: emailSubject,
        html: emailHtml,
        replyTo: email, // User's email for easy replies
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      console.error('Resend API error:', data)
      throw new Error(data.message || 'Failed to send email')
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Email sent successfully',
        id: data.id 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error sending email:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}

Deno.serve(handler)
