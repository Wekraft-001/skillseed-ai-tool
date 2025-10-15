import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Enable CORS for cross-service communication
  app.enableCors({
    origin: [
      'http://localhost:3000', // Main service
      'http://localhost:5173', // Frontend dev
      'http://localhost:3001', // This service
      process.env.FRONTEND_URL,
      process.env.MAIN_SERVICE_URL,
    ].filter(Boolean),
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  // API prefix
  app.setGlobalPrefix('api');

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('SkillSeed AI Microservice')
    .setDescription('AI-powered quiz generation, analysis, and YouTube educational content discovery')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('AI TOOLS', 'AI quiz generation and analysis endpoints')
    .addTag('YouTube Service', 'YouTube educational content discovery')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const port = process.env.PORT || 3001; // Default to 3001 for AI service
  await app.listen(port);
  
  console.log(`🚀 SkillSeed AI Microservice running on port ${port}`);
  console.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
  console.log(`🔍 Health Check: http://localhost:${port}/api/ai/health`);
}
bootstrap();
