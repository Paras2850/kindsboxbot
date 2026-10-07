import { RazorpayProvider } from "@/lib/payments/razorpay";
import type { PaymentProvider } from "@/lib/payments/types";

let provider: PaymentProvider | null = null;

/** Returns the currently configured payment gateway provider. */
export function getPaymentProvider(): PaymentProvider {
  if (!provider) {
    provider = new RazorpayProvider();
  }
  return provider;
}

export * from "@/lib/payments/types";
