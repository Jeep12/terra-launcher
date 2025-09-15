const { app, BrowserWindow, ipcMain, dialog, Menu, Tray } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');
const https = require('https');
const http = require('http');

// Función para calcular el tamaño de un directorio
function getDirectorySize(dirPath) {
  let totalSize = 0;
  
  function calculateSize(currentPath) {
    const items = fs.readdirSync(currentPath);
    
    for (const item of items) {
      const itemPath = path.join(currentPath, item);
      const stats = fs.statSync(itemPath);
      
      if (stats.isDirectory()) {
        calculateSize(itemPath);
      } else {
        totalSize += stats.size;
      }
    }
  }
  
  calculateSize(dirPath);
  return totalSize;
}

// 🧠 Hot reload para desarrollo
if (process.env.NODE_ENV !== 'production') {
  try {
    require('electron-reloader')(module);
  } catch (_) {}
}

let mainWindow;
let splash;
let tray = null;
let isMinimizedToTray = false;

const isDev = !app.isPackaged;
function resolveAssetPath(...segments) {
  // En desarrollo y producción, los archivos están en la misma carpeta que main.js
  return path.join(__dirname, ...segments);
}

// 🧱 Ventana de error personalizada
let errorWindow = null; // Variable global para la ventana de error

function showErrorWindow(msg = 'Ocurrió un error.') {
  // Verificar si ya existe una ventana de error
  if (errorWindow && !errorWindow.isDestroyed()) {
    console.log('[MAIN] Error window already exists, focusing it');
    errorWindow.show();
    errorWindow.focus();
    return;
  }

  errorWindow = new BrowserWindow({
    width: 500,
    height: 250,
    resizable: false,
    modal: true,
    parent: mainWindow,
    frame: false, 
    backgroundColor: '#252525',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  errorWindow.setMenu(null);

  errorWindow.loadFile(resolveAssetPath('views', 'error.html'));

  errorWindow.webContents.once('did-finish-load', () => {
    errorWindow.webContents.executeJavaScript(`
      document.getElementById('error-msg').innerText = \`${msg}\`;
    `);
  });

  // Limpiar referencia cuando se cierre la ventana
  errorWindow.on('closed', () => {
    errorWindow = null;
  });
}

function createWindow() {
  splash = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    backgroundColor: '#212121',
    icon: resolveAssetPath('assets', 'images', 'icons', 'terra_icon.ico'),
    skipTaskbar: true,
  });

  splash.loadFile(resolveAssetPath('splash.html'));

  // Obtener dimensiones de la pantalla
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  
  // Calcular tamaño adaptativo según la resolución
  const baseWidth = 1100;
  const baseHeight = 850;
  
  // Ajustar tamaño según la pantalla disponible
  const windowWidth = Math.min(baseWidth, screenWidth * 0.9);
  const windowHeight = Math.min(baseHeight, screenHeight * 0.9);
  
  // Para pantallas muy pequeñas, usar porcentajes más conservadores
  const minWidth = Math.max(800, screenWidth * 0.7);
  const minHeight = Math.max(600, screenHeight * 0.7);
  
  // Calcular posición centrada
  const x = Math.round((screenWidth - windowWidth) / 2);
  const y = Math.round((screenHeight - windowHeight) / 2);

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: x,
    y: y,
    frame: false,
    resizable: true, // Permitir redimensionar
    show: false,
    backgroundColor: '#212121',
    fullscreenable: false,
    maximizable: true, // Permitir maximizar
    icon: resolveAssetPath('assets', 'images', 'icons', 'terra_icon.ico'),
    title: 'Launcher Terra',
    skipTaskbar: false,
    showInTaskbar: true,
    minWidth: minWidth, // Ancho mínimo adaptativo
    minHeight: minHeight, // Alto mínimo adaptativo
    webPreferences: {
      preload: resolveAssetPath('preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

      mainWindow.loadFile(resolveAssetPath('game-panel.html'));

  mainWindow.once('ready-to-show', () => {
    setTimeout(() => {
      splash.destroy();
      mainWindow.show();
      // Asegurar que el ícono se muestre en la barra de tareas
      mainWindow.setIcon(resolveAssetPath('assets', 'images', 'icons', 'terra_icon.ico'));
    }, 2000);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Manejar cierre de ventana (cuando el usuario hace clic en X)
  mainWindow.on('close', (event) => {
    // Enviar evento al renderer para verificar si hay operaciones activas
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window-close-request');
    }
    
    // Prevenir cierre inmediato - el renderer decidirá si cerrar o minimizar
    event.preventDefault();
  });

  // Prevenir pantalla completa pero permitir maximizar
  mainWindow.on('enter-full-screen', () => {
    mainWindow.setFullScreen(false);
  });

  mainWindow.on('leave-full-screen', () => {
    mainWindow.setFullScreen(false);
  });

  // Permitir maximizar pero con límites
  mainWindow.on('maximize', () => {
    // No hacer nada, permitir maximizar
  });

  // Evento cuando se redimensiona la ventana
  mainWindow.on('resize', () => {
    const [width, height] = mainWindow.getSize();
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[MAIN] Window resized to: ${width}x${height}`);
    }
  });

  // Evento cuando se mueve la ventana
  mainWindow.on('move', () => {
    const [x, y] = mainWindow.getPosition();
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[MAIN] Window moved to: ${x}, ${y}`);
    }
  });

  // Manejador para abrir enlaces externos - REMOVIDO para evitar doble apertura
  // Los enlaces externos se manejan ahora solo a través del IPC handler

  // Manejador IPC para abrir enlaces externos
  ipcMain.handle('open-external-link', async (event, url) => {
    console.log('[MAIN] IPC open-external-link llamado con URL:', url);
    try {
      await require('electron').shell.openExternal(url);
      console.log('[MAIN] Enlace abierto exitosamente');
      return { success: true };
    } catch (error) {
      console.error('[MAIN] Error abriendo enlace externo:', error);
      return { success: false, error: error.message };
    }
  });

  // Manejador para interceptar window.open() y redirigir al navegador del sistema
  // Solo como fallback para casos no manejados por externalLinks.js
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log('[MAIN] window.open() interceptado como fallback con URL:', url);
    require('electron').shell.openExternal(url);
    return { action: 'deny' }; // Denegar la creación de nueva ventana de Electron
  });

  // Manejadores para la barra de título personalizada
  ipcMain.on('minimize-window', () => {
    mainWindow.minimize();
  });



  ipcMain.on('maximize-window', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.on('close-window', () => {
    // Cerrar la aplicación
    app.quit();
  });

  // Manejadores del system tray
  ipcMain.on('minimize-to-tray', () => {
    console.log('[MAIN] Minimizing to system tray');
    minimizeToTray();
  });

  ipcMain.on('restore-from-tray', () => {
    console.log('[MAIN] Restoring from system tray');
    restoreFromTray();
  });

  ipcMain.on('show-tray-notification', (event, { title, message, type }) => {
    console.log('[MAIN] Showing tray notification:', { title, message, type });
    showTrayNotification(title, message, type);
  });

  ipcMain.on('close-app', () => {
    console.log('[MAIN] Closing app from renderer');
    app.quit();
  });

  // Manejadores para limpieza y validación
  ipcMain.handle('cleanup-incomplete-files', async (event, folderPath, patterns) => {
    try {
      console.log('[MAIN] Cleaning up incomplete files in:', folderPath);
      
      let deletedCount = 0;
      
      // Función recursiva para buscar archivos
      function findAndDeleteFiles(dir) {
        try {
          const items = fs.readdirSync(dir);
          
          for (const item of items) {
            const itemPath = path.join(dir, item);
            const stats = fs.statSync(itemPath);
            
            if (stats.isDirectory()) {
              // Buscar en subdirectorios
              findAndDeleteFiles(itemPath);
            } else {
              // Verificar si el archivo coincide con algún patrón
              for (const pattern of patterns) {
                if (pattern.includes('*')) {
                  // Patrón simple con wildcard
                  const regex = new RegExp(pattern.replace('*', '.*'));
                  if (regex.test(item)) {
                    try {
                      fs.unlinkSync(itemPath);
                      console.log('[MAIN] Deleted incomplete file:', itemPath);
                      deletedCount++;
                    } catch (error) {
                      console.warn('[MAIN] Could not delete file:', itemPath, error.message);
                    }
                    break;
                  }
                } else if (item.includes(pattern)) {
                  // Patrón exacto
                  try {
                    fs.unlinkSync(itemPath);
                    console.log('[MAIN] Deleted incomplete file:', itemPath);
                    deletedCount++;
                  } catch (error) {
                    console.warn('[MAIN] Could not delete file:', itemPath, error.message);
                  }
                  break;
                }
              }
            }
          }
        } catch (error) {
          console.warn('[MAIN] Error reading directory:', dir, error.message);
        }
      }
      
      findAndDeleteFiles(folderPath);
      
      return { success: true, deletedCount };
    } catch (error) {
      console.error('[MAIN] Error cleaning up incomplete files:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('validate-file-integrity', async (event, folderPath) => {
    try {
      console.log('[MAIN] Validating file integrity in:', folderPath);
      
      // Verificación básica de archivos
      const files = fs.readdirSync(folderPath);
      const validFiles = [];
      const invalidFiles = [];
      
      for (const file of files) {
        const filePath = path.join(folderPath, file);
        const stats = fs.statSync(filePath);
        
        // Verificar que el archivo no esté corrupto (tamaño > 0)
        if (stats.size > 0) {
          validFiles.push(file);
        } else {
          invalidFiles.push(file);
        }
      }
      
      return {
        valid: invalidFiles.length === 0,
        validFiles,
        invalidFiles,
        reason: invalidFiles.length > 0 ? `Found ${invalidFiles.length} invalid files` : 'All files valid'
      };
    } catch (error) {
      console.error('[MAIN] Error validating file integrity:', error);
      return { valid: false, reason: error.message };
    }
  });

      // Manejador para logout (cerrar aplicación)
      ipcMain.on('logout-from-game', () => {
      console.log('[MAIN] Logout from game requested');
      
      try {
        // Recargar game-panel.html para asegurar estado limpio
        if (mainWindow) {
          console.log('[MAIN] Reloading main window');
          mainWindow.loadFile(resolveAssetPath('game-panel.html'));
        }
        
        console.log('[MAIN] Logout completed successfully');
      } catch (error) {
        console.error('[MAIN] Error during logout:', error);
      }
    });

    // Manejador para logout general
    ipcMain.on('logout', () => {
      console.log('[MAIN] Logout requested');
      
      try {
        // Recargar game-panel.html para asegurar estado limpio
        if (mainWindow) {
          console.log('[MAIN] Reloading main window');
          mainWindow.loadFile(resolveAssetPath('game-panel.html'));
        }
        
        console.log('[MAIN] Logout completed successfully');
      } catch (error) {
        console.error('[MAIN] Error during logout:', error);
      }
    });

  // Manejador IPC para toggle dev tools
  ipcMain.on('toggle-dev-tools', () => {
    console.log('[MAIN] Toggle DevTools solicitado');
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      console.log('[MAIN] Abriendo/cerrando DevTools en mainWindow');
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools();
      }
    } else {
      console.log('[MAIN] No hay ventanas disponibles para DevTools');
    }
  });



  // Manejador para extraer archivos ZIP
  ipcMain.handle('extract-zip-file', async (event, zipPath, destFolder) => {
    try {
      console.log(`[MAIN] Extracción solicitada:`);
      console.log(`[MAIN] ZIP original: ${zipPath} (tipo: ${typeof zipPath}, es array: ${Array.isArray(zipPath)})`);
      console.log(`[MAIN] Destino original: ${destFolder} (tipo: ${typeof destFolder}, es array: ${Array.isArray(destFolder)})`);
      
      // Normalizar rutas para evitar problemas con caracteres especiales y duplicaciones
      let normalizedZipPath, normalizedDestFolder;
      
      if (Array.isArray(zipPath)) {
        // Si es un array, tomar solo el último elemento para evitar duplicaciones
        const zipPathStr = zipPath[zipPath.length - 1];
        normalizedZipPath = path.resolve(zipPathStr);
        console.log(`[MAIN] ZIP normalizado (array): ${normalizedZipPath}`);
      } else {
        normalizedZipPath = path.resolve(zipPath);
      }
      
      if (Array.isArray(destFolder)) {
        // Si es un array, tomar solo el último elemento para evitar duplicaciones
        const destFolderStr = destFolder[destFolder.length - 1];
        normalizedDestFolder = path.resolve(destFolderStr);
        console.log(`[MAIN] Destino normalizado (array): ${normalizedDestFolder}`);
      } else {
        normalizedDestFolder = path.resolve(destFolder);
      }
      
      console.log('[MAIN] Extrayendo archivo:', normalizedZipPath, 'a:', normalizedDestFolder);
      
      // Verificar que el archivo ZIP existe
      if (!fs.existsSync(normalizedZipPath)) {
        console.error(`[MAIN] Archivo ZIP no existe: ${normalizedZipPath}`);
        console.error(`[MAIN] Verificando si existe en diferentes ubicaciones...`);
        
        // Intentar buscar el archivo en ubicaciones alternativas
        const fileName = path.basename(normalizedZipPath);
        const possiblePaths = [
          path.join(path.dirname(normalizedZipPath), fileName),
          path.join(path.dirname(path.dirname(normalizedZipPath)), fileName),
          path.join(process.cwd(), fileName)
        ];
        
        for (const possiblePath of possiblePaths) {
          console.log(`[MAIN] Verificando: ${possiblePath}`);
          if (fs.existsSync(possiblePath)) {
            console.log(`[MAIN] Archivo encontrado en ubicación alternativa: ${possiblePath}`);
            normalizedZipPath = possiblePath;
            break;
          }
        }
        
        if (!fs.existsSync(normalizedZipPath)) {
          throw new Error(`Archivo ZIP no existe: ${normalizedZipPath}`);
        }
      }
      
      console.log(`[MAIN] Archivo ZIP existe: ${normalizedZipPath}`);
      
      // Crear directorio de destino si no existe
      if (!fs.existsSync(normalizedDestFolder)) {
        console.log(`[MAIN] Creando directorio de destino: ${normalizedDestFolder}`);
        fs.mkdirSync(normalizedDestFolder, { recursive: true });
      }
      
      // Función para enviar progreso de extracción
      const sendExtractionProgress = (progress) => {
        console.log('[MAIN] Progreso extracción:', progress);
               // Enviar a la ventana principal
       if (mainWindow && !mainWindow.isDestroyed()) {
         mainWindow.webContents.send('extraction-progress', progress);
       }
      };
      
             const sendExtractionError = (error) => {
         console.error('[MAIN] Error extracción:', error);
         // Enviar a la ventana principal
         if (mainWindow && !mainWindow.isDestroyed()) {
           mainWindow.webContents.send('extraction-error', error);
         }
       };
      
             const sendExtractionDone = (info) => {
         console.log('[MAIN] Extracción completada:', info);
         // Enviar a la ventana principal
         if (mainWindow && !mainWindow.isDestroyed()) {
           mainWindow.webContents.send('extraction-done', info);
         }
       };
      
      // Intentar usar 7-Zip primero
      const sevenZipPath = 'C:\\Program Files\\7-Zip\\7z.exe';
      
      console.log('[MAIN] Verificando 7-Zip en:', sevenZipPath);
      console.log('[MAIN] 7-Zip existe:', fs.existsSync(sevenZipPath));
      
      if (fs.existsSync(sevenZipPath)) {
        // Usar 7-Zip
        console.log('[MAIN] Usando 7-Zip para extracción');
        return new Promise((resolve, reject) => {
          const process = spawn(sevenZipPath, ['x', normalizedZipPath, `-o${normalizedDestFolder}`, '-y'], {
            stdio: 'pipe'
          });

          let stdout = '';
          let stderr = '';
          let progress = 0;

          console.log('[MAIN] Proceso 7-Zip iniciado');

          process.stdout.on('data', (data) => {
            stdout += data.toString();
            // Simular progreso basado en la salida
            progress += 10;
            if (progress <= 100) {
              console.log('[MAIN] Progreso 7-Zip:', progress);
              sendExtractionProgress(progress);
            }
          });

          process.stderr.on('data', (data) => {
            stderr += data.toString();
            console.log('[MAIN] 7-Zip stderr:', data.toString());
          });

          process.on('close', (code) => {
            console.log('[MAIN] 7-Zip proceso cerrado con código:', code);
            if (code === 0) {
              console.log('[MAIN] Extracción con 7-Zip completada exitosamente');
              sendExtractionProgress(100);
              sendExtractionDone({ destFolder: normalizedDestFolder });
              resolve();
            } else {
              console.error('[MAIN] Error en extracción con 7-Zip. Código:', code, 'Stderr:', stderr);
              sendExtractionError(`Error extrayendo archivo: ${stderr}`);
              reject(new Error(`Error extrayendo archivo: ${stderr}`));
            }
          });

          process.on('error', (error) => {
            console.error('[MAIN] Error ejecutando 7-Zip:', error);
            sendExtractionError(error.message);
            reject(error);
          });
        });
      } else {
        // Fallback: usar PowerShell
        console.log('[MAIN] 7-Zip no encontrado, usando PowerShell');
        return new Promise((resolve, reject) => {
          const process = spawn('powershell', [
            '-Command', 
            `Expand-Archive -Path "${normalizedZipPath}" -DestinationPath "${normalizedDestFolder}" -Force`
          ], {
            stdio: 'pipe'
          });

          let stdout = '';
          let stderr = '';
          let progress = 0;

          console.log('[MAIN] Proceso PowerShell iniciado');

          process.stdout.on('data', (data) => {
            stdout += data.toString();
            // Simular progreso basado en la salida
            progress += 10;
            if (progress <= 100) {
              console.log('[MAIN] Progreso PowerShell:', progress);
              sendExtractionProgress(progress);
            }
          });

          process.stderr.on('data', (data) => {
            stderr += data.toString();
            console.log('[MAIN] PowerShell stderr:', data.toString());
          });

          process.on('close', (code) => {
            console.log('[MAIN] PowerShell proceso cerrado con código:', code);
            if (code === 0) {
              console.log('[MAIN] Extracción con PowerShell completada exitosamente');
              sendExtractionProgress(100);
              sendExtractionDone({ destFolder: normalizedDestFolder });
              resolve();
            } else {
              console.error('[MAIN] Error en extracción con PowerShell. Código:', code, 'Stderr:', stderr);
              sendExtractionError(`Error extrayendo archivo: ${stderr}`);
              reject(new Error(`Error extrayendo archivo: ${stderr}`));
            }
          });

          process.on('error', (error) => {
            console.error('[MAIN] Error ejecutando PowerShell:', error);
            sendExtractionError(error.message);
            reject(error);
          });
        });
      }
    } catch (error) {
      console.error('[MAIN] Error en extracción:', error);
      throw error;
    }
  });

  // Manejador para obtener archivos de un directorio
  ipcMain.handle('get-directory-files', async (event, folderPath) => {
    try {
      console.log(`[MAIN] Obteniendo archivos del directorio: ${folderPath}`);
      const normalizedPath = path.resolve(folderPath);
      console.log(`[MAIN] Ruta normalizada: ${normalizedPath}`);
      
      // Verificar si el directorio existe
      if (!fs.existsSync(normalizedPath)) {
        console.error(`[MAIN] El directorio no existe: ${normalizedPath}`);
        return [];
      }
      
      const files = fs.readdirSync(normalizedPath);
      console.log(`[MAIN] Archivos encontrados:`, files);
      
      const fullPaths = files.map(file => path.join(normalizedPath, file));
      console.log(`[MAIN] Rutas completas:`, fullPaths);
      
      return fullPaths;
    } catch (error) {
      console.error('[MAIN] Error obteniendo archivos del directorio:', error);
      return [];
    }
  });

  // Manejador para obtener archivos recursivamente
  ipcMain.handle('get-directory-files-recursive', async (event, folderPath) => {
    try {
      const normalizedPath = path.resolve(folderPath);
      const files = [];
      
      const scanDirectory = (dir) => {
        const items = fs.readdirSync(dir);
        
        for (const item of items) {
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);
          
          if (stat.isDirectory()) {
            scanDirectory(fullPath);
          } else if (stat.isFile()) {
            files.push(fullPath);
          }
        }
      };
      
      scanDirectory(normalizedPath);
      return files;
    } catch (error) {
      console.error('[MAIN] Error obteniendo archivos recursivamente:', error);
      return [];
    }
  });

  // Manejador para mover archivos
  ipcMain.handle('move-file', async (event, sourcePath, targetPath) => {
    try {
      // Normalizar rutas para evitar problemas con caracteres especiales
      const normalizedSourcePath = path.resolve(sourcePath);
      const normalizedTargetPath = path.resolve(targetPath);
      
      // Verificar que el archivo fuente existe
      if (!fs.existsSync(normalizedSourcePath)) {
        console.error(`[MAIN] Archivo fuente no existe: ${normalizedSourcePath}`);
        throw new Error(`Archivo fuente no existe: ${path.basename(normalizedSourcePath)}`);
      }
      
      // Si el archivo ya existe, hacer backup
      if (fs.existsSync(normalizedTargetPath)) {
        const backupPath = normalizedTargetPath + '.backup';
        fs.renameSync(normalizedTargetPath, backupPath);
      }
      
      // Crear directorio de destino si no existe
      const targetDir = path.dirname(normalizedTargetPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      
      // Verificar si el archivo fuente y destino son el mismo
      if (normalizedSourcePath === normalizedTargetPath) {
        console.log(`[MAIN] Archivo ya está en la ubicación correcta: ${path.basename(normalizedSourcePath)}`);
        return;
      }
      
      // Mover archivo a ubicación final
      fs.renameSync(normalizedSourcePath, normalizedTargetPath);
      
      console.log(`[MAIN] Archivo movido: ${path.basename(normalizedSourcePath)} -> ${path.basename(normalizedTargetPath)}`);
    } catch (error) {
      console.error('[MAIN] Error moviendo archivo:', error);
      throw error;
    }
  });

  // Manejador para copiar archivos
  ipcMain.handle('copy-file', async (event, sourcePath, targetPath) => {
    try {
      // Normalizar rutas para evitar problemas con caracteres especiales
      const normalizedSourcePath = path.resolve(sourcePath);
      const normalizedTargetPath = path.resolve(targetPath);
      
      // Verificar que el archivo fuente existe
      if (!fs.existsSync(normalizedSourcePath)) {
        console.error(`[MAIN] Archivo fuente no existe: ${normalizedSourcePath}`);
        throw new Error(`Archivo fuente no existe: ${path.basename(normalizedSourcePath)}`);
      }
      
      // Si el archivo ya existe, hacer backup
      if (fs.existsSync(normalizedTargetPath)) {
        const backupPath = normalizedTargetPath + '.backup';
        fs.renameSync(normalizedTargetPath, backupPath);
      }
      
      // Crear directorio de destino si no existe
      const targetDir = path.dirname(normalizedTargetPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      
      // Verificar si el archivo fuente y destino son el mismo
      if (normalizedSourcePath === normalizedTargetPath) {
        console.log(`[MAIN] Archivo ya está en la ubicación correcta: ${path.basename(normalizedSourcePath)}`);
        return;
      }
      
      // Copiar archivo a ubicación final
      fs.copyFileSync(normalizedSourcePath, normalizedTargetPath);
      
      console.log(`[MAIN] Archivo copiado: ${path.basename(normalizedSourcePath)} -> ${path.basename(normalizedTargetPath)}`);
    } catch (error) {
      console.error('[MAIN] Error copiando archivo:', error);
      throw error;
    }
  });

  // Manejador para leer archivos
  ipcMain.handle('read-file', async (event, filePath) => {
    try {
      const normalizedPath = path.resolve(filePath);
      
      if (!fs.existsSync(normalizedPath)) {
        console.log(`[MAIN] File does not exist: ${normalizedPath}`);
        return null;
      }
      
      const content = fs.readFileSync(normalizedPath, 'utf8');
      console.log(`[MAIN] File read successfully: ${path.basename(normalizedPath)}`);
      return content;
    } catch (error) {
      console.error('[MAIN] Error reading file:', error);
      return null;
    }
  });

  // Manejador para escribir archivos
  ipcMain.handle('write-file', async (event, filePath, content) => {
    try {
      const normalizedPath = path.resolve(filePath);
      
      // Crear directorio si no existe
      const dir = path.dirname(normalizedPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(normalizedPath, content, 'utf8');
      console.log(`[MAIN] File written successfully: ${path.basename(normalizedPath)}`);
      return true;
    } catch (error) {
      console.error('[MAIN] Error writing file:', error);
      throw error;
    }
  });

  // Manejador para obtener ruta de userData
  ipcMain.handle('get-user-data-path', async (event) => {
    try {
      const userDataPath = app.getPath('userData');
      console.log(`[MAIN] UserData path: ${userDataPath}`);
      return userDataPath;
    } catch (error) {
      console.error('[MAIN] Error getting userData path:', error);
      throw error;
    }
  });

  // Manejador para crear directorio
  ipcMain.handle('create-directory', async (event, dirPath) => {
    try {
      const normalizedPath = path.resolve(dirPath);
      
      if (!fs.existsSync(normalizedPath)) {
        fs.mkdirSync(normalizedPath, { recursive: true });
        console.log(`[MAIN] Directorio creado: ${normalizedPath}`);
      } else {
        console.log(`[MAIN] Directorio ya existe: ${normalizedPath}`);
      }
      
      return normalizedPath;
    } catch (error) {
      console.error('[MAIN] Error creando directorio:', error);
      throw error;
    }
  });

  // Manejador para eliminar directorio completo
  ipcMain.handle('remove-directory', async (event, dirPath) => {
    try {
      const normalizedPath = path.resolve(dirPath);
      
      // Función recursiva para eliminar directorio y contenido
      const removeDirectoryRecursive = (dir) => {
        if (fs.existsSync(dir)) {
          const items = fs.readdirSync(dir);
          
          for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
              removeDirectoryRecursive(fullPath);
            } else {
              fs.unlinkSync(fullPath);
            }
          }
          
          fs.rmdirSync(dir);
          console.log(`[MAIN] Eliminado directorio: ${dir}`);
        }
      };
      
      removeDirectoryRecursive(normalizedPath);
      
    } catch (error) {
      console.error('[MAIN] Error eliminando directorio:', error);
      throw error;
    }
  });

  // Manejador para limpiar archivos ZIP
  ipcMain.handle('cleanup-zip-files', async (event, folderPath) => {
    try {
      const files = fs.readdirSync(folderPath);
      const zipFiles = files.filter(file => file.endsWith('.zip'));
      
      console.log(`[MAIN] Eliminando ${zipFiles.length} archivos ZIP temporales`);

      for (const zipFile of zipFiles) {
        const zipPath = path.join(folderPath, zipFile);
        
        try {
          fs.unlinkSync(zipPath);
          console.log(`[MAIN] Eliminado: ${zipFile}`);
        } catch (error) {
          console.error(`[MAIN] Error eliminando ${zipFile}:`, error);
        }
      }

      // Limpiar directorios vacíos
      const cleanupEmptyDirectories = (dir) => {
        try {
          const items = fs.readdirSync(dir);
          
          for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
              cleanupEmptyDirectories(fullPath);
              
              // Verificar si el directorio está vacío después de limpiar
              const remainingItems = fs.readdirSync(fullPath);
              if (remainingItems.length === 0) {
                fs.rmdirSync(fullPath);
                console.log(`[MAIN] Eliminado directorio vacío: ${item}`);
              }
            }
          }
        } catch (error) {
          console.error('[MAIN] Error limpiando directorios:', error);
        }
      };

      cleanupEmptyDirectories(folderPath);
      
    } catch (error) {
      console.error('[MAIN] Error en limpieza:', error);
      throw error;
    }
  });

  ipcMain.on('open-folder-dialog', async (event) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    });

    event.reply('selected-folder', result.canceled ? null : result.filePaths[0]);
  });

  ipcMain.on('launch-game', (event, folderPath) => {
    const exePath = path.join(folderPath, 'system', 'L2.exe');
    console.log('Intentando ejecutar:', exePath);

    if (!fs.existsSync(exePath)) {
      // Usamos nuestra ventana personalizada
      showErrorWindow('No se encontró L2.exe en la carpeta seleccionada. Seleccione la carpeta raíz del cliente.');
      return;
    }

    const gameProcess = spawn(`"${exePath}"`, {
      shell: true,
      detached: true,
      stdio: 'ignore',
    });

    gameProcess.unref();
    console.log(`L2.exe lanzado con PID (no trackeado): ${gameProcess.pid}`);
  });

  ipcMain.handle('get-current-directory', () => {
    return process.cwd();
  });

  // Nuevo handler para verificar si una carpeta es válida para L2 (solo para el botón Play)
  ipcMain.handle('is-valid-l2-folder', async (event, folderPath) => {
    try {
      console.log('[MAIN] === Checking if folder is valid L2 ===');
      console.log('[MAIN] Folder path:', folderPath);
      
      // Verificar si la carpeta existe
      if (!fs.existsSync(folderPath)) {
        console.log('[MAIN] Folder does not exist:', folderPath);
        return { isValid: false, reason: 'Folder does not exist' };
      }
      
      // Verificar si es una carpeta válida de L2 (debe tener system/L2.exe)
      const systemPath = path.join(folderPath, 'system');
      const l2ExePath = path.join(systemPath, 'L2.exe');
      const hasValidL2Structure = fs.existsSync(systemPath) && fs.existsSync(l2ExePath);
      
      console.log('[MAIN] Has valid L2 structure:', hasValidL2Structure);
      console.log('[MAIN] System path exists:', fs.existsSync(systemPath));
      console.log('[MAIN] L2.exe exists:', fs.existsSync(l2ExePath));
      
      if (!hasValidL2Structure) {
        console.log('[MAIN] Not a valid L2 folder - no system/L2.exe found');
        return { 
          isValid: false, 
          reason: 'No system/L2.exe found. Please select a valid Lineage 2 client folder.' 
        };
      }
      
      console.log('[MAIN] Valid L2 folder detected');
      return { isValid: true, reason: 'Valid L2 client folder' };
      
    } catch (error) {
      console.error('[MAIN] Error checking L2 folder validity:', error);
      return { isValid: false, reason: 'Error checking folder validity' };
    }
  });

  ipcMain.handle('get-local-files', async (event, folderPath) => {
    try {
      console.log('[MAIN] === Getting local files ===');
      console.log('[MAIN] Folder path:', folderPath);
      
      // Verificar si la carpeta existe
      if (!fs.existsSync(folderPath)) {
        console.log('[MAIN] Folder does not exist:', folderPath);
        return [];
      }
      
      const localFiles = [];
      const files = fs.readdirSync(folderPath);
      console.log('[MAIN] All files in folder:', files);
      
      // Verificar si es una carpeta válida de L2 (debe tener system/L2.exe)
      const systemPath = path.join(folderPath, 'system');
      const l2ExePath = path.join(systemPath, 'L2.exe');
      const hasValidL2Structure = fs.existsSync(systemPath) && fs.existsSync(l2ExePath);
      
      console.log('[MAIN] Has valid L2 structure:', hasValidL2Structure);
      console.log('[MAIN] System path exists:', fs.existsSync(systemPath));
      console.log('[MAIN] L2.exe exists:', fs.existsSync(l2ExePath));
      
      // IMPORTANTE: No retornar array vacío si no es L2 válido
      // El sistema de actualizaciones debe funcionar siempre
      if (!hasValidL2Structure) {
        console.log('[MAIN] Not a valid L2 folder - but continuing with file detection for updates');
      }
      
      for (const file of files) {
        console.log('[MAIN] Checking file:', file);
        
        // Buscar archivos ZIP, archivos extraídos y archivos del servidor
        if (file.endsWith('.zip') || 
            file === 'system' || 
            file === 'bgc1' || 
            file === 'documentosintitulo' ||
            // Archivos extraídos del servidor
            file === 'ActualizacionEjemplo' ||
            file === 'fluid.html' ||
            file === 'fluid.jpg' ||
            file === 'fluid_preview.gif' ||
            file === 'iconfont.ttf' ||
            file === 'javaicon.png' ||
            file === 'js' ||
            file === 'wallpapers' ||
            file.startsWith('Poliza_') ||
            file.endsWith('.PDF') ||
            file.endsWith('.png') ||
            file.endsWith('.html') ||
            file.endsWith('.gif') ||
            file.endsWith('.ttf')) {
          
          const filePath = path.join(folderPath, file);
          const stats = fs.statSync(filePath);
          
          // Si es un directorio (archivo extraído), obtener el tamaño total
          let size = stats.size;
          if (stats.isDirectory()) {
            try {
              const dirSize = getDirectorySize(filePath);
              size = dirSize;
            } catch (error) {
              console.log('[MAIN] Error calculating directory size:', error);
              size = 0;
            }
          }
          
          const fileInfo = {
            name: file,
            size: size,
            modified: Math.floor(stats.mtime.getTime() / 1000),
            modified_date: stats.mtime.toISOString(),
            isDirectory: stats.isDirectory()
          };
          
          console.log('[MAIN] File found (ZIP or extracted):', fileInfo);
          localFiles.push(fileInfo);
        }
      }
      
      console.log('[MAIN] Total files found:', localFiles.length);
      console.log('[MAIN] Archivos locales encontrados:', localFiles);
      return localFiles;
    } catch (error) {
      console.error('[MAIN] Error obteniendo archivos locales:', error);
      return [];
    }
  });

  ipcMain.on('download-file', (event, { url, destFolder, fileName }) => {
    console.log('[DOWNLOAD][MAIN] Parámetros recibidos:', { url, destFolder, fileName });
    console.log('[DOWNLOAD][MAIN] Tipo de destFolder:', typeof destFolder, Array.isArray(destFolder));
    console.log('[DOWNLOAD][MAIN] Tipo de fileName:', typeof fileName, Array.isArray(fileName));
    
    // Normalizar rutas para evitar duplicaciones
    let normalizedDestFolder = destFolder;
    let normalizedFileName = fileName;
    
    if (Array.isArray(destFolder)) {
      // Si es un array, tomar solo el último elemento para evitar duplicaciones
      normalizedDestFolder = destFolder[destFolder.length - 1];
      console.log('[DOWNLOAD][MAIN] DestFolder normalizado (array):', normalizedDestFolder);
    }
    
    if (Array.isArray(fileName)) {
      // Si es un array, tomar solo el último elemento
      normalizedFileName = fileName[fileName.length - 1];
      console.log('[DOWNLOAD][MAIN] FileName normalizado (array):', normalizedFileName);
    }
    
    const destPath = path.join(normalizedDestFolder, normalizedFileName);
    console.log('[DOWNLOAD][MAIN] Ruta final normalizada:', destPath);
    console.log('[DOWNLOAD][MAIN] Iniciando descarga:', url, '->', destPath);
    
    let startTime = Date.now();
    let lastUpdateTime = startTime;
    let lastDownloaded = 0;
    
    const sendProgress = (progress) => {
      const currentTime = Date.now();
      const elapsed = currentTime - startTime;
      const timeSinceLastUpdate = currentTime - lastUpdateTime;
      
      // Calcular velocidad (bytes por segundo)
      let speed = 0;
      if (timeSinceLastUpdate > 0) {
        const bytesSinceLastUpdate = progress.downloaded - lastDownloaded;
        speed = (bytesSinceLastUpdate / timeSinceLastUpdate) * 1000; // bytes por segundo
      }
      
      // Calcular tiempo restante
      let remainingTime = 0;
      if (speed > 0 && progress.total > progress.downloaded) {
        const remainingBytes = progress.total - progress.downloaded;
        remainingTime = remainingBytes / speed; // segundos
      }
      
      const progressData = {
        percent: Math.round((progress.downloaded / progress.total) * 100),
        downloaded: progress.downloaded,
        total: progress.total,
        speed: speed,
        elapsed: elapsed,
        remaining: remainingTime,
        filename: fileName
      };
      
      console.log('[DOWNLOAD][MAIN] Progreso:', progressData);
      
             // Enviar a la ventana principal
       if (mainWindow && !mainWindow.isDestroyed()) {
         mainWindow.webContents.send('download-progress', progressData);
       }
      
      // Actualizar para el siguiente cálculo
      lastUpdateTime = currentTime;
      lastDownloaded = progress.downloaded;
    };
    
         const sendError = (err) => {
       console.error('[DOWNLOAD][MAIN] Error:', err);
       // Enviar a la ventana principal
       if (mainWindow && !mainWindow.isDestroyed()) {
         mainWindow.webContents.send('download-error', err);
       }
     };
    
         const sendDone = (info) => {
       console.log('[DOWNLOAD][MAIN] Finalizado:', info);
       // Enviar a la ventana principal
       if (mainWindow && !mainWindow.isDestroyed()) {
         mainWindow.webContents.send('download-done', info);
       }
     };

    try {
      const proto = url.startsWith('https') ? https : http;
      // Usar las rutas normalizadas que ya calculamos arriba
      const file = fs.createWriteStream(destPath);
      
      proto.get(url, (response) => {
        if (response.statusCode !== 200) {
          sendError(`Error HTTP: ${response.statusCode}`);
          file.close();
          fs.unlink(destPath, () => {});
          return;
        }
        
        const total = parseInt(response.headers['content-length'] || '0', 10);
        let downloaded = 0;
        
        response.on('data', (chunk) => {
          file.write(chunk);
          downloaded += chunk.length;
          if (total) {
            sendProgress({ downloaded, total });
          }
        });
        
        response.on('end', () => {
          file.end();
          sendDone({ destPath });
        });
        
        response.on('error', (err) => {
          sendError(err.message);
          file.close();
          fs.unlink(destPath, () => {});
        });
      }).on('error', (err) => {
        sendError(err.message);
        file.close();
        fs.unlink(destPath, () => {});
      });
    } catch (err) {
      sendError(err.message);
    }
  });

   // Abrir DevTools solo en desarrollo
   if (process.env.NODE_ENV !== 'production') {
     mainWindow.webContents.openDevTools();
   }
}

