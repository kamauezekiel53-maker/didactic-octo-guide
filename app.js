/* =========================
   CONFIG
========================= */
const API_BASE = 'https://movieapi.giftedtech.co.ke/api';
const CACHE_TTL = 1000 * 60 * 5; // 5 min cache

/* -------------------------
   small DOM helpers
------------------------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function el(tag, attrs={}, children=[]){
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k,v])=>{
    if(k==='class') e.className=v;
    else if(k==='html') e.innerHTML=v;
    else if(k==='text') e.textContent=v;
    else e.setAttribute(k,v);
  });
  (Array.isArray(children)?children:[children]).forEach(c=>{
    if(!c) return;
    if(typeof c === 'string') e.appendChild(document.createTextNode(c));
    else e.appendChild(c);
  });
  return e;
}

/* -------------------------
   very small local cache
------------------------- */
function cacheSet(key, value){
  const payload = { ts: Date.now(), v: value };
  try { localStorage.setItem(key, JSON.stringify(payload)); } catch(e){}
}
function cacheGet(key, ttl = CACHE_TTL){
  try {
    const raw = localStorage.getItem(key);
    if(!raw) return null;
    const parsed = JSON.parse(raw);
    if(Date.now() - parsed.ts > ttl) { localStorage.removeItem(key); return null; }
    return parsed.v;
  } catch(e){ return null; }
}

/* -------------------------
   network helpers
------------------------- */
async function apiFetch(path){
  const url = `${API_BASE}${path}`;
  const cached = cacheGet(url);
  if(cached) return cached;
  const r = await fetch(url);
  if(!r.ok) throw new Error('Network error ' + r.status);
  const j = await r.json();
  cacheSet(url, j);
  return j;
}

/* =========================
   SEARCH + HOME
========================= */
const resultsEl = $('#results');
const resultsCount = $('#resultsCount');
const qInput = $('#q');
const searchBtn = $('#searchBtn');
const popularBtn = $('#popularBtn');

let searchTimer = null;
function debounce(fn, wait=300){
  return (...args) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(()=> fn(...args), wait);
  };
}

async function searchGifted(q){
  if(!q) return null;
  try{
    const data = await apiFetch(`/search/${encodeURIComponent(q)}`);
    return data;
  }catch(err){
    console.warn('search failed', err);
    return null;
  }
}

function renderResults(items){
  if(!resultsEl) return;
  resultsEl.innerHTML = '';
  if(!items || items.length === 0){
    resultsCount.textContent = 'No results';
    resultsEl.appendChild(el('div',{text:'No movies or series found.'}));
    return;
  }
  resultsCount.textContent = `${items.length} results`;
  items.forEach(it=>{
    const card = el('div',{class:'card'});
    const img = el('img',{class:'poster', src: it.cover?.url || it.thumbnail || ''});
    const meta = el('div',{class:'meta'});
    const h = el('h3',{text: it.title});
    const g = el('p',{class:'small', text: `${it.year || ''} • ${it.type || ''}`});
    meta.appendChild(h); meta.appendChild(g);
    card.appendChild(img); card.appendChild(meta);

    // navigate to movie or series page depending on type
    card.addEventListener('click', () => {
      const id = it.subjectId || it.id || it._id || it.detailPath;
      if(!id) return;
      if((it.type || '').toLowerCase().includes('series') || (it.isSeries || false)){
        window.location.href = `series.html?id=${id}`;
      } else {
        window.location.href = `movie.html?id=${id}`;
      }
    });

    resultsEl.appendChild(card);
  });
}

/* debounce wired to input */
if (qInput) {
  qInput.addEventListener('input', debounce(async (e) => {
    const q = e.target.value.trim();
    if(!q) { /* optionally load trending */ return; }
    const data = await searchGifted(q);
    const items = data?.results?.items || data?.results || [];
    renderResults(items);
  }, 350));
}

/* button actions */
searchBtn?.addEventListener('click', async ()=>{
  const q = qInput.value.trim();
  if(!q) return;
  const data = await searchGifted(q);
  const items = data?.results?.items || data?.results || [];
  renderResults(items);
});

