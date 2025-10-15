import { IsString, IsNotEmpty, IsEmail, IsOptional } from 'class-validator';
import { UserRole } from './user-role.enum';

export class CreateSchoolDto {
  @IsString()
  @IsNotEmpty()
  schoolName: string;

  @IsString()
  @IsNotEmpty()
  schoolType: string;

  @IsString()
  @IsNotEmpty()
  schoolContactPerson: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @IsNotEmpty()
  country: string;

  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @IsString()
  @IsOptional()
  logoUrl?: string;

  @IsString()
  @IsOptional()
  role?: UserRole;

  @IsString()
  @IsOptional()
  password?: string;
}
