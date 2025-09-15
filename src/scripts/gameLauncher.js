// gameLauncher.js - Sistema principal actualizado
import { environment } from '../environments/enviroment.js';
import { logger } from './logger.js';

import { initFolderSelector } from './folderSelector.js';
import { fileValidator } from './fileValidator.js';
import { retryManager } from './retryManager.js';
import { repairService } from './repairService.js';
import { timerManager } from './timerManager.js';
import RankingService from './rankingService.js';
import PatchNotesService from './patchNotesService.js';
import PlayerStatsService from './playerStatsService.js';
import PatchDownloader from './patchDownloader.js';
import { toastManager } from './ui/toastManager.js';
import { l2ClientValidator } from './l2ClientValidator.js';
// import { Installer } from './installer.js'; // Removed - installer.js was deleted

class GameLauncher {
  constructor() {
    logger.debug('GameLauncher constructor iniciado', null, 'GameLauncher');
    this.isDownloading = false;
    this.isRepairing = false;
    this.isClientReady = false;
    this.isUpdating = false; // Nuevo estado para check for updates
    this.currentOperation = null; // Operación actual en curso
    this.downloadStats = {
      totalFiles: 0,
      completedFiles: 0,
      currentFile: null,
      currentProgress: 0
    };
    
    // Control de operaciones simultáneas
    this.operationQueue = [];
    this.isProcessingQueue = false;
    
    // Inicializar servicios
    logger.debug('Inicializando servicios...', null, 'GameLauncher');
    this.patchDownloader = null;
    this.installer = null;
    this.rankingService = new RankingService();
    logger.debug('RankingService creado', null, 'GameLauncher');
    this.patchNotesService = new PatchNotesService();
    logger.debug('PatchNotesService creado', null, 'GameLauncher');
    this.playerStatsService = new PlayerStatsService();
    logger.debug('PlayerStatsService creado', null, 'GameLauncher');
    logger.debug('GameLauncher constructor completado', null, 'GameLauncher');
  }

  async initialize() {
    try {
      logger.debug('GameLauncher.initialize() iniciado', null, 'GameLauncher');
      logger.info('Initializing GameLauncher systems');
      
      // Configurar listener para detectar cierre de ventana
      this.setupWindowCloseListener();
      
      // Inicializar patch downloader
      logger.debug('Inicializando PatchDownloader...', null, 'GameLauncher');
      this.patchDownloader = new PatchDownloader();
      await this.patchDownloader.initialize();
      logger.debug('PatchDownloader inicializado', null, 'GameLauncher');
      logger.info('PatchDownloader initialized successfully');
      
      // Verificar que patchDownloader tiene los métodos necesarios
      if (!this.patchDownloader.downloadAndExtractAllFiles) {
        throw new Error('PatchDownloader missing downloadAndExtractAllFiles method');
      }
      logger.debug('PatchDownloader methods verified', null, 'GameLauncher');
      logger.info('PatchDownloader methods verified');
      
      // Inicializar installer (removed - installer.js was deleted)
      logger.debug('Installer removed - skipping initialization', null, 'GameLauncher');
      this.installer = null;
      
      // Inicializar repair service
      logger.debug('Inicializando repair service...', null, 'GameLauncher');
      logger.info('Initializing repair service');
      await repairService.initialize(this.patchDownloader);
      logger.debug('Repair service inicializado', null, 'GameLauncher');
      
      
      
      // El badge es solo informativo, no necesita evento click
      
      // Probar el sistema de toast después de un breve delay
      // setTimeout(() => {
      //   if (window.toastManager) {
      //     window.toastManager.testToast();
      //   }
      // }, 2000);
      
      logger.debug('GameLauncher.initialize() completado exitosamente', null, 'GameLauncher');
      logger.info('GameLauncher initialized successfully');
    } catch (error) {
      logger.error('Error en GameLauncher.initialize()', { error: error.message }, 'GameLauncher');
      logger.error('Failed to initialize GameLauncher', { error: error.message });
      throw error;
    }
  }

  // Validar si se puede ejecutar una operación
  canExecuteOperation(operationType) {
    if (this.isDownloading || this.isRepairing || this.isUpdating) {
      const currentOp = this.currentOperation || 'unknown operation';
      
      // Para el botón Play, permitir pero mostrar advertencia
      if (operationType === 'play') {
        this.showWarning(`Game launch may be affected by ${currentOp} in progress`);
        return true;
      }
      
      // Para otras operaciones, bloquear y mostrar error
      this.showWarning(`Please wait for ${currentOp} to complete`);
      return false;
    }
    return true;
  }





  // Establecer estado de operación
  setOperationState(operationType, isActive) {
    switch (operationType) {
      case 'download':
        this.isDownloading = isActive;
        break;
      case 'repair':
        this.isRepairing = isActive;
        break;
      case 'update':
        this.isUpdating = isActive;
        break;
    }
    
    this.currentOperation = isActive ? operationType : null;
    
    if (isActive) {
      // Resetear contador de notificaciones del system tray
      this.lastTrayNotification = 0;
      
      // this.showInfo(`${operationType} started...`);
      this.updateTrayNotification(operationType, 0);
    } else {
      // this.showSuccess(`${operationType} completed`);
      this.updateTrayNotification(operationType, 100);
    }
  }

