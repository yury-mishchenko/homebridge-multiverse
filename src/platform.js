'use strict';

const { hap } = require('homebridge');

class MultiHomeProxyPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.api = api;

    this.homesConfig = config.homes || [];
    this.realAccessories = [];
    this.homes = [];
    this.ready = false;

    this.log.info(`[Multiverse] Initializing platform with ${this.homesConfig.length} homes.`);

    if (!this.homesConfig.length) {
      this.log.warn('[Multiverse] No homes configured. Plugin will not create any multiverse bridges.');
      return;
    }

    this._patchAddBridgedAccessory();

    this.api.on('didFinishLaunching', () => {
      this.log.info('[Multiverse] Homebridge finished launching. Starting multiverse homes…');
      this._startHomes();
      this.ready = true;
    });
  }

  //
  // PATCH: Capture every accessory added to the main bridge.
  // Ignore the stubs we created in our multiverse bridges.
  //
  _patchAddBridgedAccessory() {
    const originalAdd = hap.Bridge.prototype.addBridgedAccessory;
    const platform = this;

    hap.Bridge.prototype.addBridgedAccessory = function (acc) {
      // Skip our multiverse bridges
      if (this.__multiverseBridge) {
        return originalAdd.call(this, acc);
      }

      // Capture real accessory
      platform.realAccessories.push(acc);
      platform.log.info(`[Multiverse] Captured accessory: ${acc.displayName} (${acc.UUID})`);

      // If ready, dynamically propagate to all homes
      if (platform.ready) {
        platform.log.info(`[Multiverse] Adding dynamically discovered accessory to all multiverse homes: ${acc.displayName}`);

        for (const home of platform.homes) {
          try {
            home.addStubFor(acc);
          } catch (err) {
            platform.log.error(`[Multiverse] Error dynamically adding stub for ${acc.displayName} in home ${home.name}: ${err}`);
          }
        }
      }

      return originalAdd.call(this, acc);
    };
  }

  //
  // START ALL HOMES
  //
  _startHomes() {
    const {ProxyHome} = require('./proxy-home');

    for (const homeConfig of this.homesConfig) {
      const home = new ProxyHome(this.log, homeConfig, this.realAccessories, this.api.user.storagePath());
      this.homes.push(home);

      try {
        home.start();
        this.log.info(`[Multiverse] Started multiverse home '${home.name}'.`);
      } catch (err) {
        this.log.error(`[Multiverse] Failed to start home '${home.name}': ${err}`);
      }
    }
  }
}

module.exports = { MultiHomeProxyPlatform };