popularBtn?.addEventListener('click', async ()=>{
  resultsEl.innerHTML = '<div class="small">Loading...</div>';
  const keys = ['trending','popular','top'];
  for(const k of keys){
    try{
      const data = await apiFetch(`/search/${encodeURIComponent(k)}`);
      const items = data?.results?.items || data?.results || [];
      if(items.length){ renderResults(items); return; }
    }catch(e){}
  }
  resultsEl.innerHTML = '<div class="small">No trending results found.</div>';
});

/* =========================
   MOVIE PAGE (selectMovie already from your original)
========================= */

/* re-use existing global names for compatibility */
const player = $('#player');
const playerSource = $('#playerSource');
const qualitySelect = $('#qualitySelect');
const subtitleSelect = $('#subtitleSelect');
const openSource = $('#openSource');
const downloadBtn = $('#downloadBtn');
const quickSources = $('#quickSources');
const quickSubs = $('#quickSubs');
const infoBox = $('#infoBox');
const trailerContainer = $('#trailerContainer');

let currentSources = [];
let currentSubtitles = [];
let currentMovie = null;

async function selectMovie(movieId){
  if(!movieId) return;
  if(infoBox) infoBox.innerHTML = '<h3>Loading...</h3>';
  currentSources = []; currentSubtitles = [];
  if(qualitySelect) qualitySelect.innerHTML = '<option value="">Select quality</option>';
  if(subtitleSelect) subtitleSelect.innerHTML = '<option value="">Subtitles (none)</option>';
  if(quickSources) quickSources.innerHTML = '';
  if(quickSubs) quickSubs.innerHTML = '';
  if(downloadBtn) downloadBtn.removeAttribute('href');

  try{
    // info
    const infoData = await apiFetch(`/info/${movieId}`);
    const subject = infoData?.results?.subject || infoData?.results || {};
    currentMovie = subject;
    // render info
    if(infoBox){
      infoBox.innerHTML = '';
      const title = el('h2',{text: subject.title || subject.name || 'Untitled'});
      const desc = el('p',{text: subject.description || subject.overview || subject.postTitle || ''});
      const cover = el('img',{src: subject.cover?.url || subject.thumbnail || '', style:'width:100%; max-width:360px; border-radius:6px'});
      infoBox.appendChild(title);
      infoBox.appendChild(desc);
      if(cover.src) infoBox.appendChild(cover);
    }

    // trailer (if available)
    // try /trailer/{id}
    let trailerData = null;
    try { trailerData = await apiFetch(`/trailer/${movieId}`); } catch(e){}
    if(!trailerData || (!trailerData?.results && !trailerData?.result)){
      // some deployments include trailer inside info
      trailerData = subject?.trailer || subject?.trailerUrl || null;
    }
    renderTrailer(trailerData);

    // sources
    const srcResp = await apiFetch(`/sources/${movieId}`);
    const sources = srcResp?.results || [];
    currentSources = Array.isArray(sources) ? sources : (sources ? [sources] : []);
    // subtitles may be in srcResp or subject
    currentSubtitles = srcResp?.subtitles || subject?.subtitlesList || subject?.subtitles || [];

    // quick sources & quality select
    if(quickSources) quickSources.innerHTML = '';
    currentSources.forEach((s, i) => {
      const label = s.quality || s.resolution || s.label || 'auto';
      const btn = el('div',{class:'src', text: label});
      btn.addEventListener('click', ()=> playSourceByIndex(i));
      quickSources.appendChild(btn);
      // quality select
      if(qualitySelect){
        const url = s.stream_url || s.download_url || s.url || s.file || '';
        const opt = el('option',{value:url, text: `${label} • ${bytesTo(s.size)}`});
        qualitySelect.appendChild(opt);
      }
    });

    // subtitles
    if(Array.isArray(currentSubtitles) && currentSubtitles.length){
      quickSubs.innerHTML = '';
      currentSubtitles.forEach(sub=>{
        const name = sub.lanName || sub.label || sub.lan || sub;
        const div = el('div',{class:'sub', text: name});
        div.addEventListener('click', ()=> setSubtitle(sub));
        quickSubs.appendChild(div);
        if(subtitleSelect){
          const opt = el('option',{value: sub.url || sub.file || '', text: name});
          subtitleSelect.appendChild(opt);
        }
      });
    }

    // auto-play best quality (choose highest numeric if provided)
    const sorted = currentSources.slice().sort((a,b)=>{
      const aa = parseInt(a.quality) || parseInt(a.resolution) || 0;
      const bb = parseInt(b.quality) || parseInt(b.resolution) || 0;
      return bb - aa;
    });
    const best = sorted[0];
    if(best){
      const url = best.stream_url || best.download_url || best.url || '';
      setPlayerSource(url);
      if(downloadBtn) downloadBtn.href = url;
      if(openSource) openSource.href = url;
      // highlight first quick source if exists
      if(quickSources && quickSources.firstChild) quickSources.firstChild.classList.add('active');
    }

    // events
    if(qualitySelect) qualitySelect.onchange = ()=> setPlayerSource(qualitySelect.value);
    if(subtitleSelect) subtitleSelect.onchange = ()=> {
      if(!subtitleSelect.value) removeTracks();
      else addTrack(subtitleSelect.value, subtitleSelect.selectedOptions[0].text);
    };

  }catch(err){
    console.error('selectMovie error', err);
    if(infoBox) infoBox.innerHTML = '<h3>Error loading movie</h3>';
  }
}

