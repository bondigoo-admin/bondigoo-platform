module.exports = {
  devServer: (devServerConfig) => {
    devServerConfig.allowedHosts = 'auto';
    return devServerConfig;
  },
  webpack: {
    configure: (webpackConfig, { env, paths }) => {
      if (env === 'development') {
        webpackConfig.devtool = false;
      }
      webpackConfig.cache = {
        type: 'filesystem',
        buildDependencies: {
          config: [__filename],
        },
      };
      webpackConfig.module.rules.push({
        test: /\.worker\.js$/,
        use: {
          loader: 'worker-loader',
          options: {
            filename: 'segmentationWorker.worker.js',
            publicPath: '/',
          },
        },
      });
      webpackConfig.output.globalObject = 'this';
      return webpackConfig;
    },
  },
};