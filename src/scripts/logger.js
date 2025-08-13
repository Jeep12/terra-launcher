// logger.js - Sistema de logging robusto y configurable
import { environment } from '../environments/enviroment.js';

class Logger {
  constructor() {
    this.logs = [];
    this.maxLogs = 1000;
    this.isInitialized = false;
    this.controlPanel = null;
    
    // Configuración de niveles de log
    this.config = {
      // Niveles disponibles: 'error', 'warn', 'info', 'debug'
      minLevel: environment.production ? 'info' : 'debug',
      
      // Configuración específica por módulo
      modules: {
        default: 'info', // Nivel por defecto para todos los módulos
        'GameLauncher': 'info',
        'RankingService': 'warn', // Solo warnings y errores
        'PatchNotesService': 'warn',
        'PlayerStatsService': 'warn',
        'PatchDownloader': 'info',
        'RepairService': 'info',
        'FolderSelector': 'warn',
        'UIManager': 'warn',
        'Renderer': 'info'
      },
      
      // Silenciar logs de debug completamente
      silentDebug: false,
      
      // Mostrar timestamps en consola
      showTimestamps: false,
      
      // Mostrar datos adicionales en consola
      showData: false
    };
    
    // Mapeo de niveles de prioridad
    this.levelPriority = {
      'error': 4,
      'warn': 3,
      'info': 2,
      'debug': 1
    };
  }

  // Inicializar logger
  async initialize() {
    if (this.isInitialized) return;
    
    try {
      if (window.electron) {
        this.userDataPath = await window.electron.getUserDataPath();
        this.logFilePath = window.electron.path.join(this.userDataPath, 'launcher.log');
        this.isInitialized = true;
        this.log('info', 'Logger initialized successfully');
      }
    } catch (error) {
      console.error('Failed to initialize logger:', error);
    }
  }

  // Verificar si un nivel debe ser mostrado
  shouldLog(level, module = 'default') {
    const moduleLevel = this.config.modules[module] || this.config.modules.default;
    const currentPriority = this.levelPriority[level] || 0;
    const modulePriority = this.levelPriority[moduleLevel] || 0;
    const minPriority = this.levelPriority[this.config.minLevel] || 0;
    
    // Si está silenciado el debug, no mostrar logs de debug
    if (this.config.silentDebug && level === 'debug') {
      return false;
    }
    
    // Verificar si el nivel cumple con el mínimo global y el del módulo
    return currentPriority >= Math.max(minPriority, modulePriority);
  }