  // Manejar interrupción de operación
  handleOperationInterruption(operationType) {
    this.setOperationState(operationType, false);
    // this.showWarning(`${operationType} was interrupted`);
    
    // Limpiar estados
    this.isDownloading = false;
    this.isRepairing = false;
    this.isUpdating = false;
    this.currentOperation = null;
  }

  // Manejar errores de operación
  handleOperationError(operationType, error) {
    this.setOperationState(operationType, false);
    // this.showError(`${operationType} failed: ${error.message}`);
    
    logger.error(`${operationType} operation failed`, { error: error.message });
  }

  // Configurar listener para detectar cierre de ventana
  setupWindowCloseListener() {
    try {
      if (window.electron && window.electron.onWindowClose) {
        window.electron.onWindowClose(() => {
          if (this.isDownloading || this.isRepairing || this.isUpdating) {
            // Hay operaciones en curso - minimizar al system tray
            this.handleWindowCloseWithActiveOperations();
          } else {
            // No hay operaciones - cerrar normalmente
            this.handleNormalWindowClose();
          }
        });
        logger.debug('Window close listener configured successfully', null, 'GameLauncher');
      } else {
        logger.debug('Window close listener not available - skipping', null, 'GameLauncher');
      }
    } catch (error) {
      logger.warn('Failed to setup window close listener', { error: error.message }, 'GameLauncher');
      // No lanzar error para no interrumpir la inicialización
    }
  }

  // Manejar cierre de ventana con operaciones activas
  handleWindowCloseWithActiveOperations() {
    try {
      const currentOp = this.currentOperation || 'operation';
      
      // Mostrar notificación al usuario
      // this.showInfo(`Minimizing to system tray - ${currentOp} in progress`, 5000);
      
      // Minimizar al system tray en lugar de cerrar
      if (window.electron && window.electron.minimizeToTray) {
        window.electron.minimizeToTray();
      } else {
        // Fallback: minimizar ventana
        if (window.electron && window.electron.minimizeWindow) {
          window.electron.minimizeWindow();
        }
      }
      
      logger.info(`Window minimized to tray during ${currentOp}`, { operation: currentOp });
    } catch (error) {
      logger.warn('Failed to handle window close with active operations', { error: error.message });
      // Fallback: solo mostrar toast
      // this.showWarning(`Operation ${this.currentOperation || 'in progress'} - please wait`);
    }
  }

  // Manejar cierre normal de ventana
  handleNormalWindowClose() {
    try {
      logger.info('Window closing normally - no active operations');
      
      // Limpiar recursos y cerrar
      if (window.electron && window.electron.closeApp) {
        window.electron.closeApp();
      }
    } catch (error) {
      logger.warn('Failed to handle normal window close', { error: error.message });
    }
  }

  // Cancelar operación en curso
  cancelCurrentOperation() {
    if (!this.currentOperation) {
      // this.showInfo('No operation in progress');
      return;
    }

    const operationType = this.currentOperation;
    this.handleOperationInterruption(operationType);
    
    // Cancelar operaciones específicas
    if (operationType === 'repair') {
      repairService.cancelRepair();
    }
    
    // this.showWarning(`${operationType} cancelled by user`);
    logger.info(`${operationType} cancelled by user`);
  }

  // Obtener estado actual de operaciones
  getOperationStatus() {
    return {
      isDownloading: this.isDownloading,
      isRepairing: this.isRepairing,
      isUpdating: this.isUpdating,
      currentOperation: this.currentOperation,
      canStartNewOperation: !this.isDownloading && !this.isRepairing && !this.isUpdating
    };
  }

  // Restaurar ventana desde system tray
  restoreFromTray() {
    try {
      if (window.electron && window.electron.restoreFromTray) {
        window.electron.restoreFromTray();
        // this.showInfo('Launcher restored from system tray');
        logger.info('Window restored from system tray');
      }
    } catch (error) {
      logger.warn('Failed to restore from tray', { error: error.message });
    }
  }

  // Verificar si hay operaciones activas
  hasActiveOperations() {
    return this.isDownloading || this.isRepairing || this.isUpdating;
  }

  // Mostrar notificación del system tray
  showTrayNotification(title, message, type = 'info') {
    try {
      if (window.electron && window.electron.showTrayNotification) {
        window.electron.showTrayNotification(title, message, type);
      }
    } catch (error) {
      logger.warn('Failed to show tray notification', { error: error.message });
    }
  }

  // Actualizar notificación del system tray durante operaciones
  updateTrayNotification(operationType, progress = null) {
    if (!this.hasActiveOperations()) return;

    // Solo enviar notificación cada 10% para evitar spam
    if (progress !== null) {
      const lastNotification = this.lastTrayNotification || 0;
      const progressRounded = Math.floor(progress / 10) * 10; // Redondear a múltiplos de 10
      
      // Solo enviar si el progreso cambió significativamente (cada 10%)
      if (progressRounded <= lastNotification) {
        return;
      }
      
      this.lastTrayNotification = progressRounded;
    }

    const title = 'L2 Terra Launcher';
    let message = `${operationType} in progress`;
    
    if (progress !== null) {
      message += ` - ${Math.round(progress)}%`;
    }

    this.showTrayNotification(title, message, 'info');
  }

