// repairService.js - Sistema de reparación de archivos
import { environment } from '../environments/enviroment.js';
import { logger } from './logger.js';
import { fileValidator } from './fileValidator.js';
import { retryManager } from './retryManager.js';
import PatchDownloader from './patchDownloader.js';

class RepairService {
  constructor() {
    this.patchDownloader = null; // Se inicializará después
    this.isRepairing = false;
    this.repairProgress = {
      totalFiles: 0,
      completedFiles: 0,
      currentFile: null,
      currentProgress: 0
    };
  }

  // Inicializar servicio de reparación
  async initialize(patchDownloader) {
    try {
      logger.info('Initializing repair service');
      this.patchDownloader = patchDownloader;
      logger.info('Repair service initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize repair service', { error: error.message });
      throw error;
    }
  }

  // Configurar el repair con la carpeta del juego y callback de progreso
  setupRepair(gamePath, onProgress) {
    this.gamePath = gamePath;
    this.onProgress = onProgress;
  }

  // Iniciar proceso de reparación
  async startRepair() {
    try {
      logger.info('Starting repair process');
      
      // Actualizar token antes de empezar
      await this.patchDownloader.checkAndUpdateToken();
      
      // Obtener archivos específicos de repair del servidor
      const repairFiles = await this.patchDownloader.getRepairFiles();
      
      console.log('🔧 Archivos de repair obtenidos:', repairFiles);
      
      if (!repairFiles || repairFiles.length === 0) {
        logger.info('No repair files found on server');
        return { success: true, message: 'No files need repair' };
      }
      
      logger.info(`Found ${repairFiles.length} files to repair`);
      
      // Crear carpeta temporal para repair
      const tempRepairFolder = await this.createTempRepairFolder(this.gamePath);
      
      let repairedCount = 0;
      
      // Procesar cada archivo de repair
      for (let i = 0; i < repairFiles.length; i++) {
        const repairFile = repairFiles[i];
        
        try {
          logger.info(`Repairing file ${i + 1}/${repairFiles.length}: ${repairFile.name}`);
          
          // Callback para progreso con información detallada
          const onProgress = (progressData) => {
            const enhancedProgressData = {
              ...progressData,
              currentFile: repairFile.name,
              currentPhase: 'repair',
              fileIndex: i + 1,
              totalFiles: repairFiles.length,
              phaseProgress: ((i + 1) / repairFiles.length) * 100
            };
            
            // Llamar al callback de progreso del gameLauncher
            if (this.onProgress) {
              this.onProgress(enhancedProgressData);
            }
          };
          
          // Descargar archivo de repair usando endpoint específico
          await this.patchDownloader.downloadRepairFile(
            repairFile.name, 
            tempRepairFolder, 
            onProgress
          );
          
          // Extraer archivo
          const zipPath = window.electron.path.join(tempRepairFolder, repairFile.name);
          await this.patchDownloader.extractFile(zipPath, this.gamePath, onProgress);
          
          // Eliminar archivo ZIP temporal
          await this.deleteTempZip(zipPath);
          
          repairedCount++;
          logger.info(`File repaired successfully: ${repairFile.name}`);
          
        } catch (error) {
          logger.error(`Failed to repair file ${repairFile.name}`, { error: error.message });
          throw error;
        }
      }
      
      // Limpiar carpeta temporal
      await this.cleanupTempRepairFolder(tempRepairFolder);
      
      // Verificar integridad final
      await this.patchDownloader.verifyFileIntegrity(this.gamePath);
      
      logger.info(`Repair completed successfully. ${repairedCount} files repaired.`);
      
      return { 
        success: true, 
        message: `Repair completed. ${repairedCount} files repaired.`,
        repairedCount 
      };
      
    } catch (error) {
      logger.error('Repair process failed', { error: error.message });
      throw error;
    }
  }

  // Crear carpeta temporal para reparación
  async createTempRepairFolder(destFolder) {
    try {
      if (!window.electron) {
        throw new Error('Electron no está disponible');
      }
      
      const tempRepairFolder = window.electron.path.join(destFolder, 'temp_repair');
      await window.electron.createDirectory(tempRepairFolder);
      return tempRepairFolder;
    } catch (error) {
      logger.error('Error creando carpeta temporal de reparación:', error);
      throw error;
    }
  }

