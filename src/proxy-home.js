'use strict';

const {
  bindProxyCharacteristic,
  copyAccessoryInfo
} = require('./proxy-bind');

class ProxyHome {
  constructor(log, api, cfg, realAccessories) {
    this.log = log;
    this.api = api;
    this.cfg = cfg;
    this.realAccessories = realAccessories;

    const hap = this.api.hap;

    this.bridge = new hap.Bridge(
      this.cfg.name,
      hap.uuid.generate(`multiverse-bridge-${this.cfg.name}`)
    );

    // mark this bridge so we don't capture its own accessories
    this.bridge.__multiverseBridge = true;
  }

  start() {
    this.buildStubs();

    this.bridge.publish({
      username: this.cfg.username,
      pincode: this.cfg.pincode || '031-45-154',
      category: this.api.hap.Categories.BRIDGE,
      port: this.cfg.port
    });

    this.log(
      `[Multiverse] Home '${this.cfg.name}' running on port ${this.cfg.port}`
    );
  }

  buildStubs() {
    const hap = this.api.hap;

    for (const realAcc of this.realAccessories) {
      const stubUUID = hap.uuid.generate(
        `multiverse/${this.cfg.name}/${realAcc.UUID}`
      );
      const stub = new hap.Accessory(realAcc.displayName, stubUUID);

      // AccessoryInformation: reuse existing characteristics only
      const realInfo = realAcc.getService(hap.Service.AccessoryInformation);
      const stubInfo =
        stub.getService(hap.Service.AccessoryInformation) ||
        stub.addService(hap.Service.AccessoryInformation);

      if (realInfo && stubInfo) {
        copyAccessoryInfo(realInfo, stubInfo);
      }

      // All other services
      for (const realService of realAcc.services) {
        if (realService.UUID === hap.Service.AccessoryInformation.UUID) continue;

        // create a service of same type
        const stubService = new hap.Service(
          realService.displayName,
          realService.UUID,
          realService.subtype
        );
        stub.addService(stubService);

        for (const realChar of realService.characteristics) {
          let stubChar;

          // try to reuse an existing characteristic of same UUID
          try {
            stubChar = stubService.getCharacteristic(realChar.UUID);
          } catch {
            stubChar = undefined;
          }

          // if none, add a new one using the same constructor
          if (!stubChar) {
            try {
              stubChar = stubService.addCharacteristic(realChar.constructor);
            } catch (e) {
              this.log(
                `[Multiverse] Skipping characteristic '${realChar.displayName}' (${realChar.UUID}) on service '${realService.displayName}': ${e && e.message ? e.message : e}`
              );
              continue;
            }
          }

          // sync props and initial value
          stubChar.setProps(realChar.props);
          stubChar.updateValue(realChar.value);

          // wire proxy handlers
          bindProxyCharacteristic(this.log, stubChar, realChar);
        }
      }

      this.bridge.addBridgedAccessory(stub);
    }
  }
}

module.exports = { ProxyHome };