  // Limpiar archivos temporales incompletos
  async cleanupIncompleteFiles() {
    try {
      const selectedFolder = localStorage.getItem('selectedFolder');
      if (!selectedFolder) return;

      // Buscar archivos temporales incompletos
      const tempPatterns = [
        'temp_download',
        'temp_repair',
        '*.tmp',
        '*.temp',
        '*.part'
      ];

      if (window.electron && window.electron.cleanupIncompleteFiles) {
        await window.electron.cleanupIncompleteFiles(selectedFolder, tempPatterns);
        logger.info('Incomplete files cleaned up');
      } else {
        logger.debug('cleanupIncompleteFiles not available in Electron');
      }
    } catch (error) {
      logger.warn('Error cleaning up incomplete files', { error: error.message });
      // No lanzar error para no interrumpir el flujo
    }
  }

  // Validar integridad de archivos locales
  async validateLocalFilesIntegrity() {
    try {
      const selectedFolder = localStorage.getItem('selectedFolder');
      if (!selectedFolder) return { valid: false, reason: 'No folder selected' };

      if (window.electron && window.electron.validateFileIntegrity) {
        const result = await window.electron.validateFileIntegrity(selectedFolder);
        return result;
      }

      logger.debug('validateFileIntegrity not available in Electron');
      return { valid: true, reason: 'Validation not available' };
    } catch (error) {
      logger.warn('Error validating file integrity', { error: error.message });
      return { valid: false, reason: error.message };
    }
  }

  showToast(message, type = 'info', duration = 3000) {
    // Usar el nuevo sistema de toast manager
    return toastManager.showToast(message, type, duration);
  }

  // Métodos de conveniencia para toasts específicos
  showSuccess(message, duration = 3000) {
    return toastManager.showSuccess(message, duration);
  }

  showError(message, duration = 5000) {
    return toastManager.showError(message, duration);
  }

  showWarning(message, duration = 4000) {
    return toastManager.showWarning(message, duration);
  }

  showInfo(message, duration = 3000) {
    return toastManager.showInfo(message, duration);
  }

  setupDownloadButton() {
    const btnUpdate = document.getElementById('btnUpdate');
    const btnPlay = document.getElementById('btnPlay');
    const btnRepair = document.getElementById('btnRepair');
    
    // Progress elements
    const progressFill = document.getElementById('progressFill');
    const progressPercent = document.getElementById('progressPercent');
    const progressStatus = document.getElementById('progressStatus');
    const progressDetails = document.getElementById('progressDetails');
    
    const folderPath = document.getElementById('folderPath');

    if (!btnUpdate || !btnPlay || !btnRepair || !progressFill || !progressPercent || 
        !progressStatus || !folderPath) {
      logger.error('Required DOM elements not found', {
        btnUpdate: !!btnUpdate,
        btnPlay: !!btnPlay,
        btnRepair: !!btnRepair,
        progressFill: !!progressFill,
        progressPercent: !!progressPercent,
        progressStatus: !!progressStatus,
        folderPath: !!folderPath
      });
      return;
    }

    logger.info('All DOM elements found correctly');

    // Configurar botón de actualización
    btnUpdate.addEventListener('click', async () => {
      console.log('🔘 btnUpdate clicked!');
      
      if (this.isDownloading || this.isRepairing) {
        console.warn('⚠️ Operation already in progress, ignoring click');
        return;
      }
      
      const selectedFolder = localStorage.getItem('selectedFolder');
      if (!selectedFolder) {
        console.warn('⚠️ No folder selected');
        this.showWarning('Please select a folder first');
        return;
      }
      
      console.log('✅ Starting complete update process...');
      // Hacer todo el proceso: verificar + descargar + instalar
      await this.startUpdate(progressFill, progressPercent, progressStatus, progressDetails, btnUpdate, btnPlay);
    });

    // Configurar botón de reparación
    btnRepair.addEventListener('click', async () => {
      if (this.isDownloading || this.isRepairing) {
        console.warn('⚠️ Operation already in progress, ignoring click');
        return;
      }
      
      const selectedFolder = localStorage.getItem('selectedFolder');
      if (!selectedFolder) {
        this.showWarning('Please select a folder first');
        return;
      }
      
      await this.startRepair(progressFill, progressPercent, progressStatus, progressDetails, btnRepair);
    });

    // Configurar botón de juego
    btnPlay.addEventListener('click', async () => {
      if (!this.canExecuteOperation('play')) {
        return;
      }
      
      const selectedFolder = localStorage.getItem('selectedFolder');
      if (!selectedFolder) {
        this.showWarning('Please select a folder first');
        return;
      }
      
      // Validar estructura del cliente L2 antes de iniciar el juego
      try {
        logger.info('Validating L2 client structure before launch');
        
        // Usar la nueva función de validación
        if (window.electron && window.electron.isValidL2Folder) {
          const l2Validation = await window.electron.isValidL2Folder(selectedFolder);
          
          if (!l2Validation.isValid) {
            logger.warn('Invalid L2 client structure', l2Validation);
            this.showError(l2Validation.reason || 'Please select a valid L2 client folder');
            return;
          }
        } else {
          // Fallback al validator anterior
          const l2Validation = await l2ClientValidator.validateL2Client(selectedFolder);
          
          if (!l2Validation.isValid) {
            logger.warn('Invalid L2 client structure', l2Validation);
            this.showError('Please select a valid L2 client folder');
            return;
          }
        }
        
        logger.info('L2 client validated successfully, launching...');
        // this.showInfo('Launching game...');
        
        // Lanzar el juego
        if (window.electron) {
          window.electron.launchGame(selectedFolder);
        }
        
      } catch (error) {
        logger.error('Error validating game files', { error: error.message });
        // this.showError('Error validating game files');
      }
    });

    // Verificar estado inicial del cliente
    this.checkClientStatus();
  }

