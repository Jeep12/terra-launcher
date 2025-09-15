const { contextBridge, ipcRenderer } = require('electron');

if (process.env.NODE_ENV !== 'production') {
  console.log('🔧 [PRELOAD] Preload script cargado');
}

// Exponer funciones específicas al renderer
contextBridge.exposeInMainWorld('electron', {
  openFolderDialog: () => ipcRenderer.send('open-folder-dialog'),  // Solicitar la apertura del diálogo de selección de carpeta
  onFolderSelected: (callback) => ipcRenderer.on('selected-folder', (_, folderPath) => callback(folderPath)),
  launchGame: (folderPath) => ipcRenderer.send('launch-game', folderPath),
  downloadFile: (url, destFolder, fileName) => ipcRenderer.send('download-file', { url, destFolder, fileName }),
  onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (_, progress) => callback(progress)),
  onDownloadError: (callback) => ipcRenderer.on('download-error', (_, error) => callback(error)),
  onDownloadDone: (callback) => ipcRenderer.on('download-done', (_, info) => callback(info)),
  // APIs para progreso de extracción
  onExtractionProgress: (callback) => ipcRenderer.on('extraction-progress', (_, progress) => callback(progress)),
  onExtractionError: (callback) => ipcRenderer.on('extraction-error', (_, error) => callback(error)),
  onExtractionDone: (callback) => ipcRenderer.on('extraction-done', (_, info) => callback(info)),
  getCurrentDirectory: () => ipcRenderer.invoke('get-current-directory'),
  getCurrentDirectoryAsync: () => ipcRenderer.invoke('get-current-directory'),
  getLocalFiles: (folderPath) => ipcRenderer.invoke('get-local-files', folderPath),
  // Funciones para la barra de título personalizada
  minimizeWindow: () => ipcRenderer.send('minimize-window'),

  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  // Función para abrir game panel
  openGamePanel: () => ipcRenderer.send('open-game-panel'),
  // Función para logout
  logout: () => ipcRenderer.send('logout'),
  // Función para logout (cerrar aplicación)
  logoutFromGame: () => ipcRenderer.send('logout-from-game'),
  toggleDevTools: () => ipcRenderer.send('toggle-dev-tools'),
  // Funciones para el instalador
  extractZipFile: (zipPath, destFolder) => ipcRenderer.invoke('extract-zip-file', zipPath, destFolder),
  getDirectoryFiles: (folderPath) => ipcRenderer.invoke('get-directory-files', folderPath),
  getDirectoryFilesRecursive: (folderPath) => ipcRenderer.invoke('get-directory-files-recursive', folderPath),
                moveFile: (sourcePath, targetPath) => ipcRenderer.invoke('move-file', sourcePath, targetPath),
              copyFile: (sourcePath, targetPath) => ipcRenderer.invoke('copy-file', sourcePath, targetPath),
              readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
              writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
  cleanupZipFiles: (folderPath) => ipcRenderer.invoke('cleanup-zip-files', folderPath),
  removeDirectory: (dirPath) => ipcRenderer.invoke('remove-directory', dirPath),
  // Nuevas funciones para el PatchDownloader mejorado
  createDirectory: (dirPath) => ipcRenderer.invoke('create-directory', dirPath),
  // Funciones de path simplificadas
  path: {
    join: (...args) => args.join('/'),
    resolve: (...args) => args.join('/'),
    dirname: (path) => path.split('/').slice(0, -1).join('/'),
    basename: (path) => path.split('/').pop()
  },
  // Función para abrir enlaces externos
                openExternalLink: (url) => ipcRenderer.invoke('open-external-link', url),
              getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
  
  // Funciones de system tray
  onWindowClose: (callback) => ipcRenderer.on('window-close-request', callback),
  minimizeToTray: () => ipcRenderer.send('minimize-to-tray'),
  restoreFromTray: () => ipcRenderer.send('restore-from-tray'),
  showTrayNotification: (title, message, type) => ipcRenderer.send('show-tray-notification', { title, message, type }),
  closeApp: () => ipcRenderer.send('close-app'),
  
  // Funciones de limpieza y validación
  cleanupIncompleteFiles: (folderPath, patterns) => ipcRenderer.invoke('cleanup-incomplete-files', folderPath, patterns),
  validateFileIntegrity: (folderPath) => ipcRenderer.invoke('validate-file-integrity', folderPath),
  
  // Funciones para validación de cliente L2
  pathExists: (path) => ipcRenderer.invoke('path-exists', path),
  readDirectory: (folderPath) => ipcRenderer.invoke('read-directory', folderPath),
  isValidL2Folder: (folderPath) => ipcRenderer.invoke('is-valid-l2-folder', folderPath)
});

