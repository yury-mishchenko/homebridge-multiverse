'use strict';

const {
  bindProxyCharacteristic,
  copyAccessoryInfo
} = require('./proxy-bind');

function isValidUUID(uuid) {
  return (
    typeof uuid === 'string' &&
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
      uuid
    )
  );
}

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

    // mark this bridge so the platform hook doesn't capture its own accessories
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

      // --- AccessoryInformation ---
      const realInfo = realAcc.getService(hap.Service.AccessoryInformation);
      const stubInfo =
        stub.getService(hap.Service.AccessoryInformation) ||
        stub.addService(hap.Service.AccessoryInformation);

      if (realInfo && stubInfo) {
        copyAccessoryInfo(realInfo, stubInfo);
      }

      // --- Other services ---
      for (const realService of realAcc.services) {
        if (
          realService.UUID === hap.Service.AccessoryInformation.UUID ||
          !realService.UUID
        ) {
          continue;
        }

        const stubService = new hap.Service(
          realService.displayName,
          realService.UUID,
          realService.subtype
        );
        stub.addService(stubService);

        for (const realChar of realService.characteristics) {
          let stubChar;

          // Try to reuse an existing characteristic with same UUID
          try {
            if (isValidUUID(realChar.UUID)) {
              stubChar = stubService.getCharacteristic(realChar.UUID);
            }
          } catch {
            stubChar = undefined;
          }

          // If not present, try to add via constructor
          if (!stubChar) {
            const ctor = realChar.constructor;
            const ctorUUID = ctor && ctor.UUID;

            if (!ctorUUID || !isValidUUID(ctorUUID)) {
              this.log(
                `[Multiverse] Skipping characteristic '${realChar.displayName}' on service '${realService.displayName}' – invalid or missing constructor UUID`
              );
              continue;
            }

            try {
              stubChar = stubService.addCharacteristic(ctor);
            } catch (e) {
              this.log(
                `[Multiverse] Skipping characteristic '${realChar.displayName}' (${ctorUUID}) on service '${realService.displayName}': ${
                  e && e.message ? e.message : e
                }`
              );
              continue;
            }
          }

          // At this point stubChar.UUID should be valid
          if (!isValidUUID(stubChar.UUID)) {
            this.log(
              `[Multiverse] Skipping characteristic '${realChar.displayName}' on service '${realService.displayName}' – stub has invalid UUID '${stubChar.UUID}'`
            );
            continue;
          }

          // Sync props and initial value
          try {
            stubChar.setProps(realChar.props);
            stubChar.updateValue(realChar.value);
          } catch (e) {
            this.log(
              `[Multiverse] Warning: could not sync props/value for '${realChar.displayName}' on '${realService.displayName}': ${
                e && e.message ? e.message : e
              }`
            );
          }

          // Wire proxy handlers
          bindProxyCharacteristic(this.log, stubChar, realChar);
        }
      }

      // --- Ensure accessory names are correct for HomeKit UI ---

      // 1. AccessoryInformation.Name
      const stubInfoFinal = stub.getService(hap.Service.AccessoryInformation);
      if (stubInfoFinal) {
        try {
          const nameChar = stubInfoFinal.getCharacteristic(
            hap.Characteristic.Name
          );
          nameChar.updateValue(realAcc.displayName);
        } catch {
          // ignore
        }
      }

      // 2. Primary service Name (what Home app usually shows)
      const primaryService =
        typeof stub.getPrimaryService === 'function'
          ? stub.getPrimaryService()
          : null;
      if (primaryService) {
        try {
          const nameChar = primaryService.getCharacteristic(
            hap.Characteristic.Name
          );
          nameChar.updateValue(realAcc.displayName);
        } catch {
          // primary service has no Name characteristic; ignore
        }
      }

      this.bridge.addBridgedAccessory(stub);
    }
  }
}

module.exports = { ProxyHome };
