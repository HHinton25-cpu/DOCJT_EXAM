const Store = {
  get(key, fallback){ try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value){ localStorage.setItem(key, JSON.stringify(value)); }
};

const Util = {
  shuffle(arr){ return [...arr].sort(() => Math.random() - 0.5); },
  byId(id){ return document.getElementById(id); },
  choiceLetter(i){ return "ABCD"[i] || ""; }
};

class AudioEngine {
  constructor(){
    this.main = Util.byId("mainMusic");
    this.boss = Util.byId("bossMusic");
    this.musicOn = Store.get("v6_music", true);
    this.sfxOn = Store.get("v6_sfx", true);
    this.current = null;
  }
  unlock(){
    [this.main,this.boss].forEach(a => { if(a){ a.volume = .28; a.load(); }});
  }
  play(kind="main"){
    if(!this.musicOn) return;
    const next = kind === "boss" ? this.boss : this.main;
    const other = kind === "boss" ? this.main : this.boss;
    if(other){ other.pause(); other.currentTime = 0; }
    if(next){ next.volume = kind === "boss" ? .42 : .28; next.play().catch(()=>{}); this.current = next; }
  }
  stop(){ [this.main,this.boss].forEach(a=>{ if(a){ a.pause(); a.currentTime = 0; }}); }
  toggleMusic(){ this.musicOn = !this.musicOn; Store.set("v6_music", this.musicOn); this.musicOn ? this.play("main") : this.stop(); UI.renderAudioButtons(); }
  toggleSfx(){ this.sfxOn = !this.sfxOn; Store.set("v6_sfx", this.sfxOn); UI.renderAudioButtons(); }
  beep(type="click"){
    if(!this.sfxOn) return;
    try{
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      const map = {click:[520,.06,"square"], correct:[760,.12,"sine"], wrong:[150,.18,"sawtooth"], warn:[880,.06,"square"], win:[660,.16,"triangle"]};
      const [freq,dur,wave] = map[type] || map.click;
      osc.frequency.value=freq; osc.type=wave; gain.gain.value=.055;
      osc.start(); osc.stop(ctx.currentTime+dur);
    } catch {}
  }
  speak(text){
    if(!this.sfxOn || !("speechSynthesis" in window)) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = .9; utter.pitch = .75; utter.volume = .72;
    speechSynthesis.cancel(); speechSynthesis.speak(utter);
  }
}

class ProgressEngine {
  static profile(){ return Store.get("v6_profile", {xp:0, answered:0, correct:0, exams:0, games:0}); }
  static save(p){ Store.set("v6_profile", p); }
  static recordAnswer(correct){
    const p=this.profile(); p.answered++; if(correct){p.correct++; p.xp+=10;} this.save(p);
  }
  static addXP(xp){ const p=this.profile(); p.xp += xp; this.save(p); }
  static history(){ return Store.get("v6_history", []); }
  static addExam(result){ const h=this.history(); h.push(result); Store.set("v6_history", h.slice(-50)); }
  static missed(){ return Store.get("v6_missed", []); }
  static addMissed(item){ const m=this.missed(); m.push(item); Store.set("v6_missed", m.slice(-300)); }
  static marked(){ return Store.get("v6_marked", []); }
  static toggleMarked(q){
    const m=this.marked(); const idx=m.findIndex(x=>x.id===q.id);
    if(idx>=0) m.splice(idx,1); else m.push({id:q.id,category:q.category,type:q.type,question:q.question,answer:q.choices[q.answer],explanation:q.explanation});
    Store.set("v6_marked", m);
  }
}

