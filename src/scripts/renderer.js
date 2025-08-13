// renderer.js - Punto de entrada del renderer actualizado
import './externalLinks.js';
import { initFolderSelector } from './folderSelector.js';
import GameLauncher from './gameLauncher.js';

// Importar sistemas de logging y validación
import { logger } from './logger.js';
import { fileValidator } from './fileValidator.js';
import { retryManager } from './retryManager.js';
import { repairService } from './repairService.js';
import { timerManager } from './timerManager.js';

// Importar nuevo UIManager
import UIManager from './ui/UIManager.js';

// Variables globales
let uiManager = null;
let gameLauncher = null;

// Configurar logger para desarrollo limpio
logger.configure({
  minLevel: 'info', // Solo mostrar info, warn y error
  silentDebug: true, // Silenciar todos los logs de debug
  showTimestamps: false, // No mostrar timestamps en consola
  showData: false, // No mostrar datos adicionales en consola
  modules: {
    default: 'info',
    'GameLauncher': 'info',
    'RankingService': 'warn', // Solo warnings y errores
    'PatchNotesService': 'warn',
    'PlayerStatsService': 'warn',
    'PatchDownloader': 'info',
    'RepairService': 'info',
    'FolderSelector': 'warn',
    'UIManager': 'warn',
    'Renderer': 'info'
  }
});

// Inicializar sistemas cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Limpiar consola al inicio
    logger.clearConsole();
    logger.info('Renderer initialized');
    
    // Inicializar sistemas básicos
    await logger.initialize();
    
    // Inicializar UIManager
    uiManager = new UIManager();
    
    // Inicializar GameLauncher
    logger.debug('Inicializando GameLauncher...', null, 'Renderer');
    gameLauncher = new GameLauncher();
    await gameLauncher.initialize();
    logger.debug('GameLauncher inicializado', null, 'Renderer');
    
    // Hacer el GameLauncher disponible globalmente
    window.gameLauncher = gameLauncher;
    
    // Conectar UIManager con GameLauncher
    window.connectUIManager(gameLauncher);
    
    // Inicializar folder selector
    initFolderSelector();
    
    // Configurar botones del juego
    gameLauncher.setupDownloadButton();
    
    // Cargar datos iniciales
    logger.debug('Cargando datos iniciales...', null, 'Renderer');
    await gameLauncher.loadRankings();
    await gameLauncher.loadPatchNotes();
    await gameLauncher.loadPlayerStats();
    logger.debug('Datos iniciales cargados', null, 'Renderer');
    
    // Configurar actualización automática
    setInterval(() => {
      gameLauncher.loadRankings();
    }, 5 * 60 * 1000); // Rankings cada 5 minutos
    
    setInterval(() => {
      gameLauncher.loadPatchNotes();
    }, 10 * 60 * 1000); // Patch notes cada 10 minutos
    
    setInterval(() => {
      gameLauncher.loadPlayerStats();
    }, 2 * 60 * 1000); // Player stats cada 2 minutos
    
    // Configurar limpieza automática
    setInterval(() => {
      timerManager.cleanup();
      logger.clearOldLogs();
    }, 5 * 60 * 1000); // Cada 5 minutos
    
    logger.debug('Inicialización completa exitosa', null, 'Renderer');
    logger.info('Renderer setup completed');
  } catch (error) {
    logger.error('Error inicializando renderer', { error: error.message }, 'Renderer');
    logger.error('Failed to initialize renderer', { error: error.message });
  }
});



// Exportar para uso global
window.gameLauncherSystems = {
  logger,
  fileValidator,
  retryManager,
  repairService,
  timerManager,
  uiManager: () => uiManager
};

// Funciones globales para controlar logging desde consola
window.logging = {
  // Mostrar todos los logs (incluyendo debug)
  showAll: () => {
    logger.configure({
      minLevel: 'debug',
      silentDebug: false,
      showTimestamps: true,
      showData: true
    });
    console.log('🔍 Logging: Mostrando todos los logs (debug incluido)');
  },
  
  // Solo mostrar info, warn y error
  showInfo: () => {
    logger.configure({
      minLevel: 'info',
      silentDebug: true,
      showTimestamps: false,
      showData: false
    });
    console.log('ℹ️ Logging: Solo info, warnings y errores');
  },
  
  // Solo mostrar warnings y errores
  showWarnings: () => {
    logger.configure({
      minLevel: 'warn',
      silentDebug: true,
      showTimestamps: false,
      showData: false
    });
    console.log('⚠️ Logging: Solo warnings y errores');
  },
  
  // Solo mostrar errores
  showErrors: () => {
    logger.configure({
      minLevel: 'error',
      silentDebug: true,
      showTimestamps: false,
      showData: false
    });
    console.log('❌ Logging: Solo errores');
  },
  
  // Limpiar consola
  clear: () => {
    logger.clearConsole();
    console.log('🧹 Consola limpiada');
  },
  
  // Mostrar configuración actual
  config: () => {
    console.log('📋 Configuración actual del logger:', logger.config);
  },
  
  // Silenciar completamente la consola
  silence: () => {
    logger.silenceAll();
    console.log('🔇 Consola silenciada - solo errores críticos');
  }
  

};

// Función para conectar UIManager con GameLauncher
window.connectUIManager = (gameLauncherInstance) => {
  if (uiManager && gameLauncherInstance) {
    // Conectar métodos del UIManager con GameLauncher
    gameLauncherInstance.uiManager = uiManager;
    
    // Sobrescribir métodos de GameLauncher para usar UIManager
    gameLauncherInstance.showToast = (message, type, duration) => {
      uiManager.showToast(message, type, duration);
    };
    
    gameLauncherInstance.updateProgressBar = (progressFill, progressPercent, progressStatus, message) => {
      uiManager.updateProgressBar(
        parseFloat(progressPercent.textContent) || 0,
        message || progressStatus.textContent
      );
    };
    
    gameLauncherInstance.updateProgressDetails = (timerId, progress, type, filename) => {
      const details = {
        time: `--`,
        speed: `--`,
        file: filename || '--'
      };
      uiManager.updateProgressBar(progress, `${type}...`, details);
    };
    
    logger.info('UIManager connected to GameLauncher');
  }
};
