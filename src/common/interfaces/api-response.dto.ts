import { ApiProperty } from "@nestjs/swagger";

export class ApiResponseDto<T = any> {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  message: string;

  @ApiProperty()
  timestamp: string;

  @ApiProperty({ type: Object })
  data: T;

  @ApiProperty()
  userId: number;
}