/* helper implemented earlier */
function bytesTo(size){
  if(!size) return '—';
  const b = parseInt(size,10);
  if(isNaN(b)) return size;
  if(b < 1024) return b + ' B';
  if(b < 1024**2) return (b/1024).toFixed(1) + ' KB';
  if(b < 1024**3) return (b/1024**2).toFixed(2) + ' MB';
  return (b/1024**3).toFixed(2) + ' GB';
}

/* Trailer rendering: supports direct mp4 or youtube links */
function renderTrailer(data){
  if(!trailerContainer) return;
  trailerContainer.innerHTML = '';
  if(!data) return;
  // If data has results array -> use first
  let t = Array.isArray(data?.results) ? data.results[0] : (data?.result || data);
  if(!t) return;
  const url = t.url || t.trailer || t.source || t.file || '';
  if(!url) return;
  // If youtube link
  if(url.includes('youtube.com') || url.includes('youtu.be')){
    // extract id
    let id = '';
    try {
      const u = new URL(url);
      if(u.hostname.includes('youtu.be')) id = u.pathname.slice(1);
      else id = u.searchParams.get('v') || '';
    } catch(e){}
    if(id){
      const iframe = el('iframe', {src:`https://www.youtube.com/embed/${id}`, frameborder:0, allow:'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture', allowfullscreen:true});
      trailerContainer.appendChild(iframe);
      return;
    }
  }
  // otherwise attempt to play in HTML5 video element
  const vid = el('video',{controls:true});
  const src = el('source',{src:url, type:'video/mp4'});
  vid.appendChild(src);
  trailerContainer.appendChild(vid);
}

/* play a source by currentSources index */
function playSourceByIndex(i){
  const s = currentSources[i];
  const url = s?.stream_url || s?.download_url || s?.url || s?.file || '';
  if(!url) return alert('No playable url');
  setPlayerSource(url);
  if(qualitySelect) qualitySelect.value = url;
  if(downloadBtn) downloadBtn.href = url;

  // highlight quick sources
  if(quickSources) Array.from(quickSources.children).forEach((c, idx)=> c.classList.toggle('active', idx===i));
}

/* player + subtitles handlers */
function setPlayerSource(url){
  if(!player) return;
  try{
    player.pause();
    removeTracks();
    if(playerSource) playerSource.src = url;
    player.load();
    player.play().catch(()=>{});
    if(openSource) openSource.href = url;
    if(downloadBtn) downloadBtn.href = url;
  }catch(e){ console.warn('setPlayerSource', e); }
}

