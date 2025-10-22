import { Type } from 'class-transformer';
import {
  IsNumber,
  IsArray,
  IsOptional,
  IsInt,
  IsString,
  IsNotEmpty,
  ValidateNested,
  IsIn,
} from 'class-validator';

export class AnswerDto {
  @IsInt()
  questionIndex: number;

  @IsInt()
  @IsOptional()
  phaseIndex?: number;

  // Allow string or number answer format
  @IsNotEmpty()
  answer: string | number;
}

// Simplified version for microservice - accepts both formats
export class SubmitAnswersDto {
  @IsString()
  @IsNotEmpty()
  quizId: string;

  // Allow both number[] (for simple answers) and AnswerDto[] (for detailed answers)
  @IsArray()
  answers: number[] | AnswerDto[];

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  sessionId?: string;
}

export class CreateQuizDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['6-8', '9-12', '13-15', '16-18'], { message: 'ageRange must be one of:  6-8, 9-12, 13-15, 16-18' })
  ageRange: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  sessionId?: string;
}