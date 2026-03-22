import React from 'react';
import { ArrowLeft, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';

const RefundPolicy = () => {
  const navigate = useNavigate();

  const handleBack = () => {
    navigate(-1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background/95 to-background/90 p-4">
      <div className="max-w-4xl mx-auto h-screen flex flex-col">
        {/* Header */}
        <div className="mb-6 flex-shrink-0">
          <Button
            variant="ghost"
            onClick={handleBack}
            className="mb-4 glass cosmic-glow border-glass-border/40 hover:bg-glass/20"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2">
              <DollarSign className="w-8 h-8 text-primary" />
              <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                KANVAS Refund and Cancellation Policy
              </h1>
            </div>
            <p className="text-muted-foreground">Effective Date: March 2026</p>
          </div>
        </div>

        {/* Refund Policy Content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-glass-border/40 scrollbar-track-transparent hover:scrollbar-thumb-glass-border/60">
          <Card className="glass cosmic-glow border-glass-border/40">
            <CardContent className="p-8 space-y-8">
            {/* Section 1 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">1. The Nature of Digital Purchases</h2>
              <p className="text-muted-foreground leading-relaxed">
                Digital products, such as the KANVAS $80 one-time access and $5 PAYG fees, are considered "delivered" 
                immediately upon purchase or activation. Because digital items cannot be "returned" in the traditional sense, 
                we operate a strict No-Refund Policy for most transactions.
              </p>
            </section>

            {/* Section 2 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">2. Refund Eligibility and Exceptions</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Refunds are generally not provided for "change of mind," "mistaken purchase," or "lack of technical knowledge". 
                However, we may issue a refund in the following limited cases:
              </p>
              
              <div className="space-y-3 ml-4">
                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-foreground">Defective Service:</h3>
                  <p className="text-muted-foreground">
                    If a technical error prevents access to the Service and our support team cannot resolve it within 14 business days.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-foreground">Duplicate Charge:</h3>
                  <p className="text-muted-foreground">
                    If you are accidentally charged twice for the same transaction due to a processing error.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-foreground">Misrepresentation:</h3>
                  <p className="text-muted-foreground">
                    If the Service fails to provide the features explicitly advertised on our website.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 3 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">3. Subscription Cancellations</h2>
              
              <div className="space-y-3 ml-4">
                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-foreground">PAYG Plan:</h3>
                  <p className="text-muted-foreground">
                    Pay as you go plan is limited to the month you use it. To cancel the service simply stop paying. 
                    Service will continue working for 30 days after the previous payment.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-foreground">Effect of Cancellation:</h3>
                  <p className="text-muted-foreground">
                    Cancellation does not entitle you to a refund of previously paid fees. All past payments are non-refundable.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 4 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">4. Refund Request Procedure</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                To request a refund exception, you must:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li>Contact <a href="mailto:shadek392@gmail.com" className="text-primary hover:underline">shadek392@gmail.com</a> within 7 days of the transaction.</li>
                <li>Provide your transaction reference number and the email address associated with your Paystack account.</li>
                <li>Detail the specific reason for the refund request, including screenshots of any technical errors.</li>
              </ul>
              
              <p className="text-muted-foreground leading-relaxed mt-4">
                Approved refunds will be processed via Paystack back to the original payment method within 10 business days. 
                Note that transaction fees are non-refundable as they represent a service already rendered by the payment processor.
              </p>
            </section>

            {/* Footer */}
            <div className="pt-6 border-t border-glass-border/30">
              <p className="text-sm text-muted-foreground text-center">
                © 2026 KANVAS. All Rights Reserved.
              </p>
            </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default RefundPolicy;