function addTrack(url, label){
  if(!player) return;
  removeTracks();
  if(!url) return;
  try{
    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.label = label || 'sub';
    track.src = url;
    track.default = true;
    player.appendChild(track);
    setTimeout(()=> { try{ player.querySelector('track').mode = 'showing'; }catch(e){} }, 300);
  }catch(e){ console.warn('addTrack', e); }
}
function removeTracks(){ if(!player) return; player.querySelectorAll('track').forEach(t=>t.remove()); }
function setSubtitle(sub){
  const url = sub.url || sub.file || '';
  const name = sub.label || sub.lanName || sub.lan || sub;
  const active = Array.from(player.querySelectorAll('track')).some(t => t.src === url);
  if(active) removeTracks(); else addTrack(url, name);
  if(quickSubs) Array.from(quickSubs.children).forEach(c => c.classList.toggle('active', c.textContent === name));
}

/* PIP toggle */
$('#togglePip')?.addEventListener('click', async ()=>{
  try{
    if(document.pictureInPictureElement) await document.exitPictureInPicture();
    else if(player?.requestPictureInPicture) await player.requestPictureInPicture();
  }catch(e){}
});

/* =========================
   SERIES PAGE
========================= */
async function loadSeries(seriesId){
  const target = $('#seriesInfo');
  if(!target) return;
  target.innerHTML = '<h3>Loading series...</h3>';

  try{
    // attempt /series/{id}
    let sdata = null;
    try { sdata = await apiFetch(`/series/${seriesId}`); } catch(e){ sdata = null; }
    if(!sdata){
      // fallback: try info endpoint (some deployments store series in info)
      const info = await apiFetch(`/info/${seriesId}`);
      sdata = info?.results?.subject || info?.results || null;
    }
    if(!sdata){ target.innerHTML = '<h3>Series info not available</h3>'; return; }

    // render series info
    target.innerHTML = '';
    const title = el('h2',{text: sdata.title || sdata.name || 'Untitled'});
    const desc = el('p',{text: sdata.description || sdata.overview || sdata.postTitle || ''});
    const img = el('img',{src: sdata.cover?.url || sdata.thumbnail || '', style:'width:220px;border-radius:8px;display:block;margin-bottom:10px'});
    target.appendChild(title); target.appendChild(img); target.appendChild(desc);

    // seasons — try sdata.seasons or fetch /episodes/{seriesId}/{season}
    const seasonsWrap = $('#seasons');
    seasonsWrap.innerHTML = '';

    const seasons = sdata.seasons || sdata?.seasonCount || sdata?.seasonsList || [];
    if(Array.isArray(seasons) && seasons.length){
      seasons.forEach(se => {
        const btn = el('button',{class:'seasonBtn', text: se.title || ('Season ' + (se.season || se.number))});
        btn.addEventListener('click', ()=> loadEpisodes(seriesId, se.season || se.number || se.id));
        seasonsWrap.appendChild(btn);
      });
    } else if (sdata.seasonCount){
      // render simple numeric season buttons
      const count = parseInt(sdata.seasonCount) || 0;
      for(let i=1;i<=count;i++){
        const btn = el('button',{class:'seasonBtn', text: 'Season ' + i});
        btn.addEventListener('click', ()=> loadEpisodes(seriesId, i));
        seasonsWrap.appendChild(btn);
      }
    } else {
      seasonsWrap.innerHTML = '<div class="small">No seasons metadata — trying episodes endpoint</div>';
      // try load season 1 by default
      const tryLoad = await loadEpisodes(seriesId, 1);
      if(!tryLoad) seasonsWrap.innerHTML += '<div class="small">No seasons or episodes available.</div>';
    }

  }catch(e){
    console.error('loadSeries err', e);
    target.innerHTML = '<h3>Error loading series</h3>';
  }
}

