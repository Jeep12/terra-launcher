// UIManager.js - Gestión de UI para Game Panel con autenticación
import { environment } from '../../environments/enviroment.js';

class UIManager {
  constructor() {
    this.isLoggedIn = false;
    this.currentUser = null;
    this.loginForm = null;
    this.loginPanel = null;
    this.gameLauncher = null;
  }


  setupLoginEvents() {
    console.log('🔐 Configurando eventos de login...');
    
    this.loginForm = document.getElementById('loginForm');
    this.loginPanel = document.getElementById('loginPanel');
    
    if (this.loginForm) {
      this.loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleLogin();
      });
    }
  }

  async handleLogin() {
    try {
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;
      
      console.log('🔐 Intentando login con:', username);
      
      
      
      
      
      console.log('✅ Login exitoso:', loginResult);
      this.currentUser = username;
      this.isLoggedIn = true;
      
      // Guardar usuario en localStorage
      localStorage.setItem('rememberedUser', username);
      
      // Mostrar panel del juego
      this.showGamePanel();
    } catch (error) {
      console.error('❌ Error en login:', error);
      
      // Mostrar el mensaje específico del error si está disponible
      const errorMessage = error.message || 'Error de conexión';
      this.showToast(errorMessage, 'error');
    }
  }

  async checkRememberedUser() {
    const rememberedUser = localStorage.getItem('rememberedUser');
    if (rememberedUser) {
      console.log('👤 Usuario recordado:', rememberedUser);
      
      // Verificar si el elemento existe antes de intentar establecer el valor
      const usernameElement = document.getElementById('username');
      if (usernameElement) {
        usernameElement.value = rememberedUser;
      } else {
        console.log('⚠️ Elemento username no encontrado en el DOM');
      }
    }
  }

  showGamePanel() {
    console.log('🎮 Mostrando panel del juego...');
    
    if (this.loginPanel) {
      this.loginPanel.style.display = 'none';
    }
    

  }






  async loadRankings() {
    try {
      console.log('📊 Cargando rankings...');
      
      const rankingService = await import('../rankingService.js');
      const service = new rankingService.default();
      
      // Cargar rankings iniciales
      await service.updateRankings();
      
      // Configurar actualización automática cada 5 minutos
      setInterval(async () => {
        await service.updateRankings();
      }, 5 * 60 * 1000);
      
      console.log('✅ Rankings cargados correctamente');
    } catch (error) {
      console.error('❌ Error cargando rankings:', error);
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
    
    // Agregar clase show después de un pequeño delay
    setTimeout(() => {
      toast.classList.add('show');
    }, 100);
    
    // Remover después del tiempo especificado
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, duration);
  }

  updateProgressBar(progress, status, details = null) {
    const progressFill = document.getElementById('progressFill');
    const progressPercent = document.getElementById('progressPercent');
    const progressStatus = document.getElementById('progressStatus');
    
    if (progressFill) {
      progressFill.style.width = `${progress}%`;
    }
    
    if (progressPercent) {
      progressPercent.textContent = `${progress}%`;
    }
    
    if (progressStatus) {
      progressStatus.textContent = status;
    }
  }

  // Nueva función para actualizar detalles del progreso
  updateProgressDetails(progressData) {
    console.log('📊 UIManager.updateProgressDetails llamado con:', progressData);
    
    const progressTime = document.getElementById('progressTime');
    const progressSpeed = document.getElementById('progressSpeed');
    const currentFile = document.getElementById('currentFile');
    const progressDetails = document.getElementById('progressDetails');
    const progressETA = document.getElementById('progressETA');
    const progressPhase = document.getElementById('progressPhase');
    
    console.log('Elementos encontrados:', {
      progressTime: !!progressTime,
      progressSpeed: !!progressSpeed,
      currentFile: !!currentFile,
      progressDetails: !!progressDetails,
      progressETA: !!progressETA,
      progressPhase: !!progressPhase
    });
    
    if (!progressTime || !progressSpeed || !currentFile) {
      console.log('⚠️ Elementos de progreso no encontrados');
      return;
    }
    
    // Mostrar detalles del progreso
    if (progressDetails) {
      progressDetails.style.display = 'block';
    }
    
    // Actualizar tiempo transcurrido
    if (progressData.elapsed !== undefined) {
      const elapsedTime = this.formatTime(progressData.elapsed);
      progressTime.textContent = `⏱️ ${elapsedTime}`;
      console.log('⏰ Tiempo actualizado:', elapsedTime);
    }
    
    // Actualizar velocidad
    if (progressData.speed !== undefined) {
      const formattedSpeed = this.formatSpeed(progressData.speed);
      progressSpeed.textContent = `🚀 ${formattedSpeed}`;
      console.log('🚀 Velocidad actualizada:', formattedSpeed);
    }
    
    // Actualizar archivo actual
    if (progressData.filename || progressData.currentFile) {
      const fileName = progressData.filename || progressData.currentFile;
      currentFile.textContent = `📁 ${fileName}`;
      console.log('📁 Archivo actualizado:', fileName);
    }
    
    // Actualizar tiempo restante (ETA)
    if (progressData.eta && progressETA) {
      const etaTime = this.formatTime(progressData.eta);
      progressETA.textContent = `⏳ ${etaTime} restantes`;
    }
    
    // Actualizar fase actual
    if (progressData.currentPhase && progressPhase) {
      const phaseText = this.getPhaseText(progressData.currentPhase);
      progressPhase.textContent = `🔄 ${phaseText}`;
    }
    
    // Actualizar información adicional si está disponible
    if (progressData.fileIndex && progressData.totalFiles) {
      const fileProgress = document.getElementById('fileProgress');
      if (fileProgress) {
        fileProgress.textContent = `📦 Archivo ${progressData.fileIndex}/${progressData.totalFiles}`;
      }
    }
  }
  
  // Función para obtener texto descriptivo de la fase
  getPhaseText(phase) {
    const phaseTexts = {
      'download': 'Descargando...',
      'extraction': 'Extrayendo...',
      'verification': 'Verificando...',
      'repair': 'Reparando...',
      'install': 'Instalando...'
    };
    return phaseTexts[phase] || 'Procesando...';
  }

  // Función para formatear tiempo
  formatTime(milliseconds) {
    if (milliseconds <= 0) return '00:00';
    
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
    } else {
      return `${minutes.toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
    }
  }

  // Función para formatear velocidad
  formatSpeed(bytesPerSecond) {
    if (bytesPerSecond >= 1024 * 1024) {
      return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
    } else if (bytesPerSecond >= 1024) {
      return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
    } else {
      return `${Math.round(bytesPerSecond)} B/s`;
    }
  }

  updateRankings(pvpData, pkData) {
    this.updatePvPTable(pvpData);
    this.updatePKTable(pkData);
  }

  updatePvPTable(data) {
    const tbody = document.getElementById('pvpTableBody');
    if (!tbody) {
      console.log('⚠️ pvpTableBody no encontrado');
      return;
    }
    
    tbody.innerHTML = '';
    
    data.forEach(player => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${player.position}</td>
        <td>${player.name}</td>
        <td>${player.score}</td>
      `;
      tbody.appendChild(row);
    });
  }

  updatePKTable(data) {
    const tbody = document.getElementById('pkTableBody');
    if (!tbody) {
      console.log('⚠️ pkTableBody no encontrado');
      return;
    }
    
    tbody.innerHTML = '';
    
    data.forEach(player => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${player.position}</td>
        <td>${player.name}</td>
        <td>${player.score}</td>
      `;
      tbody.appendChild(row);
    });
  }

  updateFolderPath(path) {
    const folderPathElement = document.getElementById('folderPath');
    if (folderPathElement) {
      folderPathElement.textContent = path || 'No se ha seleccionado carpeta';
    }
  }

  setButtonState(buttonId, enabled, text = null) {
    const button = document.getElementById(buttonId);
    if (button) {
      button.disabled = !enabled;
      if (text) {
        button.textContent = text;
      }
    }
  }
}

export default UIManager; 