// Funciones del system tray
function createTray() {
  try {
    console.log('[MAIN] Creating system tray...');
    
    // Crear el ícono del tray
    const iconPath = resolveAssetPath('assets', 'images', 'icons', 'terra_icon.ico');
    console.log('[MAIN] Tray icon path:', iconPath);
    
    tray = new Tray(iconPath);
    tray.setToolTip('L2 Terra Launcher');
    console.log('[MAIN] System tray created successfully');
  
    // Crear menú del tray
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Restaurar',
        click: () => {
          restoreFromTray();
        }
      },
      {
        label: 'Salir',
        click: () => {
          app.quit();
        }
      }
    ]);
    
    tray.setContextMenu(contextMenu);
    
    // Hacer clic en el ícono del tray para restaurar
    tray.on('click', () => {
      restoreFromTray();
    });
    
    console.log('[MAIN] System tray menu and events configured');
  } catch (error) {
    console.error('[MAIN] Error creating system tray:', error);
    tray = null;
  }
}

function minimizeToTray() {
  console.log('[MAIN] minimizeToTray() called');
  console.log('[MAIN] Current tray state:', tray ? 'exists' : 'null');
  
  if (!tray) {
    console.log('[MAIN] Creating tray...');
    createTray();
  }
  
  console.log('[MAIN] Tray after creation:', tray ? 'exists' : 'null');
  console.log('[MAIN] MainWindow state:', mainWindow ? (mainWindow.isDestroyed() ? 'destroyed' : 'active') : 'null');
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
    isMinimizedToTray = true;
    console.log('[MAIN] Window minimized to system tray');
  } else {
    console.log('[MAIN] Cannot minimize - window not available');
  }
}

