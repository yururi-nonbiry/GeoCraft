const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

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
                use: [{ loader: 'ts-loader' }],
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
        }),
    ],
    resolve: {
        extensions: ['.tsx', '.ts', '.js'],
    },
    devtool: 'inline-source-map',
    devServer: {
        static: {
            directory: path.join(__dirname, 'dist'),
        },
        compress: true,
        port: 5173,
        hot: true,
        historyApiFallback: true,
    },
};
