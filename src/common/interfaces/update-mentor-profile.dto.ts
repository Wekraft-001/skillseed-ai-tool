import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEmail, IsOptional, IsString } from 'class-validator';

export class UpdateMentorProfileDto {
  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  biography?: string;

  @IsString()
  @IsOptional()
  linkedin?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  specialty?: string;

  @ApiProperty({
    required: false,
    type: [String],
    description: 'Areas of expertise',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  areasOfExpertise?: string[];

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  yearsOfExperience?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  education?: string;

  @ApiProperty({
    required: false,
    type: [String],
    description: 'Languages spoken',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  languages?: string[];
}
