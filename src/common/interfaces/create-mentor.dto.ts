import { IsString, IsNotEmpty, IsEmail, IsOptional, IsArray } from 'class-validator';
import { UserRole } from './user-role.enum';
import { ApiProperty } from '@nestjs/swagger';

export class CreateMentorDto {
  @ApiProperty({ description: 'Mentor first name' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ description: 'Mentor last name' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ description: 'Mentor specialty or profession' })
  @IsString()
  @IsNotEmpty()
  specialty: string;

  @ApiProperty({ description: 'Mentor email address' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'Mentor phone number' })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({ description: 'Mentor city' })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiProperty({ description: 'Mentor country' })
  @IsString()
  @IsNotEmpty()
  country: string;

  @ApiProperty({ description: 'Mentor profile image URL', required: false })
  @IsString()
  @IsOptional()
  image?: string;

  @ApiProperty({ description: 'Mentor biography', required: false })
  @IsString()
  @IsOptional()
  biography?: string;

  @ApiProperty({ description: 'LinkedIn profile URL', required: false })
  @IsString()
  @IsOptional()
  linkedin?: string;

  @ApiProperty({ description: 'Areas of expertise', required: false, type: [String] })
  @IsArray()
  @IsOptional()
  areasOfExpertise?: string[];

  @ApiProperty({ description: 'Languages spoken', required: false, type: [String] })
  @IsArray()
  @IsOptional()
  languages?: string[];

  @ApiProperty({ description: 'Years of experience', required: false })
  @IsString()
  @IsOptional()
  yearsOfExperience?: string;

  @ApiProperty({ description: 'Education information', required: false })
  @IsString()
  @IsOptional()
  education?: string;

  @ApiProperty({ description: 'User role', required: false, enum: UserRole, default: UserRole.MENTOR })
  @IsString()
  @IsOptional()
  role?: UserRole;

  @ApiProperty({ description: 'Generated password (system-generated)', required: false })
  @IsString()
  @IsOptional()
  password?: string;
}
