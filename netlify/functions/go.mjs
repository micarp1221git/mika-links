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
  const cards = coupons.courses.map((c) => {
    const name = esc(c.name);
    const link = esc(courseUrl(c));
    const thumb = c.thumb && c.thumb.startsWith("http") ? `<img src="${esc(c.thumb)}" alt="" loading="lazy">` : "";
    return `<a class="card" href="${link}" target="_blank" rel="noopener">${thumb}<div class="body"><div class="name">${name}</div><div class="cta">クーポン適用ページへ →</div></div></a>`;
  }).join("\n");
  const html = `<!DOCTYPE html><html lang="ja"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Udemyコース 最安クーポンまとめ｜ボイストレーナーみか</title>
<meta name="description" content="ボイストレーナーみかのUdemyコース一覧。各リンクは現在発行中の最安クーポン適用済みです。">
<style>
:root{--coral:#E8815B;--coral-deep:#C9663F;--coral-soft:#FDEFE8;--coral-line:#F3DDD2;--bg:#FFF8F5;--ink:#3D3535;--ink-soft:#97837C}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Hiragino Sans',-apple-system,sans-serif;background:var(--bg);color:var(--ink);line-height:1.8;padding:32px 16px 48px}
.wrap{max-width:680px;margin:0 auto}
.brand{text-align:center;font-size:12px;letter-spacing:.18em;color:var(--ink-soft);margin-bottom:20px}
h1{font-size:20px;text-align:center;line-height:1.6;margin-bottom:10px}
h1 span{color:var(--coral-deep)}
.lead{text-align:center;font-size:13.5px;color:var(--ink-soft);margin-bottom:22px}
.note{background:var(--coral-soft);border-radius:12px;padding:14px 16px;font-size:13px;margin-bottom:24px}
.card{display:flex;flex-direction:column;background:#fff;border:1px solid var(--coral-line);border-radius:14px;overflow:hidden;text-decoration:none;color:var(--ink);margin-bottom:16px;box-shadow:0 4px 14px rgba(201,102,63,.08);transition:transform .15s ease}
.card:hover{transform:translateY(-2px)}
.card img{width:100%;height:auto;display:block;aspect-ratio:750/422;object-fit:cover}
.card .body{padding:14px 16px 16px}
.card .name{font-size:14.5px;font-weight:600;line-height:1.6;margin-bottom:8px}
.card .cta{font-size:13px;font-weight:700;color:var(--coral-deep)}
.footer{margin-top:30px;text-align:center;font-size:12px;color:var(--ink-soft)}
@media(min-width:760px){.wrap{max-width:900px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.card{margin-bottom:0}h1{font-size:26px}}
</style></head><body><div class="wrap">
<div class="brand">VOICE TRAINER MIKA</div>
<h1>Udemyコース <span>最安クーポン</span>まとめ</h1>
<p class="lead">各リンクは、いま発行中のクーポンを適用した状態で開きます。</p>
<div class="note">クーポンは毎月更新しています。このページはいつ開いても最新のリンクです。ブックマークしてお使いください。</div>
<div class="grid">
${cards}
</div>
<div class="footer">ボイストレーナーみか</div>
</div></body></html>`;
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
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
