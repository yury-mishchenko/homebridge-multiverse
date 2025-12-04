'use strict';

const { hap } = require('homebridge');
const path = require('path');
const fs = require('fs');

const { bindProxyCharacteristic, copyAccessoryInfo } = require('./proxy-bind');

function isValidUUID(uuid) {
  return (
    typeof uuid === 'string' &&
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
      uuid
    )
  );
}

class ProxyHome {
  constructor(log, config, realAccessories, storagePath) {
    this.log = log;
    this.name = config.name;
    this.username = config.username;
    this.port = config.port;
    this.pincode = config.pincode || '031-45-154';
    this.realAccessories = realAccessories;

    // HAP Bridge for this home
    this.bridge = new hap.Bridge(
      `Multiverse ${this.name}`,
      hap.uuid.generate(`multiverse-bridge-${this.name}`)
    );

    // Mark this bridge as our own to avoid recursive capture by the patched addBridgedAccessory
    this.bridge.__multiverseBridge = true;

    this.persistPath = path.join(storagePath, `multiverse-${this.name}`);
    if (!fs.existsSync(this.persistPath)) {
      fs.mkdirSync(this.persistPath);
    }
  }

  //
  // Start & publish the bridge
  //
  start() {
    this.log.info(
      `[Multiverse:${this.name}] Building stubs for ${this.realAccessories.length} accessories…`
    );
    this.buildStubs();

    this.bridge.publish({
      username: this.username,
      pincode: this.pincode,
      category: hap.Categories.BRIDGE,
      port: this.port,
    });

    this.log.info(
      `[Multiverse:${this.name}] Published on port ${this.port} with username ${this.username}.`
    );
  }

  //
  // INITIAL STUB BUILD
  //
  buildStubs() {
    for (const real of this.realAccessories) {
      const stub = this.buildStub(real);
      if (stub) {
        this.bridge.addBridgedAccessory(stub);
      }
    }
  }

  //
  // DYNAMIC ADD: Add one new accessory after startup
  //
  addStubFor(realAccessory) {
    this.log.info(
      `[Multiverse:${this.name}] Dynamically adding stub for ${realAccessory.displayName}`
    );
    const stub = this.buildStub(realAccessory);
    if (stub) {
      this.bridge.addBridgedAccessory(stub);
    }
  }

  //
  // CORE: Create a stub accessory for one real accessory
  //
  buildStub(realAccessory) {
    // Accessory UUID comes from HAP's uuid.generate, so it is safe by design
    const stubUUID = hap.uuid.generate(
      `multiverse/${this.name}/${realAccessory.UUID}`
    );
    const stub = new hap.Accessory(realAccessory.displayName, stubUUID);

    // Copy AccessoryInformation including Name
    const realInfo = realAccessory.getService(hap.Service.AccessoryInformation);
    const stubInfo = stub.getService(hap.Service.AccessoryInformation);
    if (realInfo && stubInfo) {
      copyAccessoryInfo(realInfo, stubInfo);
    }

    // Copy primary service name if present
    try {
      const realPrimary = realAccessory.services.find((s) => s.isPrimaryService);
      if (realPrimary && isValidUUID(realPrimary.UUID)) {
        const stubPrimary = stub.services.find((s) => s.UUID === realPrimary.UUID);
        if (stubPrimary) {
          const realNameChar = realPrimary.getCharacteristic(
            hap.Characteristic.Name
          );
          const stubNameChar = stubPrimary.getCharacteristic(
            hap.Characteristic.Name
          );
          if (realNameChar && stubNameChar) {
            stubNameChar.updateValue(realNameChar.value);
          }
        }
      }
    } catch (e) {
      this.log.warn(
        `[Multiverse:${this.name}] Could not sync primary service name for ${realAccessory.displayName}: ${e}`
      );
    }

    // Clone all other services
    for (const realService of realAccessory.services) {
      // Skip AccessoryInformation
      if (realService.UUID === hap.Service.AccessoryInformation.UUID) {
        continue;
      }

      // Service UUID must be valid or we skip it
      if (!isValidUUID(realService.UUID)) {
        this.log.warn(
          `[Multiverse:${this.name}] Skipping service with invalid UUID on ${realAccessory.displayName}: ${realService.displayName || realService.UUID}`
        );
        continue;
      }

      const stubService = new hap.Service(
        realService.displayName,
        realService.UUID,
        realService.subtype
      );
      stub.addService(stubService);

      // For each characteristic
      for (const realChar of realService.characteristics) {
        // UUID sanity check for characteristic
        if (!isValidUUID(realChar.UUID)) {
          this.log.warn(
            `[Multiverse:${this.name}] Skipping characteristic with invalid UUID on ${realAccessory.displayName}: ${realChar.displayName || realChar.UUID}`
          );
          continue;
        }

        let stubChar;

        // Try existing char via UUID
        try {
          stubChar = stubService.getCharacteristic(realChar.UUID);
        } catch {
          stubChar = null;
        }

        // Add new characteristic if needed
        if (!stubChar) {
          const ctor = realChar.constructor;
          const ctorUUID =
            ctor && typeof ctor.UUID === 'string' ? ctor.UUID : undefined;

          // Require constructor UUID to match the real characteristic UUID and be valid
          if (!ctorUUID || ctorUUID !== realChar.UUID || !isValidUUID(ctorUUID)) {
            this.log.warn(
              `[Multiverse:${this.name}] Skipping vendor/custom characteristic ${realChar.displayName || realChar.UUID} on ${realAccessory.displayName}`
            );
            continue;
          }

          try {
            stubChar = stubService.addCharacteristic(ctor);
          } catch (e) {
            this.log.warn(
              `[Multiverse:${this.name}] Failed to add characteristic ${realChar.displayName || realChar.UUID} on ${realAccessory.displayName}: ${e}`
            );
            continue;
          }
        }

        // Copy metadata + initial value
        try {
          stubChar.setProps(realChar.props);
          stubChar.updateValue(realChar.value);
        } catch (e) {
          this.log.warn(
            `[Multiverse:${this.name}] Could not copy characteristic ${realChar.displayName || realChar.UUID} on ${realAccessory.displayName}: ${e}`
          );
        }

        // Wire proxy handlers
        bindProxyCharacteristic(this.log, stubChar, realChar);
      }
    }

    return stub;
  }
}

module.exports = ProxyHome;
