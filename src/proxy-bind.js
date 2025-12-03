'use strict';
function bindProxyCharacteristic(log, stubChar, realChar) {
  let lock = false;
  stubChar.onSet(v => { if(lock) return; lock=true; try{ realChar.setValue(v);} finally{lock=false;}});
  realChar.on('change', ({newValue}) => {
    if(lock) return;
    if(stubChar.value === newValue) return;
    lock=true; try{ stubChar.updateValue(newValue);} finally{lock=false;}
  });
  stubChar.onGet(() => realChar.value);
}
function copyAccessoryInfo(realInfo, stubInfo) {
  for (const char of realInfo.characteristics) {
    const s = stubInfo.getCharacteristic(char.UUID) || stubInfo.addCharacteristic(char.constructor);
    s.setProps(char.props); s.updateValue(char.value);
  }
}
module.exports = { bindProxyCharacteristic, copyAccessoryInfo };