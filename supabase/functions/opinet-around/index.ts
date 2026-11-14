// 내 지도 서버 함수
//  - 기본(action 없음): 반경 안의 주유소 가격(오피넷)을 가격 낮은 순으로 돌려준다.
//  - action: "naver-import": 네이버 지도 즐겨찾기 공유 링크(naver.me/… 또는 map.naver.com/…)의 장소 목록을 돌려준다.
//    네이버가 공식 API 로 제공하는 기능이 아니라 공유 페이지가 쓰는 데이터 주소를 읽으므로, 네이버가 바꾸면 동작하지 않을 수 있다.
// 오피넷 aroundAll API 는 한 번에 반경 5km 까지만 되므로, 10km 는 5km 원 7개(가운데 + 둘레 6개)로 나눠 조회해 합친다.
// 필요한 시크릿: OPINET_KEY (오피넷 오픈API 인증키)
import proj4 from "npm:proj4@2.12.1";

const KATEC =
  "+proj=tmerc +lat_0=38 +lon_0=128 +k=0.9999 +x_0=400000 +y_0=600000 +ellps=bessel +units=m +no_defs +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43";
const WGS84 = "EPSG:4326";
const FUELS = new Set(["B027", "D047", "B034", "K015", "C004"]);
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Oil = {
  UNI_ID: string; POLL_DIV_CD?: string; POLL_DIV_CO?: string; OS_NM: string; PRICE: number | string;
  GIS_X_COOR: number | string; GIS_Y_COOR: number | string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    if (body.action === "naver-import") return json(await naverImport(String(body.url || "")));
    const lat = Number(body.lat), lng = Number(body.lng);
    const radius = Math.min(Math.max(Number(body.radius) || 10000, 1000), 20000);
    const prodcd = FUELS.has(body.prodcd) ? body.prodcd : "B027";
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 32 || lat > 39.5 || lng < 124 || lng > 132) {
      return json({ error: "위치 값이 올바르지 않아요" }, 400);
    }

    const key = Deno.env.get("OPINET_KEY");
    if (!key) return json({ error: "OPINET_KEY 시크릿이 설정되지 않았어요" }, 500);
    const [cx, cy] = proj4(WGS84, KATEC, [lng, lat]);
    const R = 5000;
    const centers: [number, number][] = [[cx, cy]];
    if (radius > R) {
      const d = radius * Math.sqrt(3) / 2;
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        centers.push([cx + d * Math.cos(a), cy + d * Math.sin(a)]);
      }
    }

    const fetchOne = async ([x, y]: [number, number]): Promise<Oil[]> => {
      const u = new URL("https://www.opinet.co.kr/api/aroundAll.do");
      u.search = new URLSearchParams({
        certkey: key, code: key, out: "json", x: x.toFixed(1), y: y.toFixed(1),
        radius: String(Math.min(R, radius)), sort: "1", prodcd,
      }).toString();
      let text = "";
      try {
        const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) throw new Error(`오피넷 응답 오류 ${r.status}`);
        text = await r.text();
      } catch (e) {
        // 공공기관 서버 인증서 문제로 https 가 실패하면 http 로 다시 시도한다.
        u.protocol = "http:";
        const r = await fetch(u, { signal: AbortSignal.timeout(8000) }).catch((e2) => {
          throw new Error(`오피넷 연결 실패: ${e instanceof Error ? e.message : e} / ${e2 instanceof Error ? e2.message : e2}`);
        });
        if (!r.ok) throw new Error(`오피넷 응답 오류 ${r.status}`);
        text = await r.text();
      }
      let data: { RESULT?: { OIL?: Oil[] } };
      try { data = JSON.parse(text); } catch { throw new Error("오피넷 응답을 읽지 못했어요 (인증키를 확인해 주세요): " + text.slice(0, 120)); }
      return data?.RESULT?.OIL ?? [];
    };

    const lists = await Promise.all(centers.map(fetchOne));
    const seen = new Map<string, Oil>();
    for (const o of lists.flat()) if (o && o.UNI_ID && !seen.has(o.UNI_ID)) seen.set(o.UNI_ID, o);

    const stations = [...seen.values()].map((o) => {
      const gx = Number(o.GIS_X_COOR), gy = Number(o.GIS_Y_COOR);
      const [slng, slat] = proj4(KATEC, WGS84, [gx, gy]);
      return {
        id: o.UNI_ID,
        name: o.OS_NM,
        brand: o.POLL_DIV_CD ?? o.POLL_DIV_CO ?? "",
        price: Number(o.PRICE),
        lat: slat,
        lng: slng,
        distance: Math.round(Math.hypot(gx - cx, gy - cy)),
      };
    })
      .filter((s) => s.distance <= radius && s.price > 0)
      .sort((a, b) => a.price - b.price || a.distance - b.distance);

    return json({ prodcd, radius, count: stations.length, stations });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// ───────── 네이버 지도 즐겨찾기 공유 링크 ─────────
const UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";

async function resolveUrl(url: string): Promise<string> {
  let cur = url;
  for (let i = 0; i < 6; i++) {
    const r = await fetch(cur, { redirect: "manual", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(6000) });
    const loc = r.headers.get("location");
    if (r.status >= 300 && r.status < 400 && loc) { cur = new URL(loc, cur).toString(); continue; }
    // 일부 단축 링크는 HTML 안의 이동 주소로 넘긴다
    if (r.ok && !/folder|shareId|favorite/i.test(cur)) {
      const html = (await r.text()).slice(0, 20000);
      const m = html.match(/(https?:\/\/(?:m\.)?map\.naver\.com\/[^"'<>\s]+)/);
      if (m) { cur = m[1].replace(/&amp;/g, "&"); continue; }
    }
    break;
  }
  return cur;
}

function pickShareId(url: string): string | null {
  const u = decodeURIComponent(url);
  const m = u.match(/folder\/([0-9a-zA-Z]{16,64})/) || u.match(/detail-list\/([0-9a-zA-Z]{16,64})/) || u.match(/[?&](?:folderShareId|shareId|folderId|id)=([0-9a-zA-Z]{16,64})/) || u.match(/shares\/([0-9a-zA-Z]{16,64})/);
  return m ? m[1] : null;
}

// deno-lint-ignore no-explicit-any
async function naverImport(input: string): Promise<any> {
  if (!/^https?:\/\/(naver\.me|(m\.)?map\.naver\.com|pages\.map\.naver\.com)\//.test(input.trim())) {
    return { error: "네이버 지도 공유 링크(naver.me/… 또는 map.naver.com/…)를 넣어 주세요" };
  }
  const finalUrl = await resolveUrl(input.trim());
  const shareId = pickShareId(finalUrl);
  if (!shareId) return { error: "즐겨찾기 폴더 공유 링크가 아니에요. 네이버 지도 › 저장 › 폴더 › 공유로 만든 링크를 넣어 주세요.", finalUrl };

  const items: unknown[] = [];
  let folderName = "";
  for (let start = 0; start < 5000; start += 1000) {
    const api = `https://pages.map.naver.com/save-pages/api/maps-bookmark/v3/shares/${shareId}/bookmarks?start=${start}&limit=1000&sort=lastUseTime&mcids=ALL&createIdNo=false&lang=ko&language=ko`;
    // 서버가 해외에 있어 기본이 영어 이름이므로 한국어를 명시한다
    const r = await fetch(api, { headers: { "User-Agent": UA, "Referer": "https://map.naver.com/", "Accept": "application/json", "Accept-Language": "ko-KR,ko;q=0.9", "Cookie": "NNB=; page_uid=; lang=ko" }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { error: `네이버 응답 오류 ${r.status}. 폴더가 '공개'로 공유돼 있는지 확인해 주세요.`, finalUrl };
    // deno-lint-ignore no-explicit-any
    const d: any = await r.json();
    folderName = folderName || d?.folder?.name || d?.folderName || "";
    const list = d?.bookmarkList ?? d?.bookmarks ?? d?.items ?? [];
    items.push(...list);
    if (list.length < 1000) break;
  }
  // deno-lint-ignore no-explicit-any
  const places = items.map((b: any) => {
    const lng = Number(b.px ?? b.x ?? b.lng ?? b.longitude);
    const lat = Number(b.py ?? b.y ?? b.lat ?? b.latitude);
    return {
      // 한글이 들어 있는 이름을 우선한다 (name / displayName / koreanName 중)
      name: String([b.koreanName, b.name, b.displayName, b.placeName].find((x) => x && /[가-힣]/.test(String(x))) || b.name || b.displayName || "").trim(),
      altName: String(b.displayName || b.name || "").trim(),
      fields: Object.keys(b).join(","),
      address: String(b.address || b.roadAddress || "").trim(),
      lat, lng,
      category: String(b.mcidName || b.category || b.categoryName || "").trim(),
      memo: String(b.memo || "").trim(),
      naverId: String(b.sid || b.placeId || b.bookmarkId || ""),
    };
  }).filter((p) => p.name && Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat > 30 && p.lng > 120);
  return { folderName, count: places.length, places };
}
