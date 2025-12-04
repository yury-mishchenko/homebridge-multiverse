'use strict';

function bindProxyCharacteristic(log, stubChar, realChar) {
  let lock = false;

  //
  // HomeKit -> real (SET)
  //
  stubChar.onSet(value => {
    if (lock) return;
    lock = true;
    try {
      realChar.setValue(value);
    } catch (e) {
      log(
        `[Multiverse] Error setting value on real characteristic '${
          realChar.displayName || realChar.UUID
        }': ${e && e.message ? e.message : e}`
      );
    } finally {
      lock = false;
    }
  });

  //
  // real -> HomeKit (CHANGE events)
  //
  realChar.on('change', change => {
    if (lock) return;

    // Make this robust: some plugins use 'newValue', some might use 'value'.
    let newValue;
    if (change && Object.prototype.hasOwnProperty.call(change, 'newValue')) {
      newValue = change.newValue;
    } else if (change && Object.prototype.hasOwnProperty.call(change, 'value')) {
      newValue = change.value;
    } else {
      // fall back to the characteristic's current value
      newValue = realChar.value;
    }

    lock = true;
    try {
      stubChar.updateValue(newValue);
    } catch (e) {
      log(
        `[Multiverse] Error updating value on stub characteristic '${
          stubChar.displayName || stubChar.UUID
        }': ${e && e.message ? e.message : e}`
      );
    } finally {
      lock = false;
    }
  });

  //
  // HomeKit GET -> real GET
  // Try to actively ask the real characteristic via getValue(callback).
  // If that fails or is not available, fall back to the cached value.
  //
  stubChar.onGet(async () => {
    try {
      if (typeof realChar.getValue === 'function') {
        return await new Promise(resolve => {
          try {
            realChar.getValue((err, value) => {
              if (err) {
                log(
                  `[Multiverse] Error in getValue for '${
                    realChar.displayName || realChar.UUID
                  }': ${err}`
                );
                resolve(realChar.value);
              } else {
                resolve(value);
              }
            });
          } catch (e) {
            log(
              `[Multiverse] Exception calling getValue for '${
                realChar.displayName || realChar.UUID
              }': ${e && e.message ? e.message : e}`
            );
            resolve(realChar.value);
          }
        });
      }
    } catch (e) {
      log(
        `[Multiverse] Error during onGet for '${
          realChar.displayName || realChar.UUID
        }': ${e && e.message ? e.message : e}`
      );
    }

    // Fallback: just return cached value
    return realChar.value;
  });
}

function copyAccessoryInfo(realInfo, stubInfo) {
  // Only update characteristics that already exist in the stub.
  // Avoid adding new ones to prevent duplicate-UUID errors.
  for (const char of realInfo.characteristics) {
    let stubChar;
    try {
      stubChar = stubInfo.getCharacteristic(char.UUID);
    } catch {
      stubChar = undefined;
    }

    if (!stubChar) {
      // we simply skip extra / vendor-specific chars on AccessoryInformation
      continue;
    }

    try {
      stubChar.setProps(char.props);
      stubChar.updateValue(char.value);
    } catch {
      // AccessoryInformation issues are non-fatal; ignore
    }
  }
}

module.exports = { bindProxyCharacteristic, copyAccessoryInfo };
