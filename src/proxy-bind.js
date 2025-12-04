'use strict';

function bindProxyCharacteristic(log, stubChar, realChar) {
  let lock = false;
  const label =
    realChar.displayName ||
    stubChar.displayName ||
    realChar.UUID ||
    stubChar.UUID;

  // track last forwarded real value
  stubChar.__lastForwardedValue = undefined;

  //
  // HomeKit (stub) -> real (SET)
  //
  stubChar.onSet(value => {
    log(`[Multiverse][DEBUG] onSet stub -> real '${label}' value=${safeJson(value)} lock=${lock}`);

    if (lock) return;

    lock = true;
    try {
      // Forward to plugin only; DO NOT updateValue manually
      if (typeof realChar.setValue === 'function') {
        realChar.setValue(value);
      } else if (typeof realChar.updateValue === 'function') {
        realChar.updateValue(value);
      }
    } catch (e) {
      log(`[Multiverse] Error setting value on real characteristic '${label}': ${e}`);
    } finally {
      lock = false;
    }
  });

  //
  // real -> stub (CHANGE events)
  //
  realChar.on('change', change => {
    log(`[Multiverse][DEBUG] change real -> stub '${label}' raw=${safeJson(change)} lock=${lock}`);

    if (lock) {
      log(`[Multiverse][DEBUG] change real -> stub '${label}' ignored due to lock`);
      return;
    }

    // Extract newValue
    let newValue;
    if (change && 'newValue' in change) newValue = change.newValue;
    else if (change && 'value' in change) newValue = change.value;
    else newValue = realChar.value;

    // 🔥 SKIP redundant updates (polling noise)
    if (stubChar.__lastForwardedValue === newValue) {
      log(`[Multiverse][DEBUG] skip identical value for '${label}' = ${safeJson(newValue)}`);
      return;
    }

    stubChar.__lastForwardedValue = newValue;

    log(`[Multiverse][DEBUG] change real -> stub '${label}' forwarding newValue=${safeJson(newValue)}`);

    lock = true;
    try {
      stubChar.updateValue(newValue);
    } catch (e) {
      log(`[Multiverse] Error updating stub '${label}': ${e}`);
    } finally {
      lock = false;
    }
  });

  //
  // stub -> real GET
  //
  stubChar.onGet(async () => {
    log(`[Multiverse][DEBUG] onGet stub -> real '${label}'`);

    try {
      if (typeof realChar.getValue === 'function') {
        const value = await new Promise(resolve => {
          try {
            realChar.getValue((err, v) => {
              if (err) resolve(realChar.value);
              else resolve(v);
            });
          } catch {
            resolve(realChar.value);
          }
        });
        log(`[Multiverse][DEBUG] onGet: returning ${safeJson(value)} for '${label}'`);
        return value;
      }
    } catch {}

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
    if (!stubChar) continue;

    try {
      stubChar.setProps(char.props);
      stubChar.updateValue(char.value);
    } catch {}
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
