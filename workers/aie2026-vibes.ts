interface Env {
  AETHER_ASSETS: {
    get(key: string): Promise<{
      body: ReadableStream;
      httpMetadata?: { contentType?: string };
      text?: () => Promise<string>;
    } | null>;
  };
}

const DATA_KEY = 'event-recap-ai-engineer-singapore/public.json';
const MEDIA_PREFIX = 'event-recap-ai-engineer-singapore/media/';
const DATA_VERSION = 'cluster888-media873-structured-1779192998';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/vibes/aie2026/data') {
      const object = await env.AETHER_ASSETS.get(DATA_KEY);
      if (!object) return json({ ok: false, error: 'recap data not found' }, 404);
      return new Response(object.body, {
        headers: {
          'cache-control': 'public, max-age=120',
          'content-type': object.httpMetadata?.contentType ?? 'application/json; charset=utf-8',
        },
      });
    }

    if (url.pathname === '/vibes/aie2026/media') {
      const key = url.searchParams.get('path') ?? '';
      if (!key.startsWith(MEDIA_PREFIX)) return json({ ok: false, error: 'invalid media path' }, 400);
      const object = await env.AETHER_ASSETS.get(key);
      if (!object) return json({ ok: false, error: 'media not found' }, 404);
      return new Response(object.body, {
        headers: {
          'cache-control': 'public, max-age=86400',
          'content-type': object.httpMetadata?.contentType ?? contentType(key),
        },
      });
    }

    if (url.pathname === '/vibes/aie2026' || url.pathname === '/vibes/aie2026/') {
      return new Response(renderHtml(), {
        headers: {
          'cache-control': 'public, max-age=60',
          'content-type': 'text/html; charset=utf-8',
        },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function contentType(key: string): string {
  const lower = key.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'application/octet-stream';
}

function renderHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>AI Engineer Singapore vibes</title>
<style>
:root{color-scheme:light;--bg:#fbfaf7;--panel:#fffdfa;--ink:#24211f;--muted:#706960;--dim:#9b9186;--line:#e9e1d7;--accent:#de7340;--soft:#f4eee7}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
a{color:inherit}.shell{display:grid;grid-template-columns:minmax(240px,320px) minmax(0,1fr);gap:22px;max-width:1680px;margin:0 auto;padding:28px}
.side{position:sticky;top:24px;height:max-content;border:1px solid var(--line);background:var(--panel);padding:22px}.eyebrow,.chip,.meta{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:uppercase;letter-spacing:.08em}
.eyebrow{font-size:12px;color:var(--dim)}h1{font-family:Georgia,serif;font-size:42px;line-height:1.04;margin:10px 0 16px}h2{font-family:Georgia,serif;font-size:28px;line-height:1.14;margin:0}h3{font-family:Georgia,serif;font-size:22px;line-height:1.18;margin:0}
.meta{font-size:12px;color:var(--muted)}.method{margin-top:22px;border-top:1px solid var(--line);padding-top:16px}.method summary{cursor:pointer}.method p{margin:10px 0 0;color:var(--muted);font-size:14px}.method ul{margin:8px 0 0;padding-left:18px;color:var(--muted);font-size:13px}.method li{margin:4px 0}.method code{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}
.main{min-width:0}.hero{border:1px solid var(--line);background:var(--panel);padding:24px}.lede{max-width:980px;font-size:18px;color:#5b554e;margin:10px 0 0}.tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}
.chip{border:1px solid var(--line);border-radius:999px;background:#fff;padding:4px 10px;font-size:12px;color:#6f655c}.sourceMix{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:22px}
.metric{border:1px solid var(--line);background:#fff;padding:14px}.metric b{display:block;font-family:Georgia,serif;font-size:34px;line-height:1}.metric span{display:block;margin-top:6px;color:var(--muted);font-size:13px}
.wall{display:grid;grid-template-columns:repeat(6,1fr);grid-auto-rows:122px;gap:8px;margin-top:20px}.tile{display:block;overflow:hidden;border:1px solid var(--line);background:var(--soft)}.tile.big{grid-column:span 2;grid-row:span 2}.tile img{width:100%;height:100%;object-fit:cover;display:block}
.tabs{display:flex;flex-wrap:wrap;gap:8px;margin:22px 0}.tabs button{border:1px solid var(--line);background:#fff;padding:8px 14px;font:14px ui-monospace,SFMono-Regular,Menlo,monospace;cursor:pointer}.tabs button.active{border-color:var(--accent);background:var(--accent);color:#fff}
.tools{display:flex;gap:10px;align-items:center;margin-bottom:14px}.tools input{width:min(520px,100%);border:1px solid var(--line);background:#fff;padding:10px 12px;font:14px ui-monospace,SFMono-Regular,Menlo,monospace}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.card{border:1px solid var(--line);background:var(--panel);padding:18px;min-width:0}.card.hot{border-color:var(--accent)}
.mix,.snips,.info{margin-top:12px}.snip{font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted);overflow-wrap:anywhere}.post{display:grid;gap:8px;border-top:1px solid var(--line);padding:16px 0}.post:first-child{border-top:0}.post-text{font-size:15px;max-width:960px}.post-media{display:flex;gap:6px;overflow:auto}.post-media img{width:150px;height:92px;object-fit:cover;border:1px solid var(--line)}
.score{position:relative;display:inline-block}.score summary{list-style:none;cursor:help;font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted);background:#fff3ec;border:1px solid #efd2c0;border-radius:4px;padding:2px 6px}.score summary::-webkit-details-marker{display:none}.score div{position:absolute;z-index:20;left:0;top:calc(100% + 4px);width:300px;border:1px solid var(--line);background:#fff;padding:10px;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted);box-shadow:0 10px 24px #0002}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.platform{color:#5479a8}.source{color:var(--dim)}details.raw{margin-top:8px}.raw summary{cursor:pointer;color:var(--dim);font:12px ui-monospace,SFMono-Regular,Menlo,monospace}.raw dl{display:grid;grid-template-columns:120px minmax(0,1fr);gap:4px 10px;font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted)}.raw dd{margin:0;overflow-wrap:anywhere}
.pager{display:flex;justify-content:space-between;align-items:center;margin-top:12px}.pager button{border:1px solid var(--line);background:#fff;padding:7px 10px;cursor:pointer}.empty{color:var(--muted);padding:24px;border:1px solid var(--line);background:#fff}
@media(max-width:900px){.shell{display:block;padding:14px}.side{position:static;margin-bottom:14px}h1{font-size:34px}.metrics{grid-template-columns:repeat(2,1fr)}.grid{grid-template-columns:1fr}.wall{grid-template-columns:repeat(3,1fr);grid-auto-rows:100px}}
</style>
</head>
<body>
<div class="shell">
  <aside class="side">
    <p class="eyebrow">event</p>
    <h1>AI Engineer Singapore</h1>
    <p class="meta" id="dateRange">loading...</p>
    <div class="method">
      <details>
        <summary class="meta">methodology and limits</summary>
        <p>Method: seeded digital snowball sampling. Start from event names, dates, speakers, sponsors, venue terms, and source links; expand through public search surfaces, post/thread links, author links, and newly discovered phrases.</p>
        <p>This is an evidence-seeking public recap corpus, not a representative survey or full social-listening panel.</p>
        <p>X and YouTube expose public views. LinkedIn impressions are not exposed here, so LinkedIn reach uses public reactions/comments/reposts only.</p>
        <p>Score chips are normalized within each platform so high-count X posts do not swamp LinkedIn and YouTube.</p>
        <div id="methodDetails"></div>
      </details>
    </div>
  </aside>
  <main class="main">
    <section class="hero">
      <p class="eyebrow">vibe snapshot</p>
      <h2>Builder community energy, stage moments, and hallway proof.</h2>
      <p class="lede" id="lede">Loading recap...</p>
      <div class="tags" id="tags"></div>
      <div class="metrics" id="metrics"></div>
      <div class="sourceMix" id="sourceMix"></div>
      <div class="wall" id="wall"></div>
      <div class="pager"><span class="meta" id="wallCount"></span><span><button id="prevMedia">prev</button> <button id="nextMedia">next</button></span></div>
    </section>
    <nav class="tabs" id="tabs"></nav>
    <div class="tools"><input id="search" placeholder="search refs" /><span class="meta" id="visibleCount"></span></div>
    <section id="content"></section>
  </main>
</div>
<script>
const state={data:null,tab:'clusters',mediaPage:0,query:''};
const tabs=['clusters','refs','timeline','voices'];
const $=(id)=>document.getElementById(id);
const fmt=(n)=>n==null?'0':Intl.NumberFormat('en',{notation:n>=10000?'compact':'standard',maximumFractionDigits:1}).format(n);
const date=(v)=>v?new Date(v).toLocaleDateString('en-SG',{day:'numeric',month:'short',year:'numeric'}):'date pending';
const isImageUrl=(v)=>/\\.(jpe?g|png|webp|avif|gif)(\\?|$)/i.test(String(v||''));
const mediaUrl=(m)=>m.path&&isImageUrl(m.path)?'/vibes/aie2026/media?path='+encodeURIComponent(m.path):isImageUrl(m.previewUrl)?m.previewUrl:isImageUrl(m.url)?m.url:'';
const isImageMedia=(m)=>Boolean(mediaUrl(m));
const raw=(p)=> (p.metrics.likes||0)+(p.metrics.reactions||0)+2*(p.metrics.comments||0)+2*(p.metrics.reposts||0)+2*(p.metrics.replies||0)+((p.metrics.views??p.metrics.impressions??0)/200);
const score=(v,kind='eng')=>'<details class="score" title="'+(kind==='voice'?'Voice = positive post scores + log(total raw engagement).':'Raw = likes/reactions + 2x comments/reposts/replies + views/200. Score = same-platform z-score; 0 is average.')+'"><summary>'+kind+' '+Number(v||0).toFixed(2)+' ?</summary><div>'+(kind==='voice'?'Voice = positive post scores + log(total raw engagement).':'Raw = likes/reactions + 2x comments/reposts/replies + views/200. Score = same-platform z-score; 0 is average.<br><br>LinkedIn has no impressions here.')+'</div></details>';
function platformMix(ids){const posts=ids.map(id=>state.data.postsById[id]).filter(Boolean);return ['x','linkedin','youtube'].map(p=>[p,posts.filter(x=>x.platform===p).length]).filter(([,n])=>n).map(([p,n])=>'<span class="chip">'+p+' '+n+'</span>').join('')}
function clusterCoverage(){const d=state.data;if(d.clusterCoverage)return d.clusterCoverage;const ids=new Set(d.posts.map(p=>p.postId));const clustered=new Set();let root=0;let attached=0;for(const t of d.themes||[]){for(const id of t.postIds||[])if(ids.has(id))clustered.add(id);root+=new Set((t.rootPostIds||t.postIds||[]).filter(id=>ids.has(id))).size;attached+=new Set((t.attachedPostIds||[]).filter(id=>ids.has(id))).size}return{totalRefs:d.posts.length,clusteredRefs:clustered.size,rootRefs:root||clustered.size,attachedRefs:attached,unclusteredRefs:Math.max(0,d.posts.length-clustered.size)}}
function decodeText(s){const el=document.createElement('textarea');el.innerHTML=String(s||'');return el.value}
function postLine(p){return '<article class="post"><div class="row"><span class="chip platform">'+p.platform+'</span><span class="meta">'+(p.authorHandle||p.authorName||'unknown')+'</span><span class="meta">'+date(p.postedAt)+'</span>'+score(p.reachScore)+'<a class="meta" href="'+p.url+'" target="_blank" rel="noreferrer">open original</a></div><div class="post-text">'+escapeHtml(decodeText(p.text))+'</div>'+mediaStrip(p)+'<details class="raw"><summary>complete post info</summary><dl><dt>url</dt><dd><a href="'+p.url+'" target="_blank">'+p.url+'</a></dd><dt>raw engagement</dt><dd>'+raw(p).toFixed(2)+'</dd><dt>metrics</dt><dd>'+escapeHtml(JSON.stringify(p.metrics||{}))+'</dd><dt>tags</dt><dd>'+escapeHtml((p.tags||[]).join(', '))+'</dd></dl></details></article>'}
function mediaStrip(p){const imgs=(p.media||[]).filter(isImageMedia).slice(0,6);return imgs.length?'<div class="post-media">'+imgs.map(m=>'<a href="'+p.url+'" target="_blank"><img src="'+mediaUrl(m)+'" loading="lazy" alt=""></a>').join('')+'</div>':''}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function filteredPosts(){const q=state.query.toLowerCase();return state.data.posts.filter(p=>!q||[p.text,p.authorName,p.authorHandle,p.platform].join(' ').toLowerCase().includes(q))}
function renderMethodology(){const d=state.data;const cov=clusterCoverage();const m=d.methodology||{};const q=m.querySet||d.querySet||{};const x=q.x||[];const li=q.linkedin||[];const exp=m.expansionQueries||[];const yt=m.youtubeSources||[];$('methodDetails').innerHTML='<p>Source dates: '+date(m.sourceDateRange?.start)+' to '+date(m.sourceDateRange?.end)+'</p><p>Clustering: '+fmt(cov.rootRefs)+' root refs form the atlas; '+fmt(cov.attachedRefs)+' replies/comments/context refs are attached to those clusters. '+fmt(cov.unclusteredRefs)+' refs are currently unclustered.</p><details><summary class="meta">query seeds</summary><p>X '+x.length+' · LinkedIn '+li.length+' · expansion '+exp.length+'</p><ul>'+x.concat(exp).slice(0,40).map(v=>'<li><code>'+escapeHtml(v)+'</code></li>').join('')+'</ul></details><details><summary class="meta">youtube sources</summary><ul>'+yt.map(v=>'<li><a href="'+v.url+'" target="_blank" rel="noreferrer">'+escapeHtml(v.title||v.url)+'</a> <span class="meta">'+fmt(v.views)+' views</span></li>').join('')+'</ul></details>'}
function renderShell(){const d=state.data;const cov=clusterCoverage();$('dateRange').textContent=date(d.windowStart)+' to '+date(d.windowEnd)+' · refs through '+date(d.updatedAt);$('lede').textContent='A seeded snowball recap from '+fmt(d.posts.length)+' relevant public refs across X, LinkedIn, and YouTube, with media assets and source links kept attached.';$('tags').innerHTML=d.themes.slice(0,6).map(t=>'<span class="chip">'+escapeHtml(t.label)+'</span>').join('');const c=d.stats.crossSurfaceObserved||{};$('metrics').innerHTML=[['refs',d.posts.length],['known views',c.knownViews],['public reactions',c.knownLikesAndLinkedInReactions],['media assets',d.mediaTotal]].map(([k,v])=>'<div class="metric"><b>'+fmt(v)+'</b><span>'+k+'</span></div>').join('');const by=d.stats.relevantByPlatform||{};const ytVideos=d.posts.filter(p=>p.platform==='youtube'&&p.tags?.includes('youtube-video')).length;$('sourceMix').innerHTML=['x '+fmt(by.x||0),'linkedin '+fmt(by.linkedin||0),'youtube '+fmt(by.youtube||0),'yt videos '+fmt(ytVideos),'clustered '+fmt(cov.clusteredRefs)+'/'+fmt(cov.totalRefs),'root anchors '+fmt(cov.rootRefs)].map(v=>'<span class="chip">'+v+'</span>').join('');$('tabs').innerHTML=tabs.map(t=>'<button data-tab="'+t+'" class="'+(state.tab===t?'active':'')+'">'+t+'</button>').join('');$('tabs').querySelectorAll('button').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;render()});$('search').oninput=(e)=>{state.query=e.target.value;renderContent()};$('prevMedia').onclick=()=>{state.mediaPage=Math.max(0,state.mediaPage-1);renderWall()};$('nextMedia').onclick=()=>{state.mediaPage=Math.min(Math.ceil(d.media.length/15)-1,state.mediaPage+1);renderWall()};renderMethodology();renderWall()}
function renderWall(){const page=state.data.media.slice(state.mediaPage*15,state.mediaPage*15+15);$('wall').innerHTML=page.map((m,i)=>'<a class="tile '+(i===0?'big':'')+'" href="'+m.postUrl+'" target="_blank"><img src="'+mediaUrl(m)+'" alt=""></a>').join('');$('wallCount').textContent=(state.mediaPage*15+1)+'-'+Math.min(state.data.media.length,state.mediaPage*15+15)+' / '+state.data.media.length}
function renderContent(){const d=state.data;if(state.tab==='refs'){const posts=filteredPosts();$('visibleCount').textContent=posts.length+' refs';$('content').innerHTML='<div class="card">'+posts.map(postLine).join('')+'</div>';return}
if(state.tab==='voices'){const voices=d.voices.filter(v=>!state.query||[v.name,v.handle,v.platform].join(' ').toLowerCase().includes(state.query.toLowerCase()));$('visibleCount').textContent=voices.length+' voices';$('content').innerHTML='<div class="grid">'+voices.map(v=>'<div class="card"><div class="row"><h3>'+escapeHtml(v.name)+'</h3><span class="chip">'+v.platform+'</span>'+score(v.reachScore,'voice')+'</div><p class="meta">'+escapeHtml(v.handle||v.profileUrl||'profile')+' · '+v.postCount+' refs · '+fmt(v.totalEngagement)+' raw engagement</p><p><a class="meta" href="'+(v.samplePostUrls?.[0]||v.profileUrl||'#')+'" target="_blank">open sample</a></p></div>').join('')+'</div>';return}
if(state.tab==='timeline'){const posts=filteredPosts().slice().sort((a,b)=>(a.postedAt||0)-(b.postedAt||0));$('visibleCount').textContent=posts.length+' dated refs';$('content').innerHTML='<div class="card">'+posts.map(postLine).join('')+'</div>';return}
$('visibleCount').textContent=d.themes.length+' clusters · '+fmt(clusterCoverage().clusteredRefs)+'/'+fmt(d.posts.length)+' refs assigned';$('content').innerHTML='<div class="grid">'+d.themes.map((t,i)=>{const posts=t.postIds.map(id=>d.postsById[id]).filter(Boolean).sort((a,b)=>(b.reachScore||0)-(a.reachScore||0));const rootCount=(t.rootPostIds||t.postIds).length;const attachedCount=(t.attachedPostIds||[]).length;const media=posts.flatMap(p=>(p.media||[]).map(m=>({...m,postUrl:p.url}))).filter(isImageMedia).slice(0,4);return '<div class="card '+(i<2?'hot':'')+'"><div class="row"><h3>'+escapeHtml(t.label)+'</h3><span class="chip">'+posts.length+' refs</span><span class="chip">'+rootCount+' roots</span><span class="chip">'+attachedCount+' context</span></div><div class="tags">'+platformMix(t.postIds)+'</div><p>'+escapeHtml(t.summary||'')+'</p><div class="post-media">'+media.map(m=>'<a href="'+m.postUrl+'" target="_blank"><img src="'+mediaUrl(m)+'" loading="lazy" alt=""></a>').join('')+'</div><div class="snips">'+posts.slice(0,3).map(p=>'<p class="snip">['+p.platform+'] '+escapeHtml((p.authorHandle||p.authorName||'unknown')+': '+decodeText(p.text).slice(0,180))+'...</p>').join('')+'</div></div>'}).join('')+'</div>'}
function render(){renderShell();renderContent()}
fetch('/vibes/aie2026/data?v=${DATA_VERSION}').then(r=>r.json()).then(d=>{d.postsById=Object.fromEntries(d.posts.map(p=>[p.postId,p]));d.mediaTotal=0;d.media=[];const seen=new Set();for(const p of d.posts){for(const m of p.media||[]){if(m.path)d.mediaTotal++;const k=m.path||m.url;if(!k||seen.has(k)||!isImageMedia(m))continue;seen.add(k);d.media.push({...m,postUrl:p.url})}}d.media.sort((a,b)=>(b.bytes||0)-(a.bytes||0));state.data=d;render()}).catch(err=>{$('content').innerHTML='<p class="empty">Could not load recap data.</p>';console.error(err)})
</script>
</body>
</html>`;
}
