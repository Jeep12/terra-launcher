// retryManager.js - Sistema de reintentos inteligentes
import { environment } from '../environments/enviroment.js';
import { logger } from './logger.js';

class RetryManager {
  constructor() {
    this.config = environment.retry;
    this.activeRetries = new Map();
  }

  // Función principal de reintento
  async retry(operation, operationName = 'unknown', options = {}) {
    const {
      maxAttempts = this.config.maxAttempts,
      baseDelay = this.config.baseDelay,
      maxDelay = this.config.maxDelay,
      shouldRetry = this.defaultShouldRetry,
      onRetry = null
    } = options;

    let lastError = null;
    let attempt = 1;

    logger.info(`Starting retry operation: ${operationName}`, { maxAttempts });

    while (attempt <= maxAttempts) {
      try {
        logger.debug(`Attempt ${attempt}/${maxAttempts} for ${operationName}`);
        
        const result = await operation();
        
        if (attempt > 1) {
          logger.info(`Operation ${operationName} succeeded on attempt ${attempt}`);
        }
        
        return result;
      } catch (error) {
        lastError = error;
        
        logger.warn(`Attempt ${attempt}/${maxAttempts} failed for ${operationName}`, {
          error: error.message,
          attempt
        });

        if (attempt === maxAttempts) {
          logger.error(`Operation ${operationName} failed after ${maxAttempts} attempts`, {
            error: error.message
          });
          throw error;
        }

        if (!shouldRetry(error)) {
          logger.warn(`Operation ${operationName} failed with non-retryable error`, {
            error: error.message
          });
          throw error;
        }

        // Calcular delay con backoff exponencial
        const delay = this.calculateDelay(attempt, baseDelay, maxDelay);
        
        logger.info(`Retrying ${operationName} in ${delay}ms (attempt ${attempt + 1})`);
        
        if (onRetry) {
          onRetry(attempt, delay, error);
        }

        await this.sleep(delay);
        attempt++;
      }
    }

    throw lastError;
  }

  // Calcular delay con backoff exponencial
  calculateDelay(attempt, baseDelay, maxDelay) {
    const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.1 * exponentialDelay; // 10% de jitter
    const delay = Math.min(exponentialDelay + jitter, maxDelay);
    
    return Math.floor(delay);
  }

  // Función de sleep
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Función por defecto para determinar si se debe reintentar
  defaultShouldRetry(error) {
    // Reintentar en errores de red
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return true;
    }
    
    // Reintentar en errores de timeout
    if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
      return true;
    }
    
    // Reintentar en errores de conexión
    if (error.message.includes('network') || error.message.includes('ECONNRESET')) {
      return true;
    }
    
    // No reintentar en errores de autenticación o permisos
    if (error.message.includes('401') || error.message.includes('403')) {
      return false;
    }
    
    // No reintentar en errores de archivo no encontrado
    if (error.message.includes('404') || error.message.includes('ENOENT')) {
      return false;
    }
    
    return true;
  }

  // Reintento específico para descargas
  async retryDownload(downloadFunction, filename, options = {}) {
    return this.retry(
      downloadFunction,
      `download_${filename}`,
      {
        ...options,
        shouldRetry: (error) => {
          // Reintentar errores de red específicos para descargas
          return this.defaultShouldRetry(error) && 
                 !error.message.includes('disk space') &&
                 !error.message.includes('permission');
        }
      }
    );
  }

  // Reintento específico para extracciones
  async retryExtraction(extractionFunction, filename, options = {}) {
    return this.retry(
      extractionFunction,
      `extraction_${filename}`,
      {
        ...options,
        shouldRetry: (error) => {
          // Reintentar errores de extracción específicos
          return this.defaultShouldRetry(error) && 
                 !error.message.includes('corrupted') &&
                 !error.message.includes('invalid');
        }
      }
    );
  }

  // Reintento específico para operaciones de API
  async retryApiCall(apiFunction, endpoint, options = {}) {
    return this.retry(
      apiFunction,
      `api_${endpoint}`,
      {
        ...options,
        shouldRetry: (error) => {
          // Reintentar errores de API específicos
          return this.defaultShouldRetry(error) && 
                 !error.message.includes('401') &&
                 !error.message.includes('403') &&
                 !error.message.includes('404');
        }
      }
    );
  }

  // Cancelar reintentos activos
  cancelRetry(operationName) {
    if (this.activeRetries.has(operationName)) {
      const retry = this.activeRetries.get(operationName);
      retry.cancelled = true;
      logger.info(`Cancelled retry for operation: ${operationName}`);
    }
  }

  // Obtener estadísticas de reintentos
  getRetryStats() {
    return {
      activeRetries: this.activeRetries.size,
      config: this.config
    };
  }

  // Limpiar reintentos activos
  clearActiveRetries() {
    this.activeRetries.clear();
    logger.debug('Cleared active retries');
  }
}

export const retryManager = new RetryManager(); 