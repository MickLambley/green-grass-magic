import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const PaymentSuccess = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  useEffect(() => {
    // Optional: You could verify the payment status here using the payment_intent from URL
    const paymentIntent = searchParams.get("payment_intent");
    if (paymentIntent) {
      console.log("Payment completed:", paymentIntent);
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-6 p-8">
        <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mx-auto">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Payment Successful!</h1>
          <p className="text-muted-foreground max-w-md">
            Your booking has been confirmed. A contractor will be assigned to your job soon.
            You'll receive a confirmation email shortly.
          </p>
        </div>
        <Button onClick={() => navigate("/dashboard")} size="lg">
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
};

export default PaymentSuccess;
