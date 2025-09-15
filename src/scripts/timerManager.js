// timerManager.js - Sistema de temporizador con tiempo estimado
import { logger } from './logger.js';

class TimerManager {
  constructor() {
    this.activeTimers = new Map();
    this.operationHistory = new Map();
    this.estimatedSpeeds = {
      download: 1024 * 1024, // 1MB/s por defecto
      extraction: 5 * 1024 * 1024, // 5MB/s por defecto
      validation: 10 * 1024 * 1024 // 10MB/s por defecto
    };
  }

  // Iniciar temporizador para una operación
  startTimer(operationId, operationType, totalSize = 0, onProgress = null) {
    const timer = {
      id: operationId,
      type: operationType,
      startTime: Date.now(),
      totalSize: totalSize,
      currentProgress: 0,
      estimatedSpeed: this.estimatedSpeeds[operationType] || 1024 * 1024,
      onProgress: onProgress,
      intervals: [],
      isActive: true
    };

    this.activeTimers.set(operationId, timer);
    logger.info(`Timer started for operation: ${operationId}`, { type: operationType, totalSize });

    return timer;
  }

  // Actualizar progreso del temporizador
  updateProgress(operationId, progress, currentSize = 0, downloadedBytes = 0, realSpeed = null) {
    const timer = this.activeTimers.get(operationId);
    if (!timer || !timer.isActive) return;

    const elapsed = Date.now() - timer.startTime;
    timer.currentProgress = progress;
    timer.currentSize = currentSize;
    timer.downloadedBytes = downloadedBytes;

    // Usar velocidad real si se proporciona, sino calcular basada en bytes descargados
    if (realSpeed && realSpeed > 0) {
      // Usar la velocidad real proporcionada
      timer.estimatedSpeed = realSpeed;
      logger.debug(`Using real speed: ${this.formatSpeed(realSpeed)}`);
    } else if (elapsed > 1000 && downloadedBytes > 0 && timer.type === 'download') { // Solo calcular durante descarga
      const currentSpeed = (downloadedBytes / elapsed) * 1000; // bytes por segundo
      
      // Suavizar la velocidad para evitar saltos bruscos
      if (timer.estimatedSpeed === this.estimatedSpeeds[timer.type]) {
        // Primera vez, usar velocidad calculada
        timer.estimatedSpeed = currentSpeed;
      } else {
        // Promedio ponderado para suavizar
        timer.estimatedSpeed = (timer.estimatedSpeed * 0.7) + (currentSpeed * 0.3);
      }
      
      logger.debug(`Speed calculation`, {
        downloadedBytes,
        elapsed,
        currentSpeed: this.formatSpeed(currentSpeed),
        smoothedSpeed: this.formatSpeed(timer.estimatedSpeed)
      });
    }

    // Calcular tiempo estimado
    const estimatedTime = this.calculateEstimatedTime(timer);
    const elapsedTime = this.formatTime(elapsed);
    const remainingTime = this.formatTime(estimatedTime.remaining);

    // Llamar callback de progreso
    if (timer.onProgress) {
      timer.onProgress({
        progress: progress,
        elapsed: elapsedTime,
        remaining: remainingTime,
        speed: this.formatSpeed(timer.estimatedSpeed),
        eta: estimatedTime.eta
      });
    }

    logger.debug(`Progress updated for ${operationId}`, {
      progress: `${progress}%`,
      elapsed: elapsedTime,
      remaining: remainingTime,
      speed: this.formatSpeed(timer.estimatedSpeed),
      downloadedBytes
    });
  }

  // Actualizar solo la velocidad del temporizador
  updateSpeed(operationId, speed) {
    const timer = this.activeTimers.get(operationId);
    if (!timer || !timer.isActive) return;

    // Actualizar velocidad estimada
    timer.estimatedSpeed = speed;
    
    logger.debug(`Speed updated for ${operationId}`, { speed: this.formatSpeed(speed) });
  }

  // Calcular tiempo estimado
  calculateEstimatedTime(timer) {
    const elapsed = Date.now() - timer.startTime;
    const progress = timer.currentProgress / 100;
    
    // Evitar división por cero y valores inválidos
    if (progress <= 0 || elapsed <= 0) {
      return {
        remaining: 0,
        eta: new Date(Date.now())
      };
    }

    const totalEstimatedTime = elapsed / progress;
    const remaining = Math.max(0, totalEstimatedTime - elapsed);
    const eta = new Date(Date.now() + remaining);

    return { remaining, eta };
  }

  // Completar temporizador
  completeTimer(operationId) {
    const timer = this.activeTimers.get(operationId);
    if (!timer) return;

    const totalTime = Date.now() - timer.startTime;
    timer.isActive = false;
    
    // Calcular velocidad promedio final
    if (totalTime > 0 && timer.downloadedBytes > 0) {
      const averageSpeed = (timer.downloadedBytes / totalTime) * 1000; // bytes por segundo
      timer.finalAverageSpeed = averageSpeed;
      logger.info(`Operation completed`, {
        operationId,
        totalTime: this.formatTime(totalTime),
        totalBytes: this.formatSize(timer.downloadedBytes),
        averageSpeed: this.formatSpeed(averageSpeed)
      });
    }

    // Guardar en historial
    this.updateOperationHistory(timer.type, totalTime, timer.downloadedBytes || 0);

    // Limpiar intervalos
    timer.intervals.forEach(interval => clearInterval(interval));
    timer.intervals = [];

    logger.info(`Timer completed for operation: ${operationId}`, {
      type: timer.type,
      totalTime: this.formatTime(totalTime),
      finalSpeed: timer.finalAverageSpeed ? this.formatSpeed(timer.finalAverageSpeed) : 'N/A'
    });
  }

