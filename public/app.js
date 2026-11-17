const $=id=>document.getElementById(id);
let video,S=[];
const st=t=>$('st').textContent=t;
const seek=t=>new Promise(r=>{video.onseeked=r;video.currentTime=t});
const tc=t=>`${String(Math.floor(t/60)).padStart(2,'0')}:${(t%60).toFixed(1).padStart(4,'0')}`;
const srt=t=>new Date(t*1000).toISOString().substr(11,12).replace('.',',');
const q=v=>`"${String(v??'').replace(/"/g,'""')}"`;
const b64=b=>new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(b)});
const img=async b=>({type:'image',source:{type:'base64',media_type:'image/jpeg',data:await b64(b)}});
const fname=s=>`scene_${String(s.id).padStart(3,'0')}_${Math.floor(s.start/60)}m${Math.floor(s.start%60)}s`;

async function shot(t){
  await seek(t);
  const c=document.createElement('canvas'),w=Math.min(960,video.videoWidth);
  c.width=w;c.height=Math.round(w*video.videoHeight/video.videoWidth);
  c.getContext('2d').drawImage(video,0,0,c.width,c.height);
  return new Promise(r=>c.toBlob(r,'image/jpeg',.85));
}

// Langkah 1: scene detection dinamis (selisih piksel antar sampel 0,25 detik)
$('go1').onclick=async()=>{
  const f=$('file').files[0];if(!f)return alert('Pilih video dulu');
  video=document.createElement('video');video.muted=true;video.src=URL.createObjectURL(f);
  await new Promise(r=>video.onloadedmetadata=r);
  const dur=video.duration,th=+$('th').value,minD=+$('min').value;
  const c=document.createElement('canvas');c.width=64;c.height=36;
  const x=c.getContext('2d',{willReadFrequently:true});
  let prev=null,cuts=[0],last=0;
  for(let t=0;t<dur;t+=.25){
    await seek(t);x.drawImage(video,0,0,64,36);
    const d=x.getImageData(0,0,64,36).data;
    if(prev){
      let s=0;for(let i=0;i<d.length;i+=4)s+=Math.abs(d[i]-prev[i])+Math.abs(d[i+1]-prev[i+1])+Math.abs(d[i+2]-prev[i+2]);
      if(s/(d.length*.75)>th&&t-last>=minD){cuts.push(t);last=t}
    }
    prev=d;st(`Mendeteksi adegan... ${Math.round(t/dur*100)}%`);
  }
  S=cuts.map((s,i)=>({id:i+1,start:s,end:cuts[i+1]??dur}));
  for(const s of S){
    st(`Mengambil frame adegan ${s.id}/${S.length}`);
    s.a=await shot(Math.min(s.start+.3,s.end-.05));  // frame A: sedikit setelah cut
    s.b=await shot(Math.max(s.end-.3,s.start));      // frame B: sedikit sebelum cut berikutnya
  }
  $('grid').innerHTML='';
  S.forEach(s=>{const fg=document.createElement('figure');
    fg.innerHTML=`<img alt="Adegan ${s.id}" src="${URL.createObjectURL(s.a)}">#${s.id} ${tc(s.start)}-${tc(s.end)}`;$('grid').append(fg)});
  st(`${S.length} adegan terdeteksi. Geser sensitivitas lalu deteksi ulang jika kurang pas, atau lanjut ekspor.`);
  $('go2').disabled=false;
};

// Langkah 2: analisis Claude (via /api/analyze) lalu ZIP
const SYS='Kamu analis storyboard animasi. Balas HANYA dengan JSON valid, tanpa markdown.';
const ask=async content=>{
  const r=await fetch('/api/analyze',{method:'POST',headers:{'content-type':'application/json','x-app-key':$('pw').value},body:JSON.stringify({system:SYS,content})});
  const j=await r.json();if(!r.ok)throw new Error(j.error?.message||r.status);
  return JSON.parse(j.content.map(c=>c.text||'').join('').replace(/```json|```/g,'').trim());
};

