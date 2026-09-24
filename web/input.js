const keyButtons={Space:1,KeyJ:2,KeyX:2,ShiftLeft:4,ShiftRight:4,KeyZ:4};
const movement=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight',...Object.keys(keyButtons)]);
const standardPad=()=>Array.from(navigator.getGamepads?.()||[]).find(p=>p?.mapping==='standard');
const padButtons=pad=>pad?((pad.buttons[0]?.pressed?1:0)|(pad.buttons[2]?.pressed||pad.buttons[1]?.pressed?2:0)|
  (pad.buttons[6]?.pressed||pad.buttons[7]?.pressed?4:0)):0;
export const DEFAULT_DEADZONE=.15;
// Menu directions from the D-pad (standard buttons 12-15) or the left stick.
const NAV=[['up',12,1,-1],['down',13,1,1],['left',14,0,-1],['right',15,0,1]];

// Scaled radial dead zone: inside `zone` a stick reads exactly zero, so worn
// or drifting sticks stay still; the remaining travel is rescaled to 0..1.
export function deadzone(x,y,zone=DEFAULT_DEADZONE) {
  const magnitude=Math.hypot(x,y);
  if(!(magnitude>zone))return [0,0];
  const scale=Math.min(1,(magnitude-zone)/(1-zone))/magnitude;
  return [x*scale,y*scale];
}
// Gamepad stick -> raw N64 units (+Y forward). The core ignores |axis| < 8 and
// reaches full speed near 70, so travel past the dead zone starts at that
// edge: the first movement outside it is the core's slowest tiptoe.
export function stickToRaw(x,y,zone=DEFAULT_DEADZONE) {
  const [dx,dy]=deadzone(x,-y,zone),amount=Math.hypot(dx,dy);
  if(!amount)return [0,0];
  const cx=dx/amount,cy=dy/amount,edge=8/Math.max(Math.abs(cx),Math.abs(cy)),radius=edge+amount*(80-edge);
  return [Math.round(cx*radius),Math.round(cy*radius)];
}

