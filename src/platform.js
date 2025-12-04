'use strict';

const { ProxyHome } = require('./proxy-home');

class MultiHomeProxyPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config || {};
    this.api = api;

    this.realAccessories = [];
    this.homes = [];
    this.ready = false;

    this.log('[Multiverse] Initializing homebridge-multiverse platform…');

    const hap = this.api.hap;

    // 🔹 Hook Bridge.addBridgedAccessory ONCE globally
    if (!hap.Bridge.prototype.__multiversePatched) {
      const origAdd = hap.Bridge.prototype.addBridgedAccessory;
      const self = this;

      hap.Bridge.prototype.addBridgedAccessory = function (accessory) {
        // "this" is the Bridge instance
        try {
          // Ignore our own multiverse bridges
          if (!this.__multiverseBridge) {
            self.realAccessories.push(accessory);
            self.log(
              `[Multiverse] Captured accessory '${accessory.displayName}' from bridge '${this.displayName}'`
            );

            // If the platform is ready, dynamically mirror this accessory
            if (self.ready) {
              self.log(
                `[Multiverse] Dynamically mirroring accessory '${accessory.displayName}' into all multiverse homes`
              );
              for (const home of self.homes) {
                try {
                  home.addStubFor(accessory);
                } catch (e) {
                  self.log(
                    `[Multiverse] Error dynamically adding stub for '${accessory.displayName}' in home '${home.cfg?.name || home.name}': ${
                      e && e.message ? e.message : e
                    }`
                  );
                }
              }
            }
          }
        } catch (e) {
          self.log(
            `[Multiverse] Error capturing accessory: ${
              e && e.message ? e.message : e
            }`
          );
        }

        return origAdd.call(this, accessory);
      };

      hap.Bridge.prototype.__multiversePatched = true;
      this.log('[Multiverse] Patched hap.Bridge.addBridgedAccessory');
    }

    this.api.on('didFinishLaunching', () => {
      const count = this.realAccessories.length;

      this.log(
        `[Multiverse] didFinishLaunching – captured ${count} accessory(ies) from main bridge`
      );

      this.startHomes();
      this.ready = true;
      this.log('[Multiverse] Platform is now READY; late accessories will be mirrored dynamically.');
    });
  }

  configureAccessory() {
    // not using cached accessories; everything comes via the Bridge hook
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
      const home = new ProxyHome(
        this.log,
        this.api,
        homeCfg,
        this.realAccessories
      );
      this.homes.push(home);
      home.start();
    }
  }
}

module.exports = { MultiHomeProxyPlatform };
