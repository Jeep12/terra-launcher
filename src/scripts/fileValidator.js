// fileValidator.js - Validación de archivos críticos del juego
import { environment } from '../environments/enviroment.js';
import { logger } from './logger.js';

class FileValidator {
  constructor() {
    this.criticalFiles = environment.validation.criticalFiles;
    this.validationResults = new Map();
  }

  // Validar archivos críticos del juego
  async validateCriticalFiles(gamePath) {
    try {
      logger.info('Validating critical game files', { gamePath });
      
      const validationReport = {
        isValid: true,
        missingFiles: [],
        corruptedFiles: [],
        validFiles: [],
        totalCriticalFiles: this.criticalFiles.length,
        details: []
      };

      for (const criticalFile of this.criticalFiles) {
        const filePath = window.electron.path.join(gamePath, criticalFile);
        const validation = await this.validateSingleFile(filePath, criticalFile);
        
        if (validation.isValid) {
          validationReport.validFiles.push(criticalFile);
          validationReport.details.push({
            file: criticalFile,
            status: 'valid',
            path: filePath
          });
        } else {
          validationReport.isValid = false;
          if (validation.missing) {
            validationReport.missingFiles.push(criticalFile);
            validationReport.details.push({
              file: criticalFile,
              status: 'missing',
              path: filePath,
              reason: 'File not found'
            });
          } else {
            validationReport.corruptedFiles.push(criticalFile);
            validationReport.details.push({
              file: criticalFile,
              status: 'corrupted',
              path: filePath,
              reason: validation.reason || 'File validation failed'
            });
          }
        }
      }

      logger.info('Critical files validation completed', validationReport);
      return validationReport;

    } catch (error) {
      logger.error('Critical files validation failed', { error: error.message });
      throw error;
    }
  }

  // Validar un archivo específico
  async validateSingleFile(filePath, fileName) {
    try {
      if (!window.electron) {
        throw new Error('Electron not available');
      }

      // Verificar si el archivo existe
      const exists = await window.electron.fileExists(filePath);
      if (!exists) {
        return {
          isValid: false,
          missing: true,
          reason: 'File not found'
        };
      }

      // Verificar si es un directorio
      const isDirectory = await window.electron.isDirectory(filePath);
      if (fileName.endsWith('/') && !isDirectory) {
        return {
          isValid: false,
          missing: false,
          reason: 'Expected directory but found file'
        };
      }

      // Verificar permisos de lectura
      const canRead = await window.electron.canReadFile(filePath);
      if (!canRead) {
        return {
          isValid: false,
          missing: false,
          reason: 'Cannot read file (permission denied)'
        };
      }

      // Verificar tamaño mínimo para archivos
      if (!isDirectory && !fileName.endsWith('/')) {
        const fileSize = await window.electron.getFileSize(filePath);
        if (fileSize === 0) {
          return {
            isValid: false,
            missing: false,
            reason: 'File is empty (0 bytes)'
          };
        }
      }

      return {
        isValid: true,
        missing: false
      };

    } catch (error) {
      logger.error('File validation failed', { 
        filePath, 
        fileName, 
        error: error.message 
      });
      return {
        isValid: false,
        missing: false,
        reason: error.message
      };
    }
  }

  // Verificar si el juego está listo para iniciar
  async isGameReadyToLaunch(gamePath) {
    try {
      const validationReport = await this.validateCriticalFiles(gamePath);
      
      if (!validationReport.isValid) {
        logger.warn('Game not ready to launch - critical files missing or corrupted', {
          missingFiles: validationReport.missingFiles,
          corruptedFiles: validationReport.corruptedFiles
        });
        return {
          ready: false,
          reason: 'Critical files missing or corrupted',
          details: validationReport
        };
      }

      logger.info('Game is ready to launch - all critical files validated');
      return {
        ready: true,
        reason: 'All critical files validated successfully',
        details: validationReport
      };

    } catch (error) {
      logger.error('Game readiness check failed', { error: error.message });
      return {
        ready: false,
        reason: 'Validation check failed',
        error: error.message
      };
    }
  }

  // Obtener estadísticas de validación
  getValidationStats() {
    return {
      totalValidations: this.validationResults.size,
      lastValidation: this.validationResults.size > 0 ? 
        Array.from(this.validationResults.values()).pop() : null,
      criticalFiles: this.criticalFiles
    };
  }

  // Limpiar resultados de validación
  clearValidationResults() {
    this.validationResults.clear();
    logger.debug('Validation results cleared');
  }
}

export const fileValidator = new FileValidator(); 