function restoreFromTray() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    isMinimizedToTray = false;
    console.log('[MAIN] Window restored from system tray');
  }
}

function showTrayNotification(title, message, type = 'info') {
  if (tray) {
    tray.displayBalloon({
      title: title,
      content: message,
      icon: resolveAssetPath('assets', 'images', 'icons', 'terra_icon.ico')
    });
  }
}

// Handlers para validación de cliente L2
ipcMain.handle('path-exists', async (event, path) => {
  try {
    return fs.existsSync(path);
  } catch (error) {
    console.error('[MAIN] Error checking path exists:', error);
    return false;
  }
});

ipcMain.handle('read-directory', async (event, folderPath) => {
  try {
    console.log('[MAIN] Reading directory:', folderPath);
    
    if (!fs.existsSync(folderPath)) {
      console.log('[MAIN] Directory does not exist:', folderPath);
      return { folders: [], files: [] };
    }
    
    const items = fs.readdirSync(folderPath);
    const folders = [];
    const files = [];
    
    for (const item of items) {
      const itemPath = path.join(folderPath, item);
      const stats = fs.statSync(itemPath);
      
      if (stats.isDirectory()) {
        folders.push(item);
      } else {
        files.push(item);
      }
    }
    
    console.log('[MAIN] Directory contents:', { folders, files });
    return { folders, files };
  } catch (error) {
    console.error('[MAIN] Error reading directory:', error);
    return { folders: [], files: [] };
  }
});



