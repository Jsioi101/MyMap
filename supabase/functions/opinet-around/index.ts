// 내 지도: 반경 안의 주유소 가격(오피넷)을 가격 낮은 순으로 돌려준다.
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
  UNI_ID: string; POLL_DIV_CD?: string; OS_NM: string; PRICE: number | string;
  GIS_X_COOR: number | string; GIS_Y_COOR: number | string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const key = Deno.env.get("OPINET_KEY");
    if (!key) return json({ error: "OPINET_KEY 시크릿이 설정되지 않았어요" }, 500);

    const body = await req.json().catch(() => ({}));
    const lat = Number(body.lat), lng = Number(body.lng);
    const radius = Math.min(Math.max(Number(body.radius) || 10000, 1000), 20000);
    const prodcd = FUELS.has(body.prodcd) ? body.prodcd : "B027";
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 32 || lat > 39.5 || lng < 124 || lng > 132) {
      return json({ error: "위치 값이 올바르지 않아요" }, 400);
    }

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
      const r = await fetch(u);
      if (!r.ok) throw new Error(`오피넷 응답 오류 ${r.status}`);
      const text = await r.text();
      let data: { RESULT?: { OIL?: Oil[] } };
      try { data = JSON.parse(text); } catch { throw new Error("오피넷 응답을 읽지 못했어요 (인증키를 확인해 주세요)"); }
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
        brand: o.POLL_DIV_CD ?? "",
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
