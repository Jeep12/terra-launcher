const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const webpack = require('webpack');
const fs = require('fs');

module.exports = {
  mode: 'production',
  entry: {
    main: './src/scripts/renderer.js',
    styles: './src/styles/main.css'
  },
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: '[name].bundle.js',
    clean: true
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env']
          }
        }
      },
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader']
      }
    ]
  },
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            drop_console: true,
            drop_debugger: true,
            pure_funcs: ['console.log', 'console.info', 'console.warn', 'console.error', 'console.debug'],
            passes: 2
          },
          mangle: {
            reserved: ['require', 'exports', 'module']
          },
          output: {
            comments: false,
          },
        },
        extractComments: false,
      })
    ]
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        { from: 'src/assets', to: 'assets' },
        { from: 'src/views', to: 'views' },
        { 
          from: 'src/preload.js', 
          to: 'preload.js',
          transform: (content) => {
            // Convertir el buffer a string y reemplazar las variables de entorno
            const contentString = content.toString();
            return contentString
              .replace(/process\.env\.NODE_ENV/g, '"production"')
              .replace(/process\.env\.DISABLE_CONSOLE/g, '"true"');
          }
        },
        { from: 'src/scripts/gameLauncher.js', to: 'src/scripts/gameLauncher.js' },
        { from: 'src/environments/enviroment.js', to: 'src/environments/enviroment.js' },
        { from: 'src/scripts/logger.js', to: 'src/scripts/logger.js' },
        { from: 'src/scripts/fileValidator.js', to: 'src/scripts/fileValidator.js' },
        { from: 'src/scripts/retryManager.js', to: 'src/scripts/retryManager.js' },
        { from: 'src/scripts/repairService.js', to: 'src/scripts/repairService.js' },
        { from: 'src/scripts/timerManager.js', to: 'src/scripts/timerManager.js' },
        { from: 'src/scripts/rankingService.js', to: 'src/scripts/rankingService.js' },
        { from: 'src/scripts/patchNotesService.js', to: 'src/scripts/patchNotesService.js' },
        { from: 'src/scripts/playerStatsService.js', to: 'src/scripts/playerStatsService.js' },
        { from: 'src/scripts/patchDownloader.js', to: 'src/scripts/patchDownloader.js' },

        { from: 'src/scripts/folderSelector.js', to: 'src/scripts/folderSelector.js' },

        { from: 'src/scripts/ui/UIManager.js', to: 'src/scripts/ui/UIManager.js' },
        { from: 'src/environments/config.js', to: 'src/environments/config.js' },
        { from: 'game-panel.html', to: 'game-panel.html' },
        { from: 'splash.html', to: 'splash.html' },

        { from: 'src/assets/images/icons/terra_icon.ico', to: 'assets/images/icons/terra_icon.ico' }
      ]
    }),
    new MiniCssExtractPlugin({
      filename: 'styles.css'
    }),
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify('production'),
      'process.env.DISABLE_CONSOLE': JSON.stringify('true')
    }),
    {
      apply: (compiler) => {
        compiler.hooks.afterEmit.tap('CopyMainJs', (compilation) => {
          const mainJsPath = path.resolve(__dirname, 'main.js');
          const buildPath = path.resolve(__dirname, 'build', 'main.js');
          
          if (fs.existsSync(mainJsPath)) {
            // Leer el contenido del archivo
            let content = fs.readFileSync(mainJsPath, 'utf8');
            
            // Reemplazar las variables de entorno para producción
            content = content
              .replace(/process\.env\.NODE_ENV !== 'production'/g, 'false')
              .replace(/process\.env\.NODE_ENV === 'production'/g, 'true')
              .replace(/process\.env\.NODE_ENV !== "production"/g, 'false')
              .replace(/process\.env\.NODE_ENV === "production"/g, 'true');
            
            // Escribir el archivo procesado
            fs.writeFileSync(buildPath, content);
            console.log('✅ main.js copiado y procesado para producción');
          }
        });
      }
    },
    {
      apply: (compiler) => {
        compiler.hooks.afterEmit.tap('CreateDistPackageJson', (compilation) => {
          const buildPackageJson = {
            name: "Launcher-L2-Terra",
            version: "1.0.0",
            main: "main.js",
            description: "Game launcher for Lineage 2 Terra",
            author: "L2 Terra Team",
            build: {
              appId: "L2Terra",
              productName: "Launcher Terra",
              icon: "assets/images/icons/terra_icon.ico",
              files: ["**/*"],
              directories: {
                output: "dist"
              },
              win: {
                target: "nsis",
                requestedExecutionLevel: "requireAdministrator"
              }
            }
          };
          const buildPath = path.resolve(__dirname, 'build', 'package.json');
          fs.writeFileSync(buildPath, JSON.stringify(buildPackageJson, null, 2));
          console.log('✅ package.json creado en build');
          
          // Copiar electron a build/node_modules
          const electronPath = path.resolve(__dirname, 'node_modules', 'electron');
          const buildElectronPath = path.resolve(__dirname, 'build', 'node_modules', 'electron');
          if (fs.existsSync(electronPath)) {
            const buildNodeModulesPath = path.resolve(__dirname, 'build', 'node_modules');
            if (!fs.existsSync(buildNodeModulesPath)) {
              fs.mkdirSync(buildNodeModulesPath, { recursive: true });
            }
            fs.cpSync(electronPath, buildElectronPath, { recursive: true });
            console.log('✅ electron copiado a build/node_modules');
          }
        });
      }
    }
  ],
  resolve: {
    extensions: ['.js', '.json'],
    fallback: {
      fs: false,
      path: require.resolve('path-browserify'),
      https: require.resolve('https-browserify'),
      crypto: require.resolve('crypto-browserify'),
      stream: require.resolve('stream-browserify'),
      util: require.resolve('util/'),
      http: require.resolve('stream-http'),
      url: require.resolve('url/'),
      vm: require.resolve('vm-browserify'),
      'core-util-is': require.resolve('core-util-is'),
    },
  }
};