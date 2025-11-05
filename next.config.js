// next.config.js
const path = require('path');

module.exports = {
  webpack: (config, { isServer }) => {
    // Example: Add custom Webpack configuration
    // Ensure that Babel is correctly configured
    config.module.rules.push({
      test: /\.(js|jsx)$/,
      exclude: /node_modules/,
      use: {
        loader: 'babel-loader',
        options: {
          presets: ['next/babel'],
        },
      },
    });

    // Other custom Webpack configurations
    // Example: Resolve modules
    config.resolve.alias['@'] = path.join(__dirname, 'src');

    return config;
  },
};