const UI = {
  current:"home",
  init(){
    document.querySelectorAll("[data-screen]").forEach(btn => btn.addEventListener("click", () => this.show(btn.dataset.screen)));
    document.querySelectorAll("[data-go]").forEach(btn => btn.addEventListener("click", () => this.show(btn.dataset.go)));
    Util.byId("musicBtn").onclick = () => App.audio.toggleMusic();
    Util.byId("sfxBtn").onclick = () => App.audio.toggleSfx();
    Util.byId("musicToggle").onclick = () => App.audio.toggleMusic();
    Util.byId("sfxToggle").onclick = () => App.audio.toggleSfx();
    Util.byId("resetBtn").onclick = () => { if(confirm("Reset progress on this device?")){ localStorage.clear(); location.reload(); } };
    this.renderAudioButtons();
    this.populateCategories();
    this.renderHome();
    this.renderBossGrid();
  },
  show(id){
    App.audio.beep("click");
    this.current=id;
    document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));
    Util.byId(id)?.classList.add("active");
    document.querySelectorAll(".nav,.mobile-nav button").forEach(b=>b.classList.toggle("active", b.dataset.screen===id));
    const titles={home:"Command Center",study:"Study Hub",exam:"Exam Simulation",games:"Games Alpha",progress:"Progress",settings:"Settings"};
    Util.byId("screenTitle").textContent=titles[id]||"DOCJT";
    if(id==="study") App.audio.speak("Study mode active.");
    if(id==="progress") this.renderProgress();
    if(id==="home") this.renderHome();
    if(id==="games") App.audio.play("main");
  },
  renderAudioButtons(){
    ["musicBtn","musicToggle"].forEach(id=>{ const el=Util.byId(id); if(el) el.textContent=App.audio.musicOn ? (id==="musicBtn"?"🎵":"On") : (id==="musicBtn"?"🔇":"Off"); });
    ["sfxBtn","sfxToggle"].forEach(id=>{ const el=Util.byId(id); if(el) el.textContent=App.audio.sfxOn ? (id==="sfxBtn"?"🔊":"On") : (id==="sfxBtn"?"🔈":"Off"); });
  },
  populateCategories(){
    const cats=["All Categories",...new Set(QUESTION_BANK.map(q=>q.category)).sort()];
    Util.byId("categorySelect").innerHTML=cats.map(c=>`<option value="${c}">${c}</option>`).join("");
    Util.byId("bankCount").textContent=QUESTION_BANK.length;
  },
  renderHome(){
    const p=ProgressEngine.profile();
    const level=Math.floor(p.xp/500)+1;
    const ranks=["Recruit","Cadet","Officer","Senior Officer","Sergeant","Lieutenant","Captain","Commander"];
    const rank=ranks[Math.min(ranks.length-1, Math.floor((level-1)/3))];
    Util.byId("rankName").textContent=rank; Util.byId("levelNum").textContent=level; Util.byId("xpText").textContent=`${p.xp} XP`; Util.byId("xpFill").style.width=`${(p.xp%500)/5}%`;
    Util.byId("sideRank").textContent=rank; Util.byId("sideXP").textContent=`${p.xp} XP`;
    const acc=p.answered?Math.round(p.correct/p.answered*100):0;
    Util.byId("profileStats").innerHTML=`<div><b>${acc}%</b>Accuracy</div><div><b>${p.answered}</b>Answered</div><div><b>${p.exams}</b>Exams</div><div><b>${p.games}</b>Games</div>`;
  },
  renderProgress(){
    const p=ProgressEngine.profile(); const acc=p.answered?Math.round(p.correct/p.answered*100):0;
    Util.byId("statsGrid").innerHTML=`<div><b>${p.xp}</b>XP</div><div><b>${p.answered}</b>Answered</div><div><b>${acc}%</b>Accuracy</div><div><b>${p.exams}</b>Exams</div>`;
    const by={};
    ProgressEngine.history().flatMap(h=>h.results||[]).forEach(r=>{by[r.category]??={right:0,total:0};by[r.category].total++;if(r.correct)by[r.category].right++;});
    Util.byId("categoryStats").innerHTML=Object.keys(by).length?Object.entries(by).sort().map(([cat,v])=>{const pct=Math.round(v.right/v.total*100);return `<div class="cat-row"><span><b>${cat}</b><b>${pct}%</b></span><div class="cat-track"><b style="width:${pct}%"></b></div></div>`}).join(""):`<p class="muted">Complete an exam or drill to build analytics.</p>`;
  },
  renderBossGrid(){
    const cats=[...new Set(QUESTION_BANK.map(q=>q.category))].sort();
    Util.byId("bossGrid").innerHTML=cats.map(c=>`<button class="mode-card bevel" data-boss="${c}"><span>👹</span><b>${c}</b><small>Category boss battle</small></button>`).join("");
    document.querySelectorAll("[data-boss]").forEach(b=>b.onclick=()=>App.boss.start(b.dataset.boss));
  }
};

