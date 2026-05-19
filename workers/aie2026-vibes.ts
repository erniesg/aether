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
const DATA_VERSION = 'root781-context175-visual-media-auto-wall-1779200716';

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
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.card{border:1px solid var(--line);background:var(--panel);padding:18px;min-width:0}.card.hot{border-color:var(--accent)}.card.selected{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
.atlas{border:1px solid var(--line);background:var(--panel);padding:18px;margin-bottom:14px}.atlas-head{display:flex;gap:12px;align-items:flex-start;justify-content:space-between}.atlas-head p{margin:4px 0 0;color:var(--muted);font-size:14px}.atlas-map{position:relative;height:600px;min-height:460px;margin-top:14px;overflow:hidden;border:1px solid var(--line);background:#fff}.atlas-map:before{content:"";position:absolute;inset:0;background:linear-gradient(90deg,#f4eee7 1px,transparent 1px),linear-gradient(#f4eee7 1px,transparent 1px);background-size:54px 54px;opacity:.38}.atlas-links{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.atlas-node{position:absolute;z-index:2;min-height:0;transform:translate(-50%,-50%);border:1px solid var(--line);background:#fffdfa;padding:8px 10px;text-align:left;cursor:pointer;box-shadow:0 6px 14px #6f4b3318}.atlas-node:hover,.atlas-node.selected{z-index:4;border-color:var(--accent);background:#fff8f2}.atlas-node h4{margin:0;font-family:Georgia,serif;font-size:14px;line-height:1.12}.atlas-node .meta{display:block;margin-top:4px;font-size:10px}.atlas-dot{display:inline-block;width:7px;height:7px;border-radius:999px;background:var(--accent);margin-right:5px}.atlas-pairs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:10px}.atlas-pair{border:1px solid var(--line);background:#fff;padding:10px}.atlas-pair p{margin:6px 0 0;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted);overflow-wrap:anywhere}.atlas-note{font-size:13px;color:var(--muted);margin-top:8px}
.mix,.snips,.info{margin-top:12px}.snip{font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted);overflow-wrap:anywhere}.post{display:grid;gap:8px;border-top:1px solid var(--line);padding:16px 0}.post:first-child{border-top:0}.post-text{font-size:15px;max-width:960px}.post-media{display:flex;gap:6px;overflow:auto}.post-media img{width:150px;height:92px;object-fit:cover;border:1px solid var(--line)}
.score{position:relative;display:inline-block}.score summary{list-style:none;cursor:help;font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted);background:#fff3ec;border:1px solid #efd2c0;border-radius:4px;padding:2px 6px}.score summary::-webkit-details-marker{display:none}.score div{position:absolute;z-index:20;left:0;top:calc(100% + 4px);width:300px;border:1px solid var(--line);background:#fff;padding:10px;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted);box-shadow:0 10px 24px #0002}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.platform{color:#5479a8}.source{color:var(--dim)}details.raw{margin-top:8px}.raw summary{cursor:pointer;color:var(--dim);font:12px ui-monospace,SFMono-Regular,Menlo,monospace}.raw dl{display:grid;grid-template-columns:120px minmax(0,1fr);gap:4px 10px;font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted)}.raw dd{margin:0;overflow-wrap:anywhere}
.cluster-detail{border:1px solid var(--accent);background:#fff8f2;padding:18px;margin-bottom:14px}.cluster-detail h2{max-width:900px}.cluster-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}.ghost{border:1px solid var(--line);background:#fff;padding:7px 10px;font:12px ui-monospace,SFMono-Regular,Menlo,monospace;cursor:pointer}.cluster-media{display:grid;grid-template-columns:repeat(6,1fr);grid-auto-rows:104px;gap:6px;margin-top:14px}.cluster-media a{overflow:hidden;border:1px solid var(--line);background:var(--soft)}.cluster-media img{width:100%;height:100%;object-fit:cover;display:block}.cluster-posts{margin-top:14px;border-top:1px solid var(--line)}.open-cluster{margin-top:14px;border:1px solid var(--line);background:#fff;padding:7px 10px;font:12px ui-monospace,SFMono-Regular,Menlo,monospace;cursor:pointer}
.pager{display:flex;justify-content:space-between;align-items:center;margin-top:12px}.pager button{border:1px solid var(--line);background:#fff;padding:7px 10px;cursor:pointer}.empty{color:var(--muted);padding:24px;border:1px solid var(--line);background:#fff}
@media(max-width:900px){.shell{display:block;padding:14px}.side{position:static;margin-bottom:14px}h1{font-size:34px}.metrics{grid-template-columns:repeat(2,1fr)}.grid{grid-template-columns:1fr}.wall{grid-template-columns:repeat(3,1fr);grid-auto-rows:100px}.atlas-map{height:560px}.atlas-node{width:150px!important}.atlas-pairs{grid-template-columns:1fr}.cluster-media{grid-template-columns:repeat(3,1fr);grid-auto-rows:92px}}
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
const state={data:null,tab:'clusters',mediaPage:0,query:'',selectedTheme:null,mediaTimer:null,mediaAutoPausedUntil:0};
const tabs=['clusters','refs','timeline','voices'];
const AUTO_MEDIA_MS=5200;
const MANUAL_MEDIA_PAUSE_MS=16000;
const $=(id)=>document.getElementById(id);
const fmt=(n)=>n==null?'0':Intl.NumberFormat('en',{notation:n>=10000?'compact':'standard',maximumFractionDigits:1}).format(n);
const date=(v)=>v?new Date(v).toLocaleDateString('en-SG',{day:'numeric',month:'short',year:'numeric'}):'date pending';
const isImageUrl=(v)=>/\\.(jpe?g|png|webp|avif|gif)(\\?|$)/i.test(String(v||''));
const mediaUrl=(m)=>m.path&&isImageUrl(m.path)?'/vibes/aie2026/media?path='+encodeURIComponent(m.path):isImageUrl(m.previewUrl)?m.previewUrl:isImageUrl(m.url)?m.url:'';
const isImageMedia=(m)=>Boolean(mediaUrl(m));
const mediaKey=(m)=>m.visualHash||(m.path&&isImageUrl(m.path)?m.hash:undefined)||mediaUrl(m)||m.hash||m.path||m.url;
const raw=(p)=> ((p.metrics||{}).likes||0)+((p.metrics||{}).reactions||0)+2*((p.metrics||{}).comments||0)+2*((p.metrics||{}).reposts||0)+2*((p.metrics||{}).replies||0)+((((p.metrics||{}).views??(p.metrics||{}).impressions)??0)/200);
const score=(v,kind='eng')=>{const voice=kind==='voice';const help=voice?'Voice score highlights people with repeated high-signal refs and public engagement.':'Engagement score compares this ref with other refs on the same platform. 0 is typical; higher is above-platform average. Signals include public reactions, comments, reposts, and views where the platform exposes them.';return '<details class="score" title="'+help+'"><summary>'+kind+' '+Number(v||0).toFixed(2)+' ?</summary><div>'+help+(voice?'':'<br><br>LinkedIn impressions are not exposed here, so LinkedIn uses public reactions/comments/reposts only.')+'</div></details>'};
function platformCounts(ids){const mix={x:0,linkedin:0,youtube:0};for(const id of ids||[]){const p=state.data.postsById[id];if(p&&Object.prototype.hasOwnProperty.call(mix,p.platform))mix[p.platform]++}return mix}
function platformChips(mix){return ['x','linkedin','youtube'].map(p=>[p,mix[p]||0]).filter(([,n])=>n).map(([p,n])=>'<span class="chip">'+p+' '+n+'</span>').join('')}
function platformMix(ids){return platformChips(platformCounts(ids))}
function clusterCoverage(){const d=state.data;if(d.clusterCoverage)return d.clusterCoverage;const ids=new Set(d.posts.map(p=>p.postId));const clustered=new Set();let root=0;let attached=0;for(const t of d.themes||[]){for(const id of t.postIds||[])if(ids.has(id))clustered.add(id);root+=new Set((t.rootPostIds||t.postIds||[]).filter(id=>ids.has(id))).size;attached+=new Set((t.attachedPostIds||[]).filter(id=>ids.has(id))).size}return{totalRefs:d.posts.length,clusteredRefs:clustered.size,rootRefs:root||clustered.size,attachedRefs:attached,unclusteredRefs:Math.max(0,d.posts.length-clustered.size)}}
function decodeText(s){const el=document.createElement('textarea');el.innerHTML=String(s||'');return el.value}
function postLine(p){const media=(p.media||[]).filter(isImageMedia);return '<article class="post"><div class="row"><span class="chip platform">'+p.platform+'</span><span class="meta">'+(p.authorHandle||p.authorName||'unknown')+'</span><span class="meta">'+date(p.postedAt)+'</span>'+(media.length?'<span class="chip">'+media.length+' media</span>':'')+score(p.reachScore)+'<a class="meta" href="'+p.url+'" target="_blank" rel="noreferrer">open original</a></div><div class="post-text">'+escapeHtml(decodeText(p.text))+'</div>'+mediaStrip(p)+'<details class="raw"><summary>complete post info</summary><dl><dt>url</dt><dd><a href="'+p.url+'" target="_blank">'+p.url+'</a></dd><dt>raw engagement</dt><dd>'+raw(p).toFixed(2)+'</dd><dt>media</dt><dd>'+media.length+' local assets'+(media.length?'<ol>'+media.map(m=>'<li><a href="'+mediaUrl(m)+'" target="_blank" rel="noreferrer">'+escapeHtml(m.path||m.url)+'</a></li>').join('')+'</ol>':'')+'</dd><dt>metrics</dt><dd>'+escapeHtml(JSON.stringify(p.metrics||{}))+'</dd><dt>tags</dt><dd>'+escapeHtml((p.tags||[]).join(', '))+'</dd></dl></details></article>'}
function mediaStrip(p){const imgs=(p.media||[]).filter(isImageMedia);return imgs.length?'<div class="post-media">'+imgs.map((m,i)=>'<a href="'+mediaUrl(m)+'" target="_blank" rel="noreferrer" title="media '+(i+1)+' of '+imgs.length+'"><img src="'+mediaUrl(m)+'" loading="lazy" alt=""></a>').join('')+'</div>':''}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function filteredPosts(){const q=state.query.toLowerCase();return state.data.posts.filter(p=>!q||[p.text,p.authorName,p.authorHandle,p.platform].join(' ').toLowerCase().includes(q))}
const LOCAL_STOPWORDS=new Set('about after again also and are because been being but can cannot could did does down each event from have here how into its just like may more much need not now off only our out over same she should singapore summit than that the their them then there these they this those through too use was were what when where which while with you your ai aie engineer engineers conference'.split(' '));
function clusterTerms(text){return String(text||'').toLowerCase().replace(/https?:\\/\\/\\S+/g,' ').replace(/[^a-z0-9]+/g,' ').split(/\\s+/).map(w=>w.trim()).filter(w=>w.length>=3&&!LOCAL_STOPWORDS.has(w))}
function normalizeMap(vector){let norm=0;for(const value of vector.values())norm+=value*value;norm=Math.sqrt(norm);if(!norm)return vector;for(const entry of vector)vector.set(entry[0],entry[1]/norm);return vector}
function vectorSimilarity(left,right){let score=0;const small=left.size<=right.size?left:right;const large=left.size<=right.size?right:left;for(const entry of small)score+=entry[1]*(large.get(entry[0])||0);return clamp(score,0,1)}
function clamp(value,min,max){return Math.max(min,Math.min(max,value))}
function buildClusterVectors(themes){const documents=themes.map(t=>clusterTerms([t.label,t.summary,(t.keywords||[]).join(' '),(t.keywords||[]).join(' '),(t.postIds||[]).slice(0,90).map(id=>{const p=state.data.postsById[id];return p?[(p.authorHandle||p.authorName||''),p.text,(p.tags||[]).join(' ')].join(' '):''}).join(' ')].join(' ')));const df=new Map();for(const terms of documents){for(const term of new Set(terms))df.set(term,(df.get(term)||0)+1)}return documents.map(terms=>{const counts=new Map();for(const term of terms)counts.set(term,(counts.get(term)||0)+1);const weighted=Array.from(counts.entries()).map(([term,count])=>[term,Math.log1p(count)*Math.log(1+documents.length/(1+(df.get(term)||1)))]).sort((a,b)=>b[1]-a[1]).slice(0,90);return normalizeMap(new Map(weighted))})}
function buildAtlasLayout(themes){const vectors=buildClusterVectors(themes);const maxRefs=Math.max(1,...themes.map(t=>(t.postIds||[]).length));const nodes=themes.map((t,index)=>{const angle=(index/Math.max(1,themes.length))*Math.PI*2-Math.PI/2;const radius=0.34;return{themeId:t.themeId,label:t.label,count:(t.postIds||[]).length,x:0.5+Math.cos(angle)*radius,y:0.5+Math.sin(angle)*radius,width:128+Math.round(((t.postIds||[]).length/maxRefs)*28),mix:platformCounts(t.postIds||[]),index}});const pairs=[];for(let left=0;left<nodes.length;left++){for(let right=left+1;right<nodes.length;right++){pairs.push({source:nodes[left],target:nodes[right],similarity:vectorSimilarity(vectors[left],vectors[right])})}}for(let step=0;step<280;step++){for(const pair of pairs){const dx=pair.target.x-pair.source.x;const dy=pair.target.y-pair.source.y;const dist=Math.max(0.001,Math.sqrt(dx*dx+dy*dy));const target=0.21+(1-pair.similarity)*0.64;const force=(dist-target)*0.017;const mx=(dx/dist)*force;const my=(dy/dist)*force;pair.source.x+=mx;pair.source.y+=my;pair.target.x-=mx;pair.target.y-=my}for(const node of nodes){node.x+=(0.5-node.x)*0.004;node.y+=(0.5-node.y)*0.004;node.x=clamp(node.x,0.18,0.82);node.y=clamp(node.y,0.18,0.82)}}const ranked=[...pairs].sort((a,b)=>b.similarity-a.similarity);return{nodes,links:ranked.filter(p=>p.similarity>0.035).slice(0,Math.min(14,Math.max(6,themes.length+3))),shared:ranked.slice(0,4),separate:[...ranked].reverse().slice(0,4)}}
function atlasPairList(pairs){return pairs.map(p=>'<p>'+escapeHtml(p.source.label)+' + '+escapeHtml(p.target.label)+' <b>'+Math.round(p.similarity*100)+'%</b></p>').join('')}
function renderAtlas(){const d=state.data;const atlas=buildAtlasLayout(d.themes||[]);const cov=clusterCoverage();const quality=d.clustering;const qualityText=quality?' Cluster membership uses TF-IDF graph communities with recursive splitting; selected '+quality.clusterCount+' clusters from '+quality.rootRefCount+' root refs by elbow-weighted silhouette. Silhouette '+Number(quality.silhouetteScore||0).toFixed(4)+', inertia '+Number(quality.inertia||0).toFixed(4)+'.':'';const lines=atlas.links.map(link=>'<line x1="'+(link.source.x*100).toFixed(2)+'" y1="'+(link.source.y*100).toFixed(2)+'" x2="'+(link.target.x*100).toFixed(2)+'" y2="'+(link.target.y*100).toFixed(2)+'" stroke="#de7340" stroke-width="'+Math.max(.35,link.similarity*2.5).toFixed(2)+'" opacity="'+Math.min(.72,.16+link.similarity).toFixed(2)+'"/>').join('');const nodes=atlas.nodes.map(node=>'<button class="atlas-node '+(state.selectedTheme===node.themeId?'selected':'')+'" data-theme-node="'+escapeHtml(node.themeId)+'" style="left:'+(node.x*100).toFixed(2)+'%;top:'+(node.y*100).toFixed(2)+'%;width:'+node.width+'px"><h4><span class="atlas-dot"></span>'+escapeHtml(node.label)+'</h4><span class="meta">'+node.count+' refs</span></button>').join('');return '<section class="atlas" data-testid="cluster-distance-map"><div class="atlas-head"><div><p class="eyebrow">cluster atlas</p><h2>How the event stories sit together</h2><p>Nearby nodes share recurring language, authors, and cited refs. Farther nodes are separate pockets of the public recap.</p></div><span class="chip">'+fmt(cov.rootRefs)+' root refs mapped</span></div><div class="atlas-map"><svg class="atlas-links" viewBox="0 0 100 100" preserveAspectRatio="none">'+lines+'</svg>'+nodes+'</div><p class="atlas-note">Map distance is computed from cluster labels, summaries, keywords, and up to 90 refs per cluster using local term vectors.'+escapeHtml(qualityText)+' Low silhouette means the event conversation overlaps heavily; the elbow keeps the main view readable.</p><div class="atlas-pairs"><div class="atlas-pair"><span class="meta">shared signals</span>'+atlasPairList(atlas.shared)+'</div><div class="atlas-pair"><span class="meta">separate pockets</span>'+atlasPairList(atlas.separate)+'</div></div></section>'}
function bindClusterControls(){document.querySelectorAll('[data-theme-node],[data-cluster-open]').forEach(node=>{node.onclick=()=>{const id=node.getAttribute('data-theme-node')||node.getAttribute('data-cluster-open');state.selectedTheme=state.selectedTheme===id?null:id;renderContent()}});document.querySelectorAll('[data-clear-theme]').forEach(node=>{node.onclick=()=>{state.selectedTheme=null;renderContent()}})}
function themePosts(t){return (t.postIds||[]).map(id=>state.data.postsById[id]).filter(Boolean).sort((a,b)=>(b.reachScore||0)-(a.reachScore||0))}
function themeMedia(posts,limit){return posts.flatMap(p=>(p.media||[]).map(m=>({...m,postUrl:p.url}))).filter(isImageMedia).filter((m,i,arr)=>arr.findIndex(x=>mediaKey(x)===mediaKey(m))===i).slice(0,limit)}
function renderClusterDetail(t){if(!t)return'';const posts=themePosts(t);const q=state.query.toLowerCase();const shown=posts.filter(p=>!q||[p.text,p.authorName,p.authorHandle,p.platform].join(' ').toLowerCase().includes(q));const rootCount=(t.rootPostIds||t.postIds||[]).length;const attachedCount=(t.attachedPostIds||[]).length;const media=themeMedia(posts,18);return '<section class="cluster-detail" data-testid="cluster-detail"><div class="cluster-actions"><div><p class="eyebrow">cluster detail</p><h2>'+escapeHtml(t.label)+'</h2></div><button class="ghost" data-clear-theme>back to all clusters</button></div><div class="tags">'+platformMix(t.postIds||[])+'<span class="chip">'+posts.length+' refs</span><span class="chip">'+rootCount+' roots</span><span class="chip">'+attachedCount+' context</span></div><p class="lede">'+escapeHtml(t.summary||'')+'</p>'+(media.length?'<div class="cluster-media">'+media.map(m=>'<a href="'+m.postUrl+'" target="_blank" rel="noreferrer"><img src="'+mediaUrl(m)+'" loading="lazy" alt=""></a>').join('')+'</div>':'')+'<div class="cluster-posts">'+shown.map(postLine).join('')+'</div></section>'}
function renderClusterCard(t,i){const posts=themePosts(t);const rootCount=(t.rootPostIds||t.postIds||[]).length;const attachedCount=(t.attachedPostIds||[]).length;const media=themeMedia(posts,4);const selected=state.selectedTheme===t.themeId;return '<div class="card '+(selected?'selected':i<2?'hot':'')+'" data-cluster-card="'+escapeHtml(t.themeId)+'"><div class="row"><h3>'+escapeHtml(t.label)+'</h3><span class="chip">'+posts.length+' refs</span><span class="chip">'+rootCount+' roots</span><span class="chip">'+attachedCount+' context</span></div><div class="tags">'+platformMix(t.postIds||[])+'</div><p>'+escapeHtml(t.summary||'')+'</p><div class="post-media">'+media.map(m=>'<a href="'+m.postUrl+'" target="_blank"><img src="'+mediaUrl(m)+'" loading="lazy" alt=""></a>').join('')+'</div><button class="open-cluster" data-cluster-open="'+escapeHtml(t.themeId)+'">explore cluster refs</button><div class="snips">'+posts.slice(0,3).map(p=>'<p class="snip">['+p.platform+'] '+escapeHtml((p.authorHandle||p.authorName||'unknown')+': '+decodeText(p.text).slice(0,180))+'...</p>').join('')+'</div></div>'}
function renderMethodology(){const d=state.data;const cov=clusterCoverage();const m=d.methodology||{};const q=m.querySet||d.querySet||{};const x=q.x||[];const li=q.linkedin||[];const exp=m.expansionQueries||[];const yt=m.youtubeSources||[];const cq=d.clustering;const candidates=(cq?.candidateScores||[]).map(v=>'<li>'+v.clusterCount+' clusters: silhouette '+Number(v.silhouetteScore||0).toFixed(4)+' · inertia '+Number(v.inertia||0).toFixed(4)+' · elbow '+Number(v.elbowScore||0).toFixed(2)+'</li>').join('');$('methodDetails').innerHTML='<p>Source dates: '+date(m.sourceDateRange?.start)+' to '+date(m.sourceDateRange?.end)+'</p><p>Clustering: '+fmt(cov.rootRefs)+' root refs form the atlas; '+fmt(cov.attachedRefs)+' replies/comments/context refs are attached to those clusters. '+fmt(cov.unclusteredRefs)+' refs are currently unclustered.</p>'+(cq?'<p>Cluster count uses local TF-IDF graph communities with recursive splitting. The sweep found the cleanest raw silhouette at '+(cq.silhouetteClusterCount||'n/a')+' clusters, but the elbow/parsimony point was '+(cq.elbowClusterCount||cq.clusterCount)+'; selected '+cq.clusterCount+' clusters so the recap stays readable. Current silhouette '+Number(cq.silhouetteScore||0).toFixed(4)+', inertia '+Number(cq.inertia||0).toFixed(4)+'.</p><details><summary class="meta">cluster diagnostics</summary><ul>'+candidates+'</ul></details>':'')+'<details><summary class="meta">query seeds</summary><p>X '+x.length+' · LinkedIn '+li.length+' · expansion '+exp.length+'</p><ul>'+x.concat(exp).slice(0,40).map(v=>'<li><code>'+escapeHtml(v)+'</code></li>').join('')+'</ul></details><details><summary class="meta">youtube sources</summary><ul>'+yt.map(v=>'<li><a href="'+v.url+'" target="_blank" rel="noreferrer">'+escapeHtml(v.title||v.url)+'</a> <span class="meta">'+fmt(v.views)+' views</span></li>').join('')+'</ul></details>'}
function mediaPageCount(){return Math.max(1,Math.ceil((state.data?.media?.length||0)/15))}
function setMediaPage(next,manual=false){const pages=mediaPageCount();state.mediaPage=((next%pages)+pages)%pages;if(manual)state.mediaAutoPausedUntil=Date.now()+MANUAL_MEDIA_PAUSE_MS;renderWall()}
function startMediaCycle(){if(state.mediaTimer)clearInterval(state.mediaTimer);const reduce=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;if(!state.data||mediaPageCount()<2||reduce)return;state.mediaTimer=setInterval(()=>{const wall=$('wall');if(document.hidden||Date.now()<state.mediaAutoPausedUntil||(wall&&wall.matches(':hover')))return;setMediaPage(state.mediaPage+1)},AUTO_MEDIA_MS)}
function renderShell(){const d=state.data;const cov=clusterCoverage();$('dateRange').textContent=date(d.windowStart)+' to '+date(d.windowEnd)+' · refs through '+date(d.updatedAt);$('lede').textContent='A seeded snowball recap from '+fmt(cov.rootRefs)+' primary public refs plus '+fmt(cov.attachedRefs)+' attached replies/comments across X, LinkedIn, and YouTube, with media assets and source links kept attached.';$('tags').innerHTML=d.themes.slice(0,6).map(t=>'<span class="chip">'+escapeHtml(t.label)+'</span>').join('');const c=d.stats.crossSurfaceObserved||{};$('metrics').innerHTML=[['primary refs',cov.rootRefs],['known views',c.knownViews],['public reactions',c.knownLikesAndLinkedInReactions],['unique photos',d.mediaTotal]].map(([k,v])=>'<div class="metric"><b>'+fmt(v)+'</b><span>'+k+'</span></div>').join('');const by=d.stats.relevantByPlatform||{};const ytVideos=d.posts.filter(p=>p.platform==='youtube'&&p.tags?.includes('youtube-video')).length;$('sourceMix').innerHTML=['x '+fmt(by.x||0),'linkedin '+fmt(by.linkedin||0),'youtube '+fmt(by.youtube||0),'yt videos '+fmt(ytVideos),'context '+fmt(cov.attachedRefs),'clustered '+fmt(cov.clusteredRefs)+'/'+fmt(cov.totalRefs),'local media files '+fmt(d.localMediaTotal||d.mediaTotal)].map(v=>'<span class="chip">'+v+'</span>').join('');$('tabs').innerHTML=tabs.map(t=>'<button data-tab="'+t+'" class="'+(state.tab===t?'active':'')+'">'+t+'</button>').join('');$('tabs').querySelectorAll('button').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;render()});$('search').value=state.query;$('search').oninput=(e)=>{state.query=e.target.value;renderContent()};$('prevMedia').onclick=()=>setMediaPage(state.mediaPage-1,true);$('nextMedia').onclick=()=>setMediaPage(state.mediaPage+1,true);renderMethodology();renderWall();startMediaCycle()}
function renderWall(){const total=state.data.media.length;if(!total){$('wall').innerHTML='';$('wallCount').textContent='0 media';return}const page=state.data.media.slice(state.mediaPage*15,state.mediaPage*15+15);$('wall').innerHTML=page.map((m,i)=>'<a class="tile '+(i===0?'big':'')+'" href="'+m.postUrl+'" target="_blank"><img src="'+mediaUrl(m)+'" alt=""></a>').join('');$('wallCount').textContent=(state.mediaPage*15+1)+'-'+Math.min(total,state.mediaPage*15+15)+' / '+total+' · auto'}
function renderContent(){const d=state.data;if(state.tab==='refs'){const posts=filteredPosts();$('visibleCount').textContent=posts.length+' refs';$('content').innerHTML='<div class="card">'+posts.map(postLine).join('')+'</div>';return}
if(state.tab==='voices'){const voices=d.voices.filter(v=>!state.query||[v.name,v.handle,v.platform].join(' ').toLowerCase().includes(state.query.toLowerCase()));$('visibleCount').textContent=voices.length+' voices';$('content').innerHTML='<div class="grid">'+voices.map(v=>'<div class="card"><div class="row"><h3>'+escapeHtml(v.name)+'</h3><span class="chip">'+v.platform+'</span>'+score(v.reachScore,'voice')+'</div><p class="meta">'+escapeHtml(v.handle||v.profileUrl||'profile')+' · '+v.postCount+' refs · '+fmt(v.totalEngagement)+' raw engagement</p><p><a class="meta" href="'+(v.samplePostUrls?.[0]||v.profileUrl||'#')+'" target="_blank">open sample</a></p></div>').join('')+'</div>';return}
if(state.tab==='timeline'){const posts=filteredPosts().slice().sort((a,b)=>(a.postedAt||0)-(b.postedAt||0));$('visibleCount').textContent=posts.length+' dated refs';$('content').innerHTML='<div class="card">'+posts.map(postLine).join('')+'</div>';return}
$('visibleCount').textContent=d.themes.length+' clusters · '+fmt(clusterCoverage().clusteredRefs)+'/'+fmt(d.posts.length)+' refs assigned';const selected=(d.themes||[]).find(t=>t.themeId===state.selectedTheme);const themes=[...(d.themes||[])].sort((a,b)=>state.selectedTheme?(a.themeId===state.selectedTheme?-1:b.themeId===state.selectedTheme?1:0):0);$('content').innerHTML=renderClusterDetail(selected)+renderAtlas()+'<div class="grid">'+themes.map(renderClusterCard).join('')+'</div>';bindClusterControls()}
function render(){renderShell();renderContent()}
fetch('/vibes/aie2026/data?v=${DATA_VERSION}').then(r=>r.json()).then(d=>{d.postsById=Object.fromEntries(d.posts.map(p=>[p.postId,p]));d.media=[];const seen=new Set();let localMediaTotal=0;for(const p of d.posts){for(const m of p.media||[]){if(m.path)localMediaTotal++;const k=mediaKey(m);if(!k||seen.has(k)||!isImageMedia(m))continue;seen.add(k);d.media.push({...m,postUrl:p.url})}}d.media.sort((a,b)=>(b.bytes||0)-(a.bytes||0));d.mediaTotal=d.media.length;d.localMediaTotal=localMediaTotal;state.data=d;render()}).catch(err=>{const message=String(err&&err.message?err.message:err);$('content').innerHTML='<p class="empty">Could not load recap data'+(location.search.includes('debug=1')?': '+escapeHtml(message):'.')+'</p>';console.error(message)})
</script>
</body>
</html>`;
}
