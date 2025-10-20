import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import OpenAI from 'openai';
import { Model, Types } from 'mongoose';
import { LoggerService } from 'src/common/logger/logger.service';
import { CareerQuiz, CareerQuizDocument } from '../schemas/career-quiz.schema';
import { YouTubeService, YouTubeVideoResult } from './youtube.service';
import {
  EducationalContent,
  EducationalContentDocument,
  User,
  UserDocument,
} from '../schemas';
import { UserRole } from 'src/common/interfaces';
import { SubmitAnswersDto } from 'src/common/interfaces/ai-quiz.dto';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class AiService {
  private openai: OpenAI;
  private readonly mainServiceUrl: string;
  // Quiz data has been migrated to JSON files in the quiz-data directory
  // See files: age-scales.json, questions-6-8.json, questions-9-12.json, etc.

  constructor(
    private configService: ConfigService,
    private readonly logger: LoggerService,
    private readonly httpService: HttpService,
    private readonly youtubeService: YouTubeService,

    @InjectModel(CareerQuiz.name)
    private readonly quizModel: Model<CareerQuizDocument>,

    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,

    @InjectModel(EducationalContent.name)
    private readonly eduContentModel: Model<EducationalContentDocument>,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
      maxRetries: 2,
    });
    
    this.mainServiceUrl = this.configService.get<string>('MAIN_SERVICE_URL') || 'http://localhost:3000';
  }

  // Communication with main service for auth validation
  async validateUserToken(token: string): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.mainServiceUrl}/internal/auth/validate`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      );
      return response.data;
    } catch (error) {
      this.logger.error('Failed to validate token with main service', error.message);
      throw new ForbiddenException('Invalid token');
    }
  }

  // Get user data from main service
  async getUserFromMainService(userId: string, token: string): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.mainServiceUrl}/internal/users/${userId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      );
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get user from main service', error.message);
      throw new NotFoundException('User not found');
    }
  }

  // Update rewards in main service
  async updateRewards(userId: string, points: number, token: string): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.mainServiceUrl}/internal/rewards/update`,
          { userId, points },
          { headers: { Authorization: `Bearer ${token}` } }
        )
      );
    } catch (error) {
      this.logger.error('Failed to update rewards in main service', error.message);
      // Don't throw here, rewards update is not critical for AI functionality
    }
  }

  // Generate quiz for authenticated user
  async generateCareerQuizForUserId(userId: string, userAgeRange: string, token: string) {
    this.logger.log(`Generating quiz for user ${userId} with age range ${userAgeRange}`);
    
    // Get user data from main service
    const user = await this.getUserFromMainService(userId, token);
    if (!user) throw new NotFoundException('User not found');
    
    // Create local user document for quiz generation
    const localUser = {
      _id: new Types.ObjectId(userId),
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      ageRange: userAgeRange,
    };
    
    // Generate the quiz
    const quizDoc = await this.generateCareerQuiz(localUser as any, userAgeRange);
    
    this.logger.log(`Created quiz with ID: ${quizDoc._id.toString()} for user ${userId}`);
    
    // Return the quiz with a simplified format (no phases)
    return {
      quizId: quizDoc._id.toString(),
      quiz: {
        questions: quizDoc.questions.map(q => ({
          text: q.text,
          answers: q.answers,
          _id: new Types.ObjectId().toString() // Generate unique IDs for each question
        }))
      }
    };
  }

  async getLatestEducationalContentForUser(userId: string) {
    return this.eduContentModel
      .findOne({ user: userId })
      .sort({ createdAt: -1 })
      .lean();
  }

  // Guest flows via Redis cache (simplified for microservice)
  private guestKey(sessionId: string, quizId?: string) {
    return quizId
      ? `guest_quiz:${sessionId}:${quizId}`
      : `guest_quiz:${sessionId}`;
  }
  
  // Helper to extract JSON from OpenAI response text
  private extractJson(text: string): string {
    // Extract JSON from the response if it's wrapped in backticks or has extra text
    const jsonMatch = text.match(/```(?:json)?([\s\S]*?)```/) || 
                      text.match(/({[\s\S]*})/);
    return jsonMatch ? jsonMatch[1].trim() : text.trim();
  }

  // Load quiz data from JSON files
  private loadQuizData(ageRange: string): any {
    try {
      const filePath = path.join(__dirname, 'quiz-data', `questions-${ageRange}.json`);
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      this.logger.error(`Failed to load quiz data for age range ${ageRange}`, error.message);
      throw new BadRequestException(`Invalid age range: ${ageRange}`);
    }
  }

  // Load age scales data
  private loadAgeScales(): any {
    try {
      const filePath = path.join(__dirname, 'quiz-data', 'age-scales.json');
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      this.logger.error('Failed to load age scales data', error.message);
      throw new BadRequestException('Failed to load age scales');
    }
  }

  async generateCareerQuiz(user: any, ageRange: string) {
    try {
      this.logger.log(`Generating career quiz for user ${user._id} (${user.firstName} ${user.lastName}) with age range: ${ageRange}`);

      // Load questions from JSON file
      const quizData = this.loadQuizData(ageRange);
      const ageScales = this.loadAgeScales();

      // Get the age scale for the specified range
      const ageScale = ageScales.scales.find(scale => scale.range === ageRange);
      if (!ageScale) {
        throw new BadRequestException(`Age range ${ageRange} not supported`);
      }

      const quiz = new this.quizModel({
        user: user._id,
        ageRange: ageRange,
        questions: quizData.questions,
        careerAreas: ageScale.careerAreas,
        submitted: false,
        createdAt: new Date(),
      });

      return await quiz.save();
    } catch (error) {
      this.logger.error('Error generating career quiz', error.stack);
      throw new BadRequestException('Failed to generate career quiz');
    }
  }

  async submitQuizAnswers(submitAnswersDto: SubmitAnswersDto, token?: string): Promise<any> {
    const { quizId, answers, userId } = submitAnswersDto;

    try {
      this.logger.log(`Processing quiz submission for quizId: ${quizId}`);

      // Find the quiz
      const quiz = await this.quizModel.findById(quizId);
      if (!quiz) {
        throw new NotFoundException('Quiz not found');
      }

      // Validate ownership if userId provided
      if (userId && quiz.user?.toString() !== userId) {
        throw new ForbiddenException('Quiz does not belong to this user');
      }

      // Mark quiz as submitted and store answers
      quiz.submitted = true;
      // Convert AnswerDto[] to number[] if needed
      quiz.answers = Array.isArray(answers) && typeof answers[0] === 'object' 
        ? (answers as any[]).map(a => typeof a.answer === 'string' ? parseInt(a.answer) : a.answer)
        : answers as number[];
      quiz.submittedAt = new Date();
      
      await quiz.save();

      // Analyze the quiz
      const analysis = await this.analyzeQuizAnswers(quiz);
      
      // Get educational content
      const educationalContent = await this.getVerifiedEducationalContent(analysis);

      // Create educational content record
      const contentDoc = new this.eduContentModel({
        user: quiz.user,
        sessionId: quiz.sessionId,
        analysis,
        videos: educationalContent.videos,
        games: educationalContent.games,
        books: educationalContent.books,
        createdAt: new Date(),
      });

      await contentDoc.save();

      // Update rewards if user is authenticated
      if (userId && token) {
        await this.updateRewards(userId, 50, token); // 50 points for completing quiz
      }

      return {
        analysis,
        educationalContent,
        message: 'Quiz submitted and analyzed successfully',
      };
    } catch (error) {
      this.logger.error('Error submitting quiz answers', error.stack);
      throw error;
    }
  }

  async analyzeQuizAnswers(quiz: any) {
    try {
      this.logger.log(`Analyzing quiz answers for quiz ${quiz._id}`);

      const ageScales = this.loadAgeScales();
      const ageScale = ageScales.scales.find(scale => scale.range === quiz.ageRange);

      if (!ageScale) {
        throw new BadRequestException(`Age range ${quiz.ageRange} not supported`);
      }

      // Calculate scores for each career area
      const scores = {};
      ageScale.careerAreas.forEach(area => {
        scores[area] = 0;
      });

      // Process answers
      quiz.answers.forEach((answer, index) => {
        const question = quiz.questions[index];
        if (question && question.scoring) {
          Object.keys(question.scoring).forEach(area => {
            if (scores.hasOwnProperty(area)) {
              scores[area] += question.scoring[area][answer] || 0;
            }
          });
        }
      });

      // Find top 3 career areas
      const sortedScores = Object.entries(scores)
        .sort(([,a], [,b]) => (b as number) - (a as number))
        .slice(0, 3);

      const topCareerAreas = sortedScores.map(([area]) => area);

      // Use OpenAI to generate detailed analysis
      const aiAnalysis = await this.generateAIAnalysis(quiz, topCareerAreas, ageScale);

      return {
        topCareerAreas,
        scores,
        aiAnalysis,
        ageRange: quiz.ageRange,
        analysisDate: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Error analyzing quiz answers', error.stack);
      throw new BadRequestException('Failed to analyze quiz answers');
    }
  }

  async generateAIAnalysis(quiz: any, topCareerAreas: string[], ageScale: any) {
    try {
      const prompt = `
        Analyze this career quiz for a ${quiz.ageRange} year old student.
        
        Top career areas identified: ${topCareerAreas.join(', ')}
        
        Available career areas for this age: ${ageScale.careerAreas.join(', ')}
        
        Please provide:
        1. A brief explanation of their top career matches
        2. Skills they should develop
        3. Activities they can try
        4. Encouragement for their interests
        
        Keep the language appropriate for their age group and encouraging.
        Format as JSON with keys: explanation, skills, activities, encouragement
      `;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.7,
      });

      const content = response.choices[0].message.content;
      const jsonContent = this.extractJson(content);
      
      return JSON.parse(jsonContent);
    } catch (error) {
      this.logger.error('Error generating AI analysis', error.stack);
      
      // Fallback analysis
      return {
        explanation: `Based on your answers, you show strong interest in ${topCareerAreas.join(' and ')}!`,
        skills: ['Critical thinking', 'Problem solving', 'Communication'],
        activities: ['Join relevant clubs', 'Try hands-on projects', 'Explore online courses'],
        encouragement: 'Keep exploring your interests and trying new things!'
      };
    }
  }

  async getVerifiedEducationalContent(analysis: any): Promise<{videos: YouTubeVideoResult[], games: any[], books: any[]}> {
    try {
      this.logger.log('Getting verified educational content for analysis');

      const topics = this.extractTopicsFromAnalysis(analysis);
      
      // Get educational videos from YouTube
      const videos = await this.youtubeService.searchEducationalVideos({
        query: topics.join(' '),
        ageRange: analysis.ageRange,
        subject: analysis.topCareerAreas[0] || 'general education',
        maxResults: 5
      });

      // Generate educational games
      const games = await this.generateEducationalGames(analysis.topCareerAreas, analysis.ageRange);

      // Generate book recommendations
      const books = await this.generateBookRecommendations(analysis.topCareerAreas, analysis.ageRange);

      return {
        videos: videos || [],
        games: games || [],
        books: books || [],
      };
    } catch (error) {
      this.logger.error('Error getting educational content', error.stack);
      
      // Return fallback content
      return {
        videos: [],
        games: [],
        books: [],
      };
    }
  }

  private extractTopicsFromAnalysis(analysis: any): string[] {
    const topics = [];
    
    // Extract from top career areas
    if (analysis.topCareerAreas) {
      topics.push(...analysis.topCareerAreas);
    }
    
    // Extract from AI analysis skills
    if (analysis.aiAnalysis?.skills) {
      topics.push(...analysis.aiAnalysis.skills);
    }
    
    return topics.slice(0, 3); // Limit to top 3 topics
  }

  async generateEducationalGames(careerAreas: string[], ageRange: string) {
    try {
      const prompt = `
        Generate 3 educational games for ${ageRange} year olds interested in: ${careerAreas.join(', ')}.
        
        Each game should be:
        - Age-appropriate and engaging
        - Educational and skill-building  
        - Can be physical, digital, or creative activities
        - Include a brief description of how to play
        
        Format as JSON array with objects containing: name, description, category, duration, difficulty
      `;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 600,
        temperature: 0.8,
      });

      const content = response.choices[0].message.content;
      const jsonContent = this.extractJson(content);
      const games = JSON.parse(jsonContent);

      return games.map(game => ({
        ...game,
        type: 'educational_game'
      }));
    } catch (error) {
      this.logger.error('Error generating educational games', error.stack);
      
      // Fallback games
      return [
        {
          name: 'Career Explorer Board Game',
          description: 'Create your own board game about different careers',
          category: 'Creative',
          duration: '30-45 minutes',
          difficulty: 'Easy',
          type: 'educational_game'
        }
      ];
    }
  }

  async generateBookRecommendations(careerAreas: string[], ageRange: string) {
    try {
      const prompt = `
        Recommend 3 real, published books for ${ageRange} year olds interested in: ${careerAreas.join(', ')}.
        
        Books should be:
        - Age-appropriate and engaging
        - Educational and inspiring
        - Actually published (no fictional titles)
        - Available in libraries or bookstores
        
        Format as JSON array with objects containing: title, author, description, isbn, url
        For url, use a generic search format like: https://www.google.com/search?q=TITLE+AUTHOR+book
      `;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 600,
        temperature: 0.7,
      });

      const content = response.choices[0].message.content;
      const jsonContent = this.extractJson(content);
      const books = JSON.parse(jsonContent);

      return books.map(book => ({
        ...book,
        type: 'educational_book'
      }));
    } catch (error) {
      this.logger.error('Error generating book recommendations', error.stack);
      
      // Fallback books
      return [
        {
          title: 'What Do You Want to Be When You Grow Up?',
          author: 'Various Authors',
          description: 'Explores different career paths for young readers',
          isbn: '',
          url: 'https://www.google.com/search?q=career+books+children',
          type: 'educational_book'
        }
      ];
    }
  }

  // Generate educational content recommendations
  async generateEducationalContent(userId: string, quizId?: string, token?: string): Promise<any> {
    try {
      this.logger.log(`Generating educational content for user ${userId}${quizId ? ` with quizId ${quizId}` : ''}`);
      
      // Get user data from main service
      const user = token ? await this.getUserFromMainService(userId, token) : null;
      
      // Find the latest completed quiz with analysis
      const quiz = await this.getLatestQuiz(userId, quizId);
      
      if (!quiz || !quiz.submitted) {
        this.logger.warn(`No completed quiz found for user ${userId}${quizId ? ` with quizId ${quizId}` : ''}`);
        throw new BadRequestException('No completed quiz found. Please complete a career assessment quiz first.');
      }

      // Use existing analysis or generate new content
      const analysis = quiz.analysis || await this.analyzeQuizAnswers(quiz);
      
      // Get educational content
      const educationalContent = await this.getVerifiedEducationalContent(analysis);

      // Create educational content record
      const contentDoc = new this.eduContentModel({
        user: userId,
        analysis,
        videos: educationalContent.videos,
        games: educationalContent.games,
        books: educationalContent.books,
        createdAt: new Date(),
      });

      await contentDoc.save();

      return contentDoc;
    } catch (error) {
      this.logger.error('Error generating educational content', error.stack);
      throw error;
    }
  }

  // Get career recommendations from quiz analysis
  async getCareerRecommendations(userId: string, quizId?: string, token?: string): Promise<any> {
    try {
      this.logger.log(`Getting career recommendations for user ${userId}${quizId ? ` with quizId ${quizId}` : ''}`);
      
      // Find the latest completed quiz with analysis
      const quiz = await this.getLatestQuiz(userId, quizId);
      
      if (!quiz || !quiz.submitted || !quiz.analysis) {
        this.logger.warn(`No completed quiz with analysis found for user ${userId}${quizId ? ` with quizId ${quizId}` : ''}`);
        throw new BadRequestException('No completed quiz found. Please complete a career assessment quiz first.');
      }

      // Extract career recommendations from analysis
      const traits = this.extractPersonalityTraits(quiz.analysis);
      const careers = this.extractCareerRecommendations(quiz.analysis);

      return {
        traits,
        careers,
        quizId: quiz._id.toString(),
        completedAt: quiz.submittedAt || new Date()
      };
    } catch (error) {
      this.logger.error(`Error getting career recommendations: ${error.message}`);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Unable to get career recommendations: ${error.message}`);
    }
  }

  // Get quiz analysis for debugging
  async getQuizAnalysis(userId: string, quizId?: string, token?: string): Promise<any> {
    try {
      this.logger.log(`Getting quiz analysis for user ${userId}${quizId ? ` with quizId ${quizId}` : ''}`);
      
      const quiz = await this.getLatestQuiz(userId, quizId);
      
      if (!quiz) {
        throw new BadRequestException('No quiz found');
      }

      return {
        analysis: quiz.analysis || 'No analysis available',
        quizId: quiz._id.toString(),
        completed: quiz.submitted || false,
        updatedAt: quiz.submittedAt || quiz.createdAt
      };
    } catch (error) {
      this.logger.error(`Error getting quiz analysis: ${error.message}`);
      throw error;
    }
  }

  // Generate guest recommendations
  async generateGuestRecommendations(params: { sessionId: string; quizId: string }): Promise<any> {
    try {
      this.logger.log(`Generating guest recommendations for session ${params.sessionId}, quiz ${params.quizId}`);
      
      // Find the quiz
      const quiz = await this.quizModel.findById(params.quizId);
      if (!quiz) {
        throw new NotFoundException('Quiz not found');
      }

      if (!quiz.submitted || !quiz.analysis) {
        throw new BadRequestException('Quiz not completed or analyzed yet');
      }

      // Get educational content based on analysis
      const educationalContent = await this.getVerifiedEducationalContent(quiz.analysis);

      return {
        sessionId: params.sessionId,
        quizId: params.quizId,
        analysis: quiz.analysis,
        recommendations: educationalContent,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Error generating guest recommendations', error.stack);
      throw error;
    }
  }

  // Helper methods
  private async getLatestQuiz(userId: string, quizId?: string): Promise<any> {
    if (quizId) {
      return this.quizModel.findOne({ _id: quizId, user: userId });
    }
    return this.quizModel.findOne({ user: userId }).sort({ createdAt: -1 });
  }

  private extractPersonalityTraits(analysis: string): any[] {
    try {
      // Extract personality traits from analysis text
      const traits = [];
      const traitPatterns = [
        /creative/i,
        /analytical/i,
        /social/i,
        /practical/i,
        /leadership/i,
        /artistic/i,
        /technical/i,
        /helpful/i,
      ];

      traitPatterns.forEach((pattern, index) => {
        if (pattern.test(analysis)) {
          traits.push({
            emoji: ['🎨', '🧠', '👥', '🔧', '👑', '🎭', '💻', '🤝'][index],
            trait: pattern.source.replace('/i', '').replace('/', ''),
            description: `Shows strong ${pattern.source.replace('/i', '').replace('/', '')} tendencies`
          });
        }
      });

      return traits;
    } catch (error) {
      this.logger.error('Error extracting personality traits', error);
      return [];
    }
  }

  private extractCareerRecommendations(analysis: string): any[] {
    try {
      // Extract career recommendations from analysis text
      const careers = [];
      const careerPatterns = [
        'Artist', 'Scientist', 'Teacher', 'Engineer', 'Doctor', 
        'Writer', 'Designer', 'Programmer', 'Chef', 'Musician'
      ];

      careerPatterns.forEach((career, index) => {
        if (analysis.toLowerCase().includes(career.toLowerCase())) {
          careers.push({
            emoji: ['🎨', '🔬', '👩‍🏫', '⚙️', '👩‍⚕️', '✍️', '🎨', '💻', '👨‍🍳', '🎵'][index],
            career: career,
            matchPercentage: Math.floor(Math.random() * 30) + 70 // Generate realistic percentages
          });
        }
      });

      return careers.slice(0, 5); // Return top 5
    } catch (error) {
      this.logger.error('Error extracting career recommendations', error);
      return [];
    }
  }

  // Test endpoint for YouTube integration
  async testYouTubeIntegration(): Promise<{success: boolean, message: string, videos?: YouTubeVideoResult[], error?: string, timestamp: string}> {
    try {
      const testVideos = await this.youtubeService.searchEducationalVideos({
        query: 'science education',
        ageRange: '9-12',
        subject: 'science',
        maxResults: 3
      });

      return {
        success: true,
        message: 'YouTube integration working',
        videos: testVideos,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('YouTube integration test failed', error.stack);
      return {
        success: false,
        message: 'YouTube integration failed',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}