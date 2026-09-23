const KEY='smooth64-settings-v1';
export const DEFAULT_SETTINGS=Object.freeze({developer:false,hints:true,timer:false,volume:.8,music:.5,deadzone:.15});
// Numeric settings: [minimum, maximum]. Everything else is a boolean.
export const SETTING_RANGES=Object.freeze({volume:[0,1],music:[0,1],deadzone:[.05,.35]});
export function loadSettings(storage) {
  try {
    storage??=globalThis.localStorage;
    const saved=JSON.parse(storage.getItem(KEY)||'{}');
    // v0.5.0 saved music as a switch plus musicVolume. A player who silenced it stays silent.
    if(typeof saved?.music==='boolean')saved.music=saved.music&&saved.musicVolume!==0?undefined:0;
    return Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([key,value])=>{
      const next=saved?.[key],range=SETTING_RANGES[key];
      if(range)return [key,Number.isFinite(next)?Math.max(range[0],Math.min(range[1],next)):value];
      return [key,typeof next==='boolean'?next:value];
    }));
  } catch {return {...DEFAULT_SETTINGS};}
}
export function saveSettings(settings,storage) {
  try {(storage??globalThis.localStorage).setItem(KEY,JSON.stringify(settings));} catch { /* Offline/private play still works. */ }
}
