import {validate,type Item} from './domain';
export type UpdateStatus={phase:'disabled'|'idle'|'checking'|'downloading'|'current'|'ready'|'error';version:string;nextVersion?:string};
export type ModelStatus={connected:boolean;pending:boolean};
export type ChatMessage={role:'user'|'assistant';content:string};
declare global {interface Window {daru?:{modelStatus:()=>Promise<ModelStatus>;connectModel:()=>Promise<ModelStatus>;disconnectModel:()=>Promise<ModelStatus>;askModel:(history:ChatMessage[],id:string)=>Promise<string>;getShortcut:()=>Promise<{accelerator:string;ok:boolean;message:string}>;setShortcut:(value:string)=>Promise<{accelerator:string;ok:boolean;message:string}>;onQuickOpen:(fn:()=>void)=>()=>void;read:()=>Promise<unknown>;write:(items:Item[])=>Promise<void>;location:()=>Promise<string>;updates:()=>Promise<UpdateStatus>;checkUpdates:()=>Promise<UpdateStatus>;installUpdate:()=>Promise<boolean>}}}
const key='daru.preview.records.v1';
export const storage={async read(){const data=window.daru?await window.daru.read():JSON.parse(localStorage.getItem(key)||'[]');validate(data);return data;},async write(items:Item[]){validate(items);if(window.daru)await window.daru.write(items);else localStorage.setItem(key,JSON.stringify(items));},async location(){return window.daru?window.daru.location():'이 브라우저의 localStorage · 테스트·피드백 전용';}};
