// スプレッドシート駆動のリダイレクト
// 使い方: https://<サイト>/udemy → スプシ「転送」シートで udemy の転送先URLへ302
const SHEET_TSV = "https://docs.google.com/spreadsheets/d/1EY9njbOHx-ueanqZ7PfmZJtRlzxlcxRHe31nYTZWc24/export?format=tsv";

export default async (req) => {
  const slug = new URL(req.url).pathname.split("/").filter(Boolean).pop() || "";
  if (!slug) return Response.redirect("https://voice-mika.com/", 302);
  try {
    const res = await fetch(SHEET_TSV, { headers: { "cache-control": "no-cache" } });
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
