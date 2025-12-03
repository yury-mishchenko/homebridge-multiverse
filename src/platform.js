'use strict';
const path = require('path');
const { ProxyHome } = require('./proxy-home');

class MultiHomeProxyPlatform {
  constructor(log, config, api) {
    this.log = log; this.config = config; this.api = api;
    this.realAccessories = [];
    const origRegister = api.registerPlatformAccessories.bind(api);
    api.registerPlatformAccessories = (plugin, platform, accs) => {
      this.realAccessories.push(...accs);
      origRegister(plugin, platform, accs);
    };
    api.on('didFinishLaunching', () => {
      this.startHomes();
    });
  }
  configureAccessory() {}
  startHomes() {
    const hap = this.api.hap;
    const storage = require('path').join(this.api.user.storagePath(), 'homebridge-multiverse-persist');
    hap.HAPStorage.setCustomStoragePath(storage);
    for (const cfg of (this.config.homes || [])) {
      new ProxyHome(this.log, this.api, cfg, this.realAccessories).start();
    }
  }
}
module.exports = { MultiHomeProxyPlatform };