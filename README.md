# Game Launcher L2 Terra

Lanzador de juegos para Lineage 2 Terra desarrollado con Electron.

## Configuración

### 1. Instalar dependencias
```bash
npm install
```

### 2. Configurar environment
1. Copia el archivo de ejemplo:
   ```bash
   cp src/environments/environment.example.js src/environments/enviroment.js
   ```

2. Edita `src/environments/enviroment.js` con tus configuraciones:
   - URLs de tu servidor
   - API keys
   - Configuraciones del servidor de juego

### 3. Desarrollo
```bash
npm run dev
```

### 4. Build de producción
```bash
npm run build:prod
```

## Estructura del proyecto

```
src/
├── environments/     # Configuraciones de entorno
├── scripts/         # Lógica principal del launcher
├── styles/          # Estilos CSS
├── views/           # Vistas HTML
└── assets/          # Recursos estáticos
```

## Seguridad

- El archivo `src/environments/enviroment.js` contiene configuraciones sensibles
- **NUNCA** subas este archivo al repositorio
- Usa `environment.example.js` como plantilla
- El archivo está incluido en `.gitignore`

## Scripts disponibles

- `npm run dev` - Desarrollo con hot reload
- `npm run build:dev` - Build de desarrollo
- `npm run build:prod` - Build de producción
- `npm run pack` - Empaquetar para distribución