app.whenReady().then(() => {

  

  
  createWindow();
});

// 💀 Matamos todos los procesos al cerrar
app.on('before-quit', () => {
  console.log('Cerrando todos los procesos...');
  
  // Cerrar procesos L2.exe
  exec('taskkill /IM L2.exe /F', (error, stdout, stderr) => {
    if (error) {
      console.error('Error al cerrar L2.exe:', error.message);
    } else {
      console.log('Procesos L2.exe cerrados correctamente.');
    }
  });
  
  // Cerrar procesos de Electron huérfanos
  exec('taskkill /IM electron.exe /F', (error, stdout, stderr) => {
    if (error) {
      console.error('Error al cerrar electron.exe:', error.message);
    } else {
      console.log('Procesos electron.exe cerrados correctamente.');
    }
  });
  
  // Cerrar procesos de la aplicación actual
  exec('taskkill /IM "Launcher Terra.exe" /F', (error, stdout, stderr) => {
    if (error) {
      console.error('Error al cerrar Launcher Terra.exe:', error.message);
    } else {
      console.log('Procesos Launcher Terra.exe cerrados correctamente.');
    }
  });
});

app.on('window-all-closed', () => {
  // Cerrar la aplicación cuando se cierran todas las ventanas
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

// Manejar cierre inesperado de la aplicación
app.on('quit', () => {
  console.log('Aplicación cerrada, limpiando procesos...');
  
  // Asegurar que todas las ventanas estén cerradas
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy();
  }

  if (errorWindow && !errorWindow.isDestroyed()) {
    errorWindow.destroy();
  }

  // Limpiar el tray
  if (tray) {
    tray.destroy();
    tray = null;
  }
});

// Manejar señales del sistema
process.on('SIGINT', () => {
  console.log('Señal SIGINT recibida, cerrando aplicación...');
  app.quit();
});

process.on('SIGTERM', () => {
  console.log('Señal SIGTERM recibida, cerrando aplicación...');
  app.quit();
});
