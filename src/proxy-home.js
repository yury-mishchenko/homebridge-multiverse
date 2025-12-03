'use strict';
const { bindProxyCharacteristic, copyAccessoryInfo } = require('./proxy-bind');

class ProxyHome {
  constructor(log, api, cfg, realAccessories) {
    this.log = log; this.api = api; this.cfg = cfg; this.realAccessories = realAccessories;
    const hap = api.hap;
    this.bridge = new hap.Bridge(cfg.name, hap.uuid.generate(`multiverse-bridge-${cfg.name}`));
  }
  start() {
    this.buildStubs();
    this.bridge.publish({
      username: this.cfg.username,
      pincode: this.cfg.pincode || '031-45-154',
      category: this.api.hap.Categories.BRIDGE,
      port: this.cfg.port
    });
  }
  buildStubs() {
    const hap = this.api.hap;
    for (const realAcc of this.realAccessories) {
      const stubUUID = hap.uuid.generate(`multiverse/${this.cfg.name}/${realAcc.UUID}`);
      const stub = new hap.Accessory(realAcc.displayName, stubUUID);
      const realInfo = realAcc.getService(hap.Service.AccessoryInformation);
      const stubInfo = stub.getService(hap.Service.AccessoryInformation) || stub.addService(hap.Service.AccessoryInformation);
      if (realInfo && stubInfo) copyAccessoryInfo(realInfo, stubInfo);
      for (const realService of realAcc.services) {
        if (realService.UUID === hap.Service.AccessoryInformation.UUID) continue;
        const stubService = new hap.Service(realService.displayName, realService.UUID);
        stub.addService(stubService);
        for (const realChar of realService.characteristics) {
          const stubChar = new hap.Characteristic(realChar.displayName, realChar.UUID);
          stubChar.setProps(realChar.props);
          stubService.addCharacteristic(stubChar);
          bindProxyCharacteristic(this.log, stubChar, realChar);
        }
      }
      this.bridge.addBridgedAccessory(stub);
    }
  }
}
module.exports = { ProxyHome };