// スプレッドシート駆動のリダイレクト＋Udemyクーポンまとめページ
// /udemy        → コース一覧ページ（udemy一覧シートから毎回生成・スプシ更新が即反映）
// /<スラッグ>   → スプシ「転送」シートの転送先URLへ302
// 2026-08-26: /udemy のデータ源をスプレッドシートから data/udemy-coupons.mjs に移した。
//   旧: 案内用スプシ → GASミラー(毎日4時) → このFunctionがTSVを毎回fetch、の3段。
//   段が多く、どこかが黙って止まっても誰も気づかず、6月のコードが2ヶ月出しっぱなしになった。
//   新: Vault側のツールがJSONを作って push するだけ。段は1つ。
// ⚠️ /<スラッグ> の302転送は今までどおりスプシを見ている（こちらは毎日更新するものではないため）。
import coupons from "../../data/udemy-coupons.mjs";
import { getStore } from "@netlify/blobs";

const SHEET = "https://docs.google.com/spreadsheets/d/1EY9njbOHx-ueanqZ7PfmZJtRlzxlcxRHe31nYTZWc24";
const REDIRECT_TSV = SHEET + "/export?format=tsv";

// ── どのリンクが何回踏まれたか ────────────────────────────────
// 媒体ごとにスラッグを分けてあるので、数えれば「どこに貼ったのが効いたか」が分かる。
// りこさん(@riko_ai_labo)のBrain実況(2026-08-01)＝媒体別の計測リンクだけで
// 効いている場所が判明し、そこへ追撃して伸ばした。勘ではなく数字で追撃するための土台。
//
// 置き場は Netlify Blobs。このFunctionの中だけで完結する。
// ⚠️「スプシに記録」は意図して採らなかった。2026-08-26に /udemy で
//   「案内スプシ → GASミラー(毎日4時) → Function」の3段のどこかが黙って止まり、
//   6月のクーポンを2ヶ月出しっぱなしにした事故があったため。段を増やさない。
// ⚠️同じスラッグが数十msの間に2回踏まれると、片方を数え落とすことがある（読んでから書くため）。
//   この規模では無視できる差。正確さより「転送を絶対に止めない」を優先している。
const HITS = "hits";
const jstDay = (t = Date.now()) => new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10);

async function countHit(slug) {
  const store = getStore(HITS);
  const cur = (await store.get(slug, { type: "json" })) || { total: 0, days: {} };
  cur.total = (cur.total || 0) + 1;
  cur.days = cur.days || {};
  const d = jstDay();
  cur.days[d] = (cur.days[d] || 0) + 1;
  await store.setJSON(slug, cur);
}

// 計測が落ちても転送は必ず通す。0.8秒で見切る（Blobsが遅い日に人を待たせない）
async function tally(slug) {
  let timer;
  try {
    await Promise.race([countHit(slug), new Promise((r) => { timer = setTimeout(r, 800); })]);
  } catch (e) { /* 数えられなくても転送は続ける */ }
  clearTimeout(timer);
}

// ── どのクーポンを見せるか、ページが開かれた瞬間に決める ───────────────
// みかさんは「最安値1,300円」と「月次1,500円」を同時に持っていることがある。
// 安いほうを出し、その期限が切れたら自動で次に安いものへ落ちる（再デプロイ不要）。
// ⚠️ここをデータ生成時に決めてしまうと、期限が切れた瞬間から切れたクーポンを出し続ける。
//   6月のコードが2ヶ月出しっぱなしだったのと同じ事故になるので、必ず表示時に判定する。
const TZ = { PDT: "-07:00", PST: "-08:00", UTC: "+00:00", GMT: "+00:00" };
function parseUdemyTime(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?\s*([A-Z]{3})?$/);
  if (!m) { const d = new Date(s); return isNaN(d) ? null : d; }
  const d = new Date(`${m[1]}T${m[2]}:00${TZ[m[3]] ?? "+00:00"}`);
  return isNaN(d) ? null : d;
}
// 生きているもののうち「いちばん安い、同額なら終了が遅い」を選ぶ。
// 全部切れていたら null を返す（＝クーポンなしの素のリンクを出す。切れたコードは絶対に出さない）
function pickCoupon(coupons, now = Date.now()) {
  const live = (coupons || []).filter((c) => {
    const s = parseUdemyTime(c.starts_at), e = parseUdemyTime(c.ends_at);
    return (!s || s.getTime() <= now) && (!e || e.getTime() > now);
  });
  if (!live.length) return null;
  live.sort((a, b) => a.price - b.price ||
    ((parseUdemyTime(b.ends_at)?.getTime() ?? 0) - (parseUdemyTime(a.ends_at)?.getTime() ?? 0)));
  return live[0];
}
function courseUrl(c) {
  const picked = pickCoupon(c.coupons);
  const q = [];
  if (c.referral_code) q.push(`referralCode=${c.referral_code}`);
  if (picked) q.push(`couponCode=${picked.code}`);
  return `https://www.udemy.com/course/${c.slug}/` + (q.length ? "?" + q.join("&") : "");
}