class FlashcardEngine {
  constructor(bank){ this.bank=bank; this.deck=[]; this.index=0; this.flipped=false; this.mode="standard"; }
  open(mode="standard"){
    this.mode=mode;
    Util.byId("studyPanel").classList.remove("hidden");
    Util.byId("studyModeLabel").textContent = mode.replace(/^\w/, c=>c.toUpperCase());
    Util.byId("studyTitle").textContent = mode==="category"?"Category Drill":mode==="rapid"?"Rapid Review":mode==="smart"?"Smart Review":mode==="marked"?"Marked Questions":mode==="missed"?"Missed Questions":"Flashcards";
    Util.byId("flashControls").classList.toggle("hidden", !["standard","category","rapid"].includes(mode));
    this.load(mode);
    if(mode==="rapid") this.autoReveal();
  }
  pool(mode){
    if(mode==="marked"){
      const marked=ProgressEngine.marked();
      return marked.map(m=>({id:m.id,category:m.category,type:m.type,question:m.question,choices:[m.answer,"","",""],answer:0,explanation:m.explanation}));
    }
    if(mode==="missed"){
      return ProgressEngine.missed().map(m=>({id:m.id,category:m.category,type:m.type,question:m.question,choices:[m.correctAnswer,"","",""],answer:0,explanation:m.explanation}));
    }
    if(mode==="smart"){
      const ids=new Set([...ProgressEngine.missed().map(m=>m.id),...ProgressEngine.marked().map(m=>m.id)]);
      const pool=this.bank.filter(q=>ids.has(q.id));
      return pool.length?pool:this.bank;
    }
    const cat=Util.byId("categorySelect").value;
    return cat==="All Categories"?this.bank:this.bank.filter(q=>q.category===cat);
  }
  load(mode=this.mode){
    const pool=this.pool(mode);
    this.deck=Util.shuffle(pool).slice(0, mode==="rapid"?25:50).map(q=>this.prepare(q));
    this.index=0; this.flipped=false;
    App.audio.speak(mode==="smart"?"Reviewing weak areas.":"Flashcard deck loaded.");
    this.render();
  }
  prepare(q){
    if(q.choices.length<4 || !q.choices[1]){
      return {...q};
    }
    const correct=q.choices[q.answer]; const choices=Util.shuffle(q.choices);
    return {...q, choices, answer:choices.indexOf(correct)};
  }
  render(){
    const card=Util.byId("flashCard");
    Util.byId("flashAnswer").classList.add("hidden"); Util.byId("flashExplain").classList.add("hidden");
    if(!this.deck.length){
      Util.byId("flashMeta").textContent=this.mode;
      Util.byId("flashQuestion").textContent="No cards found for this study mode yet.";
      Util.byId("flashAnswer").textContent="";
      Util.byId("flashExplain").textContent="";
      Util.byId("flashProgress").textContent="";
      return;
    }
    const q=this.deck[this.index];
    Util.byId("flashMeta").textContent=`${q.category} • ${q.type}`;
    Util.byId("flashQuestion").textContent=q.question;
    Util.byId("flashAnswer").textContent=q.choices[q.answer];
    Util.byId("flashExplain").textContent=q.explanation||"";
    Util.byId("flashProgress").textContent=`Card ${this.index+1}/${this.deck.length}`;
  }
  flip(){
    if(!this.deck.length) return;
    this.flipped=!this.flipped; App.audio.beep("click");
    Util.byId("flashAnswer").classList.toggle("hidden", !this.flipped);
    Util.byId("flashExplain").classList.toggle("hidden", !this.flipped);
  }
  next(knew){
    if(!this.deck.length) return;
    const q=this.deck[this.index];
    if(knew){ App.audio.beep("correct"); ProgressEngine.addXP(5); }
    else { App.audio.beep("wrong"); ProgressEngine.addMissed({id:q.id,category:q.category,type:q.type,question:q.question,selected:"Flashcard missed",correctAnswer:q.choices[q.answer],correct:false,explanation:q.explanation}); }
    this.index=(this.index+1)%this.deck.length; this.flipped=false; this.render();
    if(this.mode==="rapid") this.autoReveal();
  }
  autoReveal(){ setTimeout(()=>{ if(this.mode==="rapid" && !this.flipped){ this.flip(); }}, 5000); }
}

