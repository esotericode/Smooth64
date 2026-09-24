// Menus from a gamepad: the D-pad moves focus to the control that lies next
// in that direction, as a console menu does. `nearest` is pure geometry, so
// it is tested without a page.
const AXES={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};

// Of `rects` ({left,top,width,height}), the index of the nearest one beyond
// `from` in `direction` (-1 if none): its near edge must lie past the middle
// of `from`. The gap between the edges counts along the direction, and twice
// over across it, so a control in line wins over a nearer one off to the side.
export function nearest(from,rects,direction) {
  const [dx,dy]=AXES[direction],span=r=>dx?[r.top,r.top+r.height]:[r.left,r.left+r.width];
  const edge=(r,side)=>dx?r.left+(side>0?r.width:0):r.top+(side>0?r.height:0);
  const centre=r=>dx?r.left+r.width/2:r.top+r.height/2,[a0,a1]=span(from),sign=dx||dy;
  let best=-1,score=Infinity;
  rects.forEach((r,i)=>{
    if((edge(r,-sign)-centre(from))*sign<0)return;
    const [b0,b1]=span(r),across=Math.max(0,b0-a1,a0-b1),along=Math.max(0,(edge(r,-sign)-edge(from,sign))*sign);
    // Ties go to the control lined up with this one's start, as text reads.
    const s=along+2*across+.01*Math.abs(b0-a0);
    if(s<score){best=i;score=s;}
  });
  return best;
}

// The controls a gamepad can reach inside `roots`: enabled, on screen, and
// not inside a closed disclosure (whose contents some browsers still lay out).
export const controls=roots=>roots.flatMap(root=>[...root.querySelectorAll('button,input,summary,select')])
  .filter(el=>!el.disabled&&el.getClientRects().length>0&&!el.closest('details:not([open])>:not(summary)'));
// Where a control sits for navigation: a setting's whole row, not its small switch.
export const area=el=>(el.closest('.setting')??el).getBoundingClientRect();
