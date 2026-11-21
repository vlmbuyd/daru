class ShortcutController{
 constructor(native,open){this.native=native;this.open=open;this.current='';this.message='해제됨';}
 set(value){if(typeof value!=='string'||value.length>100||value&&!/^(?:(?:CommandOrControl|Command|Control|Alt|Shift|Super)\+){2,}[A-Z0-9]$/.test(value))return {accelerator:this.current,ok:false,message:'수정키 2개 이상과 영문 대문자/숫자 한 개를 사용하세요.'};if(value===this.current)return this.status();if(value){let ok=false;try{ok=this.native.register(value,this.open);}catch{}if(!ok)return {accelerator:this.current,ok:false,message:'등록 실패: 다른 앱과 충돌하거나 지원되지 않습니다. 기존 설정을 유지했습니다.'};}if(this.current)this.native.unregister(this.current);this.current=value;this.message=value?'등록됨 · Mac 실측 필요':'해제됨';return this.status();}
 status(){return {accelerator:this.current,ok:true,message:this.message};}
}module.exports={ShortcutController};
