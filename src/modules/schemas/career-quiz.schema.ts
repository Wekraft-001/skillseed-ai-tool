import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';
import { User } from './users/user.schema';

export type CareerQuizDocument = CareerQuiz & Document;

@Schema({ timestamps: true, collection: 'career_quizzes' })
export class CareerQuiz extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId | User;

  @Prop({
    type: [
      {
        text: { type: String, required: true },
        answers: [{ type: String, required: true }],
      },
    ],
    required: true,
  })
  questions: {
    text: string;
    answers: string[];
  }[];

  @Prop({
    type: [String],
    required: true,
  })
  funBreaks: string[];

  @Prop({
    type: [
      {
        questionIndex: { type: Number, required: true },
        answer: { type: String, required: true },
      },
    ],
    default: [],
  })
  userAnswers: { questionIndex: number; answer: string }[];

  @Prop({ type: Object })
  analysis: any;

  @Prop({ type: Array })
  phasesData: any[];

  @Prop({ required: true, index: true })
  ageRange: string;

  @Prop({ default: false, index: true })
  completed: boolean;

  @Prop({ default: false, index: true })
  submitted: boolean;

  @Prop({
    type: [{
      type: Number,
      validate: {
        validator: function(v) {
          return !isNaN(Number(v));
        },
        message: props => `${props.value} is not a valid number!`
      }
    }],
    default: []
  })
  answers: number[];

  @Prop({ type: Date })
  submittedAt: Date;

  @Prop({ type: String })
  sessionId: string;

  @Prop({ type: [String], default: [] })
  careerAreas: string[];
}

export const CareerQuizSchema = SchemaFactory.createForClass(CareerQuiz);