import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PaymentMethod } from './payment-methods-interface.enum';
import { transactionType } from './transaction-type.enum';

export class CreateTransactionDto {
  @IsString()
  schoolName: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsString()
  currency: string;

  @IsNumber()
  @Min(1)
  numberOfKids: number;

  @IsEnum(PaymentMethod)
  paymentMethod: string;

  @IsEnum(transactionType)
  transactionType: transactionType;

  @IsString()
  @IsOptional()
  notes: string;
}