class ExamEngine {
  constructor(bank){ this.bank=bank; this.quiz=[]; this.index=0; this.score=0; this.timer=null; this.results=[]; }
  start(){
    App.audio.speak("Exam simulation ready. Three. Two. One. Begin.");
    App.audio.play("main");
    this.quiz=this.sample(75).map(q=>this.prepare(q)); this.index=0; this.score=0; this.results=[];
    Util.byId("examIntro").classList.add("hidden"); Util.byId("examRunner").classList.remove("hidden");
    this.render();
  }
  sample(n){
    const cats=[...new Set(this.bank.map(q=>q.category))]; const base=Math.floor(n/cats.length); let rem=n%cats.length; let out=[];
    cats.forEach(cat=>{const pool=Util.shuffle(this.bank.filter(q=>q.category===cat)); out.push(...pool.slice(0,base+(rem-->0?1:0)));});
    return Util.shuffle(out).slice(0,n);
  }
  prepare(q){ const correct=q.choices[q.answer]; const choices=Util.shuffle(q.choices); return {...q, choices, answer:choices.indexOf(correct)}; }
  render(){
    clearInterval(this.timer);
    const q=this.quiz[this.index]; const limit=q.type==="Scenario"?45:30; let left=limit;
    Util.byId("examCat").textContent=`${q.category} • ${q.type}`;
    Util.byId("examProgress").textContent=`${this.index+1} / ${this.quiz.length}`;
    Util.byId("examScore").textContent=`Score ${this.score}`;
    Util.byId("examQuestion").textContent=q.question;
    Util.byId("timerType").textContent=q.type==="Scenario"?"Scenario: 45 sec":"Recall: 30 sec";
    Util.byId("timerText").textContent=`00:${String(left).padStart(2,"0")}`;
    Util.byId("timerFill").style.width="100%";
    Util.byId("examAnswers").innerHTML=q.choices.map((c,i)=>`<button class="answer-btn" data-answer="${i}">${c}</button>`).join("");
    document.querySelectorAll("#examAnswers [data-answer]").forEach(b=>b.onclick=()=>this.answer(Number(b.dataset.answer),false));
    Util.byId("markExamBtn").onclick=()=>{ProgressEngine.toggleMarked(q);App.audio.beep("click");};
    this.timer=setInterval(()=>{left--; Util.byId("timerText").textContent=`00:${String(Math.max(0,left)).padStart(2,"0")}`; Util.byId("timerFill").style.width=`${Math.max(0,left/limit*100)}%`; if(left<=5&&left>0)App.audio.beep("warn"); if(left<=0)this.answer(-1,true);},1000);
  }
  answer(i,timedOut){
    clearInterval(this.timer);
    const q=this.quiz[this.index]; const correct=i===q.answer;
    if(correct){this.score++;App.audio.beep("correct")}else App.audio.beep("wrong");
    ProgressEngine.recordAnswer(correct);
    if(!correct) ProgressEngine.addMissed({id:q.id,category:q.category,type:q.type,question:q.question,selected:timedOut?"Timed out":q.choices[i],correctAnswer:q.choices[q.answer],correct:false,explanation:q.explanation});
    this.results.push({id:q.id,category:q.category,type:q.type,question:q.question,correct});
    this.index++;
    if(this.index>=this.quiz.length) this.finish(); else setTimeout(()=>this.render(),250);
  }
  finish(){
    const pct=Math.round(this.score/this.quiz.length*100);
    const p=ProgressEngine.profile(); p.exams++; ProgressEngine.save(p); ProgressEngine.addExam({date:new Date().toLocaleString(),score:this.score,total:this.quiz.length,pct,results:this.results});
    ProgressEngine.addXP(this.score*2 + (pct>=80?75:0));
    App.audio.speak(pct>=80?"Certification threshold achieved.":"Additional training recommended.");
    alert(`Exam complete: ${this.score}/${this.quiz.length} (${pct}%)`);
    Util.byId("examIntro").classList.remove("hidden"); Util.byId("examRunner").classList.add("hidden");
    UI.renderHome();
  }
}

