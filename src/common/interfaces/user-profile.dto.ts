import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from './user-role.enum';

export class UserProfileDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty({ enum: UserRole })
  role: UserRole;

  @ApiProperty()
  email: string;

  @ApiProperty()
  age: number;
}
