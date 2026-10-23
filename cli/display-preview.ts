import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function displayPreview(root: string) {
  const source = await readFile(join(root, 'workspace/projects/car/display.ts'), 'utf8');
  const renderer = new Bun.Transpiler({ loader: 'ts' }).transformSync(source).replace(/<\/script/gi, '<\\/script');
  const directory = join(root, 'workspace/built');
  await mkdir(directory, { recursive: true });
  const file = join(directory, 'joystick-display.html');
  await writeFile(file, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Joystick LED display preview</title><style>
body{font:17px system-ui;background:#15171d;color:#eceff6;max-width:740px;margin:35px auto;padding:20px}button,select{font:inherit;padding:9px;margin:4px;background:#303646;color:inherit;border:1px solid #606b83;border-radius:6px}canvas{width:min(100%,330px);touch-action:none;border-radius:15px;background:#222733} .panels{display:flex;gap:20px;flex-wrap:wrap}label{display:block;margin:12px 0}input{width:75%}output{font-variant-numeric:tabular-nums}p{line-height:1.5}</style>
<h1>Joystick LED display</h1><p>A selects the left stick; B selects the right. Drag in the square or use the sliders. This uses the firmware's frame renderer and does not connect to hardware.</p>
<button id="left">A · Left stick</button><button id="right">B · Right stick</button>
<label>View <select id="style"><option value="0">Blended moving dot</option><option value="1">Coarse / fine rings</option><option value="2">Aligned polar rings</option></select></label>
<div class="panels"><canvas id="pad" width="330" height="330" aria-label="Joystick input pad"></canvas><canvas id="matrix" width="330" height="330" aria-label="5 by 5 LED display"></canvas></div>
<label>Horizontal <input id="x" type="range" min="-1" max="1" step="0.01" value="0"></label>
<label>Vertical <input id="y" type="range" min="-1" max="1" step="0.01" value="0"></label>
<button id="center">Center selected stick</button><p><output id="readout"></output></p><p id="explanation"></p>
<script>${renderer}
const points=[[0,0],[0,0]];let selected=0;const get=id=>document.getElementById(id);const pad=get('pad'),matrix=get('matrix');
function choose(n){selected=n;get('x').value=points[n][0];get('y').value=points[n][1];}
get('left').onclick=()=>choose(0);get('right').onclick=()=>choose(1);
get('center').onclick=()=>{points[selected]=[0,0];choose(selected)};
for(const axis of ['x','y'])get(axis).oninput=()=>points[selected]=[+get('x').value,+get('y').value];
function move(e){const r=pad.getBoundingClientRect();points[selected]=[Math.max(-1,Math.min(1,2*(e.clientX-r.left)/r.width-1)),Math.max(-1,Math.min(1,1-2*(e.clientY-r.top)/r.height))];choose(selected)}
pad.onpointerdown=e=>{pad.setPointerCapture(e.pointerId);move(e)};pad.onpointermove=e=>{if(pad.hasPointerCapture(e.pointerId))move(e)};pad.onpointerup=e=>pad.releasePointerCapture(e.pointerId);
function draw(t){const [x,y]=points[selected],style=+get('style').value,frame=joystickDisplay.frame(x,y,style,t%600<300),p=pad.getContext('2d'),m=matrix.getContext('2d');p.clearRect(0,0,330,330);p.strokeStyle='#68758c';p.beginPath();p.moveTo(165,0);p.lineTo(165,330);p.moveTo(0,165);p.lineTo(330,165);p.stroke();p.fillStyle='#8bc7ff';p.beginPath();p.arc(165+x*150,165-y*150,9,0,Math.PI*2);p.fill();m.clearRect(0,0,330,330);frame.forEach((v,i)=>{m.beginPath();m.arc(45+(i%5)*60,45+Math.floor(i/5)*60,15,0,Math.PI*2);m.fillStyle=v?'rgba(255,65,70,'+Math.max(.04,v/255)+')':'#393039';m.fill()});get('readout').textContent=(selected?'Right':'Left')+' · x '+x.toFixed(2)+' · y '+y.toFixed(2)+' · radius '+Math.min(1,Math.hypot(x,y)).toFixed(2);get('explanation').textContent=['Only the joystick-position dot is lit, blending neighboring LEDs for intermediate positions. There is no fixed center light.','Outer ring points toward the stick; inner ring rotates nine times as fast. Both align at cardinal and diagonal directions. The pulsing right-column marker shows radius: bottom zero, top maximum. At center, angle is undefined and pointers park upward.','Both pointers indicate direction; brightness increases with deflection. Only the center is lit at zero deflection.'][style];requestAnimationFrame(draw)}requestAnimationFrame(draw);
</script></html>`);
  console.log(file);
}