  // Función principal de logging
  log(level, message, data = null, module = 'default') {
    // Verificar si debe mostrar este log
    if (!this.shouldLog(level, module)) {
      return;
    }

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      data,
      module,
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    // Agregar a logs en memoria
    this.logs.push(logEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Console output
    const timestampStr = this.config.showTimestamps ? `[${timestamp}]` : '';
    const moduleStr = module !== 'default' ? `[${module}]` : '';
    const consoleMessage = `${timestampStr} [${level.toUpperCase()}]${moduleStr} ${message}`;
    
    switch (level) {
      case 'error':
        console.error(consoleMessage, this.config.showData ? data : '');
        break;
      case 'warn':
        console.warn(consoleMessage, this.config.showData ? data : '');
        break;
      case 'info':
        console.info(consoleMessage, this.config.showData ? data : '');
        break;
      default:
        console.log(consoleMessage, this.config.showData ? data : '');
    }

    // Guardar en archivo si está disponible
    this.saveToFile(logEntry);
  }

  // Guardar log en archivo
  async saveToFile(logEntry) {
    if (!this.isInitialized || !window.electron) return;

    try {
      const logLine = JSON.stringify(logEntry) + '\n';
      await window.electron.writeFile(this.logFilePath, logLine, { flag: 'a' });
    } catch (error) {
      console.error('Failed to write log to file:', error);
    }
  }

  // Métodos de conveniencia
  error(message, data = null, module = 'default') {
    this.log('error', message, data, module);
  }

  warn(message, data = null, module = 'default') {
    this.log('warn', message, data, module);
  }

  info(message, data = null, module = 'default') {
    this.log('info', message, data, module);
  }

  debug(message, data = null, module = 'default') {
    this.log('debug', message, data, module);
  }

  // Configurar el logger
  configure(config) {
    this.config = { ...this.config, ...config };
  }

  // Configurar nivel para un módulo específico
  setModuleLevel(module, level) {
    this.config.modules[module] = level;
  }

  // Silenciar/activar logs de debug
  setSilentDebug(silent) {
    this.config.silentDebug = silent;
  }

  // Obtener logs recientes
  getRecentLogs(limit = 50) {
    return this.logs.slice(-limit);
  }

  // Limpiar logs antiguos
  clearOldLogs() {
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
  }

  // Exportar logs para debugging
  exportLogs() {
    return {
      logs: this.logs,
      summary: {
        total: this.logs.length,
        errors: this.logs.filter(log => log.level === 'ERROR').length,
        warnings: this.logs.filter(log => log.level === 'WARN').length,
        info: this.logs.filter(log => log.level === 'INFO').length,
        debug: this.logs.filter(log => log.level === 'DEBUG').length
      }
    };
  }

  // Limpiar consola
  clearConsole() {
    console.clear();
  }

  // Silenciar completamente la consola
  silenceAll() {
    this.configure({
      minLevel: 'error',
      silentDebug: true,
      showTimestamps: false,
      showData: false,
      modules: {
        default: 'error',
        'GameLauncher': 'error',
        'RankingService': 'error',
        'PatchNotesService': 'error',
        'PlayerStatsService': 'error',
        'PatchDownloader': 'error',
        'RepairService': 'error',
        'FolderSelector': 'error',
        'UIManager': 'error',
        'Renderer': 'error'
      }
    });
    this.clearConsole();
  }

  // Crear panel de control visual
  createControlPanel() {
    if (this.controlPanel) {
      this.controlPanel.remove();
    }

    const panel = document.createElement('div');
    panel.id = 'logger-control-panel';
    panel.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      width: 350px;
      max-height: 80vh;
      background: rgba(15, 23, 42, 0.95);
      border: 2px solid rgba(245, 158, 11, 0.3);
      border-radius: 12px;
      padding: 20px;
      color: white;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 14px;
      z-index: 10000;
      backdrop-filter: blur(10px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      overflow-y: auto;
      transition: all 0.3s ease;
    `;

    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 1px solid rgba(245, 158, 11, 0.3);
    `;

    const title = document.createElement('h3');
    title.textContent = '🔧 Logger Control';
    title.style.margin = '0';
    title.style.color = '#f59e0b';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `
      background: none;
      border: none;
      color: #f59e0b;
      font-size: 24px;
      cursor: pointer;
      padding: 0;
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      transition: all 0.2s ease;
    `;
    closeBtn.onmouseover = () => closeBtn.style.background = 'rgba(245, 158, 11, 0.2)';
    closeBtn.onmouseout = () => closeBtn.style.background = 'none';
    closeBtn.onclick = () => this.hideControlPanel();

    header.appendChild(title);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // Configuración global
    const globalSection = this.createGlobalSection();
    panel.appendChild(globalSection);

    // Configuración por módulos
    const modulesSection = this.createModulesSection();
    panel.appendChild(modulesSection);

    // Botones de acción
    const actionsSection = this.createActionsSection();
    panel.appendChild(actionsSection);

    document.body.appendChild(panel);
    this.controlPanel = panel;
  }

  createGlobalSection() {
    const section = document.createElement('div');
    section.style.marginBottom = '20px';

    const title = document.createElement('h4');
    title.textContent = '🌐 Configuración Global';
    title.style.margin = '0 0 15px 0';
    title.style.color = '#f59e0b';
    section.appendChild(title);

    // Nivel mínimo global
    const levelDiv = document.createElement('div');
    levelDiv.style.marginBottom = '10px';
    
    const levelLabel = document.createElement('label');
    levelLabel.textContent = 'Nivel mínimo: ';
    levelLabel.style.marginRight = '10px';
    
    const levelSelect = document.createElement('select');
    levelSelect.style.cssText = `
      background: rgba(30, 41, 59, 0.8);
      border: 1px solid rgba(245, 158, 11, 0.3);
      color: white;
      padding: 5px 10px;
      border-radius: 6px;
      font-size: 12px;
    `;
    
    ['error', 'warn', 'info', 'debug'].forEach(level => {
      const option = document.createElement('option');
      option.value = level;
      option.textContent = level.toUpperCase();
      if (level === this.config.minLevel) option.selected = true;
      levelSelect.appendChild(option);
    });

    levelSelect.onchange = (e) => {
      this.config.minLevel = e.target.value;
      this.updateControlPanel();
    };

    levelDiv.appendChild(levelLabel);
    levelDiv.appendChild(levelSelect);
    section.appendChild(levelDiv);

    // Checkboxes globales
    const checkboxes = [
      { key: 'silentDebug', label: 'Silenciar Debug', desc: 'Ocultar todos los logs de debug' },
      { key: 'showTimestamps', label: 'Mostrar Timestamps', desc: 'Mostrar hora en los logs' },
      { key: 'showData', label: 'Mostrar Datos', desc: 'Mostrar datos adicionales' }
    ];

    checkboxes.forEach(({ key, label, desc }) => {
      const checkboxDiv = document.createElement('div');
      checkboxDiv.style.cssText = `
        display: flex;
        align-items: center;
        margin-bottom: 8px;
        font-size: 12px;
      `;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = this.config[key];
      checkbox.style.marginRight = '8px';

      const labelEl = document.createElement('label');
      labelEl.textContent = label;
      labelEl.title = desc;
      labelEl.style.cursor = 'pointer';

      checkbox.onchange = (e) => {
        this.config[key] = e.target.checked;
        this.updateControlPanel();
      };

      checkboxDiv.appendChild(checkbox);
      checkboxDiv.appendChild(labelEl);
      section.appendChild(checkboxDiv);
    });

    return section;
  }

  createModulesSection() {
    const section = document.createElement('div');
    section.style.marginBottom = '20px';

    const title = document.createElement('h4');
    title.textContent = '📦 Módulos';
    title.style.margin = '0 0 15px 0';
    title.style.color = '#f59e0b';
    section.appendChild(title);

    const modules = Object.keys(this.config.modules);
    const levels = ['error', 'warn', 'info', 'debug'];

    modules.forEach(module => {
      const moduleDiv = document.createElement('div');
      moduleDiv.style.cssText = `
        margin-bottom: 12px;
        padding: 10px;
        background: rgba(30, 41, 59, 0.3);
        border-radius: 8px;
        border: 1px solid rgba(245, 158, 11, 0.1);
      `;

      const moduleHeader = document.createElement('div');
      moduleHeader.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
        font-weight: bold;
        font-size: 13px;
      `;

      const moduleName = document.createElement('span');
      moduleName.textContent = module;
      moduleName.style.color = '#e2e8f0';

      const currentLevel = document.createElement('span');
      currentLevel.textContent = this.config.modules[module].toUpperCase();
      currentLevel.style.cssText = `
        background: rgba(245, 158, 11, 0.2);
        color: #f59e0b;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: bold;
      `;

      moduleHeader.appendChild(moduleName);
      moduleHeader.appendChild(currentLevel);
      moduleDiv.appendChild(moduleHeader);

      // Botones de nivel
      const levelButtons = document.createElement('div');
      levelButtons.style.cssText = `
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
      `;

      levels.forEach(level => {
        const btn = document.createElement('button');
        btn.textContent = level.toUpperCase();
        btn.style.cssText = `
          background: ${this.config.modules[module] === level ? 'rgba(245, 158, 11, 0.3)' : 'rgba(51, 65, 85, 0.8)'};
          border: 1px solid ${this.config.modules[module] === level ? '#f59e0b' : 'rgba(245, 158, 11, 0.2)'};
          color: ${this.config.modules[module] === level ? '#f59e0b' : '#cbd5e1'};
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 10px;
          cursor: pointer;
          transition: all 0.2s ease;
          flex: 1;
          min-width: 40px;
        `;

        btn.onclick = () => {
          this.setModuleLevel(module, level);
          this.updateControlPanel();
        };

        btn.onmouseover = () => {
          if (this.config.modules[module] !== level) {
            btn.style.background = 'rgba(245, 158, 11, 0.1)';
          }
        };

        btn.onmouseout = () => {
          if (this.config.modules[module] !== level) {
            btn.style.background = 'rgba(51, 65, 85, 0.8)';
          }
        };

        levelButtons.appendChild(btn);
      });

      moduleDiv.appendChild(levelButtons);
      section.appendChild(moduleDiv);
    });

    return section;
  }

  createActionsSection() {
    const section = document.createElement('div');

    const title = document.createElement('h4');
    title.textContent = '⚡ Acciones Rápidas';
    title.style.margin = '0 0 15px 0';
    title.style.color = '#f59e0b';
    section.appendChild(title);

    const buttons = [
      { text: '🧹 Limpiar Consola', action: () => this.clearConsole() },
      { text: '📊 Solo Errores', action: () => this.setAllModulesLevel('error') },
      { text: '⚠️ Solo Warnings', action: () => this.setAllModulesLevel('warn') },
      { text: 'ℹ️ Solo Info', action: () => this.setAllModulesLevel('info') },
      { text: '🐛 Solo Debug', action: () => this.setAllModulesLevel('debug') },
      { text: '🎯 Solo Descargas', action: () => this.setDownloadModulesOnly() }
    ];

    buttons.forEach(({ text, action }) => {
      const btn = document.createElement('button');
      btn.textContent = text;
      btn.style.cssText = `
        background: rgba(51, 65, 85, 0.8);
        border: 1px solid rgba(245, 158, 11, 0.3);
        color: #e2e8f0;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.2s ease;
        width: 100%;
        margin-bottom: 8px;
      `;

      btn.onclick = () => {
        action();
        this.updateControlPanel();
      };

      btn.onmouseover = () => btn.style.background = 'rgba(245, 158, 11, 0.2)';
      btn.onmouseout = () => btn.style.background = 'rgba(51, 65, 85, 0.8)';

      section.appendChild(btn);
    });

    return section;
  }

  setAllModulesLevel(level) {
    Object.keys(this.config.modules).forEach(module => {
      this.setModuleLevel(module, level);
    });
  }

  setDownloadModulesOnly() {
    // Silenciar todo excepto descargas
    this.setAllModulesLevel('error');
    this.setModuleLevel('PatchDownloader', 'debug');
    this.setModuleLevel('RepairService', 'debug');
  }

  updateControlPanel() {
    if (this.controlPanel) {
      this.controlPanel.remove();
      this.createControlPanel();
    }
  }

  showControlPanel() {
    this.createControlPanel();
  }

  hideControlPanel() {
    if (this.controlPanel) {
      this.controlPanel.remove();
      this.controlPanel = null;
    }
  }

  toggleControlPanel() {
    if (this.controlPanel) {
      this.hideControlPanel();
    } else {
      this.showControlPanel();
    }
  }
}

// Instancia global del logger
export const logger = new Logger(); 