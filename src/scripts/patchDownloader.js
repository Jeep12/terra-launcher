// patchDownloader.js
import { environment } from '../environments/enviroment.js';
import { logger } from './logger.js';

class PatchDownloader {
  constructor() {
    this.baseUrl = environment.downloadUrl;
    this.token = null;
    this.tokenExpiry = null;
    this.downloadQueue = [];
    this.isDownloading = false;
    this.currentDownload = null;
    this.retryAttempts = 3;
    this.downloadedFiles = new Set();
    this.failedFiles = new Set();
    this.tempDownloadFolder = null;
    this.userDataFolder = null;
    this.updateStateFile = null;
    this.extractionProgress = 0;
    this.downloadProgress = 0;
    this.currentFolder = null; // Nueva propiedad para trackear la carpeta actual
  }

  // Función para generar un hash simple de la ruta de la carpeta
  generateFolderHash(folderPath) {
    // Crear un hash simple basado en la ruta de la carpeta
    let hash = 0;
    for (let i = 0; i < folderPath.length; i++) {
      const char = folderPath.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convertir a entero de 32 bits
    }
    return Math.abs(hash).toString(16);
  }

  // Inicializar el downloader
  async initialize() {
    try {
      // Obtener carpeta userData para archivo de estado
      if (window.electron) {
        this.userDataFolder = await window.electron.getUserDataPath();
      }
      
      await this.getToken();
      return true;
    } catch (error) {
      console.error('[PATCH] Error en inicialización:', error);
      throw error;
    }
  }

  // Actualizar el estado de la carpeta actual
  updateCurrentFolder(folderPath) {
    console.log('[PATCH] === updateCurrentFolder called ===');
    console.log('[PATCH] New folder path:', folderPath);
    console.log('[PATCH] Previous folder:', this.currentFolder);
    
    this.currentFolder = folderPath;
    
    if (this.currentFolder && window.electron) {
      const folderHash = this.generateFolderHash(this.currentFolder);
      this.updateStateFile = window.electron.path.join(this.userDataFolder, `update_state_${folderHash}.json`);
      
      console.log('[PATCH] Generated folder hash:', folderHash);
      console.log('[PATCH] Update state file path:', this.updateStateFile);
    } else {
      console.log('[PATCH] Cannot set update state file - missing requirements');
      this.updateStateFile = null;
    }
  }

  // Limpiar estado cuando se cambia de carpeta
  clearStateForFolder(folderPath) {
    if (window.electron && this.userDataFolder) {
      const folderHash = this.generateFolderHash(folderPath);
      const stateFile = window.electron.path.join(this.userDataFolder, `update_state_${folderHash}.json`);
      
      try {
        // Intentar eliminar el archivo de estado si existe
        window.electron.writeFile(stateFile, '').catch(() => {
          // Si el archivo no existe, no hay problema
        });
      } catch (error) {
        // Error silencioso
      }
    }
  }

