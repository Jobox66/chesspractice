// Metro only sees files inside mobile/ by default; ../shared holds code used
// by both this app and the web frontend.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, '../shared')];
// ../shared has no node_modules; resolve its packages (chessops) from here.
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];

module.exports = config;
