export function initFolderSelector() {
    const selectFolderButton = document.getElementById('btnSelectFolder');
    const folderPathElement = document.getElementById('folderPath');

    if (!selectFolderButton || !folderPathElement) {
        logger.error('DOM elements not found in folderSelector', {
            selectFolderButton: !!selectFolderButton,
            folderPathElement: !!folderPathElement
        }, 'FolderSelector');
        return;
    }

    function updateUI() {
        const savedFolderPath = localStorage.getItem('selectedFolder');
        
        // Verificar que los elementos existen
        if (!selectFolderButton || !folderPathElement) {
            logger.error('UI elements not found for update', null, 'FolderSelector');
            return;
        }
        
        if (savedFolderPath && savedFolderPath.trim() !== '') {
            folderPathElement.innerText = `${savedFolderPath}`;
            folderPathElement.title = `Selected folder: ${savedFolderPath}`;
        } else {
            folderPathElement.innerText = 'Selected folder: No folder selected';
            folderPathElement.title = 'Selected folder: No folder selected';
        }
    }

    // Actualizar UI inmediatamente al cargar
    updateUI();

    // Función para inicializar cuando window.electron esté disponible
    function initWhenElectronReady() {
        if (window.electron) {
            // Elimina listeners previos
            const newBtn = selectFolderButton.cloneNode(true);
            selectFolderButton.parentNode.replaceChild(newBtn, selectFolderButton);
            
            newBtn.addEventListener('click', () => {
                try {
                    window.electron.openFolderDialog();
                } catch (error) {
                    logger.error('Error calling openFolderDialog', { error: error.message }, 'FolderSelector');
                }
            });

            // Agregar listener para el botón de limpiar carpeta
            const clearFolderButton = document.getElementById('btnClearFolder');
            if (clearFolderButton) {
                console.log('Adding clear folder button listener');
                clearFolderButton.addEventListener('click', () => {
                    console.log('=== Clear Folder button clicked ===');
                    
                    // Limpiar localStorage
                    localStorage.removeItem('selectedFolder');
                    localStorage.removeItem('previousSelectedFolder');
                    console.log('Folder cleared from localStorage');
                    
                    // Actualizar UI inmediatamente
                    folderPathElement.innerText = 'Selected folder: No folder selected';
                    folderPathElement.title = 'Selected folder: No folder selected';
                    console.log('UI updated: Select Folder mode');
                    
                    // Resetear barra de progreso
                    const progressFill = document.getElementById('progressFill');
                    const progressPercent = document.getElementById('progressPercent');
                    const progressStatus = document.getElementById('progressStatus');
                    const progressDetails = document.getElementById('progressDetails');
                    
                    if (progressFill && progressPercent && progressStatus) {
                        progressFill.style.width = '0%';
                        progressPercent.textContent = '0%';
                        progressStatus.textContent = 'Ready';
                        if (progressDetails) progressDetails.style.display = 'none';
                    }
                    
                    // Mostrar toast de confirmación
                    if (window.gameLauncher) {
                        window.gameLauncher.showToast('Folder cleared successfully', 'success');
                        
                        // Actualizar estado del botón Play
                        if (window.gameLauncher.updatePlayButtonState) {
                            setTimeout(() => {
                                window.gameLauncher.updatePlayButtonState();
                            }, 100);
                        }
                    }
                    
                    console.log('Folder cleared successfully');
                });
            }

            console.log('Setting up onFolderSelected listener');
            window.electron.onFolderSelected((folderPath) => {
                console.log('=== Folder selected ===');
                console.log('folderPath:', folderPath);
                if (folderPath) {
                    localStorage.setItem('selectedFolder', folderPath);
                    console.log('Folder saved in localStorage');
                    
                    // Actualizar UI inmediatamente
                    folderPathElement.innerText = `${folderPath}`;
                    folderPathElement.title = `Selected folder: ${folderPath}`;
                    console.log('UI updated immediately: Change Folder mode');
                    
                    // Limpiar estado de la carpeta anterior si existe
                    const previousFolder = localStorage.getItem('previousSelectedFolder');
                    if (previousFolder && previousFolder !== folderPath && window.gameLauncher) {
                        console.log('Clearing state for previous folder:', previousFolder);
                        window.gameLauncher.patchDownloader.clearStateForFolder(previousFolder);
                    }
                    
                    // Guardar la carpeta actual como anterior para la próxima vez
                    localStorage.setItem('previousSelectedFolder', folderPath);
                    
                    // Resetear barra de progreso al cambiar carpeta
                    const progressFill = document.getElementById('progressFill');
                    const progressPercent = document.getElementById('progressPercent');
                    const progressStatus = document.getElementById('progressStatus');
                    const progressDetails = document.getElementById('progressDetails');
                    
                    if (progressFill && progressPercent && progressStatus) {
                        progressFill.style.width = '0%';
                        progressPercent.textContent = '0%';
                        progressStatus.textContent = 'Checking new folder...';
                        if (progressDetails) progressDetails.style.display = 'none';
                    }
                    
                    // Actualizar estado del botón Play
                    if (window.gameLauncher && window.gameLauncher.updatePlayButtonState) {
                        setTimeout(() => {
                            window.gameLauncher.updatePlayButtonState();
                        }, 100);
                    }
                } else {
                    localStorage.removeItem('selectedFolder');
                    console.log('Folder removed from localStorage');
                    
                    // Actualizar UI inmediatamente
                    folderPathElement.innerText = 'Selected folder: No folder selected';
                    folderPathElement.title = 'Selected folder: No folder selected';
                    console.log('UI updated immediately: Select Folder mode');
                }
                

            });
            
            console.log('FolderSelector initialization completed');
        } else {
            console.log('window.electron not available, retrying in 100ms...');
            // Si window.electron no está disponible, reintentar en 100ms
            setTimeout(initWhenElectronReady, 100);
        }
    }

    // Iniciar cuando esté listo
    initWhenElectronReady();
}