  // Método para actualizar el estado del botón Play cuando se selecciona una carpeta
  async updatePlayButtonState() {
    try {
      const selectedFolder = localStorage.getItem('selectedFolder');
      if (!selectedFolder) return;

      const btnPlay = document.getElementById('btnPlay');
      if (!btnPlay) return;

      // Verificar si es una carpeta L2 válida
      let isL2Valid = false;
      if (window.electron && window.electron.isValidL2Folder) {
        const l2Validation = await window.electron.isValidL2Folder(selectedFolder);
        isL2Valid = l2Validation.isValid;
      } else {
        // Fallback al validator anterior
        const l2Validation = await l2ClientValidator.validateL2Client(selectedFolder);
        isL2Valid = l2Validation.isValid;
      }

      // Actualizar estado del botón Play
      if (isL2Valid) {
        btnPlay.disabled = false;
        btnPlay.title = 'Launch Lineage 2';
        logger.info('Play button enabled - valid L2 client folder');
      } else {
        btnPlay.disabled = true;
        btnPlay.title = 'Please select a valid L2 client folder to play';
        logger.info('Play button disabled - not a valid L2 client folder');
      }
    } catch (error) {
      logger.error('Error updating play button state', { error: error.message });
    }
  }

  async checkClientStatus() {
    try {
      const selectedFolder = localStorage.getItem('selectedFolder');
      if (!selectedFolder) return;

      logger.info('Checking client status', { folder: selectedFolder });
      
      // Verificar si es una carpeta L2 válida para el botón Play
      let isL2Valid = false;
      if (window.electron && window.electron.isValidL2Folder) {
        const l2Validation = await window.electron.isValidL2Folder(selectedFolder);
        isL2Valid = l2Validation.isValid;
      } else {
        // Fallback al validator anterior
        const l2Validation = await l2ClientValidator.validateL2Client(selectedFolder);
        isL2Valid = l2Validation.isValid;
      }
      
      // Obtener archivos locales (siempre funciona, independientemente de si es L2 válido)
      const files = await this.patchDownloader.getLocalFiles(selectedFolder);
      this.isClientReady = files.length > 0;
      
      // Controlar el botón Play basado en la validación L2
      const btnPlay = document.getElementById('btnPlay');
      if (btnPlay) {
        if (isL2Valid) {
          btnPlay.disabled = false;
          btnPlay.title = 'Launch Lineage 2';
          logger.info('Client status: Ready for play', { fileCount: files.length });
        } else {
          btnPlay.disabled = true;
          btnPlay.title = 'Please select a valid L2 client folder to play';
          logger.warn('Client status: Ready for updates, but not for play - invalid L2 client structure');
        }
      }
      
      // NO llamar automáticamente a checkForUpdates aquí
      // checkForUpdates() se debe llamar manualmente desde game-panel.html
    } catch (error) {
      logger.error('Error checking client status', { error: error.message });
      this.isClientReady = false;
    }
  }

  // Resetear barra de progreso
  resetProgressBar(progressFill, progressPercent, progressStatus, message = 'Ready') {
    if (progressFill) progressFill.style.width = '0%';
    if (progressPercent) progressPercent.textContent = '0%';
    if (progressStatus) progressStatus.textContent = message;
    
    // Resetear detalles del progreso
    this.resetProgressDetails();
    
    // Ocultar detalles del progreso al resetear
    const progressDetails = document.getElementById('progressDetails');
    if (progressDetails) progressDetails.style.display = 'none';
  }

