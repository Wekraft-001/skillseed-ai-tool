import { PaymentMethod } from './payment-methods-interface.enum';
import { transactionType } from './transaction-type.enum';

export interface TransactionResponse {
  id: string;
  schoolName: string;
  amount: number;
  numberOfKids: number;
  paymentMethod: PaymentMethod;
  transactionType: transactionType;
  transactionDate: Date;
  Notes?: string;
  school: string; 
  createdAt: Date;
  updatedAt: Date;
}
