import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { translateLegacyPlan, logMigrationSummary } from "../shared/authMiddleware.ts"
import { getPlanConfig } from "../shared/plans.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ApplyPromoRequest {
  code: string;
  userId: string;
  productKey?: string;
  originalPrice?: number;
}

interface ApplyPromoResponse {
  success: boolean;
  message: string;
  promoCode?: {
    id: string;
    type: 'percentage' | 'free_plan' | 'extra_storage';
    value: number;
    plan_target?: string;
  };
  discountAmount?: number;
  finalPrice?: number;
  bypassPayment?: boolean;
  error?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { code, userId, productKey, originalPrice }: ApplyPromoRequest = await req.json()

    if (!code || !userId) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Promo code and user ID are required' 
        } as ApplyPromoResponse),
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

    // Start a transaction to ensure atomicity
    const { data: promoCode, error: fetchError } = await supabase
      .from('promo_codes')
      .select('*')
      .eq('code', code.toUpperCase())
      .single()

    if (fetchError || !promoCode) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid promo code' 
        } as ApplyPromoResponse),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404
        }
      )
    }

    // Validate promo code again (double-check)
    if (promoCode.expires_at && new Date(promoCode.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Promo code has expired' 
        } as ApplyPromoResponse),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      )
    }

    if (promoCode.max_uses && promoCode.uses >= promoCode.max_uses) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Promo code has reached maximum uses' 
        } as ApplyPromoResponse),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      )
    }

    // Check if user has already used this promo code
    const { data: existingUsage, error: usageCheckError } = await supabase
      .from('promo_code_usage')
      .select('*')
      .eq('promo_code_id', promoCode.id)
      .eq('user_id', userId)
      .single()

    if (existingUsage) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'You have already used this promo code' 
        } as ApplyPromoResponse),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      )
    }

    // Calculate discount
    let discountAmount = 0
    let finalPrice = originalPrice || 0
    let bypassPayment = false

    if (promoCode.type === 'percentage' && originalPrice) {
      discountAmount = Math.floor((originalPrice * promoCode.value) / 100)
      finalPrice = originalPrice - discountAmount
    } else if (promoCode.type === 'free_plan') {
      bypassPayment = true
      finalPrice = 0
      discountAmount = originalPrice || 0
    } else if (promoCode.type === 'extra_storage') {
      // Extra storage doesn't affect payment, just grants storage
      bypassPayment = false
      discountAmount = 0
    }

    // Atomic operations: update usage count and create usage record
    const { error: updateError } = await supabase.rpc('increment_promo_code_usage', {
      promo_code_id: promoCode.id
    })

    if (updateError) {
      console.error('Error incrementing promo code usage:', updateError)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to apply promo code' 
        } as ApplyPromoResponse),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        }
      )
    }

    // Create usage record
    const { error: usageRecordError } = await supabase
      .from('promo_code_usage')
      .insert({
        promo_code_id: promoCode.id,
        user_id: userId,
        original_price: originalPrice,
        discount_amount: discountAmount,
        final_price: finalPrice,
        product_key: productKey
      })

    if (usageRecordError) {
      console.error('Error creating usage record:', usageRecordError)
      // Rollback the usage increment
      await supabase.rpc('decrement_promo_code_usage', {
        promo_code_id: promoCode.id
      })
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to record promo code usage' 
        } as ApplyPromoResponse),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        }
      )
    }

    // If it's a free plan type, update user's plan directly
    if (promoCode.type === 'free_plan' && promoCode.plan_target) {
      // Translate legacy plan target to canonical ID
      const canonicalPlanId = translateLegacyPlan(promoCode.plan_target, 'apply-promo');
      
      const { error: planUpdateError } = await supabase
        .from('users')
        .update({
          plan_type: canonicalPlanId,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)

      if (planUpdateError) {
        console.error('Error updating user plan:', planUpdateError)
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Failed to grant free plan' 
          } as ApplyPromoResponse),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500
          }
        )
      }

      // If it's extra storage, update storage quota using canonical config
      if (promoCode.type === 'extra_storage') {
        const { data: currentUser } = await supabase
          .from('users')
          .select('plan_type, storage_quota_mb')
          .eq('id', userId)
          .single()

        if (currentUser) {
          // Get base quota from canonical config
          const planConfig = getPlanConfig(currentUser.plan_type) || getPlanConfig('free')!;
          const baseQuotaMb = Math.floor(planConfig.quotaBytes / (1024 * 1024));
          
          // Add extra storage (convert MB from promo code to MB)
          const newQuota = baseQuotaMb + promoCode.value;
          
          await supabase
            .from('users')
            .update({
              storage_quota_mb: newQuota,
              extra_quota: promoCode.value,
              updated_at: new Date().toISOString()
            })
            .eq('id', userId)
        }
      }
    }

    const response: ApplyPromoResponse = {
      success: true,
      message: promoCode.type === 'free_plan' 
        ? 'Free plan granted successfully!' 
        : promoCode.type === 'extra_storage'
        ? 'Extra storage granted successfully!'
        : 'Promo code applied successfully!',
      promoCode: {
        id: promoCode.id,
        type: promoCode.type,
        value: promoCode.value,
        plan_target: promoCode.plan_target
      },
      discountAmount,
      finalPrice,
      bypassPayment
    }

    return new Response(
      JSON.stringify(response),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('Error applying promo code:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Internal server error' 
      } as ApplyPromoResponse),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }

  // Log migration summary periodically (every 5 requests since promo codes are less frequent)
  if (Math.random() < 0.2) {
    logMigrationSummary();
  }
})
