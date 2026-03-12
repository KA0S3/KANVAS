import React from 'react';
import { ArrowLeft, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';

const PrivacyPolicy = () => {
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
              <Shield className="w-8 h-8 text-primary" />
              <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                KANVAS Privacy Policy
              </h1>
            </div>
            <p className="text-muted-foreground">Effective Date: March 2026</p>
          </div>
        </div>

        {/* Privacy Policy Content */}
        <Card className="glass cosmic-glow border-glass-border/40">
          <CardContent className="p-8 space-y-8">
            {/* Introduction */}
            <section className="space-y-4">
              <p className="text-muted-foreground leading-relaxed">
                This Privacy Policy describes how KANVAS collects, uses, and protects your information. 
                By using our Service, you consent to the data practices described in this policy.
              </p>
            </section>

            {/* Section 1 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">1. Information Collection</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                We collect several types of information to provide and improve our Service:
              </p>
              
              <div className="space-y-3 ml-4">
                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-foreground">Personal Identification:</h3>
                  <p className="text-muted-foreground">
                    Name, email address, and account registration details.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-foreground">Financial Information:</h3>
                  <p className="text-muted-foreground">
                    Payment details are collected directly by Paystack. We do not store your full credit card information on our servers.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-foreground">Usage Data:</h3>
                  <p className="text-muted-foreground">
                    We collect information on how you interact with the Service, including session duration, device type, IP address, and browser type.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-foreground">Creative Data:</h3>
                  <p className="text-muted-foreground">
                    The novels and world-building data you input are stored on our secure cloud servers.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 2 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">2. How We Use Your Information</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Your data is used to:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li>Operate and maintain the KANVAS platform.</li>
                <li>Process your payments and manage your subscriptions via Paystack.</li>
                <li>Improve app functionality and develop new visual tracking features.</li>
                <li>Serve advertisements to users on the Free Tier. These ads may be personalized based on your usage patterns.</li>
                <li>Provide customer support and respond to your requests.</li>
              </ul>
            </section>

            {/* Section 3 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">3. Data Sharing and Third-Party Disclosure</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                We do not sell your personal information. We share data only with:
              </p>
              <div className="space-y-3 ml-4">
                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-foreground">Service Providers:</h3>
                  <p className="text-muted-foreground">
                    Companies like Paystack that assist in payment processing.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-foreground">Advertising Partners:</h3>
                  <p className="text-muted-foreground">
                    We use third-party ad networks (e.g., Google AdSense) that may use cookies to serve ads based on your visits to this and other sites.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-foreground">Legal Compliance:</h3>
                  <p className="text-muted-foreground">
                    If required by law, we may disclose your information to comply with legal obligations or protect our rights.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 4 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">4. Data Security and Storage</h2>
              <p className="text-muted-foreground leading-relaxed">
                We implement industry-standard security measures, including encryption and secure socket layer (SSL) technology, 
                to protect your data. Some data may be stored locally on your device to support the Service's offline mode. 
                While we take significant steps to protect your data, no method of electronic storage is 100% secure.
              </p>
            </section>

            {/* Section 5 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">5. Your Rights and Choices</h2>
              <div className="space-y-3 ml-4">
                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-foreground">Access and Deletion:</h3>
                  <p className="text-muted-foreground">
                    You have the right to access, update, or request the deletion of your personal information.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-foreground">Opt-Out:</h3>
                  <p className="text-muted-foreground">
                    You can opt out of personalized advertising by visiting the Google ad settings or using "Do Not Track" browser features.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-foreground">Cookies:</h3>
                  <p className="text-muted-foreground">
                    You can choose to disable cookies in your browser, though this may affect your ability to use certain features of the Service.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 6 */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">6. Children's Privacy</h2>
              <p className="text-muted-foreground leading-relaxed">
                KANVAS is not intended for use by children under the age of 13. We do not knowingly collect information from children. 
                If we become aware of such data collection, we will delete it immediately.
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

export default PrivacyPolicy;
