const KEY='smooth64-settings-v1';
export const DEFAULT_SETTINGS=Object.freeze({developer:false,hints:true,timer:false});
export function loadSettings(storage) {
  try {
    storage??=globalThis.localStorage;
    const saved=JSON.parse(storage.getItem(KEY)||'{}');
    return Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([key,value])=>
      [key,typeof saved?.[key]==='boolean'?saved[key]:value]));
  } catch {return {...DEFAULT_SETTINGS};}
}
export function saveSettings(settings,storage) {
  try {(storage??globalThis.localStorage).setItem(KEY,JSON.stringify(settings));} catch { /* Offline/private play still works. */ }
}