  async startUpdate(progressFill, progressPercent, progressStatus, progressDetails, btnUpdate, btnPlay) {
    try {
      // Validar si se puede ejecutar update
      if (!this.canExecuteOperation('update')) {
        return;
      }

      this.setOperationState('update', true);
      btnUpdate.disabled = true;
      btnPlay.disabled = true;

      const selectedFolder = localStorage.getItem('selectedFolder');
      if (!selectedFolder) {
        throw new Error('No folder selected');
      }

      console.log('🚀 Starting update process for folder:', selectedFolder);

      // Resetear barra de progreso y mostrar progreso inmediatamente
      this.resetProgressBar(progressFill, progressPercent, progressStatus, 'Starting update...');
      
      // Asegurar que la barra esté visible y en 0%
      progressFill.style.width = '0%';
      progressPercent.textContent = '0%';
      progressDetails.style.display = 'block';

      // Actualizar la carpeta actual en el patchDownloader
      this.patchDownloader.updateCurrentFolder(selectedFolder);

      // Inicializar temporizador inmediatamente
      const timerId = `update_${Date.now()}`;
      timerManager.startTimer(timerId, 'download', 0, (timerInfo) => {
        // Actualizar información detallada en tiempo real
        this.updateProgressDetails(timerId, timerInfo.progress || 0, 'download');
      });

      // Mostrar progreso inicial
      progressStatus.textContent = 'Checking for updates...';
      progressFill.style.width = '5%';
      progressPercent.textContent = '5%';

      // Obtener archivos del servidor
      progressStatus.textContent = 'Connecting to server...';
      progressFill.style.width = '10%';
      progressPercent.textContent = '10%';
      
      const serverFiles = await this.patchDownloader.getAvailableFiles();

      // Mostrar progreso de análisis
      progressStatus.textContent = 'Analyzing files...';
      progressFill.style.width = '20%';
      progressPercent.textContent = '20%';

      // Limpiar archivos temporales incompletos antes de verificar
      await this.cleanupIncompleteFiles();

      // Validar integridad de archivos locales
      progressStatus.textContent = 'Validating local files...';
      progressFill.style.width = '25%';
      progressPercent.textContent = '25%';
      
      const integrityCheck = await this.validateLocalFilesIntegrity();
      if (!integrityCheck.valid) {
        // this.showWarning(`File integrity check failed: ${integrityCheck.reason}`);
        logger.warn('File integrity check failed', { reason: integrityCheck.reason });
      }

      // Obtener archivos locales
      const localFiles = await this.patchDownloader.getLocalFiles(selectedFolder);

      // Obtener archivos que necesitan actualización
      progressStatus.textContent = 'Comparing files...';
      progressFill.style.width = '30%';
      progressPercent.textContent = '30%';
      
      const filesToUpdate = await this.patchDownloader.getFilesToUpdate(serverFiles, localFiles);

      if (filesToUpdate.length === 0) {
        console.log('✅ No files need update');
        progressFill.style.width = '100%';
        progressPercent.textContent = '100%';
        progressStatus.textContent = 'All files are up to date ✓';
        
        // Ocultar detalles del progreso cuando no hay descarga
        progressDetails.style.display = 'none';
        
        this.showSuccess('All files are up to date ✓');
        

        return;
      }

      console.log(`📦 Found ${filesToUpdate.length} files to update`);



      // Mostrar progreso de preparación
      progressStatus.textContent = `Preparing to install ${filesToUpdate.length} files...`;
      progressFill.style.width = '40%';
      progressPercent.textContent = '40%';

      // Actualizar progreso total
      this.downloadStats = {
        totalFiles: filesToUpdate.length,
        completedFiles: 0,
        currentFile: null,
        currentProgress: 0
      };

      // Usar el patchDownloader para el proceso completo de descarga e instalación
      console.log('🚀 Starting download and extraction process...');
      

      
      await this.patchDownloader.downloadAndExtractAllFiles(
        selectedFolder,
        (progressData) => {
          // Callback de progreso de descarga
          console.log('📥 Download progress:', progressData);
          
          const progress = progressData.overallPercent || progressData.percent || 0;
          const currentFile = progressData.currentFile || 'Unknown';
          const currentPhase = progressData.currentPhase || 'download';
          const speed = progressData.speed || 0;
          
          // Actualizar notificación del system tray
          this.updateTrayNotification('update', progress);
          const downloaded = progressData.downloaded || 0;
          const elapsed = progressData.elapsed || 0;
          
          const totalProgress = Math.min(progress, 100);
          
          if (!isNaN(totalProgress)) {
            progressFill.style.width = `${totalProgress}%`;
            progressPercent.textContent = `${Math.round(totalProgress)}%`;
            
            if (currentPhase === 'download') {
              progressStatus.textContent = `Downloading ${currentFile}... ${Math.round(totalProgress)}%`;
            } else if (currentPhase === 'extraction') {
              progressStatus.textContent = `Extracting ${currentFile}... ${Math.round(totalProgress)}%`;
            } else {
              progressStatus.textContent = `Installing files... ${Math.round(totalProgress)}%`;
            }
            
            // Actualizar timer con información real
            timerManager.updateProgress(timerId, totalProgress, 0, downloaded, speed);
            
            // Actualizar información detallada con velocidad y tiempo real
            this.updateProgressDetailsWithSpeed(timerId, totalProgress, currentPhase, currentFile, speed, elapsed);
          }
        },
        (fileName, progressData) => {
          // Callback de progreso de extracción
          console.log('📦 Extraction progress:', fileName, progressData);
          
          const progress = progressData.overallPercent || progressData.percent || 0;
          const elapsed = progressData.elapsed || 0;
          const totalProgress = Math.min(progress, 100);
          
          if (!isNaN(totalProgress)) {
            progressFill.style.width = `${totalProgress}%`;
            progressPercent.textContent = `${Math.round(totalProgress)}%`;
            progressStatus.textContent = `Extracting ${fileName}... ${Math.round(totalProgress)}%`;
            
            // Actualizar timer (sin velocidad durante extracción)
            timerManager.updateProgress(timerId, totalProgress, 0, 0, 0);
            
            // Actualizar información detallada
            this.updateProgressDetailsWithSpeed(timerId, totalProgress, 'extraction', fileName, 0, elapsed);
          }
        },
        (fileName, completed, total) => {
          // Callback de archivo completado
          console.log(`✅ File completed: ${fileName} (${completed}/${total})`);
          this.downloadStats.completedFiles = completed;
          this.downloadStats.currentFile = fileName;
        },
        (summary) => {
          // Proceso completado
          console.log('🎉 Installation completed:', summary);
          
          // Asegurar que llegue al 100%
          progressFill.style.width = '100%';
          progressPercent.textContent = '100%';
          progressStatus.textContent = 'Installation completed ✓';
          
          // Completar timer
          timerManager.completeTimer(timerId);
          
          // Actualizar información detallada con progreso 100%
          this.updateProgressDetails(timerId, 100, 'install', 'Completed');
          
          // Ocultar detalles del progreso después de completar
          if (progressDetails) {
            setTimeout(() => {
              progressDetails.style.display = 'none';
            }, 2000);
          }
          

          
          // this.showSuccess('Installation completed successfully ✓');
        },
        (error) => {
          // Error en instalación
          console.error('❌ Installation failed:', error);
          // this.showError(`Installation failed: ${error}`);
          progressStatus.textContent = `Installation failed: ${error}`;
        }
      );

      // Guardar estado de actualización
      await this.patchDownloader.saveUpdateState(serverFiles);



      console.log('✅ Update process completed successfully');

    } catch (error) {
      console.error('❌ Update process failed:', error);
      
      if (error.message === 'Download cancelled by user') {
        progressStatus.textContent = 'Update cancelled';
        this.showInfo('Update cancelled by user');
      } else {
        this.handleOperationError('update', error);
        progressStatus.textContent = `Update failed: ${error.message}`;
      }
    } finally {
      this.setOperationState('update', false);
      btnUpdate.disabled = false;
      btnPlay.disabled = false;
    }
  }