export class Input {
  constructor(canvas,command) {
    this.command=command;this.enabled=false;this.deadzone=DEFAULT_DEADZONE;
    this.keys=new Set();this.pending=0;this.touchButtons=0;this.stick=[0,0];
    this.orbit=0;this.pitch=0;this.zoom=0;this.gamepadName='Keyboard';
    this.lastPad=0;this.blockedPad=0;this.menuHeld=false;this.drag=null;this.touchPointer=null;this.releaseTouches=[];
    // Gamepad menu actions go here ('up', 'down', 'left', 'right', 'accept',
    // 'back', and 'start', which returns true when it is used up).
    this.onNavigate=null;this.nav=null;
    window.addEventListener('keydown',e=>{
      if(e.target.closest?.('input,select,textarea,[contenteditable="true"]'))return;
      // Let focused menu buttons, links and disclosures use native keyboard input.
      if(e.target.closest?.('button,a,summary')&&['Space','Enter','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))return;
      if(!e.repeat&&this.command(e.code)){e.preventDefault();return;}
      if(!this.enabled)return;
      if(movement.has(e.code))e.preventDefault();
      if(!e.repeat)this.pending|=keyButtons[e.code]||0;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup',e=>this.keys.delete(e.code));
    window.addEventListener('blur',()=>this.clear());
    document.addEventListener('visibilitychange',()=>this.clear());
    canvas.addEventListener('pointerdown',e=>{
      if(!this.enabled)return;
      canvas.focus();this.drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove',e=>{
      if(!this.enabled||!this.drag)return;
      this.orbit-=(e.clientX-this.drag[0])*0.006;
      this.pitch+=(e.clientY-this.drag[1])*0.004;this.drag=[e.clientX,e.clientY];
    });
    for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>this.drag=null);
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    canvas.addEventListener('wheel',e=>{if(this.enabled){e.preventDefault();this.zoom+=e.deltaY;}},{passive:false});
    document.querySelectorAll('[data-touch]').forEach(button=>{
      const mask=Number(button.dataset.touch);let pointer=null;
      this.releaseTouches.push(()=>pointer=null);
      button.addEventListener('pointerdown',e=>{
        if(!this.enabled||pointer!==null)return;
        e.preventDefault();pointer=e.pointerId;button.setPointerCapture(pointer);this.touchButtons|=mask;this.pending|=mask;
      });
      const release=e=>{if(e.pointerId===pointer){pointer=null;this.touchButtons&=~mask;}};
      for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,release);
    });
    const pad=document.querySelector('#touch-stick');this.knob=pad.querySelector('span');
    const update=e=>{
      if(!this.enabled)return;
      const r=pad.getBoundingClientRect(),radius=r.width*.35;
      let x=(e.clientX-r.left-r.width/2)/radius,y=-(e.clientY-r.top-r.height/2)/radius;
      const m=Math.max(1,Math.hypot(x,y));x/=m;y/=m;this.stick=[x,y];
      this.knob.style.transform=`translate(${x*35}px,${-y*35}px)`;
    };
    pad.addEventListener('pointerdown',e=>{
      if(!this.enabled||this.touchPointer!==null)return;
      this.touchPointer=e.pointerId;pad.setPointerCapture(e.pointerId);update(e);
    });
    pad.addEventListener('pointermove',e=>{if(e.pointerId===this.touchPointer)update(e);});
    const release=e=>{if(e.pointerId===this.touchPointer){this.touchPointer=null;this.stick=[0,0];this.knob.style.transform='';}};
    for(const event of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(event,release);
  }
  clear() {
    this.keys.clear();this.pending=0;this.touchButtons=0;this.stick=[0,0];this.lastPad=0;
    this.orbit=0;this.pitch=0;this.zoom=0;this.drag=null;this.touchPointer=null;
    for(const release of this.releaseTouches)release();
    if(this.knob)this.knob.style.transform='';
  }
  setEnabled(value) {
    if(value===this.enabled)return;
    this.enabled=value;this.clear();this.blockedPad=padButtons(standardPad());
  }
  pollCommands(menus=false,now=performance.now()) {
    const pad=standardPad(),pressed=!!pad?.buttons[9]?.pressed;
    this.gamepadName=pad?'Gamepad':'Keyboard';
    if(pressed&&!this.menuHeld&&!this.onNavigate?.('start'))this.command('Escape');
    this.menuHeld=pressed;
    this.pollMenus(menus?pad:null,now);
  }
  // In menus and on the welcome screen: the D-pad or left stick moves
  // (repeating while held, like arrow keys), A accepts and B backs out.
  // Anything already held when a menu appears waits to be released.
  pollMenus(pad,now) {
    if(!pad||!this.onNavigate){this.nav=null;return;}
    const buttons=['accept','back'].filter((_,i)=>pad.buttons[i]?.pressed);
    const direction=NAV.find(([,button,axis,sign])=>pad.buttons[button]?.pressed||(pad.axes[axis]??0)*sign>.55)?.[0]??null;
    const nav=this.nav;
    if(!nav){this.nav={direction,next:Infinity,buttons};return;}
    for(const action of buttons)if(!nav.buttons.includes(action))this.onNavigate(action);
    nav.buttons=buttons;
    if(direction!==nav.direction){nav.direction=direction;nav.next=now+380;if(direction)this.onNavigate(direction);}
    else if(direction&&now>=nav.next){nav.next=now+110;this.onNavigate(direction);}
  }
  sample(yaw) {
    if(!this.enabled)return {x:0,y:0,buttons:0,yaw:Math.round(yaw*32768/Math.PI)};
    const k=this.keys;
    let x=Number(k.has('KeyD')||k.has('ArrowRight'))-Number(k.has('KeyA')||k.has('ArrowLeft'));
    let y=Number(k.has('KeyW')||k.has('ArrowUp'))-Number(k.has('KeyS')||k.has('ArrowDown'));
    const strength=k.has('AltLeft')||k.has('AltRight')?32:80;x*=strength;y*=strength;
    let buttons=this.touchButtons;
    for(const [key,mask] of Object.entries(keyButtons))if(k.has(key))buttons|=mask;
    if(this.stick.some(v=>v!==0)){x=Math.round(this.stick[0]*80);y=Math.round(this.stick[1]*80);}
    const gamepad=standardPad();
    if(gamepad) {
      const [px,py]=stickToRaw(gamepad.axes[0]??0,gamepad.axes[1]??0,this.deadzone);
      if(px||py){x=px;y=py;}
      const held=padButtons(gamepad);this.blockedPad&=held;
      const pad=held&~this.blockedPad;
      this.pending|=pad&~this.lastPad;this.lastPad=pad;buttons|=pad;
    } else this.lastPad=0;
    buttons|=this.pending;this.pending=0;
    return {x,y,buttons,yaw:Math.round(yaw*32768/Math.PI)};
  }
  cameraDelta(dt) {
    if(!this.enabled)return {yaw:0,pitch:0,zoom:0};
    let yaw=this.orbit,pitch=this.pitch,zoom=this.zoom;this.orbit=0;this.pitch=0;this.zoom=0;
    if(this.keys.has('KeyQ'))yaw+=dt*1.9;
    if(this.keys.has('KeyE'))yaw-=dt*1.9;
    const pad=standardPad();
    if(pad) {
      const [x,y]=deadzone(pad.axes[2]??0,pad.axes[3]??0,this.deadzone);
      yaw-=x*dt*2.3;pitch+=y*dt*1.2;
    }
    return {yaw,pitch,zoom};
  }
}