  // Limpiar carpeta temporal de reparación
  async cleanupTempRepairFolder(tempRepairFolder) {
    try {
      if (!window.electron || !tempRepairFolder) {
        return;
      }
      
      await window.electron.removeDirectory(tempRepairFolder);
    } catch (error) {
      logger.error('Error limpiando carpeta temporal de reparación:', error);
    }
  }

  // Identificar archivos que necesitan reparación
  identifyFilesToRepair(serverFiles, localFiles) {
    const filesToRepair = [];

    for (const serverFile of serverFiles) {
      const localFile = localFiles.find(lf => lf.name === serverFile.name);
      
      if (!localFile) {
        // Archivo no existe localmente
        filesToRepair.push({
          ...serverFile,
          reason: 'missing',
          action: 'download'
        });
        continue;
      }

      // Verificar si el archivo está corrupto o desactualizado
      const needsRepair = this.checkIfFileNeedsRepair(localFile, serverFile);
      
      if (needsRepair) {
        filesToRepair.push({
          ...serverFile,
          reason: needsRepair.reason,
          action: 'redownload'
        });
      }
    }

    logger.info(`Identified ${filesToRepair.length} files for repair`, {
      reasons: filesToRepair.map(f => ({ name: f.name, reason: f.reason }))
    });

    return filesToRepair;
  }

  // Verificar si un archivo necesita reparación
  checkIfFileNeedsRepair(localFile, serverFile) {
    // Verificar tamaño
    if (localFile.size !== serverFile.size) {
      return { reason: 'size_mismatch', details: { local: localFile.size, server: serverFile.size } };
    }

    // Verificar fecha de modificación (si es muy antigua)
    const localDate = new Date(localFile.modified_date);
    const serverDate = new Date(serverFile.modified_date);
    const daysDifference = (serverDate - localDate) / (1000 * 60 * 60 * 24);

    if (daysDifference > 7) {
      return { reason: 'outdated', details: { daysDifference } };
    }

    // Verificar si es un directorio cuando debería ser un archivo
    if (localFile.isDirectory && !serverFile.isDirectory) {
      return { reason: 'type_mismatch', details: { local: 'directory', server: 'file' } };
    }

    return null;
  }

  // Reparar un archivo específico usando el sistema real
  async repairFile(file, destFolder, tempRepairFolder, onProgress) {
    try {
      logger.info(`Repairing file: ${file.name}`, { reason: file.reason });

      this.repairProgress.currentFile = file.name;
      this.repairProgress.currentProgress = 0;

      // Actualizar progreso inicial
      onProgress?.({
        file: file.name,
        reason: file.reason,
        progress: 0,
        total: this.repairProgress.totalFiles,
        completed: this.repairProgress.completedFiles
      });

      // DESCARGAR archivo usando el sistema real
      const zipPath = await this.patchDownloader.downloadFile(
        file.name, 
        tempRepairFolder, 
        (progress) => {
          // Actualizar progreso de descarga (0-60%)
          const downloadProgress = progress.percent * 0.6;
          this.repairProgress.currentProgress = downloadProgress;
          
          onProgress?.({
            file: file.name,
            reason: file.reason,
            progress: downloadProgress,
            total: this.repairProgress.totalFiles,
            completed: this.repairProgress.completedFiles
          });
        }
      );

      // EXTRAER archivo usando el sistema real
      await this.patchDownloader.extractFile(
        zipPath, 
        destFolder, 
        (progress) => {
          // Actualizar progreso de extracción (60-100%)
          const extractionProgress = 60 + (progress * 0.4);
          this.repairProgress.currentProgress = extractionProgress;
          
          onProgress?.({
            file: file.name,
            reason: file.reason,
            progress: extractionProgress,
            total: this.repairProgress.totalFiles,
            completed: this.repairProgress.completedFiles
          });
        }
      );

      logger.info(`File repaired successfully: ${file.name}`);

    } catch (error) {
      logger.error(`Failed to repair file: ${file.name}`, { error: error.message });
      throw error;
    }
  }

