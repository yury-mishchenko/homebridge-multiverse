'use strict';

function bindProxyCharacteristic(log, stubChar, realChar) {
  let lock = false;

  // HomeKit -> real
  stubChar.onSet(v => {
    if (lock) return;
    lock = true;
    try {
      realChar.setValue(v);
    } finally {
      lock = false;
    }
  });

  // real -> HomeKit
  realChar.on('change', ({ newValue }) => {
    if (lock) return;
    if (stubChar.value === newValue) return;
    lock = true;
    try {
      stubChar.updateValue(newValue);
    } finally {
      lock = false;
    }
  });

  stubChar.onGet(() => realChar.value);
}

function copyAccessoryInfo(realInfo, stubInfo) {
  // Only update characteristics that already exist in the stub.
  // Avoid adding new ones to prevent duplicate-UUID errors.
  for (const char of realInfo.characteristics) {
    const stubChar = stubInfo.getCharacteristic(char.UUID);
    if (!stubChar) {
      // we simply skip extra / vendor-specific chars on AccessoryInformation
      continue;
    }
    stubChar.setProps(char.props);
    stubChar.updateValue(char.value);
  }
}

module.exports = { bindProxyCharacteristic, copyAccessoryInfo };
