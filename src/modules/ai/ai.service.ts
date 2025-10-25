import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import OpenAI from 'openai';
import { Model, Types } from 'mongoose';
import { LoggerService } from 'src/common/logger/logger.service';
import { CareerQuiz, CareerQuizDocument } from '../schemas/career-quiz.schema';
import { YouTubeService, YouTubeVideoResult } from './youtube.service';
import { SubmitAnswersDto } from 'src/common/interfaces/ai-quiz.dto';
import {
  EducationalContent,
  EducationalContentDocument,
  User,
  UserDocument,
} from '../schemas';
import { UserRole } from 'src/common/interfaces';
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

  // Helper methods for health check
  getMainServiceUrl(): string {
    return this.mainServiceUrl;
  }

  async pingMainService(): Promise<boolean> {
    try {
      // Try to hit a simple endpoint on the main service
      const pingUrl = `${this.mainServiceUrl}/api/health`;
      this.logger.debug(`Pinging main service at: ${pingUrl}`);
      
      const response = await firstValueFrom(
        this.httpService.get(pingUrl, { timeout: 5000 })
      );
      
      return response.status === 200;
    } catch (error) {
      this.logger.error(`Failed to ping main service: ${error.message}`);
      throw error;
    }
  }

  // Communication with main service for auth validation
  async validateUserToken(token: string): Promise<any> {
    try {
      const endpoint = `${this.mainServiceUrl}/api/internal/auth/validate`;
      this.logger.debug(`Validating token with main service: ${endpoint}`);
      
      if (!token) {
        throw new Error('Token is empty or undefined');
      }
      
      const response = await firstValueFrom(
        this.httpService.get(endpoint, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10000, // 10 second timeout
        })
      );
      
      const userData = response.data;
      
      if (!userData) {
        throw new Error('User data is empty in response');
      }
      
      this.logger.debug(`Token validation successful, user data: ${JSON.stringify(userData)}`);
      
      // Ensure we have a userId in the returned data
      if (!userData.userId && !userData.sub && !userData._id) {
        this.logger.warn(`User data does not contain userId, sub or _id: ${JSON.stringify(userData)}`);
      }
      
      return userData;
    } catch (error) {
      this.logger.error(`Failed to validate token with main service: ${error.message}`);
      
      if (error.response) {
        this.logger.error(`Error response status: ${error.response.status}`);
        this.logger.error(`Error response data: ${JSON.stringify(error.response.data)}`);
      }
      
      if (error.request) {
        this.logger.error('Request was made but no response was received');
      }
      
      if (error.config) {
        this.logger.error(`Request config: ${JSON.stringify({
          url: error.config.url,
          method: error.config.method,
          headers: {
            ...error.config.headers,
            Authorization: 'Bearer [REDACTED]'
          }
        })}`);
      }
      
      throw new ForbiddenException(`Invalid token: ${error.message}`);
    }
  }

  // Get user data from main service
  async getUserFromMainService(userId: string, token: string): Promise<any> {
    if (!userId) {
      this.logger.error('User ID is required to fetch user data');
      throw new BadRequestException('User ID is required to fetch user data');
    }
    
    if (!token) {
      this.logger.error('Token is required for authentication with main service');
      throw new BadRequestException('Authentication token is required');
    }
    
    const url = `${this.mainServiceUrl}/api/internal/users/${userId}`;
    
    try {
      this.logger.debug(`Getting user data from main service: ${url}`);
      
      // Check if we have an actual main service URL
      if (!this.mainServiceUrl) {
        throw new InternalServerErrorException('MAIN_SERVICE_URL is not configured');
      }
      
      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: { 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000, // 10 second timeout
        })
      );
      
      if (!response.data) {
        throw new NotFoundException('User data not returned from main service');
      }
      
      // Check for required fields to ensure we got a valid user object
      if (!response.data.email) {
        this.logger.warn(`User data missing expected fields: ${JSON.stringify(response.data)}`);
      }
      
      this.logger.debug(`User data retrieved successfully for userId: ${userId}`);
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        this.logger.error(`User ${userId} not found in main service`);
        throw new NotFoundException('User not found');
      }
      
      if (error.response?.status === 401 || error.response?.status === 403) {
        this.logger.error(`Authentication error when fetching user ${userId}: ${error.message}`);
        throw new ForbiddenException('Authentication error with main service');
      }
      
      this.logger.error(`Failed to get user from main service: ${error.message}`);
      
      if (error.response) {
        this.logger.error(`Error response status: ${error.response.status}`);
        this.logger.error(`Error response data: ${JSON.stringify(error.response.data)}`);
      }
      
      if (error.request) {
        this.logger.error('Request was made but no response was received');
        throw new ServiceUnavailableException('Main service is unavailable');
      }
      
      if (error.config) {
        this.logger.error(`Request config: ${JSON.stringify({
          url: error.config.url,
          method: error.config.method,
          headers: {
            ...error.config.headers,
            Authorization: 'Bearer [REDACTED]'
          }
        })}`);
      }
      
      throw new BadRequestException(`Could not retrieve user data: ${error.message}`);
    }
  }

  // Update rewards in main service
  async updateRewards(userId: string, points: number, token: string): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.mainServiceUrl}/api/internal/rewards/update`,
          { userId, points },
          { headers: { Authorization: `Bearer ${token}` } }
        )
      );
    } catch (error) {
      this.logger.error('Failed to update rewards in main service', error.message);
      // Don't throw here, rewards update is not critical for AI functionality
    }
  }

  // Award quiz completion stars via the proper rewards endpoint
  async awardQuizCompletionStars(userId: string, quizId: string, token: string): Promise<void> {
    try {
      this.logger.log(`Awarding quiz completion stars for user ${userId}, quiz ${quizId}`);
      
      await firstValueFrom(
        this.httpService.post(
          `${this.mainServiceUrl}/api/student/rewards/complete-quiz/${quizId}`,
          {}, // Empty body as user comes from JWT token
          { headers: { Authorization: `Bearer ${token}` } }
        )
      );
      
      this.logger.log(`Successfully awarded quiz completion stars for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to award quiz completion stars for user ${userId}`, error.message);
      // Don't throw here, rewards update is not critical for AI functionality
    }
  }

  // Generate quiz for authenticated user
  async generateCareerQuizForUserId(userId: string, userAgeRange: string, token: string) {
    this.logger.log(`Generating quiz for user ${userId} with age range ${userAgeRange}`);
    
    if (!userId) {
      this.logger.error('User ID is required for quiz generation');
      throw new BadRequestException('User ID is required for quiz generation');
    }
    
    if (!userAgeRange) {
      this.logger.error('Age range is required for quiz generation');
      throw new BadRequestException('Age range is required for quiz generation');
    }
    
    if (!token) {
      this.logger.error('Token is required for authentication with main service');
      throw new BadRequestException('Authentication token is required');
    }
    
    try {
      this.logger.debug(`Fetching user data from main service for userId: ${userId}`);
      
      // Get user data from main service
      const user = await this.getUserFromMainService(userId, token);
      if (!user) {
        this.logger.warn(`User ${userId} not found in main service`);
        throw new NotFoundException('User not found');
      }
      
      this.logger.debug(`Retrieved user data: ${JSON.stringify({
        id: userId,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email ? '***@***' : undefined,
        role: user.role
      })}`);
      
      // Create local user document for quiz generation
      let localUser;
      try {
        localUser = {
          _id: new Types.ObjectId(userId),
          firstName: user.firstName || 'Unknown',
          lastName: user.lastName || 'User',
          email: user.email,
          role: user.role || 'student',
          ageRange: userAgeRange,
        };
      } catch (error) {
        this.logger.error(`Error creating ObjectId from userId ${userId}: ${error.message}`);
        throw new BadRequestException(`Invalid user ID format: ${error.message}`);
      }
      
      this.logger.debug('Generating career quiz with local user data');
      
      // Generate the quiz
      const quizDoc = await this.generateCareerQuiz(localUser as any, userAgeRange);
      
      if (!quizDoc) {
        throw new InternalServerErrorException('Failed to generate quiz document');
      }
      
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
    } catch (error) {
      this.logger.error(`Error generating quiz for user ${userId}: ${error.message}`, error.stack);
      
      if (error instanceof NotFoundException || 
          error instanceof BadRequestException || 
          error instanceof InternalServerErrorException) {
        throw error;
      }
      
      throw new InternalServerErrorException(`Failed to generate quiz: ${error.message}`);
    }
  }

  async getLatestEducationalContentForUser(userId: string) {
    return this.eduContentModel
      .findOne({ user: userId })
      .sort({ createdAt: -1 })
      .lean();
  }
  
  // Get combined learning resources for a student
  async getCombinedLearningResources(userId: string, token?: string): Promise<any> {
    try {
      this.logger.log(`Getting combined learning resources for user ${userId}`);
      
      // Find the latest educational content for this user
      const latestContent = await this.eduContentModel
        .findOne({ user: userId })
        .sort({ createdAt: -1 })
        .lean();
        
      if (!latestContent) {
        this.logger.warn(`No educational content found for user ${userId}, generating new recommendations`);
        if (token) {
          // Generate new content if we have a token
          return this.generateEducationalContent(userId, null, token);
        } else {
          throw new NotFoundException('No educational content found for this user');
        }
      }
      
      // Combine all resource types into a single response
      return {
        userId,
        timestamp: new Date().toISOString(),
        videos: latestContent?.videos || latestContent?.videoUrl || [],
        books: latestContent?.books || [],
        games: latestContent?.games || [],
        resources: latestContent?.resources || [],
        // Handle the analysis field safely with type casting
        analysis: latestContent ? (latestContent as any).analysis || null : null
      };
    } catch (error) {
      this.logger.error(`Error getting combined learning resources: ${error.message}`);
      throw error;
    }
  }

  // Guest flows via Redis cache (simplified for microservice)
  private guestKey(sessionId: string, quizId?: string) {
    return quizId
      ? `guest_quiz:${sessionId}:${quizId}`
      : `guest_quiz:${sessionId}`;
  }
  
  // Helper to extract JSON from OpenAI response text
  private extractJson(text: string): string {
    try {
      // Extract JSON from the response if it's wrapped in backticks or has extra text
      const jsonMatch = text.match(/```(?:json)?([\s\S]*?)```/) || 
                        text.match(/({[\s\S]*})/);
      const extractedText = jsonMatch ? jsonMatch[1].trim() : text.trim();
      
      // Test if it's valid JSON before returning
      JSON.parse(extractedText);
      return extractedText;
    } catch (error) {
      // If parsing fails, try to clean up the text
      this.logger.warn(`JSON extraction failed: ${error.message}. Attempting to clean up text.`);
      
      try {
        // Try removing any non-JSON content and formatting issues
        let cleanedText = text.replace(/```json|```/g, '').trim();
        
        // If we have a JSON structure but there are trailing characters, try to extract just the JSON part
        if (cleanedText.includes('{') && cleanedText.includes('}')) {
          const startIndex = cleanedText.indexOf('{');
          const endIndex = cleanedText.lastIndexOf('}') + 1;
          if (startIndex >= 0 && endIndex > startIndex) {
            cleanedText = cleanedText.substring(startIndex, endIndex);
          }
        }
        
        // Test if it's valid JSON after cleaning
        JSON.parse(cleanedText);
        return cleanedText;
      } catch (secondError) {
        // If all attempts fail, log the error and return a simple valid JSON
        this.logger.error(`Failed to extract valid JSON after cleanup: ${secondError.message}`);
        return '[]';
      }
    }
  }

  // Load quiz data from JSON files
  private loadQuizData(ageRange: string): any {
    try {
      const filePath = path.join(__dirname, 'quiz-data', `questions-${ageRange}.json`);
      this.logger.log(`Attempting to load quiz data from: ${filePath}`);
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        this.logger.error(`Quiz data file does not exist at: ${filePath}`);
        
        // List contents of the directory to debug
        const dirPath = path.join(__dirname, 'quiz-data');
        if (fs.existsSync(dirPath)) {
          this.logger.log(`Contents of ${dirPath}:`);
          const files = fs.readdirSync(dirPath);
          files.forEach(file => this.logger.log(`- ${file}`));
        } else {
          this.logger.error(`Directory does not exist: ${dirPath}`);
        }
        
        throw new BadRequestException(`Quiz data file not found for age range: ${ageRange}`);
      }
      
      const data = fs.readFileSync(filePath, 'utf8');
      this.logger.log(`Successfully loaded quiz data for age range ${ageRange}`);
      
      try {
        // Parse the JSON data
        const questionsArray = JSON.parse(data);
        
        // If it's a simple array of question strings, convert to proper format
        if (Array.isArray(questionsArray) && typeof questionsArray[0] === 'string') {
          this.logger.log('Converting simple questions array to structured format');
          
          // Load age-appropriate answer scales
          let standardAnswers = [
            '🤩 A lot',
            '😀 Often',
            '🙂 Sometimes',
            '😐 Not much'
          ];
          
          try {
            // Try to load answer scales from age-scales.json
            const scalesPath = path.join(__dirname, 'quiz-data', 'age-scales.json');
            if (fs.existsSync(scalesPath)) {
              const scalesData = fs.readFileSync(scalesPath, 'utf8');
              const scales = JSON.parse(scalesData);
              if (scales[ageRange] && Array.isArray(scales[ageRange])) {
                standardAnswers = scales[ageRange].slice(0, 4).reverse(); // Take top 4 and reverse for correct order
              }
            }
          } catch (scaleError) {
            this.logger.warn(`Failed to load answer scales: ${scaleError.message}`);
            // Continue with default answers
          }
          
          // Create default scoring for each question (will be refined during analysis)
          const defaultCareerAreas = ['Art', 'Science', 'Technology', 'Nature', 'Communication'];
          const scoring = {};
          defaultCareerAreas.forEach(area => {
            scoring[area] = [0, 1, 2, 3]; // Default scoring for each answer option
          });
          
          // Convert array of strings to structured questions with answers
          const formattedQuestions = questionsArray.map(questionText => ({
            text: questionText,
            answers: standardAnswers,
            scoring
          }));
          
          return {
            questions: formattedQuestions,
            version: '1.0'
          };
        }
        
        // If it's already in the correct format, return as is
        return { questions: questionsArray };
      } catch (parseError) {
        this.logger.error(`Failed to parse quiz data: ${parseError.message}`);
        throw new BadRequestException(`Failed to parse quiz data: ${parseError.message}`);
      }
    } catch (error) {
      this.logger.error(`Failed to load quiz data for age range ${ageRange}`, error.message);
      throw new BadRequestException(`Failed to load quiz data for age range: ${ageRange} - ${error.message}`);
    }
  }

  // Load age scales data
  private loadAgeScales(): any {
    try {
      const filePath = path.join(__dirname, 'quiz-data', 'age-scales.json');
      const data = fs.readFileSync(filePath, 'utf8');
      const ageScalesData = JSON.parse(data);
      
      // Map the age scales data to the expected format
      return {
        scales: [
          { 
            range: "6-8", 
            careerAreas: ["Art", "Science", "Technology", "Nature", "Communication"] 
          },
          { 
            range: "9-12", 
            careerAreas: ["Art", "Science", "Technology", "Nature", "Communication", "Leadership"] 
          },
          { 
            range: "13-15", 
            careerAreas: ["Art", "Science", "Technology", "Nature", "Communication", "Leadership", "Business"] 
          },
          { 
            range: "16-18", 
            careerAreas: ["Art", "Science", "Technology", "Nature", "Communication", "Leadership", "Business", "Healthcare"] 
          }
        ]
      };
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
      
      // Define default career areas based on age range
      const defaultCareerAreas = {
        "6-8": ["Art", "Science", "Technology", "Nature", "Communication"],
        "9-12": ["Art", "Science", "Technology", "Nature", "Communication", "Leadership"],
        "13-15": ["Art", "Science", "Technology", "Nature", "Communication", "Leadership", "Business"],
        "16-18": ["Art", "Science", "Technology", "Nature", "Communication", "Leadership", "Business", "Healthcare"]
      };
      
      // Get career areas for the specified range
      let careerAreas = defaultCareerAreas[ageRange];
      
      // If available, try to load from age scales JSON
      try {
        const ageScales = this.loadAgeScales();
        if (ageScales.scales) {
          const ageScale = ageScales.scales.find(scale => scale.range === ageRange);
          if (ageScale && ageScale.careerAreas) {
            careerAreas = ageScale.careerAreas;
          }
        }
      } catch (scalesError) {
        this.logger.warn(`Could not load career areas from age scales, using defaults: ${scalesError.message}`);
      }
      
      if (!careerAreas || careerAreas.length === 0) {
        this.logger.warn(`No career areas found for age range ${ageRange}, using default list`);
        careerAreas = ["Art", "Science", "Technology", "Nature", "Communication"];
      }

      const quiz = new this.quizModel({
        user: user._id,
        ageRange: ageRange,
        questions: quizData.questions,
        careerAreas: careerAreas,
        submitted: false,
        createdAt: new Date(),
      });

      // Save the quiz in the AI microservice database
      const savedQuiz = await quiz.save();
      
      // Note: Removed sync logic for clean microservice architecture
      // Main backend will fetch data via AI Gateway when needed
      
      return savedQuiz;
    } catch (error) {
      this.logger.error('Error generating career quiz', error.stack);
      throw new BadRequestException('Failed to generate career quiz');
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

  async getVerifiedEducationalContent(analysis: any): Promise<{videos: YouTubeVideoResult[], games: any[], books: any[], resources: any[]}> {
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
      
      // Generate learning resource recommendations
      const resources = await this.generateResourceRecommendations(analysis.topCareerAreas, analysis.ageRange);

      return {
        videos: videos || [],
        games: games || [],
        books: books || [],
        resources: resources || [],
      };
    } catch (error) {
      this.logger.error('Error getting educational content', error.stack);
      
      // Return fallback content
      return {
        videos: [],
        games: [],
        books: [],
        resources: [],
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
  
  // Helper method to get educational videos (used by fallback mechanism)
  async getVerifiedEducationalVideos(query: string): Promise<YouTubeVideoResult[]> {
    try {
      // Extract age range from query or default to general
      const ageRangeMatch = query.match(/(\d+)-(\d+)/);
      const ageRange = ageRangeMatch ? ageRangeMatch[0] : '6-12';
      
      // Extract potential subject from query
      const subjects = ['art', 'science', 'math', 'technology', 'history', 'language'];
      let subject = 'general education';
      for (const s of subjects) {
        if (query.toLowerCase().includes(s)) {
          subject = s;
          break;
        }
      }
      
      // Search for educational videos
      return await this.youtubeService.searchEducationalVideos({
        query,
        ageRange,
        subject,
        maxResults: 5
      });
    } catch (error) {
      this.logger.error(`Error getting educational videos: ${error.message}`, error.stack);
      return []; // Return empty array as fallback
    }
  }
  
  async generateResourceRecommendations(careerAreas: string[], ageRange: string) {
    try {
      // Default to safe career areas if missing
      const safeCareerAreas = Array.isArray(careerAreas) && careerAreas.length > 0 
        ? careerAreas 
        : ['Education', 'Creative Arts', 'Science'];
      
      const prompt = `
        Generate 5 learning resource recommendations for ${ageRange} year olds interested in: ${safeCareerAreas.join(', ')}.
        
        Each resource should be:
        - Age-appropriate and engaging
        - Educational and skill-building
        - Mix of apps, websites, books, courses, videos
        - Include a brief description of the resource
        
        Format your response as a valid JSON array with objects containing only these fields: title, type, description, skillLevel, estimatedTimeToComplete.
        Example format:
        [
          {
            "title": "Resource Name",
            "type": "website",
            "description": "Description of the resource",
            "skillLevel": "Beginner",
            "estimatedTimeToComplete": "Self-paced"
          }
        ]
      `;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { 
            role: 'system', 
            content: 'You are a helper that generates learning resource recommendations. Always respond with valid JSON arrays.'
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 1000,
        temperature: 0.7,
        response_format: { type: "json_object" } // Request JSON format explicitly
      });

      const content = response.choices[0].message.content;
      const jsonContent = this.extractJson(content);
      
      let resources;
      try {
        resources = JSON.parse(jsonContent);
        
        // Handle case where the response is wrapped in another object
        if (!Array.isArray(resources) && resources.resources && Array.isArray(resources.resources)) {
          resources = resources.resources;
        } else if (!Array.isArray(resources)) {
          // Convert to array if it's not already
          resources = [resources];
        }
      } catch (parseError) {
        this.logger.warn(`Failed to parse resources JSON: ${parseError.message}`);
        throw parseError; // Let the outer catch handle it
      }

      return resources.map(resource => ({
        ...resource,
        resourceType: resource.type || 'website', // Ensure type property is preserved
        type: 'learning_resource'
      }));
    } catch (error) {
      this.logger.error('Error generating resource recommendations', error.stack);
      
      // Fallback resources based on age range
      const skillLevelByAge = {
        '6-8': 'Beginner',
        '9-12': 'Beginner to Intermediate',
        '13-15': 'Intermediate',
        '16-18': 'Intermediate to Advanced'
      };
      
      return [
        {
          title: 'Khan Academy',
          resourceType: 'website',
          description: 'Free educational platform with courses in various subjects',
          skillLevel: skillLevelByAge[ageRange] || 'Beginner to Advanced',
          estimatedTimeToComplete: 'Self-paced',
          type: 'learning_resource'
        },
        {
          title: 'Career Exploration Guide',
          resourceType: 'ebook',
          description: 'Interactive guide to various career paths and required skills',
          skillLevel: skillLevelByAge[ageRange] || 'Beginner',
          estimatedTimeToComplete: '2-3 hours',
          type: 'learning_resource'
        }
      ];
    }
  }

  async generateEducationalGames(careerAreas: string[], ageRange: string) {
    try {
      // Default to safe career areas if missing
      const safeCareerAreas = Array.isArray(careerAreas) && careerAreas.length > 0 
        ? careerAreas 
        : ['Education', 'Creative Arts', 'Science'];
      
      const prompt = `
        Generate 3 educational games for ${ageRange} year olds interested in: ${safeCareerAreas.join(', ')}.
        
        Each game should be:
        - Age-appropriate and engaging
        - Educational and skill-building  
        - Can be physical, digital, or creative activities
        - Include a brief description of how to play
        
        Format your response as a valid JSON array with objects containing only these fields: name, description, category, duration, difficulty.
        Example format:
        [
          {
            "name": "Game Name",
            "description": "Game description",
            "category": "Creative",
            "duration": "30 minutes",
            "difficulty": "Easy"
          }
        ]
      `;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { 
            role: 'system', 
            content: 'You are a helper that generates educational game suggestions. Always respond with valid JSON arrays.'
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 800,
        temperature: 0.7,
        response_format: { type: "json_object" } // Request JSON format explicitly
      });

      const content = response.choices[0].message.content;
      const jsonContent = this.extractJson(content);
      
      let games;
      try {
        games = JSON.parse(jsonContent);
        
        // Handle case where the response is wrapped in another object
        if (!Array.isArray(games) && games.games && Array.isArray(games.games)) {
          games = games.games;
        } else if (!Array.isArray(games)) {
          // Convert to array if it's not already
          games = [games];
        }
      } catch (parseError) {
        this.logger.warn(`Failed to parse games JSON: ${parseError.message}`);
        throw parseError; // Let the outer catch handle it
      }

      return games.map(game => ({
        ...game,
        type: 'educational_game'
      }));
    } catch (error) {
      this.logger.error('Error generating educational games', error.stack);
      
      // Fallback games based on age range
      const difficultyByAge = {
        '6-8': 'Easy',
        '9-12': 'Easy-Medium',
        '13-15': 'Medium',
        '16-18': 'Medium-Hard'
      };
      
      return [
        {
          name: 'Career Explorer Game',
          description: 'Create a simple board game about different careers and interests',
          category: 'Creative',
          duration: '30-45 minutes',
          difficulty: difficultyByAge[ageRange] || 'Easy',
          type: 'educational_game'
        },
        {
          name: 'Skills Challenge',
          description: 'A fun activity to practice different skills related to various career fields',
          category: 'Activity',
          duration: '20-30 minutes',
          difficulty: difficultyByAge[ageRange] || 'Easy',
          type: 'educational_game'
        }
      ];
    }
  }

  async generateBookRecommendations(careerAreas: string[], ageRange: string) {
    try {
      // Default to safe career areas if missing
      const safeCareerAreas = Array.isArray(careerAreas) && careerAreas.length > 0 
        ? careerAreas 
        : ['Education', 'Creative Arts', 'Science'];
      
      const prompt = `
        Recommend 3 real, published books for ${ageRange} year olds interested in: ${safeCareerAreas.join(', ')}.
        
        Books should be:
        - Age-appropriate and engaging
        - Educational and inspiring
        - Actually published (no fictional titles)
        - Available in libraries or bookstores
        
        Format your response as a valid JSON array with objects containing only these fields: title, author, description, isbn, url.
        Example format:
        [
          {
            "title": "Book Title",
            "author": "Author Name",
            "description": "Brief description of the book",
            "isbn": "ISBN-13 if available",
            "url": "https://www.google.com/search?q=Book+Title+Author+Name+book"
          }
        ]
        
        For url, use a generic search format like: https://www.google.com/search?q=TITLE+AUTHOR+book
      `;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { 
            role: 'system', 
            content: 'You are a helper that recommends age-appropriate educational books. Always respond with valid JSON arrays.'
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 800,
        temperature: 0.7,
        response_format: { type: "json_object" } // Request JSON format explicitly
      });

      const content = response.choices[0].message.content;
      const jsonContent = this.extractJson(content);
      
      let books;
      try {
        books = JSON.parse(jsonContent);
        
        // Handle case where the response is wrapped in another object
        if (!Array.isArray(books) && books.books && Array.isArray(books.books)) {
          books = books.books;
        } else if (!Array.isArray(books)) {
          // Convert to array if it's not already
          books = [books];
        }
      } catch (parseError) {
        this.logger.warn(`Failed to parse books JSON: ${parseError.message}`);
        throw parseError; // Let the outer catch handle it
      }

      return books.map(book => ({
        ...book,
        type: 'educational_book'
      }));
    } catch (error) {
      this.logger.error('Error generating book recommendations', error.stack);
      
      // Fallback books based on age range
      const ageAppropriateBooks = {
        '6-8': [
          {
            title: "Oh, the Places You'll Go!",
            author: "Dr. Seuss",
            description: "A colorful book about life's journey and possibilities",
            isbn: "9780679805274",
            url: "https://www.google.com/search?q=Oh+the+Places+You'll+Go+Dr+Seuss+book",
            type: 'educational_book'
          }
        ],
        '9-12': [
          {
            title: "What Do You Want to Be When You Grow Up?",
            author: "DK Publishing",
            description: "Explores different career paths for young readers",
            isbn: "9781465479945",
            url: "https://www.google.com/search?q=What+Do+You+Want+to+Be+When+You+Grow+Up+DK+Publishing+book",
            type: 'educational_book'
          }
        ],
        '13-15': [
          {
            title: "You Can Be Anything!",
            author: "Gary Bolles",
            description: "Guide to discovering interests and potential career paths for teens",
            isbn: "9781523516193",
            url: "https://www.google.com/search?q=You+Can+Be+Anything+career+book+teens",
            type: 'educational_book'
          }
        ],
        '16-18': [
          {
            title: "What Color Is Your Parachute? for Teens",
            author: "Carol Christen",
            description: "Career guidance book specifically written for teenagers",
            isbn: "9781580081412",
            url: "https://www.google.com/search?q=What+Color+Is+Your+Parachute+for+Teens+Carol+Christen+book",
            type: 'educational_book'
          }
        ]
      };
      
      return ageAppropriateBooks[ageRange] || [
        {
          title: "Career Exploration Guide",
          author: "Various Authors",
          description: "Explores different career paths for young readers",
          isbn: "",
          url: "https://www.google.com/search?q=career+books+children",
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
      
      if (quiz) {
        this.logger.log(`Found quiz ${quiz._id} for user ${userId}`);
        this.logger.debug(`Quiz status: submitted=${quiz.submitted}, completed=${quiz.completed}, hasAnalysis=${!!quiz.analysis}`);
        
        // Try to fix quiz if it has answers but isn't marked as submitted/completed
        if ((!quiz.submitted || !quiz.completed) && quiz.answers && quiz.answers.length > 0) {
          this.logger.log(`Quiz ${quiz._id} has answers but not marked as submitted/completed. Fixing...`);
          quiz.submitted = true;
          quiz.completed = true;
          quiz.submittedAt = quiz.submittedAt || new Date();
          await quiz.save();
          this.logger.log(`Fixed quiz status for ${quiz._id}: submitted=true, completed=true`);
        } else if (!quiz.submitted && !quiz.completed) {
          this.logger.warn(`Quiz ${quiz._id} for user ${userId} is not marked as submitted or completed and has no answers`);
        }
        
        // Try to generate analysis if it's missing but quiz is submitted
        if ((quiz.submitted || quiz.completed) && !quiz.analysis && quiz.answers && quiz.answers.length > 0) {
          this.logger.log(`Quiz ${quiz._id} is submitted but missing analysis. Generating now...`);
          try {
            const analysis = await this.analyzeQuizAnswers(quiz);
            quiz.analysis = analysis;
            await quiz.save();
            this.logger.log(`Successfully generated and saved analysis for quiz ${quiz._id}`);
          } catch (analysisError) {
            this.logger.error(`Failed to generate analysis: ${analysisError.message}`);
          }
        } else if (!quiz.analysis) {
          this.logger.warn(`Quiz ${quiz._id} for user ${userId} has no analysis data and can't generate it`);
        } else {
          // Quiz is valid and has analysis - we'll use it below
          this.logger.log(`Using existing quiz ${quiz._id} with valid analysis for user ${userId}`);
        }
      } else {
        this.logger.warn(`No quiz found for user ${userId}${quizId ? ` with quizId ${quizId}` : ''}`);
      }
      
      // After fixes, check again if quiz is usable
      if (!quiz || (!quiz.submitted && !quiz.completed) || !quiz.analysis) {
        this.logger.warn(`No completed quiz found for user ${userId}${quizId ? ` with quizId ${quizId}` : ''}`);
        
        // Generate fallback educational content instead of throwing an error
        this.logger.log(`Generating fallback educational content for user ${userId}`);
        
        try {
          // Determine age range from user data if available
          let ageRange = '6-12'; // Default age range
          let userFirstName = 'Student';
          
          if (user) {
            if (user.age) {
              // Map user age to age range
              if (user.age <= 8) ageRange = '6-8';
              else if (user.age <= 12) ageRange = '9-12';
              else if (user.age <= 15) ageRange = '13-15';
              else ageRange = '16-18';
            }
            
            userFirstName = user.firstName || 'Student';
          }
          
          // Create fallback analysis
          const fallbackAnalysis = {
            topCareerAreas: ['Education', 'Art', 'Technology'],
            ageRange: ageRange,
            aiAnalysis: {
              explanation: `These are general educational resources for ${userFirstName} to explore different subjects.`,
              skills: ['Reading', 'Creative thinking', 'Basic technology skills'],
              activities: ['Drawing and coloring', 'Reading stories', 'Simple science experiments'],
              encouragement: 'Learning is fun! Try different activities to discover what you enjoy the most.'
            },
            analysisDate: new Date().toISOString()
          };
          
          // Get educational content based on fallback analysis
          const educationalContent = await this.getVerifiedEducationalContent(fallbackAnalysis);
          
          // Create educational content record with fallback flag in the analysis object
          const contentDocData = {
            user: userId,
            analysis: {
              ...fallbackAnalysis,
              fallback: true,
              fallbackMessage: 'These are general recommendations. Complete a career assessment quiz for personalized results.'
            },
            videos: educationalContent.videos,
            games: educationalContent.games,
            books: educationalContent.books,
            resources: educationalContent.resources,
            createdAt: new Date()
          };
          
          const contentDoc = new this.eduContentModel(contentDocData);
          await contentDoc.save();
          
          return contentDoc;
        } catch (fallbackError) {
          this.logger.error(`Error generating fallback content: ${fallbackError.message}`, fallbackError.stack);
          throw new BadRequestException('No completed quiz found. Please complete a career assessment quiz first.');
        }
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
        resources: educationalContent.resources,
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
      
      if (quiz) {
        this.logger.log(`Found quiz ${quiz._id} for user ${userId}`);
        this.logger.debug(`Quiz status: submitted=${quiz.submitted}, completed=${quiz.completed}, hasAnalysis=${!!quiz.analysis}`);
        
        // Try to fix quiz if it has answers but isn't marked as submitted/completed
        if ((!quiz.submitted || !quiz.completed) && quiz.answers && quiz.answers.length > 0) {
          this.logger.log(`Quiz ${quiz._id} has answers but not marked as submitted/completed. Fixing...`);
          quiz.submitted = true;
          quiz.completed = true;
          quiz.submittedAt = quiz.submittedAt || new Date();
          await quiz.save();
          this.logger.log(`Fixed quiz status for ${quiz._id}: submitted=true, completed=true`);
        }
        
        // Try to generate analysis if it's missing but quiz is submitted
        if ((quiz.submitted || quiz.completed) && !quiz.analysis && quiz.answers && quiz.answers.length > 0) {
          this.logger.log(`Quiz ${quiz._id} is submitted but missing analysis. Generating now...`);
          try {
            const analysis = await this.analyzeQuizAnswers(quiz);
            quiz.analysis = analysis;
            await quiz.save();
            this.logger.log(`Successfully generated and saved analysis for quiz ${quiz._id}`);
          } catch (analysisError) {
            this.logger.error(`Failed to generate analysis: ${analysisError.message}`);
          }
        }
      }
      
      // After fixes, check again if quiz is usable
      if (!quiz || (!quiz.submitted && !quiz.completed) || !quiz.analysis) {
        this.logger.warn(`No completed quiz with analysis found for user ${userId}${quizId ? ` with quizId ${quizId}` : ''}`);
        
        // Generate fallback career recommendations instead of throwing an error
        this.logger.log(`Generating fallback career recommendations for user ${userId}`);
        
        try {
          // Get user data to determine age range if possible
          let ageRange = '6-12'; // Default age range
          if (token) {
            try {
              const user = await this.getUserFromMainService(userId, token);
              if (user && user.age) {
                // Map user age to age range
                if (user.age <= 8) ageRange = '6-8';
                else if (user.age <= 12) ageRange = '9-12';
                else if (user.age <= 15) ageRange = '13-15';
                else ageRange = '16-18';
              }
            } catch (userError) {
              this.logger.warn(`Could not get user data for age range: ${userError.message}`);
            }
          }
          
          // Generate fallback career recommendations based on age range
          const fallbackTraits = [
            { emoji: '🔍', trait: 'curious', description: 'Enjoys exploring and learning new things' },
            { emoji: '🎨', trait: 'creative', description: 'Has a good imagination' },
            { emoji: '👥', trait: 'social', description: 'Likes working with others' }
          ];
          
          const fallbackCareers = [
            { emoji: '🎨', career: 'Artist', matchPercentage: 85 },
            { emoji: '🔬', career: 'Scientist', matchPercentage: 82 },
            { emoji: '👩‍🏫', career: 'Teacher', matchPercentage: 80 },
            { emoji: '💻', career: 'Programmer', matchPercentage: 78 },
            { emoji: '📚', career: 'Writer', matchPercentage: 75 }
          ];
          
          return {
            traits: fallbackTraits,
            careers: fallbackCareers,
            quizId: 'fallback',
            completedAt: new Date(),
            message: 'These are general recommendations. Complete a career quiz for personalized results.',
            fallback: true
          };
        } catch (fallbackError) {
          this.logger.error(`Error generating fallback recommendations: ${fallbackError.message}`);
          throw new BadRequestException('No completed quiz found. Please complete a career assessment quiz first.');
        }
      }

      // Debug the analysis type before extraction
      this.logger.log(`Quiz analysis type: ${typeof quiz.analysis}`);
      if (typeof quiz.analysis === 'object') {
        this.logger.log(`Quiz analysis keys: ${Object.keys(quiz.analysis).join(', ')}`);
      } else {
        this.logger.log(`Quiz analysis length: ${(quiz.analysis || '').length}`);
      }
      
      try {
        // Extract career recommendations from analysis
        const traits = this.extractPersonalityTraits(quiz.analysis);
        const careers = this.extractCareerRecommendations(quiz.analysis);
        
        this.logger.log(`Extracted traits: ${traits.length}, careers: ${careers.length}`);
        
        // Ensure we have at least some traits and careers
        const finalTraits = traits.length ? traits : [
          { emoji: '✨', trait: 'adaptable', description: 'Can adjust to new situations' },
          { emoji: '🔍', trait: 'curious', description: 'Enjoys exploring and learning new things' },
          { emoji: '🧠', trait: 'analytical', description: 'Good at solving problems' }
        ];
        
        const finalCareers = careers.length ? careers : [
          { emoji: '🎨', career: 'Designer', matchPercentage: 85 },
          { emoji: '💻', career: 'Programmer', matchPercentage: 82 },
          { emoji: '👩‍🏫', career: 'Teacher', matchPercentage: 80 }
        ];
        
        return {
          traits: finalTraits,
          careers: finalCareers,
          quizId: quiz._id.toString(),
          completedAt: quiz.submittedAt || new Date()
        };
      } catch (extractionError) {
        this.logger.error(`Error extracting recommendations: ${extractionError.message}`, extractionError.stack);
        
        // Return fallback data on extraction error
        return {
          traits: [
            { emoji: '✨', trait: 'adaptable', description: 'Can adjust to new situations' },
            { emoji: '🔍', trait: 'curious', description: 'Enjoys exploring and learning new things' },
            { emoji: '🧠', trait: 'analytical', description: 'Good at solving problems' }
          ],
          careers: [
            { emoji: '🎨', career: 'Designer', matchPercentage: 85 },
            { emoji: '💻', career: 'Programmer', matchPercentage: 82 },
            { emoji: '👩‍🏫', career: 'Teacher', matchPercentage: 80 }
          ],
          quizId: quiz._id.toString(),
          completedAt: quiz.submittedAt || new Date(),
          message: 'These are general recommendations due to an error processing your quiz.',
          fallback: true
        };
      }
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
    try {
      // Convert userId to ObjectId string to ensure correct comparison
      const userIdStr = userId.toString();
      this.logger.log(`Looking for quiz for user ${userIdStr}${quizId ? ` with quizId ${quizId}` : ''}`);
      
      // Log current collection name for debugging
      this.logger.log(`Using collection: ${this.quizModel.collection.name}`);
      
      // Debug total number of quizzes
      const totalQuizCount = await this.quizModel.countDocuments();
      this.logger.log(`Total quizzes in database: ${totalQuizCount}`);
      
      // Debug quizzes for this user
      const userQuizCount = await this.quizModel.countDocuments({ user: userIdStr });
      this.logger.log(`Total quizzes for user ${userIdStr}: ${userQuizCount}`);
      
      if (quizId) {
        // Try a direct lookup with the provided ID first, but be more lenient in the query
        try {
          // Log all possible queries we'll be trying
          this.logger.log(`Attempting to find quiz with ID: ${quizId}, user: ${userIdStr}`);
          
          // First try with exact ID match
          let quiz = await this.quizModel.findOne({ 
            _id: quizId, 
            user: userIdStr
          });
          
          if (quiz) {
            this.logger.log(`Found quiz with exact ID match: ${quiz._id}`);
            return quiz;
          }
          
          this.logger.log(`No quiz found with exact ID. Trying with just the ID.`);
          
          // Try with just the ID (in case user ID is wrong)
          quiz = await this.quizModel.findOne({ _id: quizId });
          if (quiz) {
            this.logger.log(`Found quiz with ID but different user: ${quiz._id}, user: ${quiz.user}`);
            // Use it anyway since we found the quiz
            return quiz;
          }
        } catch (idError) {
          this.logger.warn(`Error finding quiz by exact ID: ${idError.message}`);
          // Continue to fallback
        }
        
        // If we have a potentially truncated ID, try with regex
        this.logger.log(`Quiz not found with ID ${quizId}. Looking for similar IDs manually.`);
        try {
          // Try with regex search on string representation of _id
          const allQuizzes = await this.quizModel.find().limit(100);
          this.logger.log(`Found ${allQuizzes.length} quizzes to check for ID match`);
          
          // Manually look for matching IDs
          for (const quiz of allQuizzes) {
            const quizIdStr = quiz._id.toString();
            if (quizIdStr.includes(quizId)) {
              this.logger.log(`Found quiz with ID containing ${quizId}: ${quizIdStr}`);
              return quiz;
            }
          }
          
          this.logger.warn(`No quiz found with ID containing ${quizId}`);
        } catch (regexError) {
          this.logger.error(`Error during regex search: ${regexError.message}`);
        }
      }
      
      // Fallback: return any submitted or completed quiz for this user
      this.logger.log(`Falling back to any quiz for user ${userIdStr}`);
      
      // First try with submitted=true
      let latestQuiz = await this.quizModel.findOne({ 
        user: userIdStr,
        submitted: true
      }).sort({ createdAt: -1 });
      
      if (latestQuiz) {
        this.logger.log(`Found submitted quiz with ID ${latestQuiz._id} for user ${userIdStr}`);
        return latestQuiz;
      }
      
      // Then try with completed=true
      latestQuiz = await this.quizModel.findOne({ 
        user: userIdStr,
        completed: true
      }).sort({ createdAt: -1 });
      
      if (latestQuiz) {
        this.logger.log(`Found completed quiz with ID ${latestQuiz._id} for user ${userIdStr}`);
        return latestQuiz;
      }
      
      // Last resort: just get any quiz for this user
      latestQuiz = await this.quizModel.findOne({ 
        user: userIdStr
      }).sort({ createdAt: -1 });
      
      if (latestQuiz) {
        this.logger.log(`Found quiz (any status) with ID ${latestQuiz._id} for user ${userIdStr}`);
        this.logger.debug(`Quiz details: submitted=${latestQuiz.submitted}, completed=${latestQuiz.completed}, hasAnalysis=${!!latestQuiz.analysis}`);
        
        // If we found a quiz but it's not marked as submitted/completed, mark it now
        if (!latestQuiz.submitted && !latestQuiz.completed && latestQuiz.answers && latestQuiz.answers.length > 0) {
          this.logger.log(`Quiz has answers but wasn't marked as submitted/completed. Fixing...`);
          latestQuiz.submitted = true;
          latestQuiz.completed = true;
          latestQuiz.submittedAt = latestQuiz.submittedAt || new Date();
          await latestQuiz.save();
          this.logger.log(`Quiz status fixed. Now submitted=true, completed=true`);
        }
        
        return latestQuiz;
      } else {
        this.logger.warn(`No quizzes found for user ${userIdStr}`);
        return null;
      }
    } catch (error) {
      this.logger.error(`Error in getLatestQuiz: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to retrieve quiz information');
    }
  }

  private extractPersonalityTraits(analysis: any): any[] {
    try {
      // Handle when analysis is an object (the expected modern format)
      if (analysis && typeof analysis === 'object' && analysis.personalityTraits) {
        this.logger.log(`Using personalityTraits from analysis object: ${JSON.stringify(analysis.personalityTraits)}`);
        
        // If the analysis already has personalityTraits with the expected format, use them directly
        if (Array.isArray(analysis.personalityTraits)) {
          const traits = analysis.personalityTraits.map(trait => {
            if (typeof trait === 'object' && trait.trait) {
              // Already in the right format
              return trait;
            } else {
              // Convert string to object format
              return {
                emoji: this.getTraitEmoji(trait),
                trait: trait,
                description: `Shows strong ${trait} tendencies`
              };
            }
          });
          return traits;
        }
      }
      
      // Handle legacy string format or convert object to string for processing
      let analysisText = '';
      if (typeof analysis === 'string') {
        analysisText = analysis;
      } else if (analysis && typeof analysis === 'object') {
        // Convert object to string for text-based extraction
        analysisText = JSON.stringify(analysis);
      } else {
        this.logger.warn(`Analysis is neither string nor object: ${typeof analysis}`);
        return []; // Return empty array if analysis is invalid
      }

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
        /curious/i,
        /innovative/i,
      ];

      traitPatterns.forEach((pattern, index) => {
        if (pattern.test(analysisText)) {
          const traitName = pattern.source.replace('/i', '').replace('/', '');
          traits.push({
            emoji: this.getTraitEmoji(traitName),
            trait: traitName,
            description: `Shows strong ${traitName} tendencies`
          });
        }
      });

      return traits;
    } catch (error) {
      this.logger.error('Error extracting personality traits', error);
      return [];
    }
  }
  
  // Helper method to get emoji for personality trait
  private getTraitEmoji(trait: string): string {
    const emojiMap = {
      'creative': '🎨',
      'analytical': '🧠',
      'social': '👥',
      'practical': '🔧',
      'leadership': '👑',
      'artistic': '🎭',
      'technical': '💻',
      'helpful': '🤝',
      'curious': '🔍',
      'innovative': '💡',
      'organized': '📋',
      'adaptable': '🔄',
      'detail-oriented': '🔎',
      'communicative': '🗣️',
      'collaborative': '🤲',
      'persistent': '💪',
      'problem-solver': '🧩',
    };
    
    // Try to find a direct match (case-insensitive)
    const normalizedTrait = trait.toLowerCase();
    for (const [key, emoji] of Object.entries(emojiMap)) {
      if (normalizedTrait === key.toLowerCase()) {
        return emoji;
      }
    }
    
    // Try to find a partial match
    for (const [key, emoji] of Object.entries(emojiMap)) {
      if (normalizedTrait.includes(key.toLowerCase()) || key.toLowerCase().includes(normalizedTrait)) {
        return emoji;
      }
    }
    
    // Default emoji if no match found
    return '✨';
  }

  private extractCareerRecommendations(analysis: any): any[] {
    try {
      // Handle when analysis is an object (the expected modern format)
      if (analysis && typeof analysis === 'object' && analysis.topCareerAreas) {
        this.logger.log(`Using topCareerAreas from analysis object: ${JSON.stringify(analysis.topCareerAreas)}`);
        
        // If the analysis already has topCareerAreas with the expected format, use them directly
        if (Array.isArray(analysis.topCareerAreas)) {
          const careers = analysis.topCareerAreas.map(area => {
            if (typeof area === 'object' && area.career) {
              // Already in the right format
              return area;
            } else {
              // Convert string to object format
              return {
                emoji: this.getCareerEmoji(area),
                career: area,
                matchPercentage: Math.floor(Math.random() * 30) + 70
              };
            }
          });
          return careers.slice(0, 5); // Return top 5
        }
      }

      // Handle legacy string format or convert object to string for processing
      let analysisText = '';
      if (typeof analysis === 'string') {
        analysisText = analysis;
      } else if (analysis && typeof analysis === 'object') {
        // Convert object to string for text-based extraction
        analysisText = JSON.stringify(analysis);
      } else {
        this.logger.warn(`Analysis is neither string nor object: ${typeof analysis}`);
        return []; // Return empty array if analysis is invalid
      }
      
      // Extract career recommendations from analysis text
      const careers = [];
      const careerPatterns = [
        'Artist', 'Scientist', 'Teacher', 'Engineer', 'Doctor', 
        'Writer', 'Designer', 'Programmer', 'Chef', 'Musician'
      ];

      careerPatterns.forEach((career, index) => {
        if (analysisText.toLowerCase().includes(career.toLowerCase())) {
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
  
  // Helper method to get emoji for career area
  private getCareerEmoji(careerArea: string): string {
    const emojiMap = {
      'Art': '🎨',
      'Artist': '🎨',
      'Science': '🔬',
      'Scientist': '🔬',
      'Technology': '💻',
      'Programming': '💻',
      'Programmer': '💻',
      'Nature': '🌱',
      'Communication': '🗣️',
      'Leadership': '👑',
      'Business': '💼',
      'Healthcare': '🏥',
      'Doctor': '👩‍⚕️',
      'Education': '📚',
      'Teacher': '👩‍🏫',
      'Engineering': '⚙️',
      'Engineer': '⚙️',
      'Writing': '✍️',
      'Writer': '✍️',
      'Design': '🎨',
      'Designer': '🎨',
      'Culinary': '👨‍🍳',
      'Chef': '👨‍🍳',
      'Music': '🎵',
      'Musician': '🎵',
    };
    
    // Try to find a direct match
    if (emojiMap[careerArea]) {
      return emojiMap[careerArea];
    }
    
    // Try to find a partial match
    for (const [key, emoji] of Object.entries(emojiMap)) {
      if (careerArea.toLowerCase().includes(key.toLowerCase())) {
        return emoji;
      }
    }
    
    // Default emoji if no match found
    return '🌟';
  }

  // Submit quiz answers and generate analysis
  async submitQuizAnswers(submitDto: SubmitAnswersDto, token?: string): Promise<any> {
    try {
      this.logger.log(`Submitting quiz ${submitDto.quizId} with ${submitDto.answers.length} answers`);
      
      // Find the quiz
      const quiz = await this.quizModel.findById(submitDto.quizId);
      if (!quiz) {
        throw new NotFoundException(`Quiz with ID ${submitDto.quizId} not found`);
      }
      
      // Get user details if token is provided
      let userDetails = null;
      if (token && submitDto.userId) {
        try {
          userDetails = await this.getUserFromMainService(submitDto.userId, token);
        } catch (error) {
          this.logger.warn(`Could not fetch user details: ${error.message}`);
        }
      }
      
      // Process and save answers
      const processedAnswers: number[] = [];
      if (Array.isArray(submitDto.answers)) {
        if (submitDto.answers.length > 0) {
          if (typeof submitDto.answers[0] === 'object') {
            // Handle AnswerDto[] format
            for (const answer of submitDto.answers) {
              if (typeof answer === 'object' && 'answer' in answer) {
                const answerValue = answer.answer;
                if (typeof answerValue === 'number') {
                  processedAnswers.push(answerValue);
                } else if (typeof answerValue === 'string') {
                  const parsed = parseInt(answerValue);
                  processedAnswers.push(isNaN(parsed) ? 0 : parsed);
                } else {
                  processedAnswers.push(0);
                }
              } else {
                processedAnswers.push(0);
              }
            }
          } else {
            // Handle number[] format
            for (const answer of submitDto.answers) {
              if (typeof answer === 'number') {
                processedAnswers.push(answer);
              } else {
                processedAnswers.push(0);
              }
            }
          }
        }
      }
      
      quiz.answers = processedAnswers;
      quiz.submitted = true;
      quiz.completed = true;
      quiz.submittedAt = new Date();
      
      // Generate analysis
      const analysis = await this.analyzeQuizAnswers(quiz);
      quiz.analysis = analysis;
      
      // Save the quiz
      await quiz.save();
      this.logger.log(`Quiz ${quiz._id} submitted and analyzed successfully`);
      
      // Award stars for quiz completion (if user is authenticated)
      if (token && submitDto.userId) {
        try {
          await this.awardQuizCompletionStars(submitDto.userId, submitDto.quizId, token);
        } catch (rewardError) {
          this.logger.error(`Failed to award quiz completion stars for user ${submitDto.userId}`, rewardError.message);
        }
      }
      
      // Generate educational content based on analysis
      const educationalContent = await this.getVerifiedEducationalContent(analysis);
      
      // Prepare quiz details for response
      const quizDetails = {
        id: quiz._id.toString(),
        questions: quiz.questions.length,
        submittedAt: quiz.submittedAt,
        ageRange: quiz.ageRange,
        createdAt: quiz.get('createdAt') || quiz.submittedAt || new Date()
      };
      
      // Prepare user details for response (only include safe fields)
      const safeUserDetails = userDetails ? {
        id: userDetails._id || submitDto.userId,
        firstName: userDetails.firstName,
        lastName: userDetails.lastName,
        age: userDetails.age,
        role: userDetails.role
      } : {
        id: submitDto.userId || submitDto.sessionId,
        type: submitDto.sessionId ? 'guest' : 'authenticated'
      };
      
      return {
        analysis,
        educationalContent,
        userDetails: safeUserDetails,
        quizDetails,
        message: 'Quiz submitted and analyzed successfully'
      };
    } catch (error) {
      this.logger.error(`Error submitting quiz answers: ${error.message}`, error.stack);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Failed to submit quiz: ${error.message}`);
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