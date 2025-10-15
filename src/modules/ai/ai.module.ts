import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { YouTubeService } from './youtube.service';
import { LoggerModule } from '../../common/logger/logger.module';
import { CareerQuiz, CareerQuizSchema } from '../schemas/career-quiz.schema';
import {
  EducationalContent,
  EducationalContentSchema,
  User,
  UserSchema,
} from '../schemas';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    HttpModule,
    MongooseModule.forFeature([
      { name: CareerQuiz.name, schema: CareerQuizSchema },
      { name: EducationalContent.name, schema: EducationalContentSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [AiController],
  providers: [AiService, YouTubeService],
  exports: [AiService, YouTubeService],
})
export class AiModule {}