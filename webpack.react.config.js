const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

module.exports = {
    mode: 'development',
    entry: './src/renderer.tsx',
    target: 'web', // Standard web target for WebView2
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'bundle.js',
        publicPath: './' // Important for file:// protocol loading
    },
    module: {
        rules: [
            {
                test: /\.(ts|tsx)$/,
                include: /src/,
                // transpileOnly skips type-checking during the compile itself (type
                // errors are still reported, just asynchronously by ForkTsCheckerWebpackPlugin
                // below), which is what makes the dev build fast.
                use: [{ loader: 'ts-loader', options: { transpileOnly: true } }],
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader'],
            },
        ],
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './src/index.html',
            favicon: './src/assets/favicon.png',
        }),
        new ForkTsCheckerWebpackPlugin(),
    ],
    resolve: {
        extensions: ['.tsx', '.ts', '.js'],
    },
    devtool: 'eval-cheap-module-source-map',
    cache: {
        type: 'filesystem',
    },
    devServer: {
        static: {
            directory: path.join(__dirname, 'dist'),
        },
        devMiddleware: {
            // output.publicPath is './' for production file:// loading, but
            // webpack-dev-server needs an absolute path to serve in-memory assets.
            publicPath: '/',
        },
        compress: true,
        port: 5173,
        hot: true,
        historyApiFallback: true,
    },
};
