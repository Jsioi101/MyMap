// 내 지도: 가게 이름으로 네이버 블로그 리뷰와 사진을 찾아 돌려준다.
// 네이버 검색 API 는 2026년부터 네이버 클라우드 플랫폼의 NAVER API HUB 에서 제공된다.
// 필요한 시크릿: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET (NAVER API HUB Application 의 인증 정보)
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const strip = (s: string) =>
  (s || "").replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'");

async function naver(path: string, params: Record<string, string>, id: string, secret: string) {
  const u = new URL(`https://naverapihub.apigw.ntruss.com/search/v1/${path}`);
  u.search = new URLSearchParams({ ...params, format: "json" }).toString();
  const r = await fetch(u, { headers: { "X-NCP-APIGW-API-KEY-ID": id, "X-NCP-APIGW-API-KEY": secret }, signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`네이버 검색 오류 ${r.status}: ${(await r.text()).slice(0, 120)}`);
  return await r.json();
}

// 블로그 글의 대표 사진(og:image)을 가져온다. 실패하면 null.
async function ogImage(link: string): Promise<string | null> {
  try {
    const m = link.match(/blog\.naver\.com\/([^/?#]+)\/(\d+)/);
    const url = m ? `https://m.blog.naver.com/${m[1]}/${m[2]}` : link;
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" }, signal: AbortSignal.timeout(3000) });
    if (!r.ok) return null;
    const html = (await r.text()).slice(0, 60000);
    const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return og ? og[1].replace(/&amp;/g, "&") : null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const id = Deno.env.get("NAVER_CLIENT_ID"), secret = Deno.env.get("NAVER_CLIENT_SECRET");
    if (!id || !secret) return json({ error: "NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 시크릿이 설정되지 않았어요" }, 500);
    const body = await req.json().catch(() => ({}));
    const name = String(body.name || "").trim().slice(0, 60);
    const area = String(body.area || "").trim().slice(0, 30);
    if (!name) return json({ error: "가게 이름이 필요해요" }, 400);
    const query = `${area} ${name}`.trim();

    const [blog, image] = await Promise.all([
      naver("blog", { query, display: "8", sort: "sim" }, id, secret),
      naver("image", { query, display: "10", sort: "sim", filter: "medium" }, id, secret).catch(() => ({ items: [] })),
    ]);
    const items = (blog.items || []).slice(0, 8);
    const thumbs = await Promise.all(items.map((it: { link: string }) => ogImage(it.link)));
    const blogs = items.map((it: { title: string; link: string; description: string; bloggername: string; postdate: string }, i: number) => ({
      title: strip(it.title),
      link: it.link,
      desc: strip(it.description).slice(0, 120),
      blogger: it.bloggername,
      date: it.postdate ? `${it.postdate.slice(0, 4)}.${it.postdate.slice(4, 6)}.${it.postdate.slice(6, 8)}` : "",
      thumb: thumbs[i],
    }));
    const images = (image.items || []).map((it: { title: string; link: string; thumbnail: string }) => ({
      title: strip(it.title), thumb: it.thumbnail, link: it.link,
    }));
    return json({ query, total: blog.total ?? blogs.length, blogs, images });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
