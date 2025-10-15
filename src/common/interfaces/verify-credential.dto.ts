import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class VerifyCredentialDto {
  @IsNotEmpty()
  @IsEnum(['approved', 'rejected'])
  status: 'approved' | 'rejected';

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
