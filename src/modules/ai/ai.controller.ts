import { Body, Controller, Get, Post, Query, UseGuards, Logger, BadRequestException, Headers, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { UserRole } from 'src/common/interfaces';
import { SubmitAnswersDto } from 'src/common/interfaces/ai-quiz.dto';

@Controller('ai')
@ApiTags('AI TOOLS')
export class AiController {
  private readonly logger = new Logger(AiController.name);
  
  constructor(private readonly aiService: AiService) {}

  // Create quiz for authenticated user
  @Post('quiz')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a quiz for an authenticated user' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID from JWT token' },
        ageRange: { type: 'string', enum: ['6-8', '9-12', '13-15', '16-18'] },
      },
      required: ['ageRange'],
    },
  })
  async createQuiz(
    @Body() body: { userId?: string; ageRange: string },
    @Headers('authorization') authorization: string,
  ) {
    if (!authorization) {
      throw new BadRequestException('Authorization header required');
    }

    const token = authorization.replace('Bearer ', '');
    
    try {
      this.logger.log(`Attempting to validate token and extract user information`);
      
      // Validate token with main service
      const validatedUser = await this.aiService.validateUserToken(token);
      this.logger.debug(`Token validated successfully: ${JSON.stringify(validatedUser)}`);
      
      // Use userId from body or from validated token if not provided
      const userId = body.userId || validatedUser?.userId || validatedUser?.sub || validatedUser?._id;
      
      if (!userId) {
        this.logger.error(`Failed to determine userId: ${JSON.stringify({ body, validatedUser })}`);
        throw new BadRequestException('User ID is required and could not be determined');
      }
      
      this.logger.log(`Creating quiz for user ${userId} with age range ${body.ageRange}`);
      return this.aiService.generateCareerQuizForUserId(userId, body.ageRange, token);
    } catch (error) {
      this.logger.error(`Error creating quiz: ${error.message}`, error.stack);
      throw error instanceof BadRequestException 
        ? error 
        : new BadRequestException(`Failed to create quiz: ${error.message}`);
    }
  }

  // Submit quiz answers for authenticated user
  @Post('quiz/submit')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit answers for a user quiz' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        quizId: { type: 'string' },
        userId: { type: 'string' },
        answers: {
          type: 'array',
          items: { type: 'number' },
          description: 'Array of answer indices',
        },
      },
      required: ['quizId', 'userId', 'answers'],
    },
  })
  async submitQuiz(
    @Body() body: SubmitAnswersDto,
    @Headers('authorization') authorization: string,
  ): Promise<any> {
    if (!authorization) {
      throw new BadRequestException('Authorization header required');
    }

    const token = authorization.replace('Bearer ', '');
    
    // Validate token with main service
    await this.aiService.validateUserToken(token);
    
    return this.aiService.submitQuizAnswers(body, token);
  }

  // Get latest educational content for user
  @Get('recommendations')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get latest educational recommendations for user' })
  async getRecommendations(
    @Query('userId') userId: string,
    @Headers('authorization') authorization: string,
  ) {
    if (!authorization || !userId) {
      throw new BadRequestException('Authorization header and userId required');
    }

    const token = authorization.replace('Bearer ', '');
    
    // Validate token with main service
    await this.aiService.validateUserToken(token);
    
    return this.aiService.getLatestEducationalContentForUser(userId);
  }

  // Guest quiz creation (no auth required)
  @Post('guest/quiz')
  @ApiOperation({ summary: 'Create a quiz for guest user' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Guest session identifier' },
        ageRange: { type: 'string', enum: ['6-8', '9-12', '13-15', '16-18'] },
      },
      required: ['sessionId', 'ageRange'],
    },
  })
  async createGuestQuiz(@Body() body: { sessionId: string; ageRange: string }) {
    // For guest users, we create a temporary user object
    const guestUser = {
      _id: body.sessionId, // Use session ID as temporary user ID
      firstName: 'Guest',
      lastName: 'User',
      email: `guest-${body.sessionId}@temp.com`,
      role: UserRole.STUDENT,
    };

    const quiz = await this.aiService.generateCareerQuiz(guestUser, body.ageRange);
    
    return {
      quizId: quiz._id.toString(),
      sessionId: body.sessionId,
      quiz: {
        questions: quiz.questions.map((q, index) => ({
          text: q.text,
          answers: q.answers,
          _id: `question-${index}-${new Date().getTime()}`
        }))
      }
    };
  }

  // Guest quiz submission (no auth required)
  @Post('guest/quiz/submit')
  @ApiOperation({ summary: 'Submit answers for guest quiz' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        quizId: { type: 'string' },
        sessionId: { type: 'string' },
        answers: {
          type: 'array',
          items: { type: 'number' },
          description: 'Array of answer indices',
        },
      },
      required: ['quizId', 'sessionId', 'answers'],
    },
  })
  async submitGuestQuiz(@Body() body: { quizId: string; sessionId: string; answers: number[] }): Promise<any> {
    const submitDto: SubmitAnswersDto = {
      quizId: body.quizId,
      answers: body.answers,
      sessionId: body.sessionId,
    };

    return this.aiService.submitQuizAnswers(submitDto);
  }

  // Test endpoint for YouTube integration
  @Get('test/youtube')
  @ApiOperation({ summary: 'Test YouTube API integration' })
  @ApiResponse({ 
    status: 200, 
    description: 'YouTube integration test result',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        videos: { type: 'array' },
        timestamp: { type: 'string' }
      }
    }
  })
  async testYouTube(): Promise<any> {
    return this.aiService.testYouTubeIntegration();
  }

  // POST method for recommendations (for compatibility)
  @Post('recommendations')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate educational content recommendations for a student (POST method)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string' },
        childId: { type: 'string', description: 'Required if caller is parent or school_admin' },
        quizId: { type: 'string', description: 'ID of the specific quiz to use for recommendations' },
      },
      required: ['userId'],
    },
  })
  async postRecommendations(
    @Body() body: { userId: string; childId?: string; quizId?: string },
    @Headers('authorization') authorization: string,
  ): Promise<any> {
    if (!authorization) {
      throw new BadRequestException('Authorization header required');
    }

    try {
      const token = authorization.replace('Bearer ', '');
      await this.aiService.validateUserToken(token);
      
      const targetUserId = body.childId || body.userId;
      this.logger.log(`Processing recommendations request for user ${targetUserId} with quiz ${body.quizId || 'latest'}`);
      
      try {
        return await this.aiService.generateEducationalContent(targetUserId, body.quizId, token);
      } catch (contentError) {
        // If we can't generate content based on quiz, provide generic recommendations
        this.logger.warn(`Failed to generate recommendations based on quiz: ${contentError.message}. Generating generic content.`);
        
        // Return basic educational content (as fallback)
        return {
          userId: targetUserId,
          timestamp: new Date().toISOString(),
          videos: await this.aiService.getVerifiedEducationalVideos('general learning skills for kids'),
          books: [
            {
              title: "Oh, the Places You'll Go!",
              author: "Dr. Seuss",
              description: "A book about the journey of life and its challenges",
              url: "https://www.google.com/search?q=oh+the+places+you%27ll+go+book"
            },
            {
              title: "The Giving Tree",
              author: "Shel Silverstein",
              description: "A story about giving and relationships",
              url: "https://www.google.com/search?q=the+giving+tree+book"
            }
          ],
          games: [
            {
              name: "Build a Story",
              description: "Take turns adding to a story one sentence at a time",
              materials: "None needed, just imagination",
              type: "educational_game"
            },
            {
              name: "Alphabet I Spy",
              description: "Find objects starting with each letter of the alphabet",
              materials: "None needed",
              type: "educational_game"
            }
          ],
          resources: [
            {
              name: "PBS Kids",
              url: "https://pbskids.org/",
              description: "Educational games and activities"
            },
            {
              name: "National Geographic Kids",
              url: "https://kids.nationalgeographic.com/",
              description: "Fun facts and activities about animals and the world"
            }
          ],
          generatedBy: "AI fallback system",
          source: "fallback"
        };
      }
    } catch (error) {
      this.logger.error(`Error in recommendations endpoint: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to generate recommendations. Please try again.');
    }
  }

  // Career recommendations based on completed quiz
  @Get('career-recommendations')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get career recommendations based on completed quiz' })
  @ApiResponse({
    status: 200,
    description: 'Returns career recommendations based on quiz analysis',
    schema: {
      type: 'object',
      properties: {
        traits: { type: 'array' },
        careers: { type: 'array' },
        quizId: { type: 'string' },
        completedAt: { type: 'string' }
      }
    }
  })
  async getCareerRecommendations(
    @Query('userId') userId: string,
    @Query('childId') childId?: string,
    @Query('quizId') quizId?: string,
    @Headers('authorization') authorization?: string,
  ): Promise<any> {
    if (!authorization || !userId) {
      throw new BadRequestException('Authorization header and userId required');
    }

    const token = authorization.replace('Bearer ', '');
    await this.aiService.validateUserToken(token);
    
    const targetUserId = childId || userId;
    return this.aiService.getCareerRecommendations(targetUserId, quizId, token);
  }

  // Debug endpoint to get raw quiz analysis
  @Get('quiz-analysis')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get raw quiz analysis for debugging (development only)' })
  @ApiResponse({
    status: 200,
    description: 'Returns the raw quiz analysis text',
    schema: {
      type: 'object',
      properties: {
        analysis: { type: 'string' },
        quizId: { type: 'string' },
        completed: { type: 'boolean' },
        updatedAt: { type: 'string' }
      }
    }
  })
  async getQuizAnalysis(
    @Query('userId') userId: string,
    @Query('quizId') quizId?: string,
    @Headers('authorization') authorization?: string,
  ): Promise<any> {
    // Only allow in development mode
    if (process.env.NODE_ENV === 'production') {
      throw new BadRequestException('This endpoint is only available in development mode');
    }

    if (!authorization || !userId) {
      throw new BadRequestException('Authorization header and userId required');
    }

    const token = authorization.replace('Bearer ', '');
    await this.aiService.validateUserToken(token);
    
    return this.aiService.getQuizAnalysis(userId, quizId, token);
  }

  // Latest educational content for current student
  @Get('content/latest')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get latest educational content for current student' })
  async getLatestContent(
    @Query('userId') userId: string,
    @Headers('authorization') authorization: string,
  ): Promise<any> {
    if (!authorization || !userId) {
      throw new BadRequestException('Authorization header and userId required');
    }

    const token = authorization.replace('Bearer ', '');
    await this.aiService.validateUserToken(token);
    
    return this.aiService.getLatestEducationalContentForUser(userId);
  }
  
  // All learning resources for current student
  @Get('learning-resources')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get combined learning resources for current student' })
  @ApiResponse({
    status: 200,
    description: 'Returns combined learning resources (videos, books, games, and other resources)',
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string' },
        timestamp: { type: 'string' },
        videos: { type: 'array' },
        books: { type: 'array' },
        games: { type: 'array' },
        resources: { type: 'array' },
        analysis: { type: 'object' }
      }
    }
  })
  async getLearningResources(
    @Query('userId') userId: string,
    @Headers('authorization') authorization: string,
  ): Promise<any> {
    if (!authorization || !userId) {
      throw new BadRequestException('Authorization header and userId required');
    }

    const token = authorization.replace('Bearer ', '');
    await this.aiService.validateUserToken(token);
    
    return this.aiService.getCombinedLearningResources(userId, token);
  }

  // Guest recommendations after analysis
  @Post('guest/recommendations')
  @ApiOperation({ summary: 'Get guest recommendations after analysis' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        quizId: { type: 'string' },
      },
      required: ['sessionId', 'quizId'],
    },
  })
  async getGuestRecommendations(@Body() body: { sessionId: string; quizId: string }): Promise<any> {
    return this.aiService.generateGuestRecommendations(body);
  }

  // Health check endpoint
  @Get('health')
  @ApiOperation({ summary: 'Health check for AI service' })
  @ApiResponse({ 
    status: 200, 
    description: 'Service health status', 
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        service: { type: 'string' },
        timestamp: { type: 'string' },
        version: { type: 'string' },
        mainServiceConnectivity: { 
          type: 'object',
          properties: {
            url: { type: 'string' },
            status: { type: 'string' },
            error: { type: 'string' },
          }
        },
        environment: {
          type: 'object',
          properties: {
            nodeEnv: { type: 'string' },
            port: { type: 'number' },
            mainServiceUrl: { type: 'string' },
          }
        }
      }
    }
  })
  async healthCheck() {
    // Check connectivity to main service
    let mainServiceConnectivity = { 
      url: this.aiService.getMainServiceUrl(),
      status: 'unknown', 
      error: null 
    };
    
    try {
      // Try a simple ping to the main service
      await this.aiService.pingMainService();
      mainServiceConnectivity.status = 'connected';
    } catch (error) {
      mainServiceConnectivity.status = 'disconnected';
      mainServiceConnectivity.error = error.message;
      this.logger.warn(`Health check failed to connect to main service: ${error.message}`);
    }
    
    return {
      status: 'healthy',
      service: 'SkillSeed AI Microservice',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      mainServiceConnectivity,
      environment: {
        nodeEnv: process.env.NODE_ENV || 'development',
        port: parseInt(process.env.PORT || '3001'),
        mainServiceUrl: this.aiService.getMainServiceUrl(),
      }
    };
  }
}