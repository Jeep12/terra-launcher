// installer.js
// Función simple para manejar rutas en el navegador
function pathJoin(...parts) {
  return parts.join('/').replace(/\/+/g, '/');
}

function pathBasename(filePath) {
  return filePath.split(/[\\\/]/).pop();
}

class Installer {
  constructor() {
    this.isInstalling = false;
    this.currentStep = '';
    this.totalSteps = 0;
    this.currentStepNumber = 0;
    this.installedFiles = new Set();
    this.failedFiles = new Set();
  }

  // Inicializar el instalador
  async initialize() {
    console.log('[INSTALLER] Inicializando instalador...');
    this.isInstalling = false;
    this.currentStep = '';
    this.totalSteps = 0;
    this.currentStepNumber = 0;
    this.installedFiles.clear();
    this.failedFiles.clear();
  }

  // Proceso completo de instalación
  async installAllFiles(destFolder, patchDownloader, onProgress, onComplete, onError) {
    if (this.isInstalling) {
      console.log('[INSTALLER] Ya hay una instalación en progreso');
      return;
    }

    try {
      this.isInstalling = true;
      this.totalSteps = 1; // Solo descargar y extraer (patchDownloader maneja todo)
      this.currentStepNumber = 0;

      console.log('[INSTALLER] Iniciando proceso de instalación...');

      // Usar patchDownloader que ya maneja descarga, extracción y limpieza
      await this.downloadAndExtractFiles(destFolder, patchDownloader, onProgress);

      // Resumen final
      const summary = {
        totalSteps: this.totalSteps,
        completedSteps: this.currentStepNumber,
        installedFiles: Array.from(this.installedFiles),
        failedFiles: Array.from(this.failedFiles),
        message: 'Instalación completada exitosamente'
      };

      console.log('[INSTALLER] Instalación completada:', summary);
      onComplete?.(summary);

    } catch (error) {
      console.error('[INSTALLER] Error en instalación:', error);
      onError?.(error);
    } finally {
      this.isInstalling = false;
    }
  }

  // Descargar y extraer archivos usando patchDownloader
  async downloadAndExtractFiles(destFolder, patchDownloader, onProgress) {
    this.currentStep = 'Descargando y extrayendo archivos...';
    this.currentStepNumber = 1;
    this.updateProgress(onProgress);

    console.log('[INSTALLER] Descargando y extrayendo archivos...');

    return new Promise((resolve, reject) => {
      patchDownloader.downloadAndExtractAllFiles(
        destFolder, // Descargar directamente en la carpeta destino
        (progress) => {
          // Progreso de descarga con información completa
          console.log(`[INSTALLER] Descarga: ${progress.currentFile} - ${progress.overallPercent}% (Fase: ${progress.phaseProgress}%)`);
          // Pasar información completa incluyendo archivo y velocidad real
          const speed = progress.speed || 0; // Usar la velocidad real del patchDownloader
          this.updateProgressWithDetails(onProgress, progress.overallPercent || 0, progress.currentFile, speed, 'download');
        },
        (filename, progress) => {
          // Progreso de extracción con información completa
          console.log(`[INSTALLER] Extracción: ${filename} - ${progress.overallPercent}% (Fase: ${progress.phaseProgress}%)`);
          // Pasar información completa incluyendo archivo y velocidad real
          const speed = progress.speed || 0; // Usar la velocidad real del patchDownloader
          this.updateProgressWithDetails(onProgress, progress.overallPercent || 0, progress.currentFile, speed, 'extraction');
        },
        (filename, completed, total) => {
          // Progreso de archivo individual
          console.log(`[INSTALLER] Archivo completado ${filename}: ${completed}/${total}`);
        },
        (summary) => {
          console.log('[INSTALLER] Proceso completado:', summary);
          // Verificar si se descargaron archivos o si todos están actualizados
          if (summary.downloaded > 0 || (typeof summary === 'string' && summary.includes('actualizados'))) {
            resolve(summary);
          } else {
            reject(new Error('No se descargaron archivos'));
          }
        },
        (error) => {
          console.error('[INSTALLER] Error en proceso:', error);
          reject(error);
        }
      );
    });
  }









  // Actualizar progreso
  updateProgress(onProgress, stepProgress = 0) {
    const overallProgress = Math.round(((this.currentStepNumber - 1) / this.totalSteps) * 100 + (stepProgress / this.totalSteps));
    
    // Pasar solo el número de progreso, no un objeto
    onProgress?.(overallProgress);
  }

  // Actualizar progreso con detalles adicionales
  updateProgressWithDetails(onProgress, stepProgress = 0, currentFile = null, speed = 0, operationType = 'download') {
    const overallProgress = Math.round(((this.currentStepNumber - 1) / this.totalSteps) * 100 + (stepProgress / this.totalSteps));
    
    // Pasar objeto con información completa
    onProgress?.({
      progress: overallProgress,
      currentFile: currentFile,
      speed: speed,
      operationType: operationType
    });
  }

  // Cancelar instalación
  cancelInstallation() {
    console.log('[INSTALLER] Cancelando instalación...');
    this.isInstalling = false;
  }

  // Obtener estadísticas de instalación
  getInstallStats() {
    return {
      isInstalling: this.isInstalling,
      currentStep: this.currentStep,
      currentStepNumber: this.currentStepNumber,
      totalSteps: this.totalSteps,
      installedFiles: Array.from(this.installedFiles),
      failedFiles: Array.from(this.failedFiles)
    };
  }
}

export { Installer }; 