const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const webpack = require('webpack');
const fs = require('fs');

module.exports = {
  mode: 'development',
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
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        { from: 'src/assets', to: 'assets' },
        { from: 'src/views', to: 'views' },
        { from: 'src/preload.js', to: 'preload.js' },
        { from: 'src/scripts/gameLauncher.js', to: 'src/scripts/gameLauncher.js' },
        { from: 'src/environments/enviroment.js', to: 'src/environments/enviroment.js' },
        { from: 'src/scripts/logger.js', to: 'src/scripts/logger.js' },
        { from: 'src/scripts/fileValidator.js', to: 'src/scripts/fileValidator.js' },
        { from: 'src/scripts/retryManager.js', to: 'src/scripts/retryManager.js' },
        { from: 'src/scripts/repairService.js', to: 'src/scripts/repairService.js' },
        { from: 'src/scripts/timerManager.js', to: 'src/scripts/timerManager.js' },
        { from: 'src/scripts/rankingService.js', to: 'src/scripts/rankingService.js' },
        { from: 'src/scripts/patchDownloader.js', to: 'src/scripts/patchDownloader.js' },

        { from: 'src/scripts/folderSelector.js', to: 'src/scripts/folderSelector.js' },
        { from: 'src/scripts/patchNotesService.js', to: 'src/scripts/patchNotesService.js' },
        { from: 'src/scripts/playerStatsService.js', to: 'src/scripts/playerStatsService.js' },

        { from: 'src/scripts/ui/UIManager.js', to: 'src/scripts/ui/UIManager.js' },
        { from: 'game-panel.html', to: 'game-panel.html' },
        { from: 'splash.html', to: 'splash.html' },

        { from: 'src/assets/images/icons/terra_icon.ico', to: 'assets/images/icons/terra_icon.ico' }
      ]
    }),
    new MiniCssExtractPlugin({
      filename: 'styles.css'
    }),
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify('development')
    }),
    {
      apply: (compiler) => {
        compiler.hooks.afterEmit.tap('CopyMainJs', (compilation) => {
          const mainJsPath = path.resolve(__dirname, 'main.js');
          const buildPath = path.resolve(__dirname, 'build', 'main.js');
          
          if (fs.existsSync(mainJsPath)) {
            fs.copyFileSync(mainJsPath, buildPath);
            console.log('✅ main.js copiado sin procesar');
          }
        });
      }
    },
    {
      apply: (compiler) => {
        compiler.hooks.afterEmit.tap('CreateBuildPackageJson', (compilation) => {
          const buildPackageJson = {
            name: "Launcher-L2-Terra",
            version: "1.0.0",
            main: "main.js",
            description: "Game launcher for Lineage 2 Terra",
            author: "L2 Terra Team"
          };
          const buildPath = path.resolve(__dirname, 'build', 'package.json');
          fs.writeFileSync(buildPath, JSON.stringify(buildPackageJson, null, 2));
          console.log('✅ package.json creado en build');
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
  },
  devtool: 'source-map'
}; 