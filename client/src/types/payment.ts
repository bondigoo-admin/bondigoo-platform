// Payment-related types and interfaces
export interface PaymentMethod {
  id: string;
  type: string;
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  isDefault: boolean;
  lastUsed?: Date;
}

export interface PaymentIntent {
  id: string;
  clientSecret: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  paymentMethod?: string;
}

export type PaymentStatus = 
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'pending'
  | 'requires_action'
  | 'cancelled';

export interface PaymentError {
  code: string;
  message: string;
  declineCode?: string;
  retriable: boolean;
}

export interface VATCalculation {
  netAmount: number;
  vatAmount: number;
  totalAmount: number;
  vatRate: number;
}