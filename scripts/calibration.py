"""Generate an exact-scale DTF screen test, binary alpha, 300 ppi.
Requires Node >=18 and Pillow; writes docs/CARTA-CALIBRACION.png.
"""
from pathlib import Path
import json
import subprocess
import tempfile
from PIL import Image, ImageDraw, ImageFont
ROOT = Path(__file__).resolve().parents[1]
W, H, DPI = 1800, 2100, 300
image = Image.new('RGBA', (W,H))
draw = ImageDraw.Draw(image)
def font(size):
    for name in ['DejaVuSans.ttf', 'C:/Windows/Fonts/arial.ttf']:
        try: return ImageFont.truetype(name,size)
        except OSError: pass
    return ImageFont.load_default()
def text(x,y,s,size=28): draw.text((x,y),s,font=font(size),fill=(245,245,245,255))
text(65,40,'HALFTONE DTF / CARTA DE CALIBRACION',43)
text(65,100,'300 ppp / 1800 x 2100 px / 15.24 x 17.78 cm',30)
text(65,150,'Imprimir 100%. Tramas sin limpieza. Angulo 45 grados.',27)
text(65,190,'Comparar puntos retenidos, huecos y moire. Probar lavado.',27)
shapes=[('round','Redonda'),('ellipse','Elipse 2:1'),('square','Cuadrada'),('diamond','Diamante'),('line','Lineas')]
js=r'''
const fs=require('fs');
const {processRGBA}=require(process.argv[1]);
const w=480,h=160,input=new Uint8Array(w*h*4);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,tone=(Math.min(8,Math.floor(x/(w/9)))+1)/10;
  input.set([150,215,195,Math.round(255*tone)],i);
}
(async()=>{for(const shape of ['round','ellipse','square','diamond','line'])for(const lpi of [25,35,45]){
const r=await processRGBA(input,w,h,{dpi:300,lpi,angle:45,shape,knockout:false,minDiameterMM:0,cleanup:'low'});
fs.writeFileSync(process.argv[2]+'/'+shape+'-'+lpi+'.rgba',r.data);
}})().catch(e=>{console.error(e);process.exit(1)});
'''
with tempfile.TemporaryDirectory() as td:
    subprocess.run(['node','-e',js,str(ROOT/'plugin/engine.js'),td],check=True)
    for row,(shape,label) in enumerate(shapes):
        y=280+row*280
        text(65,y,label,30)
        for col,lpi in enumerate([25,35,45]):
            x=65+col*560
            text(x,y+45,f'{lpi} LPI',25)
            patch=Image.frombytes('RGBA',(480,160),(Path(td)/f'{shape}-{lpi}.rgba').read_bytes())
            image.paste(patch,(x,y+85))
            draw.rectangle((x-1,y+84,x+480,y+245),outline=(200,200,200,255),width=1)
            text(x,y+248,'10  20  30  40  50  60  70  80  90%',19)
text(65,1700,'PARTICULAS AISLADAS Y LINEAS / DIMENSION TEORICA',28)
for col,mm in enumerate([.12,.20,.30,.46]):
    x=90+col*430
    text(x,1770,f'{mm:.2f} mm',30)
    diameter=mm/25.4*DPI
    for j in range(7):
        cx=x+20+j*36;cy=1840
        draw.ellipse((cx-diameter/2,cy-diameter/2,cx+diameter/2,cy+diameter/2),fill=(150,215,195,255))
    draw.rectangle((x,1900,x+260,1900+max(1,round(diameter))-1),fill=(150,215,195,255))
text(65,1980,'Los puntos y lineas se cuantizan a pixeles. No hay minimo universal.',25)
text(65,2025,'Anota: film / polvo / blanca / curado / plancha / prenda / resultado.',24)
# Text rasterization must not introduce semitransparent pixels in this test.
alpha=image.getchannel('A').point(lambda a: 255 if a>=128 else 0)
image.putalpha(alpha)
output=ROOT/'docs/CARTA-CALIBRACION.png'
image.save(output,dpi=(DPI,DPI))
print(output)
