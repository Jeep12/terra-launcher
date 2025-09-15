// toastManager.js - Sistema simplificado de notificaciones toast
import { logger } from '../logger.js';

class ToastManager {
  constructor() {
    this.currentToast = null;
    this.currentTimer = null;
    this.init();
  }

  init() {
    try {
      // Esperar a que el DOM esté listo
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          logger.debug('ToastManager initialized successfully', null, 'ToastManager');
        });
      } else {
        logger.debug('ToastManager initialized successfully', null, 'ToastManager');
      }
    } catch (error) {
      logger.error('Error initializing ToastManager', { error: error.message }, 'ToastManager');
    }
  }

  showToast(message, type = 'info', duration = 3000) {
    try {
      // Limpiar TODOS los toasts existentes de manera agresiva
      this.clearAllToasts();
      
      // Esperar un frame para asegurar que la limpieza se complete
      requestAnimationFrame(() => {
        // Crear nuevo toast
        const toast = this.createToastElement(message, type);
        
        // Agregar al DOM
        document.body.appendChild(toast);
        
        // Animar entrada
        requestAnimationFrame(() => {
          toast.classList.add('show');
        });
        
        // Guardar referencia
        this.currentToast = toast;
        
        // Configurar timer para ocultar (solo si no es un error)
        if (type !== 'error') {
          this.currentTimer = setTimeout(() => {
            this.hideCurrentToast();
          }, duration);
        }
      });
      
    } catch (error) {
      logger.error('Error showing toast', { error: error.message, message, type }, 'ToastManager');
    }
  }

  createToastElement(message, type) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // Hacer que todo el toast sea clickeable para cerrarlo
    toast.style.cursor = 'pointer';
    toast.onclick = () => this.hideCurrentToast();
    
    toast.innerHTML = `
      <div class="toast-content">
        <span class="toast-message">${this.escapeHtml(message)}</span>
        <button class="toast-close" onclick="event.stopPropagation(); window.toastManager.hideCurrentToast()" style="
          background: none;
          border: none;
          color: white;
          cursor: pointer;
          margin-left: 8px;
          font-size: 16px;
          opacity: 0.7;
          float: right;
        ">×</button>
      </div>
    `;
    
    return toast;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  hideCurrentToast() {
    // Limpiar timer primero
    if (this.currentTimer) {
      clearTimeout(this.currentTimer);
      this.currentTimer = null;
    }
    
    if (this.currentToast) {
      // Animar salida
      this.currentToast.classList.remove('show');
      
      // Remover después de la animación
      setTimeout(() => {
        if (this.currentToast && this.currentToast.parentNode) {
          this.currentToast.parentNode.removeChild(this.currentToast);
        }
        this.currentToast = null;
      }, 300);
    }
  }

  clearCurrentToast() {
    // Limpiar toast actual
    this.hideCurrentToast();
    
    // Limpiar TODOS los toasts existentes en el DOM (por si hay toasts huérfanos)
    const existingToasts = document.querySelectorAll('.toast');
    existingToasts.forEach(toast => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    });
  }

  // Métodos de conveniencia para tipos específicos
  showSuccess(message, duration = 3000) {
    this.showToast(message, 'success', duration);
  }

  showError(message, duration = 0) {
    // Los errores no se auto-ocultan, solo al hacer clic
    this.showToast(message, 'error', duration);
  }

  showWarning(message, duration = 4000) {
    this.showToast(message, 'warning', duration);
  }

  showInfo(message, duration = 3000) {
    this.showToast(message, 'info', duration);
  }

  // Método para limpiar todos los toasts de manera agresiva
  clearAllToasts() {
    // Limpiar timer actual
    if (this.currentTimer) {
      clearTimeout(this.currentTimer);
      this.currentTimer = null;
    }
    
    // Limpiar referencia actual
    this.currentToast = null;
    
    // Remover TODOS los toasts del DOM inmediatamente
    const allToasts = document.querySelectorAll('.toast');
    allToasts.forEach(toast => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    });
    
    logger.debug('All toasts cleared', null, 'ToastManager');
  }

  // Método de prueba para verificar que el sistema funciona
  testToast() {
    console.log('Testing toast system...');
    this.showSuccess('Test success toast!');
    setTimeout(() => this.showError('Test error toast!'), 2000);
    setTimeout(() => this.showWarning('Test warning toast!'), 4000);
    setTimeout(() => this.showInfo('Test info toast!'), 6000);
  }
}

// Crear instancia global
const toastManager = new ToastManager();

// Exponer globalmente para acceso desde otros scripts
window.toastManager = toastManager;

export { toastManager };
