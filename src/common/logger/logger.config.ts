import { transports, format, level, exitOnError } from 'winston';
import { utilities as nestWinstonModuleUtilities } from 'nest-winston';
import { ConfigService } from '@nestjs/config';
import 'winston-daily-rotate-file';

export const loggerConfig = (configService: ConfigService) => {
  const nodeEnv = configService.get('NODE_ENV') || 'development';
  const isProduction = nodeEnv === 'production';

  const customFormat = format.combine(
    format.timestamp(),
    format.ms(),
    nestWinstonModuleUtilities.format.nestLike('MyApp', {
      colors: !isProduction,
      prettyPrint: !isProduction,
    }),
  );

  const transportList = [
    new transports.DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '10m',
      maxFiles: '14d',
      level: 'error',
      format: format.combine(format.timestamp(), format.json()),
    }),

    new transports.DailyRotateFile({
      filename: 'logs/app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '10m',
      maxFiles: '14d',
      format: format.combine(format.timestamp(), format.json()),
    })
  ];

  if (!isProduction) {
    transportList.push(
        new transports.Console({
            format: customFormat,
        }) as any,
    );
  }

  return {
    level: 'info',
    format: customFormat,
    exitOnError: false,
    transports: transportList,
    defaultMeta: {
        service: 'skillseed-ai-backend',
        environment: nodeEnv,
    }
  }
};
