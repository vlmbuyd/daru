const {app,BrowserWindow,ipcMain,globalShortcut,shell}=require('electron');const path=require('node:path');const {Store}=require('./storage.cjs');const {createUpdates}=require('./updates.cjs');const fs=require('node:fs/promises');const {ShortcutController}=require('./shortcut.cjs');
if(process.env.DARU_TEST_DATA)app.setPath('userData',process.env.DARU_TEST_DATA);
if(!app.requestSingleInstanceLock())app.quit();else app.whenReady().then(async()=>{const store=new Store(app.getPath('userData'));let win;const trusted=e=>{if(!win||e.sender!==win.webContents||e.senderFrame!==win.webContents.mainFrame)throw Error('허용되지 않은 호출');};
ipcMain.handle('records:read',e=>{trusted(e);return store.read();});ipcMain.handle('records:write',async(e,items)=>{trusted(e);const {validate}=await import('./domain.mjs');validate(items);return store.write(items);});ipcMain.handle('records:location',e=>{trusted(e);return store.file;});const updates=createUpdates(app,()=>require('electron-updater').autoUpdater);
ipcMain.handle('updates:status',e=>{trusted(e);return updates.status();});
ipcMain.handle('updates:check',e=>{trusted(e);return updates.check();});
ipcMain.handle('updates:install',e=>{trusted(e);return updates.install();});
void updates.check();
const model=require('./chatgpt.cjs').createChatGPT(app,shell);
ipcMain.handle('model:status',e=>{trusted(e);return model.status();});
ipcMain.handle('model:connect',async e=>{trusted(e);await model.signIn();return model.status();});
ipcMain.handle('model:disconnect',e=>{trusted(e);return model.signOut();});
ipcMain.handle('model:ask',(e,history,id)=>{trusted(e);return model.ask(history,id);});
const shortcuts=new ShortcutController(globalShortcut,()=>{if(!win||win.isDestroyed()){create();win.webContents.once('did-finish-load',()=>win.webContents.send('quick:open'));}else{if(win.isMinimized())win.restore();win.show();win.focus();win.webContents.send('quick:open');}});const prefsFile=path.join(app.getPath('userData'),'shortcut.json');let shortcutStatus;
try{const pref=JSON.parse(await fs.readFile(prefsFile,'utf8'));shortcutStatus=shortcuts.set(pref.accelerator);}catch(e){shortcutStatus=e.code==='ENOENT'?shortcuts.set('CommandOrControl+Alt+Shift+D'):{accelerator:'',ok:false,message:'단축키 설정 파일을 읽지 못했습니다. 변경 전 파일을 확인하세요.'};}
ipcMain.handle('shortcut:get',e=>{trusted(e);return shortcutStatus;});ipcMain.handle('shortcut:set',async(e,value)=>{trusted(e);const previous=shortcuts.current;const result=shortcuts.set(value);if(!result.ok)return result;try{await fs.mkdir(path.dirname(prefsFile),{recursive:true});await fs.writeFile(prefsFile+'.tmp',JSON.stringify({accelerator:value}),{mode:0o600});await fs.rename(prefsFile+'.tmp',prefsFile);shortcutStatus=result;return result;}catch{shortcuts.set(previous);return {accelerator:shortcuts.current,ok:false,message:'설정 저장 실패. 이전 단축키로 복구했습니다.'};}});
app.on('will-quit',()=>globalShortcut.unregisterAll());
function create(){win=new BrowserWindow({width:1440,height:940,minWidth:760,minHeight:600,title:'다루',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());win.webContents.session.setPermissionRequestHandler((_w,_p,cb)=>cb(false));win.loadFile(path.join(__dirname,'../dist/index.html'));}create();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)create();});});app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