const save=async z=>{const a=document.createElement('a');a.href=URL.createObjectURL(await z.generateAsync({type:'blob'}));a.download='video-decode.zip';a.click();st('Selesai. ZIP terunduh.')};
const PROMPT=`# Cara pakai
1. Unggah semua gambar dalam SATU folder batch beserta scenes.csv ke chat, lalu tempel instruksi di bawah garis.
2. Batch berikutnya: unggah folder batch itu dan tulis "Lanjut batch 02, pakai style bible yang sama."

---
Kamu analis storyboard animasi. Gambar yang kuunggah adalah frame A (awal) dan frame B (akhir) tiap adegan. Nama file memuat nomor adegan dan waktu mulai; scenes.csv berisi waktu mulai, selesai, dan durasi.

Untuk batch pertama, buat dulu style bible: gaya visual, palet warna, kamera, pencahayaan, dan character bible (ciri fisik, kostum, ekspresi khas tiap karakter).

Lalu untuk setiap adegan berikan:
1. image_prompt: prompt bahasa Inggris untuk membuat gambar serupa frame A (gaya, karakter, warna, kamera, cahaya), plus negative prompt
2. Narasi adegan dari A ke B (maks 3 kalimat, bahasa Indonesia)
3. Voice over narator bahasa Indonesia dengan timestamp [mm:ss-mm:ss], panjang menyesuaikan durasi (sekitar 2,5 kata per detik), nada: santai dan informatif
4. Jenis shot, gerak kamera, catatan musik/SFX

Tampilkan per adegan agar mudah disalin. Pakai style bible yang sama di semua batch.
`;
$('go2').onclick=async()=>{
  const ai=!!$('pw').value;let bible={style_guide:'',characters:[]};
  if(ai){try{
    st('Membuat style bible...');
    const pick=S.filter((_,i)=>i%Math.max(1,Math.ceil(S.length/4))===0).slice(0,4);
    bible=await ask([...await Promise.all(pick.map(s=>img(s.a))),{type:'text',text:'Dari frame video animasi ini, buat style bible. JSON: {"style_guide":"gaya visual, palet warna, kamera, pencahayaan (bahasa Indonesia)","characters":[{"name":"","description":"ciri fisik, kostum, ekspresi khas (bahasa Indonesia)"}]}'}]);
  }catch(e){return st('Gagal membuat style bible: '+e.message)}}
  for(const s of S){
    if(!ai)break;st(`Menganalisis adegan ${s.id}/${S.length}`);
    const dur=s.end-s.start,words=Math.round(dur*2.5);
    try{Object.assign(s,await ask([
      {type:'text',text:'Frame A (awal adegan):'},await img(s.a),
      {type:'text',text:'Frame B (akhir adegan):'},await img(s.b),
      {type:'text',text:`Style bible: ${JSON.stringify(bible)}\nDurasi adegan ${dur.toFixed(1)} detik. Nada narasi: ${$('tone').value}.\nJSON: {"image_prompt":"prompt bahasa Inggris untuk gambar serupa frame A: gaya, karakter, warna, kamera, cahaya","negative_prompt":"","narration":"perubahan dari A ke B, maks 3 kalimat, bahasa Indonesia","voice_over":"narasi narator bahasa Indonesia sekitar ${words} kata","shot_type":"","camera":"","music_sfx":""}`}]))}
    catch(e){s.error=e.message}
  }
  if(!ai){
    st('Menyusun ZIP untuk dianalisis di chat Claude...');
    const z=new JSZip(),B=8; // 8 adegan = 16 gambar per batch
    S.forEach(s=>{const d=z.folder('batch_'+String(Math.ceil(s.id/B)).padStart(2,'0'));d.file(fname(s)+'_A.jpg',s.a);d.file(fname(s)+'_B.jpg',s.b)});
    z.file('scenes.csv','adegan,mulai,selesai,durasi_detik,frame_A,frame_B\n'+S.map(s=>[s.id,tc(s.start),tc(s.end),(s.end-s.start).toFixed(1),fname(s)+'_A.jpg',fname(s)+'_B.jpg'].map(q).join(',')).join('\n'));
    z.file('PROMPT_UNTUK_CLAUDE.md',PROMPT);
    return save(z);
  }
  st('Menyusun ZIP...');
  const z=new JSZip(),f=z.folder('01_frames');
  S.forEach(s=>{f.file(fname(s)+'_A.jpg',s.a);f.file(fname(s)+'_B.jpg',s.b)});
  const T=(fn)=>S.map(fn).join('\n');
  z.file('00_style_bible/style_guide.md',bible.style_guide||'');
  z.file('00_style_bible/character_bible.md',(bible.characters||[]).map(c=>`## ${c.name}\n${c.description}\n`).join('\n'));
  z.file('02_prompts/image_prompts.md',T(s=>`## Adegan ${s.id} (${tc(s.start)})\n${s.image_prompt||''}\n\nNegative: ${s.negative_prompt||''}\n`));
  z.file('03_narration/scene_narration.md',T(s=>`## Adegan ${s.id} (${tc(s.start)}-${tc(s.end)})\n${s.narration||''}\n`));
  z.file('03_narration/voiceover_script.md',T(s=>`[${tc(s.start)}-${tc(s.end)}] ${s.voice_over||''}\n`));
  z.file('03_narration/voiceover.srt',S.map((s,i)=>`${i+1}\n${srt(s.start)} --> ${srt(s.end)}\n${s.voice_over||''}\n`).join('\n'));
  z.file('03_narration/timeline.csv','adegan,mulai,selesai,narasi,voice_over\n'+T(s=>[s.id,tc(s.start),tc(s.end),s.narration,s.voice_over].map(q).join(',')));
  z.file('05_data/shot_list.csv','adegan,mulai,durasi,shot,kamera,musik_sfx\n'+T(s=>[s.id,tc(s.start),(s.end-s.start).toFixed(1),s.shot_type,s.camera,s.music_sfx].map(q).join(',')));
  z.file('05_data/storyboard.json',JSON.stringify({bible,scenes:S.map(s=>({...s,a:undefined,b:undefined,frame:fname(s)}))},null,2));
  z.file('storyboard.html','<meta charset="utf-8"><title>Storyboard</title><style>body{font:14px system-ui;max-width:900px;margin:auto}.s{display:grid;grid-template-columns:1fr 1fr;gap:12px;border-top:1px solid #ccc;padding:12px 0}img{width:100%;margin-bottom:6px}</style>'+T(s=>`<div class="s"><div><img src="01_frames/${fname(s)}_A.jpg"><img src="01_frames/${fname(s)}_B.jpg"></div><div><b>${s.id}. ${tc(s.start)}-${tc(s.end)}</b><p>${s.narration||''}</p><p><i>${s.voice_over||''}</i></p><code>${s.image_prompt||''}</code></div></div>`));
  z.file('README.md','# Hasil Video Decode\nBuka storyboard.html untuk ringkasan visual. Data lengkap ada di 05_data/storyboard.json.\n');
  await save(z);
};
