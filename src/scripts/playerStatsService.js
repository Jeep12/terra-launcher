/**
 * Servicio para manejar las estadísticas de jugadores
 */
import { environment } from '../environments/enviroment.js';

class PlayerStatsService {
  constructor() {
    this.baseUrl = environment.apiUrl;
    this.cache = {
      stats: null,
      lastUpdate: null
    };
    this.cacheTimeout = 2 * 60 * 1000; // 2 minutos (más frecuente que rankings)
  }

  /**
   * Obtiene las estadísticas de jugadores desde la API con cache
   * @returns {Promise<Object>} Objeto con total y online
   */
  async getPlayerStats() {
    // Verificar cache
    if (this.cache.stats && this.cache.lastUpdate) {
      const timeSinceUpdate = Date.now() - this.cache.lastUpdate;
      if (timeSinceUpdate < this.cacheTimeout) {
        return this.cache.stats;
      }
    }

    try {
      const headers = {
        'X-Electron-API-Key': environment.apiKey,
        'User-Agent': 'L2Terra-Launcher/1.0.0 (Electron)'
      };
      
      const response = await fetch(`${this.baseUrl}/api/stats`, {
        method: 'GET',
        headers: headers,
        timeout: 10000
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('Invalid data format: expected object');
      }

      // Actualizar cache
      this.cache.stats = data;
      this.cache.lastUpdate = Date.now();

      return data;
    } catch (error) {
      console.error('❌ Error obteniendo player stats:', error);
      console.error('❌ Error details Player Stats:', {
        message: error.message,
        name: error.name,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Actualiza las estadísticas en la interfaz
   */
  async updatePlayerStats() {
    try {
      const stats = await this.getPlayerStats();
      this.updateStatsDisplay(stats);
    } catch (error) {
      logger.error('Error en PlayerStatsService.updatePlayerStats()', { error: error.message }, 'PlayerStatsService');
      this.showErrorInStats();
    }
  }

  /**
   * Actualiza la visualización de estadísticas en el DOM
   * @param {Object} stats - Objeto con total y online
   */
  updateStatsDisplay(stats) {
    // Buscar directamente los elementos por clase
    const totalValue = document.querySelector('.stat-value');
    const onlineValue = document.querySelectorAll('.stat-value')[1];
    
    if (totalValue) {
      totalValue.textContent = stats.total.toLocaleString();
    } else {
      logger.warn('No se encontró el elemento total-value', null, 'PlayerStatsService');
    }
    
    if (onlineValue) {
      onlineValue.textContent = stats.online.toLocaleString();
    } else {
      logger.warn('No se encontró el elemento online-value', null, 'PlayerStatsService');
    }
  }

  /**
   * Muestra un mensaje de error en las estadísticas
   */
  showErrorInStats() {
    // Buscar directamente los elementos por clase
    const totalValue = document.querySelector('.stat-value');
    const onlineValue = document.querySelectorAll('.stat-value')[1];
    
    if (totalValue) {
      totalValue.textContent = '--';
      totalValue.style.color = '#e74c3c';
    }
    
    if (onlineValue) {
      onlineValue.textContent = '--';
      onlineValue.style.color = '#e74c3c';
    }
  }



  /**
   * Limpia el cache para forzar una nueva actualización
   */
  clearCache() {
    this.cache.stats = null;
    this.cache.lastUpdate = null;
  }
}

export default PlayerStatsService; 