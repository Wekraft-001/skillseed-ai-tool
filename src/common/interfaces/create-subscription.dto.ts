import { Type } from "class-transformer";
import { IsString, IsNotEmpty, IsNumber, ValidateNested, IsOptional } from "class-validator";
import { PaymentMethod } from "./payment-methods-interface.enum";

export class CreateSubscriptionDto {

  @IsNotEmpty()
  @IsNumber()
  amount: number;

  @IsNotEmpty()
  @IsString()
  currency: string;

  @IsOptional()
  @IsString()
  childTempId?: string;

  @IsOptional()
  @IsString()
  redirect_url: string;

  @IsString()
  payment_options: PaymentMethod;

}