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

// export class AnswerDto {
//   @IsInt()
//   questionIndex: number;

//   @IsString()
//   answers: string;
// }

// export class SubmitAnswersDto {
//   @IsString()
//   @IsNotEmpty()
//   quizId: string;

//   @IsArray()
//   @IsOptional()
//   answers?: AnswerDto[];
// }

export class AnswerDto {
  @IsInt()
  questionIndex: number;

  @IsInt()
  @IsOptional()
  phaseIndex?: number;

  @IsString()
  @IsNotEmpty()
  answer: string;
}

export class SubmitAnswersDto {
  @IsString()
  @IsNotEmpty()
  quizId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers: AnswerDto[];
}

export class CreateQuizDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['6-8', '9-12', '13-15', '16-18'], { message: 'ageRange must be one of:  6-8, 9-12, 13-15, 16-18' })
  ageRange: string;

}