const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function udemyPage() {
  const now = Date.now();
  const items = coupons.courses.map((c) => ({ c, picked: pickCoupon(c.coupons, now) }));
  // 割引が生きているものを上に。同じ群のなかでは終了が早い順（急ぐ理由がある順）
  const onSale = items.filter((i) => i.picked)
    .sort((a, b) => (parseUdemyTime(a.picked.ends_at) ?? 0) - (parseUdemyTime(b.picked.ends_at) ?? 0));
  const rest = items.filter((i) => !i.picked);

  const card = ({ c, picked }) => {
    const until = picked ? fmtUntil(picked.ends_at) : null;
    const soon = picked && daysLeft(picked.ends_at, now) <= 3;
    const badge = until
      ? `<span class="until${soon ? " soon" : ""}">${esc(until)}まで</span>`
      : "";
    const thumb = c.thumb && c.thumb.startsWith("http")
      ? `<img src="${esc(c.thumb)}" alt="" loading="lazy">`
      : `<div class="noimg"></div>`;
    return `<a class="card" href="${esc(courseUrl(c))}" target="_blank" rel="noopener">
<div class="thumb">${thumb}${badge}</div>
<div class="body"><h3>${esc(c.name)}</h3><span class="go">コースを見る</span></div>
</a>`;
  };

  const lead = onSale.length
    ? `いま割引中は${onSale.length}本。いちばん早い期限は${esc(fmtUntil(onSale[0].picked.ends_at))}です。`
    : `いまは割引をしていません。次のクーポンが出たら、ここに並びます。`;

  const section = (title, list) => list.length
    ? `<h2>${title}</h2><div class="grid">${list.map(card).join("\n")}</div>` : "";

  const html = `<!DOCTYPE html><html lang="ja"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Udemyコース一覧｜ボイストレーナーみか</title>
<meta name="description" content="ボイストレーナーみかのUdemyコース一覧。割引中のコースは期限つきです。">
<meta name="robots" content="noindex">
<style>
:root{
  --ink:#2E2A28; --sub:#8B7D77; --line:#EFE4DE;
  --bg:#FFFCFA; --card:#FFFFFF; --accent:#D9663D; --accent-soft:#FBEDE6;
}
*{margin:0;padding:0;box-sizing:border-box}
body{
  font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  background:var(--bg); color:var(--ink); line-height:1.75;
  -webkit-font-smoothing:antialiased; padding:56px 20px 72px;
}
.wrap{max-width:1000px;margin:0 auto}
h1{font-size:clamp(23px,4.4vw,32px);font-weight:600;letter-spacing:.01em;line-height:1.45;margin-bottom:12px}
.lead{font-size:14.5px;color:var(--sub);margin-bottom:44px}
h2{
  font-size:13px;font-weight:600;letter-spacing:.09em;color:var(--sub);
  padding-bottom:9px;border-bottom:1px solid var(--line);margin:0 0 22px;
}
h2+.grid{margin-bottom:46px}
.grid{display:grid;grid-template-columns:1fr;gap:22px}
@media(min-width:640px){.grid{grid-template-columns:1fr 1fr}}
@media(min-width:940px){.wrap{max-width:1040px}.grid{grid-template-columns:repeat(3,1fr)}}
.card{
  display:flex;flex-direction:column;background:var(--card);
  border:1px solid var(--line);border-radius:10px;overflow:hidden;
  text-decoration:none;color:inherit;transition:border-color .18s ease, transform .18s ease;
}
.card:hover,.card:focus-visible{border-color:var(--accent);transform:translateY(-2px)}
.card:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.thumb{position:relative;background:var(--accent-soft)}
.thumb img{width:100%;height:auto;display:block;aspect-ratio:750/422;object-fit:cover}
.noimg{width:100%;aspect-ratio:750/422}
.until{
  position:absolute;left:10px;bottom:10px;
  font-family:ui-monospace,"SF Mono",Menlo,monospace;
  font-size:11.5px;letter-spacing:.02em;
  background:rgba(255,255,255,.94);color:var(--ink);
  border:1px solid var(--line);border-radius:5px;padding:3px 8px;
}
.until.soon{background:var(--accent);border-color:var(--accent);color:#fff}
.body{padding:15px 16px 17px;display:flex;flex-direction:column;gap:11px;flex:1}
.body h3{font-size:14px;font-weight:600;line-height:1.65;flex:1}
.go{font-size:12.5px;font-weight:600;color:var(--accent)}
.foot{margin-top:52px;padding-top:20px;border-top:1px solid var(--line);font-size:12.5px;color:var(--sub)}
@media (prefers-reduced-motion:reduce){.card{transition:none}.card:hover{transform:none}}
</style></head><body><div class="wrap">
<h1>声のトレーニングを、Udemyで</h1>
<p class="lead">${lead}</p>
${section("割引中", onSale)}
${section("そのほかのコース", rest)}
<p class="foot">ボイストレーナーみか</p>
</div></body></html>`;
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
}

