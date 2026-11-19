import assert from "node:assert/strict";
import test from "node:test";

import { handlePortalMediaUpload, isPortalMediaPath, portalMediaContentType, portalMediaType, type PortalMediaStore } from "../cloudflare/portal-media";

const json = (body: unknown, status = 200) => Response.json(body, { status });

function memoryStore() {
  const saved: { ext: string; bytes: number }[] = [];
  const store: PortalMediaStore = {
    async put(body, { ext, maxBytes }) {
      let bytes = 0;
      const reader = body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) throw new Error("MEDIA_TOO_LARGE");
      }
      saved.push({ ext, bytes });
      return { path: `portal/202611/00000000-0000-0000-0000-00000000000${saved.length}.${ext}`, bytes };
    },
  };
  return { store, saved };
}

const upload = (body: BodyInit, headers: Record<string, string>) => new Request("http://x/api/media", { method: "POST", body, headers, duplex: "half" } as RequestInit);

test("tải video MP4 → lưu đĩa, trả đường dẫn /media/…", async () => {
  const { store, saved } = memoryStore();
  const res = await handlePortalMediaUpload(upload(new Uint8Array(1234), { "content-type": "video/mp4", "x-file-name": encodeURIComponent("phonics s.mp4") }), store, json);
  assert.equal(res.status, 201);
  const body = await res.json() as { url: string; kind: string; bytes: number };
  assert.equal(body.kind, "video");
  assert.equal(body.bytes, 1234);
  assert.match(body.url, /^\/media\/portal\/202611\/.+\.mp4$/);
  assert.deepEqual(saved, [{ ext: "mp4", bytes: 1234 }]);
});

test("loại file lạ bị từ chối; .mov nhận theo đuôi khi trình duyệt không gửi MIME", async () => {
  const { store } = memoryStore();
  assert.equal((await handlePortalMediaUpload(upload("x", { "content-type": "application/pdf" }), store, json)).status, 415);
  assert.equal(portalMediaType("", "bai 1.MOV")?.ext, "mov");
  assert.equal(portalMediaType("application/octet-stream", "tu.m4a")?.kind, "audio");
});

test("vượt dung lượng → 413, không có binding → 501", async () => {
  const { store } = memoryStore();
  assert.equal((await handlePortalMediaUpload(upload("x", { "content-type": "image/png", "content-length": String(11 * 1024 * 1024) }), store, json)).status, 413);
  assert.equal((await handlePortalMediaUpload(upload(new Uint8Array(11 * 1024 * 1024), { "content-type": "image/png" }), store, json)).status, 413);
  assert.equal((await handlePortalMediaUpload(upload("x", { "content-type": "image/png" }), undefined, json)).status, 501);
});

test("chỉ phục vụ đúng dạng portal/YYYYMM/<uuid>.<đuôi>", () => {
  assert.equal(isPortalMediaPath("portal/202611/0f8fad5b-d9cb-469f-a165-70867728950e.mp4"), true);
  assert.equal(isPortalMediaPath("../etc/passwd"), false);
  assert.equal(isPortalMediaPath("portal/202611/../../x.mp4"), false);
  assert.equal(isPortalMediaPath("portal/202611/abc.exe"), false);
  assert.equal(portalMediaContentType("a.mp4"), "video/mp4");
});

test("lưu đĩa thật + phục vụ có Range (tua video), quá cỡ thì xóa file dở", async () => {
  const { mkdtemp, readdir, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { createServer } = await import("node:http");
  const { createDiskMediaStore, serveDiskMedia } = await import("../cloudflare/portal-media-disk");
  const root = await mkdtemp(join(tmpdir(), "media-"));
  try {
    const store = createDiskMediaStore(root);
    const data = new Uint8Array(5000).map((_, i) => i % 251);
    const saved = await store.put(new Blob([data]).stream(), { ext: "mp4", maxBytes: 10_000 });
    assert.equal(saved.bytes, 5000);
    assert.ok(isPortalMediaPath(saved.path));
    await assert.rejects(store.put(new Blob([new Uint8Array(20_000)]).stream(), { ext: "mp4", maxBytes: 10_000 }), /MEDIA_TOO_LARGE/);
    const month = saved.path.split("/")[1]!;
    assert.equal((await readdir(join(root, "portal", month))).length, 1, "file quá cỡ đã bị xóa");
    const server = createServer((req, res) => { serveDiskMedia(root, req, res); });
    await new Promise<void>((ok) => server.listen(0, ok));
    const port = (server.address() as { port: number }).port;
    try {
      const full = await fetch(`http://127.0.0.1:${port}/media/${saved.path}`);
      assert.equal(full.status, 200);
      assert.equal(full.headers.get("content-type"), "video/mp4");
      assert.equal((await full.arrayBuffer()).byteLength, 5000);
      const part = await fetch(`http://127.0.0.1:${port}/media/${saved.path}`, { headers: { range: "bytes=100-199" } });
      assert.equal(part.status, 206);
      assert.equal(part.headers.get("content-range"), "bytes 100-199/5000");
      const bytes = new Uint8Array(await part.arrayBuffer());
      assert.equal(bytes.length, 100);
      assert.equal(bytes[0], 100 % 251);
      assert.equal((await fetch(`http://127.0.0.1:${port}/media/portal/${month}/khong-co.mp4`)).status, 404);
    } finally { server.close(); }
  } finally { await rm(root, { recursive: true, force: true }); }
});
