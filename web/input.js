const keyButtons={Space:1,KeyJ:2,KeyX:2,ShiftLeft:4,ShiftRight:4,KeyZ:4};
export class Input {
  constructor(canvas,command) {
    this.keys=new Set(); this.pending=0; this.touchButtons=0; this.stick=[0,0];
    this.orbit=0; this.pitch=0; this.zoom=0; this.gamepadName='Keyboard';
    this.lastPad=0;
    const movement=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight',...Object.keys(keyButtons)];
    window.addEventListener('keydown',e=>{
      if(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if(movement.includes(e.code)) e.preventDefault();
      if(!e.repeat) {
        this.pending|=keyButtons[e.code]||0;
        command(e.code);
      }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup',e=>this.keys.delete(e.code));
    window.addEventListener('blur',()=>this.clear());
    document.addEventListener('visibilitychange',()=>this.clear());
    let drag=null;
    canvas.addEventListener('pointerdown',e=>{
      canvas.focus(); drag=[e.clientX,e.clientY]; canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove',e=>{
      if(!drag) return;
      this.orbit-=(e.clientX-drag[0])*0.006;
      this.pitch+=(e.clientY-drag[1])*0.004;
      drag=[e.clientX,e.clientY];
    });
    canvas.addEventListener('pointerup',()=>drag=null);
    canvas.addEventListener('pointercancel',()=>drag=null);
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoom+=e.deltaY;},{passive:false});
    document.querySelectorAll('[data-touch]').forEach(button=>{
      const mask=Number(button.dataset.touch);
      button.addEventListener('pointerdown',e=>{
        e.preventDefault();button.setPointerCapture(e.pointerId);this.touchButtons|=mask;this.pending|=mask;
      });
      const release=()=>{this.touchButtons&=~mask;};
      button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);
    });
    const pad=document.querySelector('#touch-stick');
    const knob=pad.querySelector('span');
    const update=e=>{
      const r=pad.getBoundingClientRect();let x=(e.clientX-r.left-r.width/2)/42,y=-(e.clientY-r.top-r.height/2)/42;
      const m=Math.max(1,Math.hypot(x,y));x/=m;y/=m;this.stick=[x,y];
      knob.style.transform=`translate(${x*35}px,${-y*35}px)`;
    };
    pad.addEventListener('pointerdown',e=>{pad.setPointerCapture(e.pointerId);update(e);});
    pad.addEventListener('pointermove',e=>{if(pad.hasPointerCapture(e.pointerId))update(e);});
    const release=()=>{this.stick=[0,0];knob.style.transform='';};
    pad.addEventListener('pointerup',release);pad.addEventListener('pointercancel',release);
  }
  clear() { this.keys.clear();this.pending=0;this.touchButtons=0;this.stick=[0,0];this.lastPad=0; }
  sample(yaw) {
    const k=this.keys;
    let x=Number(k.has('KeyD')||k.has('ArrowRight'))-Number(k.has('KeyA')||k.has('ArrowLeft'));
    let y=Number(k.has('KeyW')||k.has('ArrowUp'))-Number(k.has('KeyS')||k.has('ArrowDown'));
    const strength=k.has('AltLeft')||k.has('AltRight')?32:80;
    x*=strength;y*=strength;
    let buttons=this.touchButtons;
    for(const [key,mask] of Object.entries(keyButtons)) if(k.has(key))buttons|=mask;
    if(this.stick.some(v=>v!==0)) {x=Math.round(this.stick[0]*80);y=Math.round(this.stick[1]*80);}
    const gamepad=Array.from(navigator.getGamepads?.()||[]).find(p=>p?.mapping==='standard');
    this.gamepadName=gamepad?'Gamepad':'Keyboard';
    if(gamepad) {
      const [px,py]=gamepad.axes;
      if(Math.hypot(px,py)>0.08) { x=Math.round(px*80);y=Math.round(-py*80); }
      let pad=(gamepad.buttons[0]?.pressed?1:0)|(gamepad.buttons[2]?.pressed||gamepad.buttons[1]?.pressed?2:0)|
        (gamepad.buttons[6]?.pressed||gamepad.buttons[7]?.pressed?4:0);
      this.pending|=pad&~this.lastPad;this.lastPad=pad;buttons|=pad;
    }
    buttons|=this.pending;this.pending=0;
    return {x,y,buttons,yaw:Math.round(yaw*32768/Math.PI)};
  }
  cameraDelta(dt) {
    let yaw=this.orbit,pitch=this.pitch,zoom=this.zoom;
    this.orbit=0;this.pitch=0;this.zoom=0;
    if(this.keys.has('KeyQ'))yaw+=dt*1.9;
    if(this.keys.has('KeyE'))yaw-=dt*1.9;
    const pad=Array.from(navigator.getGamepads?.()||[]).find(p=>p?.mapping==='standard');
    if(pad) {
      if(Math.abs(pad.axes[2])>.15)yaw-=pad.axes[2]*dt*2.3;
      if(Math.abs(pad.axes[3])>.15)pitch+=pad.axes[3]*dt*1.2;
    }
    return {yaw,pitch,zoom};
  }
}