  // Obtener token JWT del servidor
  async getToken() {
    try {
      console.log('🔑 getToken() called');
      console.log('🔑 Base URL:', this.baseUrl);
      
      const response = await fetch(this.baseUrl);
      console.log('🔑 Token response status:', response.status);
      
      if (!response.ok) {
        logger.warn(`Server returned ${response.status} for token request`);
        throw new Error(`Server error: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('🔑 Token response data:', data);
      
      if (!data.success) {
        logger.warn('Server returned error for token request', { message: data.message });
        throw new Error(data.message || 'Server returned error');
      }
      
      this.token = data.token;
      this.tokenExpiry = Date.now() + (data.expires_in * 1000);
      
      console.log('✅ getToken() completed, token length:', this.token?.length || 0);
      logger.info('Token obtained successfully');
      return this.token;
      
    } catch (error) {
      console.error('❌ getToken() error:', error);
      logger.error('Failed to get token from server', { error: error.message });
      throw error;
    }
  }

  // Verificar si el token está expirado y renovarlo si es necesario
  async checkAndUpdateToken() {
    const now = Date.now();
    const bufferTime = 5 * 60 * 1000; // 5 minutos de buffer
    
    if (!this.token || (this.tokenExpiry && now >= (this.tokenExpiry - bufferTime))) {
      await this.getToken();
    }
    
    return this.token;
  }

  // Obtener archivos disponibles del servidor
  async getAvailableFiles() {
    try {
      console.log('🔍 getAvailableFiles() called');
      await this.checkAndUpdateToken();
      
      const requestUrl = `${this.baseUrl}?action=list&token=${this.token}`;
      console.log('📡 Request URL:', requestUrl);
      
      const response = await fetch(requestUrl);
      console.log('📡 Response status:', response.status);
      
      if (!response.ok) {
        logger.warn(`Server returned ${response.status} for file list request`);
        return [];
      }
      
      const data = await response.json();
      console.log('📡 Response data:', data);
      
      if (!data.success) {
        logger.warn('Server returned error for file list request', { message: data.message });
        return [];
      }
      
      const files = data.files || [];
      console.log('✅ getAvailableFiles() completed, files:', files.length);
      logger.info(`Retrieved ${files.length} files from server`);
      return files;
      
    } catch (error) {
      console.error('❌ getAvailableFiles() error:', error);
      logger.error('Failed to get available files from server', { error: error.message });
      return [];
    }
  }

    // Obtener archivos locales
  async getLocalFiles(destFolder) {
    try {
      // Actualizar la carpeta actual
      this.updateCurrentFolder(destFolder);
      
      if (window.electron) {
        return await window.electron.getLocalFiles(destFolder);
      } else {
        // Fallback: simular archivos locales vacíos
        return [];
      }
    } catch (error) {
      console.error('[PATCH] Error obteniendo archivos locales:', error);
      return [];
    }
  }

  // Verificar si una carpeta ya fue actualizada previamente
  async isFolderPreviouslyUpdated(folderPath) {
    try {
      console.log('[PATCH] === Checking if folder was previously updated ===');
      console.log('[PATCH] Folder path:', folderPath);
      
      // Actualizar la carpeta actual temporalmente para generar el hash
      const originalFolder = this.currentFolder;
      this.updateCurrentFolder(folderPath);
      
      const updateState = await this.getUpdateState();
      
      // Restaurar la carpeta original
      this.currentFolder = originalFolder;
      
      if (updateState && updateState.serverFiles && updateState.serverFiles.length > 0) {
        console.log('[PATCH] Folder was previously updated:', {
          lastUpdate: new Date(updateState.lastUpdate).toLocaleString(),
          serverFilesCount: updateState.serverFiles.length
        });
        return true;
      }
      
      console.log('[PATCH] Folder was not previously updated');
      return false;
    } catch (error) {
      console.error('[PATCH] Error checking if folder was previously updated:', error);
      return false;
    }
  }

  // Leer estado de actualización guardado
  async getUpdateState() {
    try {
      if (!this.updateStateFile || !window.electron || !this.currentFolder) {
        console.log('[PATCH] Cannot get update state - missing requirements:', {
          hasUpdateStateFile: !!this.updateStateFile,
          hasElectron: !!window.electron,
          hasCurrentFolder: !!this.currentFolder
        });
        return null;
      }

      console.log('[PATCH] Reading update state from:', this.updateStateFile);
      const stateData = await window.electron.readFile(this.updateStateFile);
      
      if (stateData) {
        const state = JSON.parse(stateData);
        console.log('[PATCH] Update state loaded successfully:', {
          folderPath: state.folderPath,
          lastUpdate: state.lastUpdate,
          serverFilesCount: state.serverFiles?.length || 0
        });
        return state;
      }
      
      console.log('[PATCH] No update state file found or empty');
      return null;
    } catch (error) {
      console.error('[PATCH] Error reading update state:', error);
      return null;
    }
  }

  // Guardar estado de actualización en userData
  async saveUpdateState(serverFiles) {
    try {
      console.log('[PATCH] === saveUpdateState called ===');
      console.log('[PATCH] Server files to save:', serverFiles.length);
      
      if (!this.updateStateFile || !window.electron || !this.currentFolder) {
        console.log('[PATCH] Cannot save update state - missing requirements:', {
          hasUpdateStateFile: !!this.updateStateFile,
          hasElectron: !!window.electron,
          hasCurrentFolder: !!this.currentFolder
        });
        return;
      }

      const state = {
        folderPath: this.currentFolder,
        lastUpdate: Date.now(),
        lastVerification: Date.now(),
        serverFiles: serverFiles.map(file => ({
          name: file.name,
          size: file.size,
          modified: file.modified,
          modified_date: file.modified_date,
          checksum: file.checksum || null, // Si el servidor proporciona checksums
          integrity_status: 'verified' // Estado de integridad
        })),
        localFiles: [], // Información de archivos locales
        repairHistory: [], // Historial de reparaciones
        downloadStats: {
          totalDownloads: 0,
          successfulDownloads: 0,
          failedDownloads: 0,
          lastDownloadSpeed: 0,
          averageDownloadSpeed: 0
        }
      };

      console.log('[PATCH] Saving update state to:', this.updateStateFile);
      await window.electron.writeFile(this.updateStateFile, JSON.stringify(state, null, 2));
      console.log('[PATCH] Update state saved successfully');
    } catch (error) {
      console.error('[PATCH] Error saving update state:', error);
    }
  }

  // Comparar archivos y obtener los que faltan o están desactualizados
  getMissingFiles(serverFiles, localFiles) {
    const localFileNames = new Set(localFiles.map(f => f.name));
    return serverFiles.filter(file => !localFileNames.has(file.name));
  }

  // Verificar si un archivo local está actualizado
  isFileUpToDate(localFile, serverFile) {
    if (!localFile || !serverFile) {
      return false;
    }
    
    // Comparar tamaños
    if (localFile.size !== serverFile.size) {
      return false;
    }
    
    // Comparar fechas de modificación
    if (localFile.modified && serverFile.modified) {
      const localDate = new Date(localFile.modified * 1000);
      const serverDate = new Date(serverFile.modified * 1000);
      
      if (localDate.getTime() < serverDate.getTime()) {
        return false;
      }
    }
    
    return true;
  }

  // Obtener archivos que necesitan actualización
  async getFilesToUpdate(serverFiles, localFiles) {
    console.log('[PATCH] === getFilesToUpdate called ===');
    console.log('[PATCH] Current folder:', this.currentFolder);
    console.log('[PATCH] Server files count:', serverFiles.length);
    console.log('[PATCH] Local files count:', localFiles.length);
    
    // Primero intentar usar el estado guardado
    const updateState = await this.getUpdateState();
    console.log('[PATCH] Update state found:', !!updateState);
    
    if (updateState && updateState.serverFiles && updateState.folderPath === this.currentFolder) {
      console.log('[PATCH] Using saved update state for comparison');
      console.log('[PATCH] Saved files count:', updateState.serverFiles.length);
      
      const savedFilesMap = new Map(updateState.serverFiles.map(f => [f.name, f]));
      const filesToUpdate = [];
      
      for (const serverFile of serverFiles) {
        const savedFile = savedFilesMap.get(serverFile.name);
        
        if (!savedFile) {
          // Archivo nuevo en el servidor
          console.log('[PATCH] New file on server:', serverFile.name);
          filesToUpdate.push(serverFile);
        } else if (savedFile.modified !== serverFile.modified || savedFile.size !== serverFile.size) {
          // Archivo actualizado en el servidor
          console.log('[PATCH] File updated on server:', serverFile.name, {
            savedModified: savedFile.modified,
            serverModified: serverFile.modified,
            savedSize: savedFile.size,
            serverSize: serverFile.size
          });
          filesToUpdate.push(serverFile);
        } else {
          console.log('[PATCH] File is up to date:', serverFile.name);
        }
      }
      
      console.log('[PATCH] Files to update (using saved state):', filesToUpdate.length);
      return filesToUpdate;
    }
    
    console.log('[PATCH] No saved state found, using local files comparison');
    
    // Fallback: comparar con archivos locales
    const localFilesMap = new Map(localFiles.map(f => [f.name, f]));
    const filesToUpdate = [];
    
    for (const serverFile of serverFiles) {
      const localFile = localFilesMap.get(serverFile.name);
      
      if (!localFile) {
        // Archivo no existe localmente
        console.log('[PATCH] File missing locally:', serverFile.name);
        filesToUpdate.push(serverFile);
      } else if (!this.isFileUpToDate(localFile, serverFile)) {
        // Archivo existe pero está desactualizado
        console.log('[PATCH] File outdated locally:', serverFile.name);
        filesToUpdate.push(serverFile);
      } else {
        console.log('[PATCH] File is up to date (local check):', serverFile.name);
      }
    }
    
    console.log('[PATCH] Files to update (using local files):', filesToUpdate.length);
    return filesToUpdate;
  }

  // Crear carpeta temporal para descargas
  async createTempDownloadFolder(destFolder) {
    try {
      // Verificar que window.electron esté disponible
      if (!window.electron) {
        throw new Error('Electron no está disponible');
      }
      
      // Usar la función path del preload
      this.tempDownloadFolder = window.electron.path.join(destFolder, 'temp_download');
      await window.electron.createDirectory(this.tempDownloadFolder);
      return this.tempDownloadFolder;
    } catch (error) {
      console.error('[PATCH] Error creando carpeta temporal:', error);
      throw error;
    }
  }

  // Descargar y extraer todos los archivos automáticamente
  async downloadAndExtractAllFiles(destFolder, onDownloadProgress, onExtractionProgress, onFileComplete, onComplete, onError) {
    if (this.isDownloading) {
      return;
    }

    try {
      this.isDownloading = true;
      this.downloadedFiles.clear();
      this.failedFiles.clear();
      this.extractionProgress = 0;
      this.downloadProgress = 0;

      // Crear carpeta temporal
      await this.createTempDownloadFolder(destFolder);

      // Obtener archivos disponibles
      const serverFiles = await this.getAvailableFiles();
      if (serverFiles.length === 0) {
        onComplete?.('No hay archivos para descargar');
        return;
      }

      // Verificar si la carpeta ya fue actualizada previamente
      const wasPreviouslyUpdated = await this.isFolderPreviouslyUpdated(destFolder);
      console.log('[PATCH] Folder was previously updated:', wasPreviouslyUpdated);
      
      // Obtener archivos locales para comparar
      const localFiles = await this.getLocalFiles(destFolder);
      const filesToUpdate = await this.getFilesToUpdate(serverFiles, localFiles);
      
      console.log('[PATCH] Files that need updating:', filesToUpdate.length);
      
      if (filesToUpdate.length === 0) {
        if (wasPreviouslyUpdated) {
          onComplete?.('Todos los archivos están actualizados ✓ (carpeta previamente actualizada)');
        } else {
          onComplete?.('Todos los archivos están actualizados ✓');
        }
        return;
      }

      let completedFiles = 0;
      const totalFiles = filesToUpdate.length;

      // Procesar archivos uno por uno
      for (const file of filesToUpdate) {
        if (!this.isDownloading) {
          break;
        }



        try {
          // Calcular rangos de progreso para este archivo
          const fileStartProgress = (completedFiles / totalFiles) * 100;
          const fileEndProgress = ((completedFiles + 1) / totalFiles) * 100;
          const fileProgressRange = fileEndProgress - fileStartProgress;
          const downloadRange = fileProgressRange * 0.6; // 60% para descarga
          const extractRange = fileProgressRange * 0.4;  // 40% para extracción
          
          // Descargar archivo
          const zipPath = await this.downloadFile(file.name, this.tempDownloadFolder, (progress) => {
            this.downloadProgress = progress.percent;
            
            // Calcular progreso general: progreso anterior + progreso actual de descarga
            const overallProgress = fileStartProgress + (progress.percent / 100) * downloadRange;
            
            // Crear objeto de progreso con información completa
            const overallProgressData = {
              ...progress,
              overallPercent: Math.round(overallProgress),
              currentFile: file.name,
              currentPhase: 'download',
              fileIndex: completedFiles + 1,
              totalFiles: totalFiles,
              phaseProgress: progress.percent,
              phaseRange: downloadRange
            };
            
            onDownloadProgress?.(overallProgressData);
          });

          // Extraer archivo
          await this.extractFile(zipPath, destFolder, (progress) => {
            this.extractionProgress = progress;
            
            // Calcular progreso general: progreso anterior + descarga completada + progreso actual de extracción
            const overallProgress = fileStartProgress + downloadRange + (progress / 100) * extractRange;
            
            // Crear objeto de progreso con información completa
            const overallProgressData = {
              percent: progress,
              overallPercent: Math.round(overallProgress),
              currentFile: file.name,
              currentPhase: 'extraction',
              fileIndex: completedFiles + 1,
              totalFiles: totalFiles,
              phaseProgress: progress,
              phaseRange: extractRange
            };
            
            onExtractionProgress?.(file.name, overallProgressData);
          });

          // Mover ZIP a carpeta temporal
          await this.moveZipToTemp(zipPath, file.name);

          this.downloadedFiles.add(file.name);
          completedFiles++;

          // Notificar completado del archivo
          onFileComplete?.(file.name, completedFiles, totalFiles);

        } catch (error) {
          console.error(`[PATCH] Error procesando ${file.name}:`, error);
          this.failedFiles.add(file.name);
          completedFiles++;
          
          // Continuar con el siguiente archivo en lugar de fallar completamente
          continue;
        }
      }

      // Limpiar carpeta temporal
      await this.cleanupTempFolder();

      // Guardar estado de actualización si se descargaron archivos
      if (this.downloadedFiles.size > 0) {
        await this.saveUpdateState(serverFiles);
      }

      // Generar resumen final
      const summary = {
        total: totalFiles,
        downloaded: this.downloadedFiles.size,
        failed: this.failedFiles.size,
        downloadedFiles: Array.from(this.downloadedFiles),
        failedFiles: Array.from(this.failedFiles)
      };
      
      // Asegurar que se llame onComplete incluso si hay errores
      if (onComplete) {
        try {
          onComplete(summary);
        } catch (error) {
          console.error('[PATCH] Error en callback onComplete:', error);
        }
      }
      
      // Resetear estado al final
      this.resetState();

    } catch (error) {
      console.error('[PATCH] Error en proceso de descarga:', error);
      
      // Resetear estado en caso de error
      this.resetState();
      
      if (onError) {
        try {
          onError(error);
        } catch (callbackError) {
          console.error('[PATCH] Error en callback onError:', callbackError);
        }
      }
    }
  }

  // Descargar archivo individual
  async downloadFile(filename, destFolder, onProgress) {
    try {
      // Verificar que window.electron esté disponible
      if (!window.electron) {
        console.warn('[PATCH] Electron no está disponible, usando simulación');
        return new Promise((resolve, reject) => {
          this.simulateProgress(filename, onProgress, resolve, reject);
        });
      }
      
      await this.checkAndUpdateToken();
      
      // Construir URL de descarga
      const downloadUrl = `${this.baseUrl}?action=download&token=${this.token}&file=${filename}`;
      
      // Usar la API de Electron para descarga con progreso
      return new Promise((resolve, reject) => {
        // Configurar timeout para evitar que se quede colgado
        const timeout = setTimeout(() => {
          console.error('[PATCH] Timeout en descarga:', filename);
          this.cleanupDownloadListeners();
          reject(new Error(`Timeout downloading ${filename}`));
        }, 300000); // 5 minutos de timeout
        
        // Configurar listeners para progreso y eventos
        this.setupDownloadListeners(onProgress, (destPath) => {
          clearTimeout(timeout);
          resolve(destPath);
        }, (error) => {
          clearTimeout(timeout);
          console.error('[PATCH] Error en descarga:', filename, error);
          reject(error);
        });
        
        // Iniciar descarga
        window.electron.downloadFile(downloadUrl, destFolder, filename);
      });
      
    } catch (error) {
      console.error('[PATCH] Error iniciando descarga:', error);
      throw error;
    }
  }

  // Extraer archivo ZIP
  async extractFile(zipPath, destFolder, onProgress) {
    try {
      console.log('[PATCH] === extractFile called ===');
      console.log('[PATCH] zipPath:', zipPath, '(tipo:', typeof zipPath, ', es array:', Array.isArray(zipPath), ')');
      console.log('[PATCH] destFolder:', destFolder, '(tipo:', typeof destFolder, ', es array:', Array.isArray(destFolder), ')');
      
      // Verificar que window.electron esté disponible
      if (!window.electron) {
        console.warn('[PATCH] Electron no está disponible, usando simulación de extracción');
        return new Promise((resolve, reject) => {
          this.simulateExtraction(zipPath, onProgress, resolve, reject);
        });
      }
      
      return new Promise((resolve, reject) => {
        // Configurar listener para progreso de extracción
        this.setupExtractionListeners(onProgress, resolve, reject);
        
        // Iniciar extracción
        console.log('[PATCH] Llamando a window.electron.extractZipFile con rutas normalizadas');
        window.electron.extractZipFile(zipPath, destFolder);
      });
      
    } catch (error) {
      console.error('[PATCH] Error extrayendo archivo:', error);
      throw error;
    }
  }
  
  // Simular extracción si no hay electron disponible
  simulateExtraction(zipPath, onProgress, onComplete, onError) {
    console.log('🔄 Simulando extracción para:', zipPath);
    
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15 + 10; // 10-25% por intervalo
      
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        
        // Crear objeto de progreso final
        const finalProgressData = {
          percent: 100,
          elapsed: 2000, // 2 segundos simulado
          currentPhase: 'extraction',
          currentFile: zipPath.split('/').pop() || 'Unknown'
        };
        
        onProgress?.(finalProgressData);
        onComplete?.({ success: true });
      } else {
        // Crear objeto de progreso
        const progressData = {
          percent: progress,
          elapsed: 2000, // 2 segundos
          currentPhase: 'extraction',
          currentFile: zipPath.split('/').pop() || 'Unknown'
        };
        
        onProgress?.(progressData);
      }
    }, 300); // Actualizar cada 300ms
  }

  // Mover ZIP a carpeta temporal
  async moveZipToTemp(zipPath, filename) {
    try {
      // Verificar que window.electron esté disponible
      if (!window.electron) {
        console.error('[PATCH] Electron no está disponible');
        return;
      }
      
      // Verificar si el archivo ya está en la carpeta temporal
      const tempZipPath = window.electron.path.join(this.tempDownloadFolder, filename);
      if (zipPath === tempZipPath) {
        return;
      }
      
      // En lugar de mover, copiar el ZIP a la carpeta temporal
      // Esto mantiene el ZIP original en la carpeta principal
      await window.electron.copyFile(zipPath, tempZipPath);
    } catch (error) {
      console.error('[PATCH] Error copiando ZIP:', error);
      // No lanzar error, solo log
    }
  }

  // Limpiar carpeta temporal
  async cleanupTempFolder() {
    try {
      // Verificar que window.electron esté disponible
      if (!window.electron) {
        console.error('[PATCH] Electron no está disponible');
        return;
      }
      
      if (this.tempDownloadFolder) {
        await window.electron.removeDirectory(this.tempDownloadFolder);
        this.tempDownloadFolder = null;
      }
    } catch (error) {
      console.error('[PATCH] Error limpiando carpeta temporal:', error);
      // No lanzar error, solo log
    }
  }

  // Configurar listeners para eventos de descarga
  setupDownloadListeners(onProgress, onComplete, onError) {
    // Verificar que window.electron esté disponible
    if (!window.electron) {
      console.error('[PATCH] Electron no está disponible para configurar listeners');
      return;
    }
    
    // Limpiar listeners anteriores
    this.cleanupDownloadListeners();
    
    // Variables para calcular velocidad
    let startTime = Date.now();
    let lastUpdateTime = startTime;
    let lastDownloadedBytes = 0;
    let totalFileSize = 0;
    
    // Configurar nuevos listeners
    this.downloadProgressListener = (progressData) => {
      const currentTime = Date.now();
      const elapsed = currentTime - startTime;
      
      // Extraer información del progreso
      const percent = progressData.percent || 0;
      const downloaded = progressData.downloaded || 0;
      const total = progressData.total || 0;
      
      // Calcular velocidad real
      let speed = 0;
      if (downloaded > 0 && elapsed > 0) {
        speed = (downloaded / elapsed) * 1000; // bytes por segundo
      }
      
      // Calcular ETA
      let eta = 0;
      if (percent > 0 && elapsed > 0) {
        const totalEstimatedTime = (elapsed / percent) * 100;
        eta = Math.max(0, totalEstimatedTime - elapsed);
      }
      
      // Crear objeto de progreso mejorado con toda la información necesaria
      const enhancedProgressData = {
        percent: percent,
        downloaded: downloaded,
        total: total,
        speed: speed,
        elapsed: elapsed,
        eta: eta,
        currentFile: progressData.filename || 'Unknown',
        currentPhase: 'download'
      };
      
      console.log('📥 Enhanced progress data:', enhancedProgressData);
      onProgress?.(enhancedProgressData);
    };
    
    this.downloadErrorListener = (error) => {
      console.error('[PATCH] Error en descarga:', error);
      this.cleanupDownloadListeners();
      onError?.(error);
    };
    
    this.downloadCompleteListener = (info) => {
      this.cleanupDownloadListeners();
      onComplete?.(info.destPath);
    };
    
    // Registrar listeners
    window.electron.onDownloadProgress(this.downloadProgressListener);
    window.electron.onDownloadError(this.downloadErrorListener);
    window.electron.onDownloadDone(this.downloadCompleteListener);
  }
  
  // Calcular tiempo estimado de llegada
  calculateETA(percent, elapsed) {
    if (percent <= 0 || elapsed <= 0) return 0;
    
    const totalEstimatedTime = (elapsed / percent) * 100;
    const remaining = Math.max(0, totalEstimatedTime - elapsed);
    
    return remaining;
  }

  // Configurar listeners para eventos de extracción
  setupExtractionListeners(onProgress, onComplete, onError) {
    // Verificar que window.electron esté disponible
    if (!window.electron) {
      console.error('[PATCH] Electron no está disponible para configurar listeners de extracción');
      return;
    }
    
    // Limpiar listeners anteriores
    this.cleanupExtractionListeners();
    
    // Variables para calcular progreso
    let startTime = Date.now();
    
    // Configurar nuevos listeners
    this.extractionProgressListener = (progressData) => {
      const currentTime = Date.now();
      const elapsed = currentTime - startTime;
      
      // Extraer información del progreso
      const percent = progressData.percent || progressData || 0;
      
      // Crear objeto de progreso mejorado para extracción
      const enhancedProgressData = {
        percent: percent,
        elapsed: elapsed,
        currentPhase: 'extraction',
        currentFile: progressData.filename || 'Unknown'
      };
      
      console.log('📦 Enhanced extraction progress:', enhancedProgressData);
      onProgress?.(enhancedProgressData);
    };
    
    this.extractionErrorListener = (error) => {
      console.error('[PATCH] Error en extracción:', error);
      this.cleanupExtractionListeners();
      onError?.(error);
    };
    
    this.extractionCompleteListener = (info) => {
      this.cleanupExtractionListeners();
      onComplete?.(info);
    };
    
    // Registrar listeners
    window.electron.onExtractionProgress(this.extractionProgressListener);
    window.electron.onExtractionError(this.extractionErrorListener);
    window.electron.onExtractionDone(this.extractionCompleteListener);
  }

  // Limpiar listeners de descarga
  cleanupDownloadListeners() {
    try {
      if (window.electron) {
        // Remover listeners específicos si están disponibles
        if (window.electron.removeDownloadListener) {
          window.electron.removeDownloadListener();
        }
        if (window.electron.removeDownloadErrorListener) {
          window.electron.removeDownloadErrorListener();
        }
        if (window.electron.removeDownloadCompleteListener) {
          window.electron.removeDownloadCompleteListener();
        }
      }
      
      // Limpiar referencias
      this.downloadProgressListener = null;
      this.downloadErrorListener = null;
      this.downloadCompleteListener = null;
      
    } catch (error) {
      console.error('[PATCH] Error limpiando listeners de descarga:', error);
    }
  }

  // Limpiar listeners de extracción
  cleanupExtractionListeners() {
    try {
      if (window.electron) {
        // Remover listeners específicos si están disponibles
        if (window.electron.removeExtractionListener) {
          window.electron.removeExtractionListener();
        }
        if (window.electron.removeExtractionErrorListener) {
          window.electron.removeExtractionErrorListener();
        }
        if (window.electron.removeExtractionCompleteListener) {
          window.electron.removeExtractionCompleteListener();
        }
      }
      
      // Limpiar referencias
      this.extractionProgressListener = null;
      this.extractionErrorListener = null;
      this.extractionCompleteListener = null;
      
    } catch (error) {
      console.error('[PATCH] Error limpiando listeners de extracción:', error);
    }
  }

  // Resetear estado del downloader
  resetState() {
    this.isDownloading = false;
    this.currentDownload = null;
    this.downloadProgress = 0;
    this.extractionProgress = 0;
    this.downloadedFiles.clear();
    this.failedFiles.clear();
    
    // Limpiar listeners
    this.cleanupDownloadListeners();
    this.cleanupExtractionListeners();
  }

  // Cancelar proceso actual
  cancelDownload() {
    if (this.isDownloading) {
      this.resetState();
      
      // Limpiar carpeta temporal
      this.cleanupTempFolder();
    }
  }

  // Reintentar descarga con backoff exponencial
  async retryDownload(filename, destFolder, onProgress, onComplete, onError, attempt = 1) {
    try {
      await this.downloadFile(filename, destFolder, onProgress, onComplete, onError);
    } catch (error) {
      if (attempt < this.retryAttempts) {
        const delay = Math.pow(2, attempt) * 1000; // Backoff exponencial
        setTimeout(() => {
          this.retryDownload(filename, destFolder, onProgress, onComplete, onError, attempt + 1);
        }, delay);
      } else {
        console.error('[PATCH] Máximo de reintentos alcanzado');
        onError?.(`Error después de ${this.retryAttempts} intentos: ${error}`);
      }
    }
  }

  // Obtener información del archivo
  async getFileInfo(filename) {
    try {
      await this.checkAndUpdateToken();
      const response = await fetch(`${this.baseUrl}?action=info&file=${filename}&token=${this.token}`);
      
      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('[PATCH] Error obteniendo información del archivo:', error);
      throw error;
    }
  }

  // Verificar espacio disponible
  async checkDiskSpace(requiredBytes) {
    try {
      // En una implementación real, verificarías el espacio en disco
      // Por ahora, asumimos que hay espacio suficiente
      return true;
    } catch (error) {
      console.error('[PATCH] Error verificando espacio en disco:', error);
      return false;
    }
  }

  // Obtener estadísticas de descarga
  getDownloadStats() {
    return {
      isDownloading: this.isDownloading,
      downloadedFiles: Array.from(this.downloadedFiles),
      failedFiles: Array.from(this.failedFiles),
      totalDownloaded: this.downloadedFiles.size,
      totalFailed: this.failedFiles.size,
      downloadProgress: this.downloadProgress,
      extractionProgress: this.extractionProgress
    };
  }

  // Verificar integridad de archivos usando checksums MD5 del servidor
  async verifyFileIntegrity(destFolder) {
    try {
      logger.info('Starting file integrity verification with MD5 checksums', { destFolder });
      
      const localFiles = await this.getLocalFiles(destFolder);
      const serverFiles = await this.getAvailableFiles();
      const serverChecksums = await this.getChecksums();
      
      const integrityReport = {
        totalFiles: localFiles.length,
        validFiles: 0,
        corruptedFiles: 0,
        missingFiles: 0,
        details: []
      };
      
      for (const serverFile of serverFiles) {
        const localFile = localFiles.find(lf => lf.name === serverFile.name);
        const serverChecksum = serverChecksums.find(c => c.name === serverFile.name);
        
        if (!localFile) {
          integrityReport.missingFiles++;
          integrityReport.details.push({
            name: serverFile.name,
            status: 'missing',
            reason: 'File not found locally'
          });
          continue;
        }
        
        // Verificar integridad usando checksum MD5 del servidor
        const isValid = await this.verifySingleFileIntegrity(localFile, serverFile, serverChecksum);
        
        if (isValid) {
          integrityReport.validFiles++;
          integrityReport.details.push({
            name: serverFile.name,
            status: 'valid',
            checksum: serverChecksum?.checksum || 'N/A'
          });
        } else {
          integrityReport.corruptedFiles++;
          integrityReport.details.push({
            name: serverFile.name,
            status: 'corrupted',
            reason: 'File integrity check failed',
            expectedChecksum: serverChecksum?.checksum || 'N/A'
          });
        }
      }
      
      logger.info('File integrity verification completed with MD5 checksums', integrityReport);
      return integrityReport;
      
    } catch (error) {
      logger.error('File integrity verification failed', { error: error.message });
      throw error;
    }
  }
  
  // Verificar integridad de un archivo específico con checksum MD5
  async verifySingleFileIntegrity(localFile, serverFile, serverChecksum) {
    try {
      // Verificar tamaño
      if (localFile.size !== serverFile.size) {
        logger.warn(`File size mismatch for ${localFile.name}`, {
          local: localFile.size,
          server: serverFile.size
        });
        return false;
      }
      
      // Verificar checksum MD5 si está disponible
      if (serverChecksum && serverChecksum.checksum && window.electron) {
        const localChecksum = await this.calculateFileChecksum(localFile.path);
        if (localChecksum !== serverChecksum.checksum) {
          logger.warn(`MD5 checksum mismatch for ${localFile.name}`, {
            local: localChecksum,
            server: serverChecksum.checksum
          });
          return false;
        }
        logger.info(`MD5 checksum verified for ${localFile.name}`);
      }
      
      // Verificar fecha de modificación (tolerancia de 1 día)
      if (localFile.modified && serverFile.modified) {
        const localDate = new Date(localFile.modified * 1000);
        const serverDate = new Date(serverFile.modified * 1000);
        const daysDifference = Math.abs(serverDate - localDate) / (1000 * 60 * 60 * 24);
        
        if (daysDifference > 1) {
          logger.warn(`File date mismatch for ${localFile.name}`, {
            local: localDate,
            server: serverDate,
            daysDifference
          });
          return false;
        }
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
  
  // Calcular checksum MD5 de un archivo local
  async calculateFileChecksum(filePath) {
    try {
      if (!window.electron) {
        throw new Error('Electron not available');
      }
      
      // Usar la API de Electron para calcular checksum MD5
      return await window.electron.calculateMD5Checksum(filePath);
    } catch (error) {
      logger.error('Failed to calculate MD5 checksum', { 
        filePath, 
        error: error.message 
      });
      return null;
    }
  }
  
  // Obtener archivos que necesitan reparación basado en verificación de integridad
  async getFilesNeedingRepair(destFolder) {
    try {
      logger.info('Getting files needing repair', { destFolder });
      
      const localFiles = await this.getLocalFiles(destFolder);
      const serverFiles = await this.getAvailableFiles();
      
      // Si no hay archivos locales, todos los archivos del servidor necesitan descarga
      if (localFiles.length === 0) {
        const filesToRepair = serverFiles.map(file => ({
          ...file,
          reason: 'missing',
          action: 'download'
        }));
        
        logger.info(`No local files found, ${filesToRepair.length} files need download`);
        return filesToRepair;
      }
      
      // Intentar obtener checksums, pero no fallar si no están disponibles
      let serverChecksums = [];
      try {
        const checksumsResult = await this.getChecksums();
        // Asegurar que serverChecksums sea siempre un array
        serverChecksums = Array.isArray(checksumsResult) ? checksumsResult : [];
        logger.info(`Retrieved ${serverChecksums.length} checksums from server`);
      } catch (checksumError) {
        logger.warn('Could not retrieve checksums, using basic file comparison', { error: checksumError.message });
        serverChecksums = []; // Asegurar que sea un array vacío
      }
      
      const filesToRepair = [];
      
      for (const serverFile of serverFiles) {
        const localFile = localFiles.find(lf => lf.name === serverFile.name);
        
        // Verificar que serverChecksums sea un array antes de usar find
        if (!Array.isArray(serverChecksums)) {
          logger.warn('serverChecksums is not an array, resetting to empty array', { 
            type: typeof serverChecksums, 
            value: serverChecksums 
          });
          serverChecksums = [];
        }
        
        const serverChecksum = serverChecksums.find(c => c.name === serverFile.name);
        
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
        let needsRepair = false;
        let reason = '';
        
        // Verificar tamaño
        if (localFile.size !== serverFile.size) {
          needsRepair = true;
          reason = 'size_mismatch';
        }
        
        // Verificar checksum si está disponible
        if (!needsRepair && serverChecksum && serverChecksum.checksum && window.electron) {
          try {
            const localChecksum = await this.calculateFileChecksum(localFile.path);
            if (localChecksum !== serverChecksum.checksum) {
              needsRepair = true;
              reason = 'checksum_mismatch';
            }
          } catch (checksumError) {
            logger.warn(`Could not calculate checksum for ${localFile.name}`, { error: checksumError.message });
          }
        }
        
        // Verificar fecha de modificación (tolerancia de 1 día)
        if (!needsRepair && localFile.modified && serverFile.modified) {
          const localDate = new Date(localFile.modified * 1000);
          const serverDate = new Date(serverFile.modified * 1000);
          const daysDifference = Math.abs(serverDate - localDate) / (1000 * 60 * 60 * 24);
          
          if (daysDifference > 1) {
            needsRepair = true;
            reason = 'date_mismatch';
          }
        }
        
        if (needsRepair) {
          filesToRepair.push({
            ...serverFile,
            reason: reason,
            action: 'redownload'
          });
        }
      }
      
      logger.info(`Found ${filesToRepair.length} files needing repair`, {
        reasons: filesToRepair.map(f => ({ name: f.name, reason: f.reason }))
      });
      
      return filesToRepair;
    } catch (error) {
      logger.error('Failed to get files needing repair', { error: error.message });
      throw error;
    }
  }

  // Obtener checksums MD5 del servidor
  async getChecksums() {
    try {
      await this.checkAndUpdateToken();
      
      const requestUrl = `${this.baseUrl}?action=checksums&token=${this.token}`;
      
      const response = await fetch(requestUrl);
      
      if (!response.ok) {
        logger.warn(`Server returned ${response.status} for checksums request`);
        return [];
      }
      
      const data = await response.json();
      
      if (!data.success) {
        logger.warn('Server returned error for checksums request', { message: data.message });
        return [];
      }
      
      // Asegurar que data.checksums sea un array
      const checksums = Array.isArray(data.checksums) ? data.checksums : [];
      logger.info(`Retrieved ${checksums.length} checksums from server`);
      return checksums;
      
    } catch (error) {
      logger.warn('Could not retrieve checksums from server', { error: error.message });
      return [];
    }
  }

  // Validar archivos usando el endpoint del servidor
  async validateFiles(gamePath) {
    try {
      await this.checkAndUpdateToken();
      
      const requestUrl = `${this.baseUrl}?action=validate&token=${this.token}&game_path=${encodeURIComponent(gamePath)}`;
      
      const response = await fetch(requestUrl);
      
      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Error al validar archivos');
      }
      
      return data.validation || {};
      
    } catch (error) {
      console.error('[PATCH] Error validando archivos:', error);
      throw error;
    }
  }

  // Obtener información del servidor
  async getServerInfo() {
    try {
      await this.checkAndUpdateToken();
      
      const requestUrl = `${this.baseUrl}?action=server_info&token=${this.token}`;
      
      const response = await fetch(requestUrl);
      
      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Error al obtener información del servidor');
      }
      
      return data.server_info || {};
      
    } catch (error) {
      console.error('[PATCH] Error obteniendo información del servidor:', error);
      throw error;
    }
  }

  // Simular progreso si no hay información real (fallback)
  simulateProgress(filename, onProgress, onComplete, onError) {
    console.log('🔄 Simulando progreso para:', filename);
    
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 10 + 5; // 5-15% por intervalo
      
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        
        // Crear objeto de progreso final
        const finalProgressData = {
          percent: 100,
          downloaded: 1024 * 1024, // 1MB simulado
          total: 1024 * 1024,
          speed: 1024 * 1024, // 1MB/s simulado
          elapsed: 1000, // 1 segundo simulado
          eta: 0,
          currentFile: filename,
          currentPhase: 'download'
        };
        
        onProgress?.(finalProgressData);
        onComplete?.({ destPath: `/temp/${filename}` });
      } else {
        // Crear objeto de progreso
        const progressData = {
          percent: progress,
          downloaded: (progress / 100) * 1024 * 1024, // Proporcional
          total: 1024 * 1024,
          speed: 1024 * 1024, // 1MB/s constante
          elapsed: 1000, // 1 segundo
          eta: ((100 - progress) / progress) * 1000, // ETA calculado
          currentFile: filename,
          currentPhase: 'download'
        };
        
        onProgress?.(progressData);
      }
    }, 200); // Actualizar cada 200ms
  }

  // Obtener archivos específicos de repair del servidor
  async getRepairFiles() {
    try {
      await this.checkAndUpdateToken();
      
      const requestUrl = `${this.baseUrl}?action=repair&token=${this.token}`;
      
      console.log('🔧 Requesting repair files from:', requestUrl);
      
      const response = await fetch(requestUrl);
      
      console.log('🔧 Repair files response status:', response.status);
      
      if (!response.ok) {
        logger.warn(`Server returned ${response.status} for repair files request`);
        return [];
      }
      
      const data = await response.json();
      
      console.log('🔧 Repair files response data:', data);
      
      if (!data.success) {
        logger.warn('Server returned error for repair files request', { message: data.message });
        return [];
      }
      
      const repairFiles = data.repair_files || [];
      logger.info(`Retrieved ${repairFiles.length} repair files from server`);
      console.log('🔧 Repair files found:', repairFiles);
      return repairFiles;
      
    } catch (error) {
      logger.warn('Could not retrieve repair files from server', { error: error.message });
      return [];
    }
  }

  // Descargar archivo específico de repair
  async downloadRepairFile(fileName, destFolder, onProgress) {
    try {
      // Asegurar que el token esté actualizado
      await this.checkAndUpdateToken();
      
      logger.info(`Downloading repair file: ${fileName}`);
      
      // Usar el endpoint de download para archivos de repair
      const requestUrl = `${this.baseUrl}?action=download&token=${this.token}&file=${fileName}`;
      
      // Usar la API de Electron para descarga con progreso
      return new Promise((resolve, reject) => {
        // Configurar timeout para evitar que se quede colgado
        const timeout = setTimeout(() => {
          console.error('[PATCH] Timeout en descarga de repair:', fileName);
          this.cleanupDownloadListeners();
          reject(new Error(`Timeout downloading repair file ${fileName}`));
        }, 300000); // 5 minutos de timeout
        
        // Configurar listeners para progreso y eventos
        this.setupDownloadListeners(onProgress, (destPath) => {
          clearTimeout(timeout);
          resolve(destPath);
        }, (error) => {
          clearTimeout(timeout);
          console.error('[PATCH] Error en descarga de repair:', fileName, error);
          reject(error);
        });
        
        // Iniciar descarga
        window.electron.downloadFile(requestUrl, destFolder, fileName);
      });
      
    } catch (error) {
      logger.error(`Failed to download repair file ${fileName}`, { error: error.message });
      throw error;
    }
  }
}

export default PatchDownloader; 