  // Cancelar temporizador
  cancelTimer(operationId) {
    const timer = this.activeTimers.get(operationId);
    if (!timer) return;

    timer.isActive = false;
    this.activeTimers.delete(operationId);

    logger.info(`Timer cancelled for operation: ${operationId}`);
  }

  // Detener temporizador (alias de cancelTimer)
  stopTimer(operationId) {
    this.cancelTimer(operationId);
  }

  // Actualizar historial de operaciones
  updateOperationHistory(operationType, totalTime, totalSize) {
    if (!this.operationHistory.has(operationType)) {
      this.operationHistory.set(operationType, []);
    }

    const history = this.operationHistory.get(operationType);
    history.push({ totalTime, totalSize, timestamp: Date.now() });

    // Mantener solo los últimos 10 registros
    if (history.length > 10) {
      history.shift();
    }

    // Actualizar velocidad estimada basada en el historial
    this.updateEstimatedSpeed(operationType);
  }

  // Actualizar velocidad estimada basada en historial
  updateEstimatedSpeed(operationType) {
    const history = this.operationHistory.get(operationType);
    if (!history || history.length === 0) return;

    const recentHistory = history.slice(-5); // Últimos 5 registros
    let totalSpeed = 0;
    let validEntries = 0;

    for (const entry of recentHistory) {
      if (entry.totalSize > 0 && entry.totalTime > 0) {
        const speed = (entry.totalSize / entry.totalTime) * 1000; // bytes por segundo
        totalSpeed += speed;
        validEntries++;
      }
    }

    if (validEntries > 0) {
      this.estimatedSpeeds[operationType] = totalSpeed / validEntries;
      logger.debug(`Updated estimated speed for ${operationType}`, {
        speed: this.formatSpeed(this.estimatedSpeeds[operationType])
      });
    }
  }

  // Formatear tiempo en formato legible
  formatTime(milliseconds) {
    if (milliseconds <= 0) return '0s';

    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  // Formatear velocidad en formato legible
  formatSpeed(bytesPerSecond) {
    if (bytesPerSecond >= 1024 * 1024) {
      return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
    } else if (bytesPerSecond >= 1024) {
      return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
    } else {
      return `${Math.round(bytesPerSecond)} B/s`;
    }
  }

  // Obtener tiempo estimado para una operación
  getEstimatedTime(operationType, totalSize) {
    const speed = this.estimatedSpeeds[operationType] || 1024 * 1024;
    const estimatedSeconds = totalSize / speed;
    const estimatedMs = estimatedSeconds * 1000;

    return {
      time: this.formatTime(estimatedMs),
      seconds: estimatedSeconds,
      speed: this.formatSpeed(speed)
    };
  }

  // Obtener estadísticas de temporizadores
  getTimerStats() {
    const activeTimers = Array.from(this.activeTimers.values());
    const historyStats = {};

    for (const [type, history] of this.operationHistory.entries()) {
      if (history.length > 0) {
        const avgTime = history.reduce((sum, entry) => sum + entry.totalTime, 0) / history.length;
        const avgSize = history.reduce((sum, entry) => sum + entry.totalSize, 0) / history.length;
        const avgSpeed = avgSize > 0 ? (avgSize / avgTime) * 1000 : 0;
        
        historyStats[type] = {
          averageTime: this.formatTime(avgTime),
          averageSize: this.formatSize(avgSize),
          averageSpeed: this.formatSpeed(avgSpeed),
          totalOperations: history.length,
          lastOperation: history[history.length - 1] ? new Date(history[history.length - 1].timestamp).toLocaleString() : 'N/A'
        };
      }
    }

    return {
      activeTimers: activeTimers.length,
      estimatedSpeeds: Object.fromEntries(
        Object.entries(this.estimatedSpeeds).map(([type, speed]) => [
          type, 
          this.formatSpeed(speed)
        ])
      ),
      historyStats,
      performance: {
        totalOperations: Object.values(historyStats).reduce((sum, stat) => sum + stat.totalOperations, 0),
        averageSpeed: this.calculateOverallAverageSpeed(),
        reliability: this.calculateReliabilityScore()
      }
    };
  }
  
  // Calcular velocidad promedio general
  calculateOverallAverageSpeed() {
    const speeds = Object.values(this.estimatedSpeeds);
    if (speeds.length === 0) return '0 B/s';
    
    const avgSpeed = speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length;
    return this.formatSpeed(avgSpeed);
  }
  
  // Calcular puntuación de confiabilidad basada en historial
  calculateReliabilityScore() {
    let totalOperations = 0;
    let successfulOperations = 0;
    
    for (const history of this.operationHistory.values()) {
      totalOperations += history.length;
      // Asumimos que si está en el historial, fue exitoso
      successfulOperations += history.length;
    }
    
    if (totalOperations === 0) return 'N/A';
    
    const reliability = (successfulOperations / totalOperations) * 100;
    return `${reliability.toFixed(1)}%`;
  }

  // Formatear tamaño en formato legible
  formatSize(bytes) {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    } else if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    } else if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    } else {
      return `${bytes} B`;
    }
  }

  // Limpiar temporizadores antiguos
  cleanup() {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutos

    for (const [id, timer] of this.activeTimers.entries()) {
      if (now - timer.startTime > maxAge) {
        this.activeTimers.delete(id);
        logger.warn(`Cleaned up old timer: ${id}`);
      }
    }
  }
}

export const timerManager = new TimerManager();