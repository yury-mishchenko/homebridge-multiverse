'use strict';

function bindProxyCharacteristic(log, stubChar, realChar) {
  let lock = false;
  const label =
    realChar.displayName ||
    stubChar.displayName ||
    realChar.UUID ||
    stubChar.UUID;

  //
  // HomeKit (stub bridge) -> real (SET)
  //
  stubChar.onSet(value => {
    log(
      `[Multiverse][DEBUG] onSet stub -> real '${label}' value=${safeJson(
        value
      )} lock=${lock}`
    );

    if (lock) {
      log(
        `[Multiverse][DEBUG] onSet stub -> real '${label}' ignored due to lock`
      );
      return;
    }

    lock = true;
    try {
      // 1) Trigger the real plugin's normal "set" path so hardware is updated
      if (typeof realChar.setValue === 'function') {
        log(
          `[Multiverse][DEBUG] calling realChar.setValue for '${label}' with ${safeJson(
            value
          )}`
        );
        realChar.setValue(value);
      } else if (typeof realChar.updateValue === 'function') {
        log(
          `[Multiverse][DEBUG] realChar.setValue missing, using updateValue for '${label}' with ${safeJson(
            value
          )}`
        );
        realChar.updateValue(value);
      }

      // 2) Explicitly broadcast to all main bridge clients (iPad etc.)
      if (typeof realChar.updateValue === 'function') {
        log(
          `[Multiverse][DEBUG] broadcasting realChar.updateValue for '${label}' with ${safeJson(
            value
          )}`
        );
        realChar.updateValue(value);
      }
    } catch (e) {
      log(
        `[Multiverse] Error setting value on real characteristic '${label}': ${
          e && e.message ? e.message : e
        }`
      );
    } finally {
      lock = false;
    }
  });

  //
  // real -> HomeKit (stub) (CHANGE events)
  //
  realChar.on('change', change => {
    log(
      `[Multiverse][DEBUG] change real -> stub '${label}' raw=${safeJson(
        change
      )} lock=${lock}`
    );

    if (lock) {
      log(
        `[Multiverse][DEBUG] change real -> stub '${label}' ignored due to lock`
      );
      return;
    }

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

    log(
      `[Multiverse][DEBUG] change real -> stub '${label}' using newValue=${safeJson(
        newValue
      )}`
    );

    lock = true;
    try {
      stubChar.updateValue(newValue);
    } catch (e) {
      log(
        `[Multiverse] Error updating value on stub characteristic '${label}': ${
          e && e.message ? e.message : e
        }`
      );
    } finally {
      lock = false;
    }
  });

  //
  // HomeKit GET (stub) -> real GET
  //
  stubChar.onGet(async () => {
    log(`[Multiverse][DEBUG] onGet stub -> real '${label}'`);

    try {
      if (typeof realChar.getValue === 'function') {
        const value = await new Promise(resolve => {
          try {
            realChar.getValue((err, v) => {
              if (err) {
                log(
                  `[Multiverse][DEBUG] getValue error for '${label}': ${err}`
                );
                resolve(realChar.value);
              } else {
                log(
                  `[Multiverse][DEBUG] getValue result for '${label}' = ${safeJson(
                    v
                  )}`
                );
                resolve(v);
              }
            });
          } catch (e) {
            log(
              `[Multiverse][DEBUG] Exception calling getValue for '${label}': ${
                e && e.message ? e.message : e
              }`
            );
            resolve(realChar.value);
          }
        });

        log(
          `[Multiverse][DEBUG] onGet stub -> real '${label}' returning ${safeJson(
            value
          )}`
        );
        return value;
      }
    } catch (e) {
      log(
        `[Multiverse] Error during onGet for '${label}': ${
          e && e.message ? e.message : e
        }`
      );
    }

    log(
      `[Multiverse][DEBUG] onGet stub -> real '${label}' falling back to cached ${safeJson(
        realChar.value
      )}`
    );
    return realChar.value;
  });
}

function copyAccessoryInfo(realInfo, stubInfo) {
  for (const char of realInfo.characteristics) {
    let stubChar;
    try {
      stubChar = stubInfo.getCharacteristic(char.UUID);
    } catch {
      stubChar = undefined;
    }

    if (!stubChar) {
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

function safeJson(v) {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

module.exports = { bindProxyCharacteristic, copyAccessoryInfo };