  async startRepair(progressFill, progressPercent, progressStatus, progressDetails, btnRepair) {
    try {
      // Validar si se puede ejecutar repair
      if (!this.canExecuteOperation('repair')) {
        return;
      }

      this.setOperationState('repair', true);
      btnRepair.disabled = true;

      const selectedFolder = localStorage.getItem('selectedFolder');
      if (!selectedFolder) {
        throw new Error('No folder selected');
      }

      console.log('🔧 Iniciando proceso de repair...');
      logger.info('Starting repair process', { folder: selectedFolder });

      // Resetear barra de progreso y mostrar progreso inmediatamente
      this.resetProgressBar(progressFill, progressPercent, progressStatus, 'Starting repair...');
      
      // Asegurar que la barra esté visible y en 0%
      progressFill.style.width = '0%';
      progressPercent.textContent = '0%';
      progressDetails.style.display = 'block';

      // Actualizar la carpeta actual en el patchDownloader
      this.patchDownloader.updateCurrentFolder(selectedFolder);

      // Inicializar temporizador inmediatamente
      const timerId = `repair_${Date.now()}`;
      timerManager.startTimer(timerId, 'repair', 0, (timerInfo) => {
        // Actualizar información detallada en tiempo real
        this.updateProgressDetails(timerId, timerInfo.progress || 0, 'repair');
      });

      // Mostrar progreso inicial
      progressStatus.textContent = 'Initializing repair...';
      progressFill.style.width = '5%';
      progressPercent.textContent = '5%';

      // Configurar repair service con la carpeta del juego y callback de progreso
      repairService.setupRepair(
        selectedFolder, 
        (progressData) => {
          console.log('🔧 Progresso de repair:', progressData);
          
          // Calcular progreso general (5% a 95%)
          const repairProgress = 5 + (progressData.percent || 0) * 0.9; // 90% del progreso
          progressFill.style.width = `${repairProgress}%`;
          progressPercent.textContent = `${Math.round(repairProgress)}%`;
          
          // Actualizar status con información del archivo actual
          const fileInfo = progressData.currentFile ? ` - ${progressData.currentFile}` : '';
          const phaseInfo = progressData.currentPhase ? ` (${progressData.currentPhase})` : '';
          progressStatus.textContent = `Repairing${fileInfo}${phaseInfo}... ${Math.round(repairProgress)}%`;
          
          // Actualizar información detallada
          this.updateProgressDetails(timerId, repairProgress, 'repair', progressData.currentFile);
          
          // Actualizar notificación del system tray
          this.updateTrayNotification('repair', repairProgress);
          
          // Actualizar timer con información de velocidad
          if (progressData.speed && progressData.downloaded) {
            timerManager.updateProgress(timerId, progressData.downloaded, progressData.speed);
          }
        }
      );

      // Ejecutar repair
      const result = await repairService.startRepair();
      
      // Finalizar timer
      timerManager.stopTimer(timerId);
      
      if (result.success) {
        console.log('✅ Repair completado:', result.message);
        
        // Asegurar que llegue al 100%
        progressFill.style.width = '100%';
        progressPercent.textContent = '100%';
        progressStatus.textContent = result.message;
        
        // Actualizar información detallada con progreso 100%
        this.updateProgressDetails(timerId, 100, 'repair', 'Completed');
        
        // Mostrar toast específico para repair
        if (result.repairedCount > 0) {
          this.showSuccess(`Repair completed! ${result.repairedCount} files repaired ✓`);
        } else {
          this.showInfo('No files needed repair ✓');
        }
        

      } else {
        console.log('❌ Repair falló:', result.message);
        // this.showError(`Repair failed: ${result.message}`);
        progressStatus.textContent = `Repair failed: ${result.message}`;
      }

    } catch (error) {
      console.error('❌ Error en repair:', error);
      logger.error('Repair process failed', { error: error.message });
      this.handleOperationError('repair', error);
      progressStatus.textContent = `Repair failed: ${error.message}`;
    } finally {
      this.setOperationState('repair', false);
      btnRepair.disabled = false;
    }
  }

