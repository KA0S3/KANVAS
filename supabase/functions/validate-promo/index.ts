import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PromoCodeRequest {
  code: string;
  userId: string;
  productKey?: string;
}

interface PromoCodeResponse {
  valid: boolean;
  promoCode?: {
    id: string;
    code: string;
    type: 'percentage' | 'free_plan' | 'extra_storage';
    value: number;
    plan_target?: string;
    expires_at?: string;
    max_uses?: number;
    uses: number;
  };
  discountAmount?: number;
  adjustedPrice?: number;
  error?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { code, userId, productKey }: PromoCodeRequest = await req.json()

    if (!code || !userId) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: 'Promo code and user ID are required' 
        } as PromoCodeResponse),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      )
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Find the promo code
    const { data: promoCode, error: fetchError } = await supabase
      .from('promo_codes')
      .select('*')
      .eq('code', code.toUpperCase())
      .single()

    if (fetchError || !promoCode) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: 'Invalid promo code' 
        } as PromoCodeResponse),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404
        }
      )
    }

    // Check if promo code is expired
    if (promoCode.expires_at && new Date(promoCode.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: 'Promo code has expired' 
        } as PromoCodeResponse),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      )
    }

    // Check if promo code has reached max uses
    if (promoCode.max_uses && promoCode.uses >= promoCode.max_uses) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: 'Promo code has reached maximum uses' 
        } as PromoCodeResponse),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      )
    }

    // Check if user has already used this promo code
    const { data: userUsage, error: usageError } = await supabase
      .from('promo_code_usage')
      .select('*')
      .eq('promo_code_id', promoCode.id)
      .eq('user_id', userId)
      .single()

    if (userUsage) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: 'You have already used this promo code' 
        } as PromoCodeResponse),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      )
    }

    // Calculate discount or benefits
    let discountAmount = 0
    let adjustedPrice: number | undefined

    if (productKey && promoCode.type === 'percentage') {
      // Get product price from paystack products (this would need to be configured)
      const productPrices: Record<string, number> = {
        'PRO_SUBSCRIPTION': 2500, // ₦2,500
        'LIFETIME': 25000, // ₦25,000
        'STORAGE_10GB': 1000, // ₦1,000
      }

      const originalPrice = productPrices[productKey] || 0
      discountAmount = Math.floor((originalPrice * promoCode.value) / 100)
      adjustedPrice = originalPrice - discountAmount
    }

    // For free_plan type, no price adjustment needed
    // For extra_storage type, handled separately

    const response: PromoCodeResponse = {
      valid: true,
      promoCode: {
        id: promoCode.id,
        code: promoCode.code,
        type: promoCode.type,
        value: promoCode.value,
        plan_target: promoCode.plan_target,
        expires_at: promoCode.expires_at,
        max_uses: promoCode.max_uses,
        uses: promoCode.uses
      },
      discountAmount,
      adjustedPrice
    }

    return new Response(
      JSON.stringify(response),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('Error validating promo code:', error)
    return new Response(
      JSON.stringify({ 
        valid: false, 
        error: 'Internal server error' 
      } as PromoCodeResponse),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})
