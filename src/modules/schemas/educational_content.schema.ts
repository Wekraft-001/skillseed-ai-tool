import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from './users/user.schema';

export type EducationalContentDocument = EducationalContent & Document;

@Schema({ timestamps: true })
export class EducationalContent {
  @Prop({
    type: [{ title: String, url: String, description: String, duration: String, tag: String }],
    default: [],
    index: true
  })
  videos: { title: string; url: string; description: string; duration: string; tag: string }[];
  
  // For backward compatibility
  @Prop({
    type: [{ title: String, url: String, description: String, duration: String, tag: String }],
    default: [],
    index: true
  })
  videoUrl: { title: string; url: string; description: string; duration: string; tag: string }[];

  @Prop({
    type: [
      {
        title: String,
        author: String,
        level: String,
        theme: String,
        url: String,
      },
    ],
    default: [],
    index: true
  })
  books: Array<{
    title: string;
    author: string;
    level: string;
    theme: string;
    url: string;
  }>;

  @Prop({
    type: [
      {
        name: String,
        url: String,
        skill: String,
        description: String,
      },
    ],
    default: [],
    index: true
  })
  games: Array<{
    name: string;
    url: string;
    skill: string;
    description: string;
  }>;
  
  @Prop({
    type: [
      {
        title: String,
        resourceType: String,
        description: String,
        skillLevel: String,
        estimatedTimeToComplete: String,
        url: String,
      },
    ],
    default: [],
    index: true
  })
  resources: Array<{
    title: string;
    resourceType: string;
    description: string;
    skillLevel: string;
    estimatedTimeToComplete: string;
    url: string;
  }>;

  @Prop({ enum: ['video', 'book', 'game', 'resource'], required: false, index: true })
  contentType?: 'video' | 'book' | 'game' | 'resource';

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  user: Types.ObjectId | User;
  
  @Prop({ type: String, required: false, index: true })
  sessionId: string;
  
  @Prop({ type: Object, required: false })
  analysis: Record<string, any>;
}

export const EducationalContentSchema =
  SchemaFactory.createForClass(EducationalContent);