  async extractFile(file, destFolder) {
    try {
      logger.info(`Extracting file: ${file.name} to ${destFolder}`);
      
      // Simular extracción con progreso
      await new Promise((resolve) => {
        let progress = 0;
        const interval = setInterval(() => {
          progress += 20;
          if (progress >= 100) {
            clearInterval(interval);
            resolve();
          }
        }, 100);
      });
      
      logger.info(`File extracted successfully: ${file.name}`);
    } catch (error) {
      logger.error(`Failed to extract file: ${file.name}`, { error: error.message });
      throw error;
    }
  }

  // Control de descarga














  // Cargar rankings usando el rankingService
  async loadRankings() {
    try {
      logger.debug('Iniciando loadRankings()', null, 'GameLauncher');
      logger.info('Loading rankings using rankingService');
      await this.rankingService.updateRankings();
      logger.debug('loadRankings() completado exitosamente', null, 'GameLauncher');
      logger.info('Rankings loaded successfully');
    } catch (error) {
      logger.error('Error en loadRankings()', { error: error.message }, 'GameLauncher');
      logger.error('Failed to load rankings', { error: error.message });
    }
  }

  async loadPatchNotes() {
    try {
      logger.debug('Iniciando loadPatchNotes()', null, 'GameLauncher');
      logger.info('Loading patch notes using patchNotesService');
      await this.patchNotesService.updatePatchNotes();
      logger.debug('loadPatchNotes() completado exitosamente', null, 'GameLauncher');
      logger.info('Patch notes loaded successfully');
    } catch (error) {
      logger.error('Error en loadPatchNotes()', { error: error.message }, 'GameLauncher');
      logger.error('Failed to load patch notes', { error: error.message });
    }
  }

  async loadPlayerStats() {
    try {
      logger.debug('Iniciando loadPlayerStats()', null, 'GameLauncher');
      logger.info('Loading player stats using playerStatsService');
      await this.playerStatsService.updatePlayerStats();
      logger.debug('loadPlayerStats() completado exitosamente', null, 'GameLauncher');
      logger.info('Player stats loaded successfully');
    } catch (error) {
      logger.error('Error en loadPlayerStats()', { error: error.message }, 'GameLauncher');
      logger.error('Failed to load player stats', { error: error.message });
    }
  }

  // Obtener estadísticas del sistema
  getSystemStats() {
    return {
      isDownloading: this.isDownloading,
      isRepairing: this.isRepairing,
      isClientReady: this.isClientReady,
      downloadStats: this.downloadStats,
      repairStats: repairService.getRepairStats(),
      timerStats: timerManager.getTimerStats(),
      validationStats: fileValidator.getValidationStats(),
      retryStats: retryManager.getRetryStats()
    };
  }

  // Actualizar información detallada del progreso
  updateProgressDetails(timerId, progress, type = 'download', filename = null) {
    const progressTime = document.getElementById('progressTime');
    const progressSpeed = document.getElementById('progressSpeed');
    const currentFile = document.getElementById('currentFile');
    const progressDetails = document.getElementById('progressDetails');
    
    console.log('🔧 updateProgressDetails llamado:', { timerId, progress, type, filename });
    console.log('🔧 Elementos encontrados:', {
      progressTime: !!progressTime,
      progressSpeed: !!progressSpeed,
      currentFile: !!currentFile,
      progressDetails: !!progressDetails
    });
    
    if (!progressTime || !progressSpeed || !currentFile) {
      console.log('⚠️ Elementos de progreso no encontrados');
      return;
    }
    
    const timer = timerManager.activeTimers.get(timerId);
    if (!timer) {
      console.log('⚠️ Timer no encontrado:', timerId);
      return;
    }
    
    // Mostrar detalles solo cuando hay actividad
    if (progressDetails) {
      progressDetails.style.display = 'block';
    }
    
    // Actualizar tiempo transcurrido
    const elapsed = Date.now() - timer.startTime;
    const elapsedTime = timerManager.formatTime(elapsed);
    progressTime.textContent = `⏱️ ${elapsedTime}`;
    console.log('⏰ Tiempo actualizado:', elapsedTime);
    
    // Actualizar velocidad según el tipo de operación
    if (progress >= 100) {
      // Operación completada
      if (timer.finalAverageSpeed) {
        const speed = timerManager.formatSpeed(timer.finalAverageSpeed);
        progressSpeed.textContent = `🚀 Final: ${speed}`;
      } else {
        progressSpeed.textContent = `✅ Completado`;
      }
    } else {
      // Operación en progreso
      if (type === 'download') {
        // Durante la descarga, mostrar velocidad real
        const speed = timerManager.formatSpeed(timer.estimatedSpeed || 0);
        progressSpeed.textContent = `🚀 ${speed}`;
      } else if (type === 'extraction' || type === 'install') {
        // Durante la extracción/instalación
        progressSpeed.textContent = `📦 Procesando...`;
      } else {
        // Otros tipos de operación
        const speed = timerManager.formatSpeed(timer.estimatedSpeed || 0);
        progressSpeed.textContent = `⚡ ${speed}`;
      }
    }
    console.log('🚀 Velocidad actualizada:', progressSpeed.textContent);
    
    // Actualizar archivo actual
    if (filename) {
      currentFile.textContent = `📁 ${filename}`;
      console.log('📁 Archivo actualizado:', filename);
    } else if (this.downloadStats && this.downloadStats.currentFile) {
      currentFile.textContent = `📁 ${this.downloadStats.currentFile}`;
      console.log('📁 Archivo actualizado (stats):', this.downloadStats.currentFile);
    } else if (timer.currentFile) {
      currentFile.textContent = `📁 ${timer.currentFile}`;
      console.log('📁 Archivo actualizado (timer):', timer.currentFile);
    } else {
      currentFile.textContent = `📁 Procesando...`;
    }
  }

