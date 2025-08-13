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
// import { Installer } from './installer.js'; // Removed - installer.js was deleted

class GameLauncher {
  constructor() {
    logger.debug('GameLauncher constructor iniciado', null, 'GameLauncher');
    this.isDownloading = false;
    this.isRepairing = false;
    this.isClientReady = false;
    this.downloadStats = {
      totalFiles: 0,
      completedFiles: 0,
      currentFile: null,
      currentProgress: 0
    };
    
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
      
      logger.debug('GameLauncher.initialize() completado exitosamente', null, 'GameLauncher');
      logger.info('GameLauncher initialized successfully');
    } catch (error) {
      logger.error('Error en GameLauncher.initialize()', { error: error.message }, 'GameLauncher');
      logger.error('Failed to initialize GameLauncher', { error: error.message });
      throw error;
    }
  }

  showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <div class="toast-content">
        <span class="toast-message">${message}</span>
      </div>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.add('show');
    }, 100);
    
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, duration);
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
        this.showToast('Please select a folder first', 'warning');
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
        this.showToast('Please select a folder first', 'warning');
        return;
      }
      
      await this.startRepair(progressFill, progressPercent, progressStatus, progressDetails, btnRepair);
    });

    // Configurar botón de juego
    btnPlay.addEventListener('click', async () => {
      if (this.isDownloading || this.isRepairing) {
        logger.warn('Operation in progress, cannot launch game');
        this.showToast('Please wait for current operation to complete', 'warning');
        return;
      }
      
      const selectedFolder = localStorage.getItem('selectedFolder');
      if (!selectedFolder) {
        this.showToast('Please select a folder first', 'warning');
        return;
      }
      
      // Validar archivos críticos antes de iniciar el juego
      try {
        logger.info('Validating game files before launch');
        const gameReady = await fileValidator.isGameReadyToLaunch(selectedFolder);
        
        if (!gameReady.ready) {
          logger.warn('Game not ready to launch', gameReady);
          this.showToast(`Game not ready: ${gameReady.reason}`, 'error');
          
          // Mostrar detalles de archivos faltantes/corruptos
          if (gameReady.details) {
            const missingFiles = gameReady.details.missingFiles || [];
            const corruptedFiles = gameReady.details.corruptedFiles || [];
            
            if (missingFiles.length > 0) {
              this.showToast(`Missing files: ${missingFiles.join(', ')}`, 'warning');
            }
            if (corruptedFiles.length > 0) {
              this.showToast(`Corrupted files: ${corruptedFiles.join(', ')}`, 'warning');
            }
          }
          
          return;
        }
        
        logger.info('Game validated successfully, launching...');
        this.showToast('Launching game...', 'info');
        
        // Lanzar el juego
        if (window.electron) {
          window.electron.launchGame(selectedFolder);
        }
        
      } catch (error) {
        logger.error('Error validating game files', { error: error.message });
        this.showToast('Error validating game files', 'error');
      }
    });

    // Verificar estado inicial del cliente
    this.checkClientStatus();
  }

  async checkClientStatus() {
    try {
      const selectedFolder = localStorage.getItem('selectedFolder');
      if (!selectedFolder) return;

      logger.info('Checking client status', { folder: selectedFolder });
      
      const isValid = await fileValidator.validateDirectory(selectedFolder);
      if (isValid) {
        const files = await this.patchDownloader.getLocalFiles(selectedFolder);
        this.isClientReady = files.length > 0;
        logger.info('Client status: Ready', { fileCount: files.length });
        
        // NO llamar automáticamente a checkForUpdates aquí
        // checkForUpdates() se debe llamar manualmente desde game-panel.html
      } else {
        this.isClientReady = false;
        logger.warn('Client status: Not ready - invalid directory');
      }
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
      this.isDownloading = true;
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
        
        this.showToast('All files are up to date ✓', 'success');
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
          
          this.showToast('Installation completed successfully ✓', 'success');
        },
        (error) => {
          // Error en instalación
          console.error('❌ Installation failed:', error);
          this.showToast(`Installation failed: ${error}`, 'error');
          progressStatus.textContent = `Installation failed: ${error}`;
        }
      );

      // Guardar estado de actualización
      await this.patchDownloader.saveUpdateState(serverFiles);

      console.log('✅ Update process completed successfully');

    } catch (error) {
      console.error('❌ Update process failed:', error);
      this.showToast(`Update failed: ${error.message}`, 'error');
      progressStatus.textContent = `Update failed: ${error.message}`;
    } finally {
      this.isDownloading = false;
      btnUpdate.disabled = false;
      btnPlay.disabled = false;
    }
  }

  async startRepair(progressFill, progressPercent, progressStatus, progressDetails, btnRepair) {
    try {
      this.isRepairing = true;
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
        
        this.showToast(result.message, 'success');
      } else {
        console.log('❌ Repair falló:', result.message);
        this.showToast(`Repair failed: ${result.message}`, 'error');
        progressStatus.textContent = `Repair failed: ${result.message}`;
      }

    } catch (error) {
      console.error('❌ Error en repair:', error);
      logger.error('Repair process failed', { error: error.message });
      this.showToast(`Repair failed: ${error.message}`, 'error');
      progressStatus.textContent = `Repair failed: ${error.message}`;
    } finally {
      this.isRepairing = false;
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