  // Verificar integridad de archivos
  async verifyFileIntegrity(destFolder) {
    try {
      logger.info('Starting file integrity verification');

      const localFiles = await this.patchDownloader.getLocalFiles(destFolder);
      const serverFiles = await this.patchDownloader.getAvailableFiles();

      const integrityReport = {
        totalFiles: localFiles.length,
        validFiles: 0,
        corruptedFiles: 0,
        missingFiles: 0,
        details: []
      };

      for (const serverFile of serverFiles) {
        const localFile = localFiles.find(lf => lf.name === serverFile.name);
        
        if (!localFile) {
          integrityReport.missingFiles++;
          integrityReport.details.push({
            name: serverFile.name,
            status: 'missing',
            reason: 'File not found locally'
          });
          continue;
        }

        // Verificar integridad básica
        const isValid = await this.verifySingleFile(localFile, serverFile);
        
        if (isValid) {
          integrityReport.validFiles++;
          integrityReport.details.push({
            name: serverFile.name,
            status: 'valid'
          });
        } else {
          integrityReport.corruptedFiles++;
          integrityReport.details.push({
            name: serverFile.name,
            status: 'corrupted',
            reason: 'File integrity check failed'
          });
        }
      }

      logger.info('File integrity verification completed', integrityReport);
      return integrityReport;

    } catch (error) {
      logger.error('File integrity verification failed', { error: error.message });
      throw error;
    }
  }

  // Verificar integridad de un archivo específico
  async verifySingleFile(localFile, serverFile) {
    try {
      // Verificar tamaño
      if (localFile.size !== serverFile.size) {
        return false;
      }

      // Verificar fecha de modificación (tolerancia de 1 día)
      const localDate = new Date(localFile.modified_date);
      const serverDate = new Date(serverFile.modified_date);
      const daysDifference = Math.abs(serverDate - localDate) / (1000 * 60 * 60 * 24);

      if (daysDifference > 1) {
        return false;
      }

      return true;
    } catch (error) {
      logger.error('File integrity check failed', { 
        file: localFile.name, 
        error: error.message 
      });
      return false;
    }
  }

  // Obtener estadísticas de reparación
  getRepairStats() {
    return {
      isRepairing: this.isRepairing,
      progress: this.repairProgress,
      config: {
        enableChecksums: environment.validation.enableChecksums,
        enableFilePermissions: environment.validation.enableFilePermissions
      }
    };
  }

  // Cancelar reparación
  cancelRepair() {
    if (this.isRepairing) {
      this.isRepairing = false;
      logger.info('Repair process cancelled by user');
    }
  }

  // Crear carpeta temporal para reparación
  async createTempRepairFolder(destFolder) {
    try {
      if (!window.electron) {
        throw new Error('Electron no está disponible');
      }
      
      const tempRepairFolder = window.electron.path.join(destFolder, 'temp_repair');
      await window.electron.createDirectory(tempRepairFolder);
      return tempRepairFolder;
    } catch (error) {
      logger.error('Error creando carpeta temporal de reparación', { error: error.message });
      throw error;
    }
  }

  // Limpiar carpeta temporal de reparación
  async cleanupTempRepairFolder(tempFolder) {
    try {
      if (!window.electron) {
        return;
      }
      
      if (tempFolder) {
        await window.electron.removeDirectory(tempFolder);
      }
    } catch (error) {
      logger.error('Error limpiando carpeta temporal de reparación', { error: error.message });
      // No lanzar error, solo log
    }
  }

  // Nuevo helper para eliminar ZIP temporal de reparación de forma segura
  async deleteTempZip(zipPath) {
    try {
      if (window.electron && typeof window.electron.deleteFile === 'function') {
        await window.electron.deleteFile(zipPath);
        return;
      }
      if (window.electron && window.electron.fs && typeof window.electron.fs.unlink === 'function') {
        await new Promise((resolve, reject) => {
          window.electron.fs.unlink(zipPath, (err) => err ? reject(err) : resolve());
        });
        return;
      }
      logger.info('deleteFile is not available in Electron preload; skipping deletion for', { zipPath });
    } catch (error) {
      logger.error('Error deleting temporary ZIP file', { zipPath, error: error.message });
    }
  }
}

export const repairService = new RepairService();