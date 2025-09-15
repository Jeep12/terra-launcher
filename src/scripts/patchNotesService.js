/**
 * Servicio para manejar los patch notes
 */
import { environment } from '../environments/enviroment.js';

class PatchNotesService {
  constructor() {
    this.baseUrl = environment.apiUrl;
    this.cache = {
      patches: null,
      lastUpdate: null
    };
    this.cacheTimeout = 10 * 60 * 1000; // 10 minutos
  }

  /**
   * Obtiene los patch notes desde la API con cache
   * @returns {Promise<Array>} Array de patch notes
   */
  async getPatchNotes() {
    // Verificar cache
    if (this.cache.patches && this.cache.lastUpdate) {
      const timeSinceUpdate = Date.now() - this.cache.lastUpdate;
      if (timeSinceUpdate < this.cacheTimeout) {
        return this.cache.patches;
      }
    }

    try {
      const headers = {
        'X-Electron-API-Key': environment.apiKey,
        'User-Agent': 'L2Terra-Launcher/1.0.0 (Electron)'
      };
      
      const response = await fetch(`${this.baseUrl}/api/game/patch-notes`, {
        method: 'GET',
        headers: headers,
        timeout: 10000
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (!Array.isArray(data)) {
        throw new Error('Invalid data format: expected array');
      }

      // Actualizar cache
      this.cache.patches = data;
      this.cache.lastUpdate = Date.now();

      return data;
    } catch (error) {
      console.error('❌ Error obteniendo patch notes:', error);
      console.error('❌ Error details Patch Notes:', {
        message: error.message,
        name: error.name,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Actualiza los patch notes en la interfaz
   */
  async updatePatchNotes() {
    try {
      const patches = await this.getPatchNotes();
      this.updatePatchNotesTable(patches);
    } catch (error) {
      logger.error('Error en PatchNotesService.updatePatchNotes()', { error: error.message }, 'PatchNotesService');
      this.showErrorInPatchNotes();
    }
  }

  /**
   * Actualiza la tabla de patch notes en el DOM
   * @param {Array} patches - Array de patch notes
   */
  updatePatchNotesTable(patches) {
    const container = document.querySelector('.patch-notes');
    if (!container) return;

    // Guardar los patches originales para ordenamiento
    this.originalPatches = patches;
    
    // Aplicar ordenamiento actual
    const sortedPatches = this.sortPatches(patches);
    
    container.innerHTML = '';
    
    sortedPatches.forEach(patch => {
      const patchCard = document.createElement('div');
      patchCard.className = 'patch-note-card';
      
      // Formatear la fecha
      const releaseDate = new Date(patch.releaseDate);
      const formattedDate = this.formatDate(releaseDate);
      
      // Calcular días desde el lanzamiento
      const daysAgo = this.getDaysAgo(releaseDate);
      
      patchCard.innerHTML = `
        <div class="patch-note-header">
          <h4>${patch.title}</h4>
          <span class="patch-date">${daysAgo}</span>
        </div>
        <ul class="patch-note-list">
          ${patch.content.map(item => `<li>• ${item}</li>`).join('')}
        </ul>
      `;
      
      container.appendChild(patchCard);
    });
  }

  /**
   * Ordena los patch notes según el criterio seleccionado
   * @param {Array} patches - Array de patch notes
   * @returns {Array} Array ordenado
   */
  sortPatches(patches) {
    const sortSelect = document.getElementById('patchNotesSort');
    const sortOrder = sortSelect ? sortSelect.value : 'newest';
    
    const sortedPatches = [...patches].sort((a, b) => {
      const dateA = new Date(a.releaseDate);
      const dateB = new Date(b.releaseDate);
      
      if (sortOrder === 'newest') {
        return dateB - dateA; // Más reciente primero
      } else {
        return dateA - dateB; // Más antiguo primero
      }
    });
    
    return sortedPatches;
  }

  /**
   * Aplica el ordenamiento actual a los patch notes mostrados
   */
  applyCurrentSorting() {
    if (this.originalPatches) {
      this.updatePatchNotesTable(this.originalPatches);
    }
  }

  /**
   * Muestra un mensaje de error en la sección de patch notes
   */
  showErrorInPatchNotes() {
    const container = document.querySelector('.patch-notes');
    if (!container) return;

    container.innerHTML = `
      <div class="patch-note-card" style="text-align: center; color: #e74c3c;">
        <div class="patch-note-header">
          <h4><i class="fa-solid fa-exclamation-triangle"></i> Error Loading Patch Notes</h4>
        </div>
        <p>Unable to load patch notes at this time.</p>
        <p><small>Please check your connection and try again later.</small></p>
      </div>
    `;
  }

  /**
   * Formatea una fecha para mostrar
   * @param {Date} date - Fecha a formatear
   * @returns {string} Fecha formateada
   */
  formatDate(date) {
    const options = { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    };
    return date.toLocaleDateString('en-US', options);
  }

  /**
   * Calcula cuántos días han pasado desde una fecha
   * @param {Date} date - Fecha de referencia
   * @returns {string} Texto descriptivo
   */
  getDaysAgo(date) {
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    }
    if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return `${months} month${months > 1 ? 's' : ''} ago`;
    }
    
    const years = Math.floor(diffDays / 365);
    return `${years} year${years > 1 ? 's' : ''} ago`;
  }



  /**
   * Limpia el cache para forzar una nueva actualización
   */
  clearCache() {
    this.cache.patches = null;
    this.cache.lastUpdate = null;
  }
}

export default PatchNotesService; 