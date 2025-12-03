'use strict';
const { MultiHomeProxyPlatform } = require('./src/platform');
module.exports = api => { api.registerPlatform('homebridge-multiverse', MultiHomeProxyPlatform); };