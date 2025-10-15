import {
  Injectable,
  LoggerService as NestLoggerService,
  Scope,
  Inject,
} from '@nestjs/common';
import { Logger } from 'winston';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';

@Injectable({ scope: Scope.TRANSIENT })
export class LoggerService implements NestLoggerService {
  private context?: string;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  setContext(context: string) {
    this.context = context;
    return this;
  }

  log(message: any, context?: string) {
    this.logger.info(message, { context: context || this.context });
  }

  error(message: any, trace?: string, context?: string) {
    this.logger.error(message, {
      context: context || this.context,
      trace,
    });
  }

  warn(message: any, context?: string) {
    this.logger.warn(message, { context: context || this.context });
  }

  debug(message: any, context?: string) {
    this.logger.debug(message, { context: context || this.context });
  }

  verbose(message: any, context?: string) {
    this.logger.verbose(message, { context: context || this.context });
  }
}
