import { IsEnum, IsNumber, IsOptional, IsString, Min } from "class-validator";
import { PaymentMethod } from "./payment-methods-interface.enum";
import { transactionType } from "./transaction-type.enum";

export class CreateParentTransactionDto {
    @IsString()
    parentId: string;

    @IsString()
    studentId: string;

    @IsNumber()
    @Min(0)
    amount: number;

    @IsEnum(PaymentMethod)
    paymentMethod: PaymentMethod;

    @IsEnum(transactionType)
    transactionType: transactionType;

    @IsString()
    @IsOptional()
    notes: string;
}