class BossEngine {
  constructor(bank){ this.bank=bank; }
  start(cat){
    App.audio.speak("Target acquired. Threat level high.");
    App.audio.play("boss");
    this.cat=cat; this.deck=Util.shuffle(this.bank.filter(q=>q.category===cat)).slice(0,15).map(q=>App.exam.prepare(q)); this.index=0; this.score=0; this.hp=100;
    Util.byId("bossRunner").classList.remove("hidden"); this.render();
  }
  render(){
    if(this.index>=this.deck.length || this.hp<=0) return this.finish();
    const q=this.deck[this.index];
    Util.byId("bossName").textContent=`${this.cat} Boss`;
    Util.byId("bossProgress").textContent=`${this.index+1} / ${this.deck.length}`;
    Util.byId("bossScore").textContent=`Score ${this.score}`;
    Util.byId("bossHP").style.width=`${this.hp}%`;
    Util.byId("bossQuestion").textContent=q.question;
    Util.byId("bossAnswers").innerHTML=q.choices.map((c,i)=>`<button class="answer-btn" data-boss-answer="${i}">${c}</button>`).join("");
    document.querySelectorAll("[data-boss-answer]").forEach(b=>b.onclick=()=>this.answer(Number(b.dataset.bossAnswer)));
  }
  answer(i){
    const q=this.deck[this.index]; const correct=i===q.answer;
    if(correct){this.score+=100;this.hp=Math.max(0,this.hp-12);App.audio.beep("correct");ProgressEngine.addXP(8);}
    else App.audio.beep("wrong");
    this.index++; setTimeout(()=>this.render(),250);
  }
  finish(){
    const p=ProgressEngine.profile(); p.games++; ProgressEngine.save(p);
    App.audio.play("main");
    App.audio.beep("win");
    alert(this.hp<=0?`Boss defeated! Score ${this.score}`:`Battle complete. Score ${this.score}`);
    UI.renderHome();
  }
}

const App = {
  audio:null, flash:null, exam:null, boss:null,
  init(){
    this.audio=new AudioEngine();
    this.flash=new FlashcardEngine(QUESTION_BANK);
    this.exam=new ExamEngine(QUESTION_BANK);
    this.boss=new BossEngine(QUESTION_BANK);
    UI.init();
    this.bind();
    this.boot();
  },
  bind(){
    Util.byId("enterBtn").onclick=()=>{this.audio.unlock(); this.audio.speak("DOCJT Academy online. Training systems ready. Question bank verified."); Util.byId("boot").classList.add("hidden"); Util.byId("app").classList.remove("hidden"); this.audio.play("main");};
    Util.byId("startExamBtn").onclick=()=>this.exam.start();
    Util.byId("closeStudyPanel").onclick=()=>Util.byId("studyPanel").classList.add("hidden");
    Util.byId("startDeckBtn").onclick=()=>this.flash.load(this.flash.mode);
    Util.byId("flipBtn").onclick=()=>this.flash.flip();
    Util.byId("knewBtn").onclick=()=>this.flash.next(true);
    Util.byId("missedBtn").onclick=()=>this.flash.next(false);
    document.querySelectorAll("[data-study]").forEach(b=>b.onclick=()=>this.flash.open(b.dataset.study==="flashcards"?"standard":b.dataset.study));
  },
  boot(){
    const lines=["Loading question bank...","Initializing audio engine...","Syncing progress...","401 questions verified."];
    let i=0;
    const tick=()=>{ if(i<lines.length){ Util.byId("bootStatus").textContent=lines[i]; Util.byId("bootFill").style.width=`${(i+1)/lines.length*100}%`; i++; setTimeout(tick,550);} else { Util.byId("enterBtn").classList.remove("hidden"); }};
    tick();
  }
};

document.addEventListener("DOMContentLoaded",()=>App.init());
