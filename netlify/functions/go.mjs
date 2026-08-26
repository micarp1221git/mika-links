// スプレッドシート駆動のリダイレクト＋Udemyクーポンまとめページ
// /udemy        → コース一覧ページ（udemy一覧シートから毎回生成・スプシ更新が即反映）
// /<スラッグ>   → スプシ「転送」シートの転送先URLへ302
// 2026-08-26: /udemy のデータ源をスプレッドシートから data/udemy-coupons.mjs に移した。
//   旧: 案内用スプシ → GASミラー(毎日4時) → このFunctionがTSVを毎回fetch、の3段。
//   段が多く、どこかが黙って止まっても誰も気づかず、6月のコードが2ヶ月出しっぱなしになった。
//   新: Vault側のツールがJSONを作って push するだけ。段は1つ。
// ⚠️ /<スラッグ> の302転送は今までどおりスプシを見ている（こちらは毎日更新するものではないため）。
import coupons from "../../data/udemy-coupons.mjs";

const SHEET = "https://docs.google.com/spreadsheets/d/1EY9njbOHx-ueanqZ7PfmZJtRlzxlcxRHe31nYTZWc24";
const REDIRECT_TSV = SHEET + "/export?format=tsv";

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

export default async (req) => {
  const slug = new URL(req.url).pathname.split("/").filter(Boolean).pop() || "";
  if (!slug) return Response.redirect("https://voice-mika.com/", 302);
  try {
    if (slug === "udemy") return await udemyPage();
    const res = await fetch(REDIRECT_TSV, { headers: { "cache-control": "no-cache" } });
    const tsv = await res.text();
    for (const line of tsv.split("\n").slice(1)) {
      const [s, dest] = line.split("\t");
      if (s && s.trim() === slug && dest && dest.trim().startsWith("http")) {
        return Response.redirect(dest.trim(), 302);
      }
    }
  } catch (e) { /* スプシが読めないときは404へ */ }
  return new Response("リンクが見つかりませんでした", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
};

export const config = { path: "/*" };