/* load episodes for a season */
async function loadEpisodes(seriesId, season){
  const epWrap = $('#episodes');
  const epSection = $('#episodesWrap');
  epWrap.innerHTML = '<div class="small">Loading episodes...</div>';
  epSection.style.display = 'block';

  try{
    // try two common patterns: /api/episodes/{seriesId}/{season} OR /api/episodes?series={id}&season={n}
    let data = null;
    try { data = await apiFetch(`/episodes/${seriesId}/${season}`); } catch(e){ data = null; }
    if(!data){
      try { data = await apiFetch(`/episodes/${seriesId}?season=${season}`); } catch(e){ data = null; }
    }
    if(!data) {
      epWrap.innerHTML = '<div class="small">Episodes not available for this series/season.</div>';
      return false;
    }
    const eps = data?.results || data?.episodes || data || [];
    if(!eps || !eps.length){
      epWrap.innerHTML = '<div class="small">No episodes found.</div>';
      return false;
    }
    epWrap.innerHTML = '';
    eps.forEach(ep=>{
      const c = el('div',{class:'card'});
      const img = el('img',{class:'poster', src: ep.cover?.url || ep.thumbnail || ''});
      const m = el('div',{class:'meta'});
      m.appendChild(el('h4',{text: ep.title || ep.episodeName || ('Episode ' + (ep.episode || ep.number || ''))}));
      m.appendChild(el('p',{class:'small', text: ep.overview || ep.description || ''}));
      c.appendChild(img); c.appendChild(m);
      c.addEventListener('click', ()=> loadEpisodePlayer(seriesId, season, ep.episode || ep.number || ep.id || ep._id));
      epWrap.appendChild(c);
    });
    return true;
  }catch(err){
    console.error('loadEpisodes err', err);
    epWrap.innerHTML = '<div class="small">Error loading episodes</div>';
    return false;
  }
}

/* load episode player + sources */
async function loadEpisodePlayer(seriesId, season, episodeId){
  // show player area
  const playerSection = $('#episodePlayer');
  const episodeTitle = $('#episodeName');
  const episodeVideo = $('#episodeVideo');
  const episodeSource = $('#episodeSource');
  const esourcesWrap = $('#episodeSources');

  playerSection.style.display = 'block';
  episodeVideo.pause();
  episodeSource.src = '';
  esourcesWrap.innerHTML = '';

  try{
    // common endpoints: /sources/{episodeId} or /sources/{seriesId}/{season}/{episode}
    let srcData = null;
    try { srcData = await apiFetch(`/sources/${episodeId}`); } catch(e){ srcData = null; }
    if(!srcData){
      try { srcData = await apiFetch(`/sources/${seriesId}/${season}/${episodeId}`); } catch(e){ srcData = null; }
    }
    if(!srcData){
      // fallback to /info/{episodeId}
      try { const info = await apiFetch(`/info/${episodeId}`); srcData = info?.results; } catch(e){ srcData = null; }
    }
    if(!srcData){ esourcesWrap.innerHTML = '<div class="small">No sources found for this episode</div>'; return; }

    const sources = srcData?.results || [];
    if(!sources || !sources.length){ esourcesWrap.innerHTML = '<div class="small">No sources</div>'; return; }

    // pick best and populate
    const best = sources[sources.length - 1];
    const bestUrl = best.stream_url || best.download_url || best.url || '';
    if(bestUrl){ episodeSource.src = bestUrl; episodeVideo.load(); episodeVideo.play().catch(()=>{}); }

    sources.forEach((s, i) => {
      const url = s.stream_url || s.download_url || s.url || '';
      const btn = el('div',{class:'src', text: s.quality || s.resolution || 'auto'});
      btn.addEventListener('click', ()=> { episodeSource.src = url; episodeVideo.load(); episodeVideo.play().catch(()=>{}); });
      esourcesWrap.appendChild(btn);
    });

    // set title
    episodeTitle.textContent = (srcData?.title || 'Episode').toString();

  }catch(err){
    console.error('loadEpisodePlayer err', err);
    esourcesWrap.innerHTML = '<div class="small">Error loading episode</div>';
  }
}

/* small safety: export functions to global so inline scripts in pages can call them */
window.selectMovie = selectMovie;
window.loadSeries = loadSeries;
window.loadEpisodes = loadEpisodes;
window.loadEpisodePlayer = loadEpisodePlayer;

/* =========================
   initial default for index page
========================= */
(async function init(){
  // if resultsEl exists, we are on index page — fetch trending
  if(!resultsEl) return;
  try{
    const data = await apiFetch('/search/popular');
    const items = data?.results?.items || data?.results || [];
    renderResults(items);
  }catch(e){
    console.warn('init trending failed', e);
    resultsEl.innerHTML = '<div class="small">Start by searching above</div>';
  }
})(); 