// 「2026-08-31 12:00 まで」を日本時間の短い表記にする
const WD = ["日", "月", "火", "水", "木", "金", "土"];
function fmtUntil(s) {
  const d = parseUdemyTime(s);
  if (!d) return "";
  const j = new Date(d.getTime() + 9 * 3600 * 1000);
  const hh = String(j.getUTCHours()).padStart(2, "0");
  const mm = String(j.getUTCMinutes()).padStart(2, "0");
  return `${j.getUTCMonth() + 1}/${j.getUTCDate()}(${WD[j.getUTCDay()]}) ${hh}:${mm}`;
}
function daysLeft(s, now) {
  const d = parseUdemyTime(s);
  return d ? (d.getTime() - now) / 86400000 : 999;
}

// /hits?k=<キー>  数えたものを見るページ。キーは Netlify の環境変数 HITS_KEY。
// キーが未設定なら見えないだけで、数えるほうは動いている（あとから設定しても過去分は残る）。
const NOT_FOUND = () =>
  new Response("リンクが見つかりませんでした", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });

async function hitsPage(url) {
  const key = process.env.HITS_KEY;
  if (!key) {
    // キーが無いときは中身を出さない。ただし「記録できているか」だけは言う。
    // ⚠️ここを黙って503にすると、数えられていないのか鍵が無いだけなのか誰にも分からない
    //   ＝「作った」と「動いている」の区別がつかない状態になる（2026-08-07の教訓）。
    let stat = "記録できているかは確認できませんでした";
    try {
      const { blobs } = await getStore(HITS).list();
      stat = blobs.length
        ? `記録できています（いま ${blobs.length} 種類のリンクを記録中）`
        : "記録の置き場は使えています（まだ1件も踏まれていません）";
    } catch (e) { stat = "🚨 記録の置き場が使えていません: " + (e && e.message); }
    return new Response(
      stat + "\n\n中身を見るには Netlify の環境変数 HITS_KEY に好きな文字列を入れて、\n" +
      "https://mika-links.netlify.app/hits?k=その文字列 を開いてください。\n" +
      "（設定前に踏まれた分も残っています）\n",
      { status: 200, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } }
    );
  }
  if (url.searchParams.get("k") !== key) return NOT_FOUND();

  // 読めなかったときは黙って404にしない（何が起きたか分からなくなるため）
  let rows = [];
  try {
    const store = getStore(HITS);
    const { blobs } = await store.list();
    for (const b of blobs) {
      const v = await store.get(b.key, { type: "json" });
      if (v) rows.push({ slug: b.key, total: v.total || 0, days: v.days || {} });
    }
  } catch (e) {
    return new Response("記録が読めませんでした: " + (e && e.message), {
      status: 500, headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // 直近14日ぶんの日付を新しい順に
  const today = Date.parse(jstDay() + "T00:00:00Z");
  const cols = Array.from({ length: 14 }, (_, i) => new Date(today - i * 86400000).toISOString().slice(0, 10));
  const sum = (r, n) => cols.slice(0, n).reduce((a, d) => a + (r.days[d] || 0), 0);
  rows.sort((a, b) => sum(b, 7) - sum(a, 7) || b.total - a.total);

  if (url.searchParams.get("format") === "tsv") {
    const tsv = ["スラッグ\t累計\t直近7日\t直近14日", ...rows.map((r) => `${r.slug}\t${r.total}\t${sum(r, 7)}\t${sum(r, 14)}`)].join("\n");
    return new Response(tsv, { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  const head = cols.map((d) => `<th>${d.slice(5)}</th>`).join("");
  const body = rows.map((r) =>
    `<tr><td class="s">${esc(r.slug)}</td><td class="n b">${sum(r, 7)}</td><td class="n">${sum(r, 14)}</td><td class="n">${r.total}</td>` +
    cols.map((d) => `<td class="n ${r.days[d] ? "" : "z"}">${r.days[d] || ""}</td>`).join("") + "</tr>"
  ).join("\n");

  const html = `<!DOCTYPE html><html lang="ja"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>リンクの踏まれた回数</title>
<style>
body{font-family:'Hiragino Sans',-apple-system,sans-serif;background:#fff;color:#3D3535;padding:24px 16px 48px;line-height:1.7}
.wrap{max-width:1000px;margin:0 auto}
h1{font-size:18px;margin-bottom:6px}
p.lead{font-size:13px;color:#97837C;margin-bottom:18px}
.scroll{overflow-x:auto}
table{border-collapse:collapse;font-size:13px;white-space:nowrap}
th,td{border-bottom:1px solid #F3DDD2;padding:7px 10px;text-align:right}
th{font-weight:600;color:#97837C;font-size:11.5px;position:sticky;top:0;background:#fff}
td.s,th:first-child{text-align:left}
td.s{font-weight:600}
td.b{color:#C9663F;font-weight:700}
td.z{color:#DCD2CE}
</style></head><body><div class="wrap">
<h1>リンクの踏まれた回数</h1>
<p class="lead">日付は日本時間。数え始めたところからの記録です。<a href="?k=${esc(url.searchParams.get("k"))}&amp;format=tsv">TSVで見る</a></p>
<div class="scroll"><table>
<thead><tr><th>スラッグ</th><th>7日</th><th>14日</th><th>累計</th>${head}</tr></thead>
<tbody>${body || `<tr><td colspan="18">まだ1件も踏まれていません。</td></tr>`}</tbody>
</table></div>
</div></body></html>`;
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export default async (req) => {
  const url = new URL(req.url);
  const slug = url.pathname.split("/").filter(Boolean).pop() || "";
  if (!slug) return Response.redirect("https://voice-mika.com/", 302);
  try {
    if (slug === "hits") return await hitsPage(url);
    if (slug === "udemy") { await tally("udemy"); return await udemyPage(); }
    const res = await fetch(REDIRECT_TSV, { headers: { "cache-control": "no-cache" } });
    const tsv = await res.text();
    for (const line of tsv.split("\n").slice(1)) {
      const [s, dest] = line.split("\t");
      if (s && s.trim() === slug && dest && dest.trim().startsWith("http")) {
        await tally(slug);
        return Response.redirect(dest.trim(), 302);
      }
    }
  } catch (e) { /* スプシが読めないときは404へ */ }
  return NOT_FOUND();
};

export const config = { path: "/*" };
