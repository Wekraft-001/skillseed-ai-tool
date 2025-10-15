import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PaymentMethod } from './payment-methods-interface.enum';
import { transactionType } from './transaction-type.enum';

export class RenewSchoolTransactionDto {
  @IsString()
  schoolId: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsString()
  currency: string;

  @IsNumber()
  @Min(1)
  numberOfKids: number;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsEnum(transactionType)
  @IsOptional()
  transactionType?: transactionType;

  @IsString()
  @IsOptional()
  notes?: string;
}
