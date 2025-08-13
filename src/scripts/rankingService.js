/**
 * Servicio para manejar los rankings de PvP y PK
 */
import { environment } from '../environments/enviroment.js';

class RankingService {
  constructor() {
    this.baseUrl = environment.apiUrl;
  }

  /**
   * Obtiene el ranking de PvP desde la API
   */
  async getTopPvP() {
    try {
      const response = await fetch(`${this.baseUrl}/api/game/ranking/top-pvp`, {
        method: 'GET',
        headers: {
          'X-Electron-API-Key': environment.apiKey,
          'User-Agent': 'L2Terra-Launcher/1.0.0 (Electron)'
        }
      });

      const data = await response.json();
      
      // Extraer el array de topPvp
      if (data && data.topPvp && Array.isArray(data.topPvp)) {
        return data.topPvp;
      }
      
      return [];
    } catch (error) {
      logger.error('Error obteniendo ranking PvP', { error: error.message }, 'RankingService');
      return [];
    }
  }

  /**
   * Obtiene el ranking de PK desde la API
   */
  async getTopPK() {
    try {
      const response = await fetch(`${this.baseUrl}/api/game/ranking/top-pk`, {
        method: 'GET',
        headers: {
          'X-Electron-API-Key': environment.apiKey,
          'User-Agent': 'L2Terra-Launcher/1.0.0 (Electron)'
        }
      });

      const data = await response.json();
      
      // Extraer el array de topPk
      if (data && data.topPk && Array.isArray(data.topPk)) {
        return data.topPk;
      }
      
      return [];
    } catch (error) {
      logger.error('Error obteniendo ranking PK', { error: error.message }, 'RankingService');
      return [];
    }
  }

  /**
   * Obtiene el ranking de Clanes desde la API
   */
  async getTopClans() {
    try {
      const response = await fetch(`${this.baseUrl}/api/game/ranking/top-clans`, {
        method: 'GET',
        headers: {
          'X-Electron-API-Key': environment.apiKey,
          'User-Agent': 'L2Terra-Launcher/1.0.0 (Electron)'
        }
      });

      const data = await response.json();
      
      // Extraer el array de response
      if (data && data.response && Array.isArray(data.response)) {
        return data.response;
      }
      
      return [];
    } catch (error) {
      logger.error('Error obteniendo ranking Clans', { error: error.message }, 'RankingService');
      return [];
    }
  }

  /**
   * Actualiza ambos rankings en la interfaz
   */
  async updateRankings() {
    try {
      const [pvpData, pkData, clansData] = await Promise.all([
        this.getTopPvP(),
        this.getTopPK(),
        this.getTopClans()
      ]);

      // Actualizar las tablas
      this.updatePvPTable(pvpData);
      this.updatePKTable(pkData);
      this.updateClansTable(clansData);
    } catch (error) {
      logger.error('Error en RankingService.updateRankings()', { error: error.message }, 'RankingService');
    }
  }

  /**
   * Actualiza la tabla de PvP en el DOM
   */
  updatePvPTable(data) {
    const table = document.querySelector('#topPvPTable table tbody');
    if (!table) return;

    table.innerHTML = '';
    
    data.forEach((player, index) => {
      const row = document.createElement('tr');
      const position = index + 1;
      
      // Aplicar colores especiales para los primeros 3 lugares
      let rankColor = '';
      if (position === 1) {
        rankColor = 'color: #FFD700; font-weight: bold;'; // Gold
      } else if (position === 2) {
        rankColor = 'color: #C0C0C0; font-weight: bold;'; // Silver
      } else if (position === 3) {
        rankColor = 'color: #CD7F32; font-weight: bold;'; // Bronze
      }
      
      row.innerHTML = `
        <td style="font-weight: 700; ${rankColor}">${position}</td>
        <td style="${rankColor}">${player.name}</td>
        <td style="${rankColor}">${player.kills.toLocaleString()}</td>
      `;
      table.appendChild(row);
    });
  }

  /**
   * Actualiza la tabla de PK en el DOM
   */
  updatePKTable(data) {
    const table = document.querySelector('#topPKTable table tbody');
    if (!table) return;

    table.innerHTML = '';
    
    data.forEach((player, index) => {
      const row = document.createElement('tr');
      const position = index + 1;
      
      // Aplicar colores especiales para los primeros 3 lugares
      let rankColor = '';
      if (position === 1) {
        rankColor = 'color: #FFD700; font-weight: bold;'; // Gold
      } else if (position === 2) {
        rankColor = 'color: #C0C0C0; font-weight: bold;'; // Silver
      } else if (position === 3) {
        rankColor = 'color: #CD7F32; font-weight: bold;'; // Bronze
      }
      
      row.innerHTML = `
        <td style="font-weight: 700; ${rankColor}">${position}</td>
        <td style="${rankColor}">${player.name}</td>
        <td style="${rankColor}">${player.kills.toLocaleString()}</td>
      `;
      table.appendChild(row);
    });
  }

  /**
   * Actualiza la tabla de Clanes en el DOM
   */
  updateClansTable(data) {
    const table = document.querySelector('#topClansTable table tbody');
    if (!table) return;

    table.innerHTML = '';
    
    data.forEach((clan, index) => {
      const row = document.createElement('tr');
      const position = index + 1;
      
      // Aplicar colores especiales para los primeros 3 lugares
      let rankColor = '';
      if (position === 1) {
        rankColor = 'color: #FFD700; font-weight: bold;'; // Gold
      } else if (position === 2) {
        rankColor = 'color: #C0C0C0; font-weight: bold;'; // Silver
      } else if (position === 3) {
        rankColor = 'color: #CD7F32; font-weight: bold;'; // Bronze
      }
      
      row.innerHTML = `
        <td style="font-weight: 700; ${rankColor}">${position}</td>
        <td style="${rankColor}">${clan.clanName}</td>
        <td style="${rankColor}">${clan.hasCastle ? 'Yes' : 'No'}</td>
        <td style="${rankColor}">${clan.reputationScore.toLocaleString()}</td>
      `;
      table.appendChild(row);
    });
  }
}

export default RankingService; 