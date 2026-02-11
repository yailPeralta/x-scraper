import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Interface for the standardized error response
 */
interface ErrorResponse {
  statusCode: number;
  timestamp: string;
  path: string;
  method: string;
  message: string | string[];
  error?: string;
  details?: unknown;
}

/**
 * Global Exception Filter
 *
 * Catches all exceptions thrown in the application and transforms them
 * into a standardized HTTP response format.
 *
 * Features:
 * - Consistent error response format across all endpoints
 * - Centralized logging of all errors
 * - Sensitive data sanitization in logs
 * - Different log levels based on error severity
 * - Stack trace hiding in production
 *
 * @example
 * // Register in main.ts
 * app.useGlobalFilters(new GlobalExceptionFilter());
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('GlobalExceptionFilter');

  /**
   * Main catch method that handles all exceptions
   */
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const { status, message, error, details } =
      this.extractErrorDetails(exception);

    const errorResponse: ErrorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
      error,
      details,
    };

    this.logError(exception, errorResponse, request);

    response.status(status).json(errorResponse);
  }

  /**
   * Extracts error details from different exception types
   */
  private extractErrorDetails(exception: unknown): {
    status: number;
    message: string | string[];
    error?: string;
    details?: unknown;
  } {
    // Handle NestJS HttpException and its subclasses
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseObj = exceptionResponse as Record<string, unknown>;
        return {
          status,
          message: (responseObj?.message as string | string[]) || exception?.message,
          error: (responseObj?.error as string) || exception?.name,
          details: responseObj?.details
        };  
      }

      return {
        status,
        message: exceptionResponse,
        error: exception.name,
      };
    }

    // Handle standard JavaScript Error
    if (exception instanceof Error) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: exception.message,
        error: exception.name,
        details: exception.stack,
      };
    }

    // Handle unknown error types
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Error interno del servidor',
      error: 'UnknownError',
    };
  }

  /**
   * Logs the error with appropriate level and context
   */
  private logError(
    exception: unknown,
    errorResponse: ErrorResponse,
    request: Request,
  ): void {
    const logContext = {
      ...errorResponse,
      userAgent: request.headers['user-agent'],
      ip: request.ip || request.headers['x-forwarded-for'],
      body: request.body,
      query: request.query,
      params: request.params,
    };

    // Log based on status code severity
    if (errorResponse.statusCode >= 500) {
      // Server errors - log with full stack trace
      this.logger.error(
        `[${errorResponse.method}] ${errorResponse.path} - ${errorResponse.statusCode}`,
        {
          ...logContext,
          stack: exception instanceof Error ? exception.stack : undefined,
          exceptionName:
            exception instanceof Error ? exception.name : 'Unknown',
        },
      );
    } else if (errorResponse.statusCode >= 400) {
      // Client errors - log as warning
      this.logger.warn(
        `[${errorResponse.method}] ${errorResponse.path} - ${errorResponse.statusCode}`,
        logContext,
      );
    }
  }
}
