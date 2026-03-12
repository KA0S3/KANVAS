import React from 'react';
import { ArrowLeft, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';

const TermsOfService = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background/95 to-background/90 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate(-1)}
            className="mb-4 glass cosmic-glow border-glass-border/40 hover:bg-glass/20"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2">
              <FileText className="w-8 h-8 text-primary" />
              <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                KANVAS Terms of Service
              </h1>
            </div>
            <p className="text-muted-foreground">Last Updated: March 2026</p>
          </div>
        </div>

        {/* Terms Content */}
        <Card className="glass cosmic-glow border-glass-border/40">
          <CardContent className="p-8 space-y-8">
            {/* Section 1 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">1. Acceptance of Terms</h2>
              <p className="text-muted-foreground leading-relaxed">
                By accessing or using the KANVAS webapp (the "Service"), you agree to be bound by these Terms of Service, 
                all applicable laws, and our Privacy Policy. This Agreement constitutes a legally binding contract 
                between you and KANVAS ("Company," "We," "Us"). If you do not agree with any of these terms, 
                you are prohibited from using or accessing this site.
              </p>
            </section>

            {/* Section 2 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">2. User Accounts and Eligibility</h2>
              <p className="text-muted-foreground leading-relaxed">
                To utilize the Service, you must create a user account. You agree to provide accurate, complete, 
                and current information. You are solely responsible for the security of your account and passwords. 
                Access to the Service is restricted to individuals at least 18 years of age. Users under 18 must 
                have express permission from a parent or legal guardian.
              </p>
            </section>

            {/* Section 3 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">3. Subscription and Payment Terms</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                KANVAS employs a hybrid pricing model involving one-time fees, pay-as-you-go (PAYG) charges, 
                and ad-supported free access.
              </p>
              
              <div className="space-y-3 ml-4">
                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-foreground">One-Time Fee:</h3>
                  <p className="text-muted-foreground">
                    A non-refundable fee of $80.00 provides permanent access to the core visual tracking system. 
                    This is a one-time transaction and does not constitute a recurring subscription.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-foreground">PAYG Monthly Fee:</h3>
                  <p className="text-muted-foreground">
                    A $5.00 monthly fee is charged based on usage levels and advanced feature access. 
                    This fee is billed in advance on a recurring 30-day cycle.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-foreground">Payment Processing:</h3>
                  <p className="text-muted-foreground">
                    All payments are processed by Paystack. By initiating a transaction, you authorize Paystack 
                    to charge your provided payment method.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-foreground">Failed Payments:</h3>
                  <p className="text-muted-foreground">
                    We reserve the right to suspend access to premium features if a payment method is declined 
                    or if a PAYG balance remains unpaid.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 4 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">4. Intellectual Property and Content Ownership</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                <strong>User Content:</strong> You retain all copyright and proprietary rights to the novels, 
                data, and creative works you upload to the Service ("User Content"). We do not claim ownership 
                of your intellectual property.
              </p>
              <p className="text-muted-foreground leading-relaxed mb-4">
                <strong>License to Company:</strong> By uploading User Content, you grant KANVAS a limited, 
                worldwide, non-exclusive, royalty-free license to store, host, and display your content 
                solely for the purpose of providing the Service to you.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                <strong>Service Technology:</strong> All software, visual tracking algorithms, UI designs, 
                and logos are the exclusive property of KANVAS. You may not decompile, reverse engineer, 
                or attempt to extract the source code of the Service.
              </p>
            </section>

            {/* Section 5 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">5. Prohibited Conduct</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                You agree not to use the Service in any way that:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li>Violates any local, state, or international law or regulation.</li>
                <li>Infringes on the intellectual property of others.</li>
                <li>Involves fraudulent, deceptive, or unfair activities as defined by the Paystack Acceptable Use Policy.</li>
                <li>Distributes viruses, malware, or any other harmful code.</li>
                <li>Interferes with the performance or availability of the Service.</li>
              </ul>
            </section>

            {/* Section 6 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">6. Disclaimer of Warranties</h2>
              <p className="text-muted-foreground leading-relaxed">
                The Service is provided "as is." KANVAS makes no warranties, expressed or implied, regarding the 
                reliability, accuracy, or availability of the Service. We are not liable for any data loss, 
                corruption, or damage that may occur during the use of our visual tracking system.
              </p>
            </section>

            {/* Section 7 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">7. Limitation of Liability</h2>
              <p className="text-muted-foreground leading-relaxed">
                In no event shall KANVAS or its suppliers be liable for any damages (including, without limitation, 
                damages for loss of data or profit, or due to business interruption) arising out of the use or 
                inability to use the Service. Our total liability shall not exceed the total fees paid by you 
                to the Company in the preceding six months.
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
  );
};

export default TermsOfService;
