// Native, editable Figma screens. Sample values only; no account data.
// Variable-collection helper follows figma-generate-library/scripts/createVariableCollection.js.
async function createVariableCollection(name, modeNames) {
  const collection = figma.variables.createVariableCollection(name);
  const modeIds = {};
  collection.renameMode(collection.modes[0].modeId, modeNames[0]);
  modeIds[modeNames[0]] = collection.modes[0].modeId;
  return { collection, modeIds };
}
const page = figma.root.children[0];
await figma.setCurrentPageAsync(page);
const created = [];
const fonts = [{family:'Sarabun',style:'Regular'},{family:'Sarabun',style:'Bold'},{family:'Nunito',style:'ExtraBold'}];
await Promise.all(fonts.map(f=>figma.loadFontAsync(f)));
const hex = s=>({r:parseInt(s.slice(1,3),16)/255,g:parseInt(s.slice(3,5),16)/255,b:parseInt(s.slice(5,7),16)/255});
const colors={ink:'#222b2e',muted:'#657373',surface:'#ffffff',canvas:'#f5f7f4',dark:'#242e32',lime:'#e1f5a3',mint:'#ccebc5',aqua:'#dff3f5',brand:'#326b4c',line:'#e8ece7'};
const {collection,modeIds}=await createVariableCollection('NutriThai / Soft Green',['Light']);
const vars={};
for(const [name,value] of Object.entries(colors)) {
 const primitive=figma.variables.createVariable('Palette/'+name,collection,'COLOR');primitive.scopes=[];primitive.setValueForMode(modeIds.Light,{...hex(value),a:1});
 const v=figma.variables.createVariable('Color/'+name,collection,'COLOR');v.scopes=['FRAME_FILL','SHAPE_FILL','TEXT_FILL','STROKE_COLOR'];v.setValueForMode(modeIds.Light,{type:'VARIABLE_ALIAS',id:primitive.id});v.setVariableCodeSyntax('WEB','var(--'+name+')');vars[name]=v;
}
for(const [name,value,scope] of [['gap',20,'GAP'],['card-radius',28,'CORNER_RADIUS']]){
 const v=figma.variables.createVariable(name,collection,'FLOAT');v.scopes=[scope];v.setValueForMode(modeIds.Light,value);v.setVariableCodeSyntax('WEB','var(--'+name+')');vars[name]=v;
}
const styles={};
for(const [name,size,style] of [['Body',14,'Regular'],['Caption',12,'Regular'],['Heading',20,'Bold'],['Title',32,'Bold']]){
 const s=figma.createTextStyle();s.name='NutriThai/'+name;s.fontName={family:'Sarabun',style};s.fontSize=size;s.lineHeight={unit:'PERCENT',value:145};styles[name]=s;
}
function track(n){created.push(n.id);return n;}
function fill(n,key){n.fills=[figma.variables.setBoundVariableForPaint({type:'SOLID',color:hex(colors[key])},'color',vars[key])];}
function frame(parent,name,w,h,color='surface',dir='VERTICAL',padding=20){
 const n=track(figma.createAutoLayout(dir));n.name=name;parent.appendChild(n);n.resize(w,h);n.primaryAxisSizingMode='FIXED';n.counterAxisSizingMode='FIXED';n.paddingTop=n.paddingBottom=n.paddingLeft=n.paddingRight=padding;n.itemSpacing=12;fill(n,color);return n;
}
function text(parent,value,w,style='Body',color='ink'){
 const n=track(figma.createText());n.fontName={family:'Sarabun',style:style==='Heading'||style==='Title'?'Bold':'Regular'};n.textStyleId=styles[style].id;n.characters=value;n.textAutoResize='HEIGHT';n.resize(w,20);fill(n,color);parent.appendChild(n);return n;
}
function card(parent,name,w,h,color='surface') {const n=frame(parent,name,w,h,color);for(const corner of ['topLeftRadius','topRightRadius','bottomLeftRadius','bottomRightRadius'])n.setBoundVariable(corner,vars['card-radius']);return n;}
const buttons=await figma.importComponentSetByKeyAsync('cc8b558dc7d9684011b6b99ce8e6509399bc836b');
const primary=buttons.children.find(c=>c.type==='COMPONENT'&&c.name==='Variant=Primary, State=Default, Size=Medium');
for(const t of primary.findAllWithCriteria({types:['TEXT']})){for(const segment of t.getStyledTextSegments(['fontName']))await figma.loadFontAsync(segment.fontName);}
function button(parent,label,w,color='dark'){
 const n=track(primary.createInstance());parent.appendChild(n);n.setProperties({'Label#2:0':label,'Has Icon Start#4:128':false,'Has Icon End#4:64':false});n.resize(w,46);n.cornerRadius=23;fill(n,color);
 for(const t of n.findAllWithCriteria({types:['TEXT']})){t.fontName={family:'Sarabun',style:'Bold'};t.fontSize=14;fill(t,color==='lime'?'ink':'surface');}
 return n;
}
const component=track(figma.createComponent());component.name='NutriThai / Macro row';component.layoutMode='VERTICAL';component.resize(250,86);component.primaryAxisSizingMode='FIXED';component.paddingTop=8;component.itemSpacing=10;component.fills=[];component.x=2200;
const label=text(component,'โปรตีน',250,'Body');const value=text(component,'75 / 125 กรัม',250,'Caption','muted');
const labelProp=component.addComponentProperty('Label','TEXT','โปรตีน');label.componentPropertyReferences={characters:labelProp};
const valueProp=component.addComponentProperty('Amount','TEXT','75 / 125 กรัม');value.componentPropertyReferences={characters:valueProp};
const trackBar=frame(component,'Progress track',250,8,'canvas','HORIZONTAL',0);const bar=frame(trackBar,'Progress fill',150,8,'mint','HORIZONTAL',0);bar.cornerRadius=trackBar.cornerRadius=4;
const images=[];
function bowl(parent,size){const n=track(figma.createRectangle());n.name='Decorative food bowl';n.resize(size,size);n.fills=[];parent.appendChild(n);images.push(n.id);return n;}
function macrosCard(parent,w){const n=card(parent,'สารอาหารวันนี้',w,350);text(n,'สารอาหารวันนี้',w-40,'Heading');for(const [name,amount]of[['โปรตีน','75 / 125 กรัม'],['คาร์โบไฮเดรต','145 / 250 กรัม'],['ไขมัน','40 / 56 กรัม']]){const inst=track(component.createInstance());n.appendChild(inst);inst.resize(w-40,86);inst.setProperties({[labelProp]:name,[valueProp]:amount});}return n;}
function energy(parent,w){const n=card(parent,'พลังงานวันนี้',w,300);text(n,'พลังงานวันนี้',w-40,'Heading');const svg=track(figma.createNodeFromSvg('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><circle cx="100" cy="100" r="84" fill="none" stroke="#edf1ec" stroke-width="15"/><circle cx="100" cy="100" r="84" fill="none" stroke="#a9dc94" stroke-width="15" stroke-linecap="round" stroke-dasharray="327 528" transform="rotate(-90 100 100)"/><text x="100" y="103" text-anchor="middle" font-family="Nunito" font-size="34" font-weight="800" fill="#222b2e">1,240</text><text x="100" y="126" text-anchor="middle" font-family="Sarabun" font-size="12" fill="#657373">จาก 2,000 kcal</text></svg>'));n.appendChild(svg);n.counterAxisAlignItems='CENTER';text(n,'เหลืออีก 760 kcal',w-40,'Body','brand');return n;}
function hero(parent,w,mobile){const n=card(parent,'ทุกมื้อดี เริ่มที่การเลือก',w,mobile?210:276,'lime');n.layoutMode='HORIZONTAL';n.itemSpacing=0;n.counterAxisAlignItems='CENTER';const pic=bowl(n,mobile?142:180);const copy=frame(n,'Hero copy',w-(mobile?166:220),mobile?172:220,'lime','VERTICAL',0);text(copy,'EAT WELL, LIVE WELL',copy.width,'Caption','brand');text(copy,'ทุกมื้อดี\nเริ่มที่การเลือก',copy.width,mobile?'Heading':'Title');text(copy,'ดูแลเป้าหมายของคุณในทุกวัน',copy.width,'Caption','muted');button(copy,'＋ บันทึกอาหาร',Math.min(copy.width,164));return n;}
function trend(parent,w){const n=card(parent,'พลังงานสัปดาห์นี้',w,276,'dark');text(n,'พลังงานสัปดาห์นี้',w-40,'Heading','surface');text(n,'จันทร์–อาทิตย์ · kcal',w-40,'Caption','mint');const svg=track(figma.createNodeFromSvg('<svg xmlns="http://www.w3.org/2000/svg" width="280" height="130" viewBox="0 0 280 130"><path d="M0 30H280M0 70H280M0 110H280" stroke="#52605f" stroke-opacity=".35"/><path d="M4 95L49 56L94 81L139 64L184 34L229 48L274 86" stroke="#dff59e" stroke-width="3" fill="none"/><path d="M4 114L49 100L94 105L139 79L184 86L229 96L274 88" stroke="#89d0c3" stroke-width="2" fill="none"/></svg>'));n.appendChild(svg);svg.resize(w-40,130);text(n,'จ.      อ.      พ.      พฤ.      ศ.      ส.      อา.',w-40,'Caption','surface');return n;}
function meals(parent,w){const n=card(parent,'มื้ออาหารของคุณ',w,350);text(n,'มื้ออาหารของคุณ',w-40,'Heading');for(const [label,kcal,color] of [['มื้อเช้า','320 kcal','aqua'],['มื้อกลางวัน','650 kcal','lime'],['ของว่าง','270 kcal','canvas']]){const row=frame(n,label,w-40,68,color,'HORIZONTAL',14);text(row,label,w-150,'Body');text(row,kcal,80,'Body');}button(n,'＋ เพิ่มมื้ออาหาร',w-40,'lime');return n;}
function calendar(parent,w){const n=card(parent,'สัปดาห์ปัจจุบัน',w,115);text(n,'สัปดาห์นี้',w-40,'Heading');text(n,'จ.    อ.    พ.    พฤ.    ศ.    ส.    อา.',w-40,'Caption','muted');return n;}
function scan(parent,w){const n=card(parent,'สแกนอาหารด้วย AI',w,190,'aqua');text(n,'สแกนอาหารด้วย AI',w-40,'Heading');text(n,'ถ่ายภาพ แล้วตรวจข้อมูลก่อนบันทึก',w-40,'Body','muted');button(n,'↗ เริ่มสแกนอาหาร',w-40);return n;}
const desktop=frame(page,'Dashboard / Desktop · 1440',1440,1010,'canvas','HORIZONTAL',16);desktop.x=100;desktop.itemSpacing=24;
const sidebar=frame(desktop,'Sidebar',216,978,'dark','VERTICAL',24);sidebar.cornerRadius=28;text(sidebar,'NutriThai',168,'Title','surface');text(sidebar,'YOUR DAILY NOURISHMENT',168,'Caption','mint');
for(const [i,title]of['วันนี้','เพิ่มอาหาร','ประวัติอาหาร','สแกนอาหาร AI','ข้อมูลเชิงลึก'].entries()){const row=frame(sidebar,title,168,54,i===0?'lime':'dark','HORIZONTAL',14);row.cornerRadius=16;text(row,title,140,'Body',i===0?'ink':'surface');}
text(sidebar,'ทีละมื้อ ทีละวัน',168,'Caption','mint');
const content=frame(desktop,'Content',1168,978,'canvas','VERTICAL',16);content.itemSpacing=24;text(content,'วันนี้ กินดีขึ้นอีกนิด',1136,'Title');text(content,'สวัสดี คุณ · บันทึกทีละมื้อ เห็นภาพรวมทั้งวัน',1136,'Body','muted');
const layout=frame(content,'Dashboard grid',1136,750,'canvas','HORIZONTAL',0);layout.itemSpacing=20;const main=frame(layout,'Main',824,730,'canvas','VERTICAL',0);main.itemSpacing=20;const top=frame(main,'Hero and weekly chart',824,276,'canvas','HORIZONTAL',0);top.itemSpacing=20;hero(top,432,false);trend(top,372);
const bottom=frame(main,'Macros and meals',824,350,'canvas','HORIZONTAL',0);bottom.itemSpacing=20;macrosCard(bottom,322);meals(bottom,482);
const rail=frame(layout,'Daily summary',292,750,'canvas','VERTICAL',0);rail.itemSpacing=20;calendar(rail,292);energy(rail,292);scan(rail,292);
const mobile=frame(page,'Dashboard / Mobile · 390',390,1690,'canvas','VERTICAL',20);mobile.x=1620;mobile.itemSpacing=20;text(mobile,'NutriThai',350,'Heading');text(mobile,'วันนี้ กินดีขึ้นอีกนิด',350,'Title');text(mobile,'บันทึกทีละมื้อ ดูแลตัวเองไปด้วยกัน',350,'Caption','muted');hero(mobile,350,true);energy(mobile,350);macrosCard(mobile,350);meals(mobile,350);scan(mobile,350);
const nav=frame(mobile,'Bottom navigation',350,66,'surface','HORIZONTAL',10);nav.itemSpacing=8;for(const title of ['วันนี้','เพิ่มอาหาร','ประวัติ','สแกน AI','ข้อมูล'])text(nav,title,58,'Caption',title==='วันนี้'?'brand':'muted');
return {desktopId:desktop.id,mobileId:mobile.id,imageSlots:images,createdNodeIds:created,variableCollectionId:collection.id,variables:Object.keys(vars),styles:Object.keys(styles),editableTextCount:desktop.findAllWithCriteria({types:['TEXT']}).length+mobile.findAllWithCriteria({types:['TEXT']}).length};
