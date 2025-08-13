// serverInfoService.js - Servicio de información del servidor L2 Terra
import { environment } from '../environments/enviroment.js';
import { logger } from './logger.js';

class ServerInfoService {
  constructor() {
    this.serverInfo = null;
    this.lastUpdate = null;
    this.updateInterval = 5 * 60 * 1000; // 5 minutos
  }

  // Obtener información del servidor
  async getServerInfo() {
    try {
      logger.info('Fetching server information');
      
      const response = await fetch(`${environment.patchServer.baseUrl}?action=server_info&token=${token}`);      
      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Failed to get server info');
      }
      
      this.serverInfo = data.server_info;
      this.lastUpdate = Date.now();
      
      logger.info('Server information updated', this.serverInfo);
      return this.serverInfo;
      
    } catch (error) {
      logger.error('Failed to get server info', { error: error.message });
      throw error;
    }
  }

  // Obtener información del servidor de juego
  getGameServerInfo() {
    return {
      name: environment.patchServer.gameServer.name,
      ip: environment.patchServer.gameServer.ip,
      port: environment.patchServer.gameServer.port,
      status: 'online', // Se podría verificar dinámicamente
      lastCheck: this.lastUpdate
    };
  }

  // Verificar si la información está actualizada
  isInfoStale() {
    if (!this.lastUpdate) return true;
    
    const now = Date.now();
    const timeSinceUpdate = now - this.lastUpdate;
    
    return timeSinceUpdate > this.updateInterval;
  }

  // Actualizar información si es necesario
  async updateIfNeeded() {
    if (this.isInfoStale()) {
      await this.getServerInfo();
    }
    return this.serverInfo;
  }

  // Obtener estadísticas del servidor
  getServerStats() {
    if (!this.serverInfo) {
      return {
        status: 'unknown',
        lastUpdate: null,
        message: 'Server info not available'
      };
    }

    return {
      status: 'online',
      lastUpdate: this.lastUpdate ? new Date(this.lastUpdate).toLocaleString() : 'Never',
      serverInfo: this.serverInfo,
      gameServer: this.getGameServerInfo()
    };
  }

  // Formatear información para mostrar en la UI
  formatServerInfo() {
    const gameServer = this.getGameServerInfo();
    
    return {
      serverName: gameServer.name,
      serverIP: gameServer.ip,
      serverPort: gameServer.port,
      serverStatus: gameServer.status,
      lastUpdate: this.lastUpdate ? new Date(this.lastUpdate).toLocaleString() : 'Never',
      connectionString: `${gameServer.ip}:${gameServer.port}`
    };
  }
}

export const serverInfoService = new ServerInfoService();
