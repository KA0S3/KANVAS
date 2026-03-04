import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Ticket, Plus, Trash2, Calendar, Users } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";

const promoCodeSchema = z.object({
  code: z.string().min(3, "Code must be at least 3 characters").max(50, "Code must be less than 50 characters"),
  type: z.enum(["percentage", "free_plan", "extra_storage"]),
  value: z.number().min(0, "Value must be positive"),
  plan_target: z.string().optional(),
  expires_at: z.string().optional(),
  max_uses: z.number().min(1, "Max uses must be at least 1").optional(),
});

type PromoCodeType = 'percentage' | 'free_plan' | 'extra_storage';

interface PromoCode {
  id: string;
  code: string;
  type: PromoCodeType;
  value: number;
  plan_target?: string;
  expires_at?: string;
  max_uses?: number;
  uses: number;
  created_at: string;
}

const PromoCodeManager: React.FC = () => {
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof promoCodeSchema>>({
    resolver: zodResolver(promoCodeSchema),
    defaultValues: {
      code: "",
      type: "percentage",
      value: 0,
      plan_target: "",
      expires_at: "",
      max_uses: undefined,
    },
  });

  const fetchPromoCodes = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('promo_codes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching promo codes:', error);
        toast({
          title: "Error",
          description: "Failed to fetch promo codes",
          variant: "destructive",
        });
        return;
      }

      setPromoCodes(data || []);
    } catch (error) {
      console.error('Unexpected error fetching promo codes:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPromoCodes();
  }, []);

  const checkCodeUniqueness = async (code: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('promo_codes')
        .select('id')
        .eq('code', code.toUpperCase())
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is "not found" error
        console.error('Error checking code uniqueness:', error);
        return false;
      }

      return !data; // Return true if no existing code found
    } catch (error) {
      console.error('Unexpected error checking code uniqueness:', error);
      return false;
    }
  };

  const onSubmit = async (values: z.infer<typeof promoCodeSchema>) => {
    setIsSubmitting(true);
    
    try {
      // Check code uniqueness
      const isUnique = await checkCodeUniqueness(values.code);
      if (!isUnique) {
        toast({
          title: "Error",
          description: "Promo code already exists",
          variant: "destructive",
        });
        return;
      }

      const promoCodeData = {
        code: values.code.toUpperCase(),
        type: values.type,
        value: values.value,
        plan_target: values.plan_target || null,
        expires_at: values.expires_at || null,
        max_uses: values.max_uses || null,
      };

      const { error } = await supabase
        .from('promo_codes')
        .insert(promoCodeData);

      if (error) {
        console.error('Error creating promo code:', error);
        toast({
          title: "Error",
          description: "Failed to create promo code",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: "Promo code created successfully",
      });

      setIsCreateDialogOpen(false);
      form.reset();
      fetchPromoCodes();
    } catch (error) {
      console.error('Unexpected error creating promo code:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const deletePromoCode = async (id: string) => {
    try {
      const { error } = await supabase
        .from('promo_codes')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting promo code:', error);
        toast({
          title: "Error",
          description: "Failed to delete promo code",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: "Promo code deleted successfully",
      });

      fetchPromoCodes();
    } catch (error) {
      console.error('Unexpected error deleting promo code:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    }
  };

  const getTypeLabel = (type: PromoCodeType) => {
    switch (type) {
      case 'percentage':
        return '% Discount';
      case 'free_plan':
        return 'Free Plan';
      case 'extra_storage':
        return 'Extra Storage';
      default:
        return type;
    }
  };

  const getTypeBadgeVariant = (type: PromoCodeType) => {
    switch (type) {
      case 'percentage':
        return 'default';
      case 'free_plan':
        return 'secondary';
      case 'extra_storage':
        return 'outline';
      default:
        return 'secondary';
    }
  };

  const isExpired = (expiresAt?: string) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  const isMaxedOut = (maxUses?: number, uses?: number) => {
    if (!maxUses) return false;
    return uses >= maxUses;
  };

  const getStatusBadge = (code: PromoCode) => {
    if (isExpired(code.expires_at)) {
      return <Badge variant="destructive">Expired</Badge>;
    }
    if (isMaxedOut(code.max_uses, code.uses)) {
      return <Badge variant="secondary">Maxed Out</Badge>;
    }
    return <Badge variant="default">Active</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ticket className="h-5 w-5" />
            Promo Code Manager
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Promo Code
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create New Promo Code</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Promo Code</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Enter promo code" 
                            {...field}
                            onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select promo code type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="percentage">% Discount</SelectItem>
                            <SelectItem value="free_plan">Free Lifetime</SelectItem>
                            <SelectItem value="extra_storage">Extra Storage</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="value"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {form.watch("type") === "percentage" ? "Discount Percentage" : 
                           form.watch("type") === "extra_storage" ? "Storage (MB)" : 
                           "Value"}
                        </FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder={form.watch("type") === "percentage" ? "e.g., 25 for 25%" : 
                                       form.watch("type") === "extra_storage" ? "e.g., 1024" : 
                                       "0"}
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {form.watch("type") === "free_plan" && (
                    <FormField
                      control={form.control}
                      name="plan_target"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Plan Target</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select plan" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="free">Free Plan</SelectItem>
                              <SelectItem value="basic">Basic Plan</SelectItem>
                              <SelectItem value="premium">Premium Plan</SelectItem>
                              <SelectItem value="enterprise">Enterprise Plan</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <FormField
                    control={form.control}
                    name="expires_at"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Expiration Date (Optional)</FormLabel>
                        <FormControl>
                          <Input 
                            type="datetime-local" 
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="max_uses"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Usage Limit (Optional)</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder="Leave empty for unlimited"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end space-x-2">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setIsCreateDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting ? "Creating..." : "Create Promo Code"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-sm text-muted-foreground">Loading promo codes...</div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Plan Target</TableHead>
                <TableHead>Usage</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {promoCodes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <div className="text-sm text-muted-foreground">
                      No promo codes found. Create your first promo code to get started.
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                promoCodes.map((promoCode) => (
                  <TableRow key={promoCode.id}>
                    <TableCell className="font-mono font-medium">{promoCode.code}</TableCell>
                    <TableCell>
                      <Badge variant={getTypeBadgeVariant(promoCode.type)}>
                        {getTypeLabel(promoCode.type)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {promoCode.type === 'percentage' ? `${promoCode.value}%` : 
                       promoCode.type === 'extra_storage' ? `${promoCode.value} MB` : 
                       promoCode.value}
                    </TableCell>
                    <TableCell>{promoCode.plan_target || '-'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        <span>{promoCode.uses}</span>
                        {promoCode.max_uses && <span className="text-muted-foreground">/ {promoCode.max_uses}</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {promoCode.expires_at ? (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          <span className={isExpired(promoCode.expires_at) ? "text-destructive" : ""}>
                            {new Date(promoCode.expires_at).toLocaleDateString()}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Never</span>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(promoCode)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deletePromoCode(promoCode.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

export default PromoCodeManager;
