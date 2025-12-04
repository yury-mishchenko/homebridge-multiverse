'use strict';

function bindProxyCharacteristic(log, stubChar, realChar) {
  let lock = false;

  // Track last forwarded value to prevent redundant updates
  stubChar.__lastForwardedValue = undefined;

  //
  // HomeKit (stub) -> real (SET)
  //
  stubChar.onSet(value => {
    if (lock) return;

    lock = true;
    try {
      // Forward value to real plugin
      if (typeof realChar.setValue === 'function') {
        realChar.setValue(value);
      } else if (typeof realChar.updateValue === 'function') {
        realChar.updateValue(value);
      }
    } finally {
      lock = false;
    }
  });

  //
  // real -> stub (CHANGE events)
  //
  realChar.on('change', change => {
    if (lock) return;

    // Determine new value
    let newValue;
    if (change && 'newValue' in change) newValue = change.newValue;
    else if (change && 'value' in change) newValue = change.value;
    else newValue = realChar.value;

    // Skip redundant identical values
    if (stubChar.__lastForwardedValue === newValue) {
      return;
    }
    stubChar.__lastForwardedValue = newValue;

    lock = true;
    try {
      stubChar.updateValue(newValue);
    } finally {
      lock = false;
    }
  });

  //
  // stub -> real GET
  //
  stubChar.onGet(async () => {
    try {
      if (typeof realChar.getValue === 'function') {
        return await new Promise(resolve => {
          try {
            realChar.getValue((err, v) => {
              if (err) resolve(realChar.value);
              else resolve(v);
            });
          } catch {
            resolve(realChar.value);
          }
        });
      }
    } catch {
      // ignore, fall back below
    }

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
    } catch {
      // ignore
    }
  }
}

module.exports = { bindProxyCharacteristic, copyAccessoryInfo };
