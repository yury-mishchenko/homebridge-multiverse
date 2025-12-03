'use strict';

const path = require('path');
const { ProxyHome } = require('./proxy-home');

class MultiHomeProxyPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config || {};
    this.api = api;

    // will hold ALL real accessories
    this.realAccessories = [];

    this.log('[Multiverse] Initializing homebridge-multiverse platform…');

    // Hook dynamically registered platform accessories (optional bonus)
    const origRegister = this.api.registerPlatformAccessories.bind(this.api);
    this.api.registerPlatformAccessories = (plugin, platform, accessories) => {
      this.log(
        `[Multiverse] registerPlatformAccessories: got ${accessories.length} new accessory(ies) from ${plugin}/${platform}`
      );
      this.realAccessories.push(...accessories);
      origRegister(plugin, platform, accessories);
    };

    this.api.on('didFinishLaunching', () => {
      // At this point Homebridge has loaded everything.
      // Grab ALL known accessories from Homebridge.
      this.realAccessories = this.api.accessories.slice();

      this.log(
        `[Multiverse] didFinishLaunching – found ${this.realAccessories.length} accessory(ies) in main bridge`
      );

      this.startHomes();
    });
  }

  configureAccessory(accessory) {
    // not using cached accessories directly; we use api.accessories in didFinishLaunching
  }

  startHomes() {
    const homes = this.config.homes || [];

    if (!homes.length) {
      this.log('[Multiverse] No homes configured – nothing to do.');
      return;
    }

    this.log(
      `[Multiverse] Starting ${homes.length} home(s) with ${this.realAccessories.length} mirrored accessory(ies)`
    );

    for (const homeCfg of homes) {
      this.log(
        `[Multiverse] Initializing home '${homeCfg.name}' on port ${homeCfg.port} (username ${homeCfg.username})`
      );
      const home = new ProxyHome(this.log, this.api, homeCfg, this.realAccessories);
      home.start();
    }
  }
}

module.exports = { MultiHomeProxyPlatform };