  // Actualizar información detallada del progreso con velocidad
  updateProgressDetailsWithSpeed(timerId, progress, type = 'download', filename = null, speed = 0, elapsed = 0) {
    const progressTime = document.getElementById('progressTime');
    const progressSpeed = document.getElementById('progressSpeed');
    const currentFile = document.getElementById('currentFile');
    const progressDetails = document.getElementById('progressDetails');
    
    console.log('🔧 updateProgressDetailsWithSpeed llamado:', { timerId, progress, type, filename, speed, elapsed });
    console.log('🔧 Elementos encontrados:', {
      progressTime: !!progressTime,
      progressSpeed: !!progressSpeed,
      currentFile: !!currentFile,
      progressDetails: !!progressDetails
    });
    
    if (!progressTime || !progressSpeed || !currentFile) {
      console.log('⚠️ Elementos de progreso no encontrados');
      return;
    }
    
    // Mostrar detalles solo cuando hay actividad
    if (progressDetails) {
      progressDetails.style.display = 'block';
    }
    
    // Actualizar tiempo transcurrido
    const elapsedTime = timerManager.formatTime(elapsed);
    progressTime.textContent = `⏱️ ${elapsedTime}`;
    console.log('⏰ Tiempo actualizado:', elapsedTime);
    
    // Actualizar velocidad según el tipo de operación
    if (progress >= 100) {
      // Operación completada
      progressSpeed.textContent = `✅ Completado`;
    } else {
      // Operación en progreso
      if (type === 'download' && speed > 0) {
        // Durante la descarga, mostrar velocidad real
        const formattedSpeed = timerManager.formatSpeed(speed);
        progressSpeed.textContent = `🚀 ${formattedSpeed}`;
        console.log('🚀 Velocidad actualizada:', formattedSpeed);
      } else if (type === 'extraction' || type === 'install') {
        // Durante la extracción/instalación
        progressSpeed.textContent = `📦 Procesando...`;
      } else {
        // Otros tipos de operación
        progressSpeed.textContent = `⚡ Procesando...`;
      }
    }
    
    // Actualizar archivo actual
    if (filename && filename !== 'Unknown') {
      currentFile.textContent = `📁 ${filename}`;
      console.log('📁 Archivo actualizado:', filename);
    } else if (this.downloadStats && this.downloadStats.currentFile) {
      currentFile.textContent = `📁 ${this.downloadStats.currentFile}`;
      console.log('📁 Archivo actualizado (stats):', this.downloadStats.currentFile);
    } else {
      currentFile.textContent = `📁 Procesando...`;
    }
  }

  // Resetear información detallada del progreso
  resetProgressDetails() {
    const progressTime = document.getElementById('progressTime');
    const progressSpeed = document.getElementById('progressSpeed');
    const currentFile = document.getElementById('currentFile');
    const progressDetails = document.getElementById('progressDetails');
    
    console.log('🔄 Reseteando detalles del progreso');
    
    if (progressTime) {
      progressTime.textContent = '⏱️ --:--';
      console.log('⏰ Tiempo reseteado');
    }
    if (progressSpeed) {
      progressSpeed.textContent = '🚀 --';
      console.log('🚀 Velocidad reseteada');
    }
    if (currentFile) {
      currentFile.textContent = '📁 --';
      console.log('📁 Archivo reseteado');
    }
    if (progressDetails) {
      progressDetails.style.display = 'none';
      console.log('📊 Detalles ocultos');
    }
  }


}

// Función de inicialización global
async function initializeGameLauncher() {
  try {
    const gameLauncher = new GameLauncher();
    await gameLauncher.initialize();
    
    // Inicializar folder selector
    initFolderSelector();
    
    // Cargar rankings
    await gameLauncher.loadRankings();
    
    // Configurar actualización automática de rankings
    setInterval(() => {
      gameLauncher.loadRankings();
    }, 5 * 60 * 1000); // Cada 5 minutos
    
    // Hacer el gameLauncher disponible globalmente
    window.gameLauncher = gameLauncher;
    
    logger.info('GameLauncher setup completed');
  } catch (error) {
    logger.error('Failed to initialize GameLauncher', { error: error.message });
  }
}

// Removida la auto-inicialización para evitar conflictos con UIManager
// La inicialización ahora se maneja desde UIManager

// Exportar la clase GameLauncher
export default GameLauncher;