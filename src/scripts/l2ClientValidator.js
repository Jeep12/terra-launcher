// l2ClientValidator.js - Validador de estructura del cliente L2
import { logger } from './logger.js';

class L2ClientValidator {
  constructor() {
    // Carpetas críticas que debe tener un cliente L2 válido
    this.requiredFolders = [
      'Animations',
      'L2text', 
      'L2text_classic',
      'Maps',
      'music',
      'Sounds',
      'StaticMeshes',
      'system',
      'SysTextures',
      'Textures',
      'Video',
      'Voice'
    ];

    // Archivos críticos que debe tener
    this.requiredFiles = [
      'L2.exe'
    ];
  }

  // Validar archivos requeridos
  validateRequiredFiles(foundFiles) {
    const missingFiles = [];
    
    // L2.exe debe estar en la carpeta system, no en la raíz
    // Por eso no lo validamos aquí, se valida en validateL2Client
    return missingFiles;
  }

  // Validar si una carpeta es un cliente L2 válido
  async validateL2Client(folderPath) {
    try {
      logger.info('Validating L2 client structure', { folderPath });

      if (!folderPath) {
        return {
          isValid: false,
          reason: 'No folder path provided',
          missingFolders: this.requiredFolders,
          missingFiles: this.requiredFiles
        };
      }

      // Verificar que la carpeta existe
      const folderExists = await this.checkFolderExists(folderPath);
      if (!folderExists) {
        return {
          isValid: false,
          reason: 'Selected folder does not exist',
          missingFolders: this.requiredFolders,
          missingFiles: this.requiredFiles
        };
      }

      // Obtener contenido de la carpeta
      const folderContents = await this.getFolderContents(folderPath);
      
      // Validar carpetas requeridas
      const missingFolders = this.validateRequiredFolders(folderContents.folders);
      
      // Validar que L2.exe existe en la carpeta system
      const missingFiles = [];
      if (!missingFolders.includes('system')) {
        // Si la carpeta system existe, verificar que L2.exe esté ahí
        const systemFolderPath = folderPath + '/system';
        const systemExists = await this.checkFolderExists(systemFolderPath);
        
        if (systemExists) {
          const systemContents = await this.getFolderContents(systemFolderPath);
          if (!systemContents.files.includes('L2.exe')) {
            missingFiles.push('system/L2.exe');
          }
        } else {
          missingFiles.push('system/L2.exe');
        }
      } else {
        // Si no existe la carpeta system, L2.exe tampoco existe
        missingFiles.push('system/L2.exe');
      }

      // Determinar si es válido
      const isValid = missingFolders.length === 0 && missingFiles.length === 0;

      const result = {
        isValid,
        folderPath,
        foundFolders: folderContents.folders,
        foundFiles: folderContents.files,
        missingFolders,
        missingFiles,
        totalRequiredFolders: this.requiredFolders.length,
        totalRequiredFiles: 1, // Solo L2.exe
        foundRequiredFolders: this.requiredFolders.length - missingFolders.length,
        foundRequiredFiles: 1 - missingFiles.length
      };

      if (isValid) {
        result.reason = 'Valid L2 client structure';
        logger.info('L2 client validation successful', result);
      } else {
        result.reason = `Missing ${missingFolders.length} required folders and ${missingFiles.length} required files`;
        logger.warn('L2 client validation failed', result);
      }

      return result;

    } catch (error) {
      logger.error('Error validating L2 client', { error: error.message, folderPath });
      return {
        isValid: false,
        reason: `Validation error: ${error.message}`,
        error: error.message,
        missingFolders: this.requiredFolders,
        missingFiles: ['system/L2.exe']
      };
    }
  }

  // Verificar si una carpeta existe
  async checkFolderExists(folderPath) {
    try {
      if (window.electron && window.electron.pathExists) {
        return await window.electron.pathExists(folderPath);
      }
      
      // Fallback: intentar listar el contenido
      const contents = await this.getFolderContents(folderPath);
      return contents !== null;
    } catch (error) {
      return false;
    }
  }

  // Obtener contenido de una carpeta
  async getFolderContents(folderPath) {
    try {
      if (window.electron && window.electron.readDirectory) {
        const contents = await window.electron.readDirectory(folderPath);
        return {
          folders: contents.folders || [],
          files: contents.files || []
        };
      }

      // Fallback: usar el método existente del fileValidator
      // Esto asume que fileValidator tiene métodos para listar directorios
      return {
        folders: [],
        files: []
      };
    } catch (error) {
      logger.error('Error reading folder contents', { error: error.message, folderPath });
      return {
        folders: [],
        files: []
      };
    }
  }

  // Validar carpetas requeridas
  validateRequiredFolders(foundFolders) {
    const missingFolders = [];
    
    for (const requiredFolder of this.requiredFolders) {
      if (!foundFolders.includes(requiredFolder)) {
        missingFolders.push(requiredFolder);
      }
    }
    
    return missingFolders;
  }

  // Validar archivos requeridos
  validateRequiredFiles(foundFiles) {
    const missingFiles = [];
    
    for (const requiredFile of this.requiredFiles) {
      if (!foundFiles.includes(requiredFile)) {
        missingFiles.push(requiredFile);
      }
    }
    
    return missingFiles;
  }

  // Obtener estadísticas de validación
  getValidationStats(validationResult) {
    if (!validationResult) return null;

    const totalRequired = validationResult.totalRequiredFolders + validationResult.totalRequiredFiles;
    const foundRequired = validationResult.foundRequiredFolders + validationResult.foundRequiredFiles;
    const percentage = totalRequired > 0 ? Math.round((foundRequired / totalRequired) * 100) : 0;

    return {
      totalRequired,
      foundRequired,
      missingTotal: validationResult.missingFolders.length + validationResult.missingFiles.length,
      percentage,
      isValid: validationResult.isValid
    };
  }

  // Generar mensaje de error detallado
  getDetailedErrorMessage(validationResult) {
    if (!validationResult || validationResult.isValid) {
      return null;
    }

    let message = 'Invalid L2 client structure:\n';
    
    if (validationResult.missingFolders.length > 0) {
      message += `\nMissing folders (${validationResult.missingFolders.length}):\n`;
      validationResult.missingFolders.forEach(folder => {
        message += `  • ${folder}\n`;
      });
    }
    
    if (validationResult.missingFiles.length > 0) {
      message += `\nMissing files (${validationResult.missingFiles.length}):\n`;
      validationResult.missingFiles.forEach(file => {
        message += `  • ${file}\n`;
      });
    }

    return message;
  }

  // Verificar si una carpeta parece ser un cliente L2 (validación rápida)
  async quickValidate(folderPath) {
    try {
      const contents = await this.getFolderContents(folderPath);
      
      // Verificar al menos 3 carpetas críticas para una validación rápida
      const criticalFolders = ['system', 'Maps', 'Textures'];
      const foundCritical = criticalFolders.filter(folder => 
        contents.folders.includes(folder)
      );
      
      return {
        isValid: foundCritical.length >= 2, // Al menos 2 de 3 carpetas críticas
        foundCritical,
        totalCritical: criticalFolders.length
      };
    } catch (error) {
      return { isValid: false, error: error.message };
    }
  }
}

// Crear instancia global
const l2ClientValidator = new L2ClientValidator();

export { l2ClientValidator };
