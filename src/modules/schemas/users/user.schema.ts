import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { UserRole } from 'src/common/interfaces';

export type UserDocument = User &
  Document & {
    // _id: Types.ObjectId;
    school: Types.ObjectId;
    createdBy: Types.ObjectId;
  };

@Schema({ timestamps: true, collection: 'users', autoIndex: true })
export class User extends Document {
  @Prop({ required: true, index: true })
  firstName: string;

  @Prop({ required: true, index: true })
  lastName: string;

  @Prop({
    type: String,
    enum: UserRole,
    default: UserRole.STUDENT,
    index: true,
  })
  role: UserRole;

  @Prop({ required: false, index: true })
  image?: string;

  @Prop({ required: false, index: true })
  grade?: string;

  @Prop({ required: false, index: true })
  age: number;

  @Prop({
    sparse: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  email: string;

  @Prop({
    required: function () {
      return !this.isOAuth;
    },
    minlength: 6,
  })
  password: string;

  @Prop({ required: false, select: false })
  plainPassword: string;

  @Prop({ default: false })
  isOAuth: boolean;

  @Prop({ default: null })
  deletedAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'School', index: true, default: null })
  school: Types.ObjectId;

  @Prop()
  phoneNumber: number;

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  createdBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'CareerQuiz', index: true })
  quizzes?: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'Badge', index: true })
  badges: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'EducationalContent', index: true })
  educationalContents: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'ProjectShowCase', index: true })
  showcases: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'Subscription', index: true })
  subscription?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'CareerQuiz', index: true })
  initialQuizId?: Types.ObjectId;

  @Prop({
    required: false,
    lowercase: true,
    trim: true,
    index: true,
  })
  parentEmail?: string;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.virtual('userQuizzes', {
  ref: 'CareerQuiz',
  localField: '_id',
  foreignField: 'user',
});

UserSchema.virtual('userBadges', {
  ref: 'Badge',
  localField: '_id',
  foreignField: 'user',
});

UserSchema.virtual('userEducationalContents', {
  ref: 'EducationalContent',
  localField: '_id',
  foreignField: 'user',
});

UserSchema.virtual('userShowcases', {
  ref: 'ProjectShowcase',
  localField: '_id',
  foreignField: 'user',
});

UserSchema.set('toJSON', { virtuals: true });
UserSchema.set('toObject', { virtuals: true });
