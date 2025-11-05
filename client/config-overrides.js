const { override, addWebpackModuleRule } = require('customize-cra');

module.exports = override(
  addWebpackModuleRule({
    test: /\.worker\.js$/,
    use: {
      loader: 'worker-loader',
      options: {
        inline: 'no-fallback', // Load worker as a separate file
        filename: '[name].js', // Ensure predictable output name
      },
    },
  }),
  (config) => {
    // Disable React Refresh for worker files to prevent conflicts
    config.plugins = config.plugins.filter(
      (plugin) => plugin.constructor.name !== 'ReactRefreshPlugin'
    );
    return config;
  }
);