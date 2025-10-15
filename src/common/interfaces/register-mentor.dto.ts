import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterMentorDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsString()
  specialty: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  phoneNumber: string;

  @IsString()
  city: string;

  @IsString()
  country: string;

  @IsOptional()
  @IsString()
  biography?: string;

  @IsOptional()
  @IsString()
  linkedin?: string;
}


