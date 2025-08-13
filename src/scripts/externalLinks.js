// Función para abrir enlaces externos
function openExternalLink(url) {
  if (window.electron && window.electron.openExternalLink) {
    window.electron.openExternalLink(url).then(result => {
      if (!result.success) {
        console.error('Error abriendo enlace:', result.error);
        // Fallback al navegador por defecto
        window.open(url, '_blank');
      }
    }).catch(error => {
      console.error('Error en Electron API:', error);
      // Fallback al navegador por defecto
      window.open(url, '_blank');
    });
  } else {
    // Fallback si electron no está disponible
    window.open(url, '_blank');
  }
}

// Event listeners para los enlaces (opcional, ya que se configura desde index.html)
document.addEventListener('DOMContentLoaded', function() {
  // Encontrar todos los enlaces con data-url
  const externalLinks = document.querySelectorAll('.nav-link[data-url]');
  
  externalLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      const url = this.getAttribute('data-url');
      openExternalLink(url);
    });
  });
});

// Exportar la función para uso global
window.openExternalLink = openExternalLink; 