import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  IsEmail,
  ValidateNested,
  IsOptional,
} from 'class-validator';

export class CardDetails {
  @IsNotEmpty()
  @IsString()
  card_number: string;

  @IsNotEmpty()
  @IsString()
  expiry_month: string;

  @IsNotEmpty()
  @IsString()
  expiry_year: string;

  @IsNotEmpty()
  @IsString()
  cvv: string;
  
}

export class CustomerNameDto {
  @IsNotEmpty()
  @IsString()
  firstName: string;

  @IsOptional()
  @IsString()
  middleName?: string;

  @IsNotEmpty()
  @IsString()
  lastName: string;
}

export class CustomerPhoneDto {
  @IsNotEmpty()
  @IsString()
  country_code: string;

  @IsNotEmpty()
  @IsString()
  number: string;
}

export class CustomerAddressDto {
  @IsNotEmpty()
  @IsString()
  city: string;

  @IsNotEmpty()
  @IsString()
  country: string;

  @IsNotEmpty()
  @IsString()
  line1: string;

  @IsOptional()
  @IsString()
  line2?: string;

  @IsNotEmpty()
  @IsString()
  postal_code: string;

  @IsNotEmpty()
  @IsString()
  state: string;
}

export class CustomerDataDto {
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsString()
  name: string;

  @IsString()
  currenty: string;

 @IsString()
  phoneNumber: CustomerPhoneDto;

  // @ValidateNested()
  // @Type(() => CustomerAddressDto)
  // address: CustomerAddressDto;
}


export interface CardPaymentRequest {
  amount: number;
  currency: string;
  customer: CustomerDataDto;
  card: CardDetails;
  reference: string;
  redirect_url: string;
  // meta?: any;
}

export interface FlutterwaveCustomer {
  id: string;
  email: string;
  name: {
    first: string;
    middle?: string;
    last: string;
  };
}

export interface FlutterwavePaymentMethod {
  id: string;
  type: string;
  card: {
    last_four: string;
    brand: string;
    expiry_month: string;
    expiry_year: string;
  };
}
export interface FlutterwavePaymentInitiationResponse {
  status: string;
  message: string;
  data: {
    link: string;
    tx_ref: string;
  };
}


export interface FlutterwaveCharge {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  status: string;
  customer_id: string;
  payment_method_id: string;
  redirect_url?: string;
  authorization_url?: string;
  meta?: any;
}
