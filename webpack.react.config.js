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
    // src/csharp is the separate .NET desktop app project, not TS/JS source. It
    // must stay out of webpack's (and fork-ts-checker's) watch scope: the C# app's
    // running WebView2 instance holds an exclusive lock on files under its
    // bin/.../EBWebView cache, and chokidar recursing into that directory to watch
    // it crashes the whole dev server with EBUSY when the app is running.
    watchOptions: {
        ignored: '**/src/csharp/**',
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
