import { IsNotEmpty, IsString } from 'class-validator';

export class UploadMentorCredentialsDto {
  @IsString()
  @IsNotEmpty()
  credentialType: 'government_id' | 'professional_credentials';

  @IsString()
  @IsNotEmpty()
  description: string;
}
