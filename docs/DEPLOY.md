# Triển khai STEPS LMS

Mỗi lần đẩy mã lên nhánh `main`, GitHub Actions chạy một job **trên chính VPS**
(self-hosted runner) để build và thay phiên bản đang chạy. Mã nguồn và ảnh Docker
không bao giờ rời khỏi máy chủ; GitHub chỉ đóng vai trò điều phối.

Quy trình nằm trong hai file, đọc thẳng ở đó thay vì tin bản mô tả dưới đây:

- [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) — khi nào chạy, chạy ở đâu.
- [`deploy/deploy.sh`](../deploy/deploy.sh) — làm gì, theo thứ tự nào.
- [`deploy/docker-compose.yml`](../deploy/docker-compose.yml) — app và database chạy ra sao. File này build
  bằng **`Dockerfile.vps`** (chạy `tsx cloudflare/vps-server.ts`), **không phải** `Dockerfile` ở gốc repo
  (Next.js, không được deploy pipeline nào đụng tới). Ứng dụng đang phục vụ `ngoaingusteps.edu.vn` nằm ở
  `cloudflare/`, không phải `src/` — xem mục "Ứng dụng đang chạy production nằm ở `cloudflare/`, không phải
  `src/`" trong [`docs/system-architecture.md`](system-architecture.md) trước khi sửa bất cứ gì liên quan
  webhook/finance/ke-toán.

## Máy chủ hiện tại

| | |
| --- | --- |
| Máy chủ | `163.61.72.30` (Ubuntu 24.04, 3.8GB RAM) |
| Tên miền | `https://ngoaingusteps.edu.vn` |
| Vào bằng | SSH `root`, hoặc profile MCP `mcp-ssh-bnixvsteps` |
| Thư mục cấu hình | `/opt/vsteps` (`.env`, `backups/`) |
| Container | `vsteps-app` (cổng nội bộ 3100), `vsteps-postgres` (cổng nội bộ 5433) |
| Runner | dịch vụ `actions.runner.buivanvu94-vsteps-lms.vsteps-vps`, chạy bằng user `github-runner` |

Máy này đồng thời chạy **CloudPanel**. CloudPanel giữ cổng 80/443 và cấp chứng chỉ
Let's Encrypt; app nằm sau một site kiểu *Reverse Proxy* trỏ về `127.0.0.1:3100`.
App và PostgreSQL **không mở cổng nào ra Internet**.

Đổi tên miền về sau: tạo site reverse proxy mới trong CloudPanel trỏ cùng cổng,
cấp chứng chỉ, rồi xoá site cũ. Không phải build lại gì.

## Deploy thường ngày

```bash
git push origin main
```

Hết. Theo dõi bằng `gh run watch`, hoặc tab Actions của repo. Job từ chối chạy
chồng nhau: push liên tiếp thì bản sau đợi bản trước xong.

Muốn chạy lại mà không sửa mã: vào Actions → *Deploy lên VPS* → **Run workflow**.

## Migration và an toàn dữ liệu

`deploy.sh` chạy `prisma migrate deploy` **sau khi** đã sao lưu database và build
xong ảnh mới. Lệnh đó chỉ áp dụng những migration chưa chạy, nên **thêm cột hay
thêm bảng không đụng tới dữ liệu đang có**.

Điều này đã được kiểm chứng bằng cách thêm thật một cột vào bảng `students` đang
có 936 dòng, đẩy lên, rồi đếm lại sau khi deploy: 936 dòng nguyên vẹn.

Cảnh báo: nếu một migration cố tình `DROP COLUMN` hoặc `DROP TABLE` thì dữ liệu ở
đó **sẽ mất** — `prisma migrate deploy` chạy đúng nội dung file migration. Bản sao
lưu trước mỗi lần deploy là lớp bảo vệ cho tình huống đó.

## Biến môi trường

Nằm ở `/opt/vsteps/.env` trên máy chủ, **không** trong git và **không** trong
GitHub Secrets. Sửa xong thì chạy lại workflow để container nhận giá trị mới.

| Biến | Vai trò |
| --- | --- |
| `APP_PORT` | Cổng nội bộ app nghe, phải khớp site reverse proxy trong CloudPanel |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Tài khoản database |
| `AUTH_SECRET` | Ký phiên đăng nhập **và** dẫn xuất khoá mã hoá bí mật tích hợp (SePay/MISA/Zalo/OpenAI) trong DB. Đổi là mọi người bị đăng xuất **và** mọi bí mật đã lưu qua Cài đặt → Tích hợp thành rác, phải nhập lại |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | **Thông tin đăng nhập, xem mục dưới** |
| `SEED_ADMIN_NAME` | Tên hiển thị của quản trị |
| `SEPAY_WEBHOOK_SECRET` | Đường lùi khi màn hình Cài đặt → Tích hợp chưa cấu hình bí mật webhook SePay. Từ khi tích hợp này có (xem `cloudflare/integration-settings.ts`), nguồn chính là màn hình đó; biến này chỉ còn tác dụng nếu ADMIN chưa lưu gì qua UI. MISA và Zalo không có biến môi trường riêng — cấu hình toàn bộ qua UI |
| `PUBLIC_BASE_URL` | Domain công khai thật, dùng dựng link tuyệt đối gửi trong tin "yêu cầu thanh toán" qua Zalo (`cloudflare/zalo-outbox.ts`). Chưa chốt domain (Q8/Q9 của `plans/260922-0846-tich-hop-sepay-misa-zalo/README.md`) — để trống thì riêng tin này không gửi được, các luồng khác không bị ảnh hưởng |

### `SEED_ADMIN_*` là thông tin đăng nhập, không phải biến seed

Tên biến gây hiểu nhầm. Đây **không phải** giá trị chỉ dùng lần deploy đầu:

- App từ chối khởi động nếu thiếu một trong hai (`cloudflare/vps-server.ts`).
- Đây là mật khẩu đăng nhập của **quản trị, mọi giáo viên và trợ giảng**. App không
  lưu mật khẩu riêng cho từng người; tên đăng nhập sinh từ họ tên trong phần Nhân
  sự (`Nguyễn Thị Ngọc Hân` → `nguyenthingochan`), mật khẩu dùng chung giá trị này.

Chuyển sang máy khác thì **phải mang theo đúng hai giá trị này**, đổi đi là toàn bộ
giáo viên mất quyền vào. Kế toán dùng `ACCOUNTANT_DEFAULT_PASSWORD`, không đặt thì
mặc định là `123456789` (`cloudflare/worker.ts`).

## Hóa đơn điện tử MISA meInvoice

Cấu hình ở **Cài đặt → Tích hợp → MISA meInvoice** (chỉ ADMIN). Base URL theo tài liệu
MISA ([developer.misa.vn/products-openapi/MEINVOICE](https://developer.misa.vn/products-openapi/MEINVOICE))
là `https://developer.misa.vn/apis/itg/meinvoice`. Endpoint và định dạng dữ liệu gửi đi nằm ở
`cloudflare/misa-invoice-client.ts` và `cloudflare/misa-invoice-payload.ts`; route thủ công và
công cụ thử ở `cloudflare/misa-invoice-routes.ts`.

- **Thử trên sandbox**: cùng thẻ cấu hình có khối "Thử nghiệm với MISA", mọi thao tác mở trong
  modal. "Mẫu hóa đơn" lấy danh sách từ MISA; bấm "Chọn" điền cả ký hiệu và mẫu số (ký tự đầu của
  ký hiệu) vào form, rồi phải bấm Lưu. "Xem trước" không tạo hóa đơn. "Phát hành thử" tạo hóa đơn
  thật trên môi trường Base URL đang trỏ tới (không ghi vào sổ học phí), sau đó tải PDF và tra
  trạng thái được ngay trong modal kết quả. Form thử có ô "Số CCCD người mua" để kiểm tra mẫu có
  in CCCD hay không.
- **Nháp tự dựng sau khi thu tay chuyển khoản**: thu tay bằng chuyển khoản lập hóa đơn `PENDING` rồi
  chạy nền theo thứ tự: tin Zalo "đã thanh toán" → dựng bản nháp MISA (`unpublishview`, không tạo hóa
  đơn, không có số, không gửi thuế; `cloudflare/misa-invoice-draft.ts`) → hàng chờ. Bước nháp lưu
  `previewHash` và báo sớm lỗi MISA ở cột "Lỗi gần nhất" (tiền tố "Nháp MISA:"); không bao giờ đặt
  `approvedAt` nên hóa đơn vẫn chờ kế toán bấm xuất. Cần `misa.enabled` và `misa.issueEnabled`. Webhook
  SePay chưa tự dựng nháp; kế toán mở phiếu ra thì bản nháp được dựng lúc đó.
- **Duyệt trước khi xuất (bắt buộc, cả tự động lẫn thủ công)**: webhook SePay khớp đủ tiền (và thu
  tay bằng chuyển khoản) chỉ tạo hóa đơn `PENDING` **chưa duyệt** — hàng chờ
  (`cloudflare/invoice-outbox.ts`) bỏ qua hóa đơn chưa có `approvedAt`, nên không có hóa đơn nào
  tự phát hành thật. Trạng thái hiển thị là "Chờ xem trước & duyệt". Kế toán vào **Kế toán → Hóa đơn
  điện tử**, bấm "Xem trước & xuất" (hoặc "Xuất hóa đơn" cho phiếu thu tiền mặt / "Phát hành lại" cho
  hóa đơn lỗi), sửa thông tin người mua nếu cần rồi bấm **Xem trước** (nút ghi "Xem bản nháp"; mở
  phiếu ra là hệ thống đã tự dựng bản nháp ở MISA, kế toán chỉ việc xem rồi xuất, sai thì sửa thông tin
  và tạo lại ngay trong lúc xem): hệ thống dựng đúng dữ liệu sẽ
  phát hành và gọi MISA `unpublishview` lấy bản nháp (link sống 5 phút, chưa có số, chưa gửi thuế),
  đồng thời lưu dấu vân tay nội dung (`previewHash`). Nút "Xuất hóa đơn" chỉ mở sau khi xem trước, và
  mất lại nếu sửa thông tin; server cũng từ chối xuất khi nội dung không khớp bản đã xem trước. Bấm
  xuất mới đặt `approvedAt` và phát hành ngay. Trang có bộ lọc theo trạng thái (Tất cả / Chờ xem trước & duyệt / Chưa có hóa đơn / Đang xuất / Lỗi / Đã xuất) kèm số lượng, nhóm "Chờ xem trước & duyệt" được tô nổi khi còn việc cần làm và là nhóm mặc định khi mở trang nếu còn hóa đơn chờ (hết thì mặc định Tất cả). Các thẻ tổng quan phía trên đếm theo cùng các nhóm này. Hóa đơn lỗi đã duyệt vẫn được hàng chờ tự thử lại;
  muốn đổi thông tin thì phải xem trước lại. Email, MST, địa chỉ nhập ở form vẫn đi qua quy tắc hai
  mẫu người mua bên dưới: hồ sơ chưa có CCCD thì hóa đơn vẫn ra mẫu không thông tin, trừ khi nhập
  mã số thuế. Học viên chưa có tên phụ huynh thì ô "Tên người mua" ở form để trống (không bắt
  buộc) và hóa đơn ra mẫu không thông tin; cột người mua ở danh sách hiện tên phụ huynh, không hiện
  tên học viên. Bản xem trước và bản phát hành dùng chung `buildMisaInvoiceInput`
  (`cloudflare/misa-invoice-input.ts`).
- **Công tắc `issueEnabled`** ("cho phép xuất hóa đơn thật", tách riêng khỏi công tắc `enabled` ở
  trên) chặn cả xem trước, xuất thủ công lẫn hàng chờ phát hành. Tắt công tắc này khi hệ thống còn đang phát triển/thử nghiệm để chắc chắn không
  phát hành nhầm hóa đơn thật, kể cả khi có giao dịch SePay khớp tiền thật.
- Thuế suất nhập một trong `KCT`, `KKKNT`, `0%`, `5%`, `8%`, `10%`, `KHAC:x%`. Số tiền thu là
  tổng đã gồm thuế; hệ thống tự tách tiền trước thuế và tiền thuế.
- **Thông số hóa đơn chỉnh ở UI** (Cài đặt → Tích hợp → MISA → "Thông số hóa đơn", không cần sửa
  code): nội dung dòng hàng trên hóa đơn (cột Tên hàng hóa, dịch vụ; biến `{period}`, `{studentName}`, `{studentCode}`, `{parentName}`,
  `{className}`; mặc định `Học phí {period} - {studentName}`, mẫu đã lưu từ trước không bị đổi theo), đơn vị tính theo khóa / theo tháng, hình thức thanh toán, nguồn tên người mua
  (mặc định tên phụ huynh; tên kế toán đã sửa tay ở form xuất hóa đơn được giữ). Để trống ô nào
  thì dùng mặc định.
- **Hai mẫu người mua** (`resolveMisaBuyer` trong `cloudflare/misa-invoice-fields.ts`): hồ sơ học
  viên (bảng `students`) có đủ tên phụ huynh + địa chỉ + CCCD/MST của phụ huynh (`nationalId`, người đóng
  tiền) thì hóa đơn ghi tên phụ huynh, địa chỉ và số đó điền vào **mã số thuế** (`BuyerTaxCode`); thiếu một trong ba thì ghi "Khách hàng chưa
  cung cấp thông tin", không gửi địa chỉ/CCCD/SĐT. Hệ thống không gửi mã khách hàng (`BuyerCode`)
  và chỉ gửi tên đơn vị (`BuyerLegalName`) khi có mã số thuế (MISA báo lỗi "Khi có [BuyerTaxCode] thì
  [BuyerLegalName] không được rỗng", kể cả mã là CCCD 12 số; thiếu thì lấy tên người mua). Có mã số thuế thì xuất hóa đơn đơn vị theo thông tin kế toán nhập. Có email (email nhập ở form hoặc email đăng nhập học viên) thì MISA
  luôn tự gửi email hóa đơn (không có công tắc tắt); phát hành xong không xếp tin Zalo.
- **CCCD/MST của phụ huynh điền vào mã số thuế**: người đóng tiền là phụ huynh nên số này là CCCD hoặc mã
  số thuế của phụ huynh, nhập ở ô "CCCD / MST phụ huynh" trong hồ sơ học viên (cột `nationalId`, không đổi
  tên cột). Hợp lệ: CCCD 12 số, MST 10 số, hoặc MST 13 số (ghi dạng `0101243150-733`); bỏ dấu cách/chấm/gạch
  khi kiểm. Ô "Mã số thuế / CCCD người mua" ở form xuất hóa đơn được điền sẵn số này khi hồ sơ có đủ tên phụ
  huynh + địa chỉ; thiếu một trong ba thì ô để trống và hóa đơn ra mẫu "không thông tin". Bản nháp tự
  dựng và hóa đơn từ hàng chờ dùng cùng quy tắc nên khớp với ô này. Form cảnh báo khi số trong hồ sơ có
  nhập nhưng sai độ dài (hồ sơ đó sẽ ra mẫu "không thông tin"). Có mã số thuế (CCCD hay MST) thì
  "Tên đơn vị" luôn có, mặc định là tên phụ huynh. `BuyerIDNumber` chỉ còn dùng ở công cụ thử MISA.
- Hóa đơn từ webhook SePay và từ thu tay chuyển khoản đều đi qua cùng hàng chờ MISA này; ứng dụng
  không còn công cụ giả lập thanh toán hay hóa đơn demo.
- **Zalo "đã thanh toán" luôn có và ưu tiên hơn hóa đơn**: webhook SePay khớp đủ tiền là xếp tin
  `INVOICE_ISSUED` ngay trong lượt webhook, kể cả khi MISA tắt hay không lập hóa đơn (có hóa đơn thì
  tin gắn theo hóa đơn, không thì gắn theo khoản phải thu), rồi chạy hàng chờ Zalo trước, hàng chờ
  MISA sau. Lý do: báo phụ huynh đã nhận tiền quan trọng hơn và không được chờ MISA.
- Tin Zalo `INVOICE_ISSUED` (nhãn "Thông báo hóa đơn" ở trang Tin Zalo, mẫu ZBS "Thông báo đã thanh
  toán thành công") **không** gửi link/mã tra cứu MISA — mẫu ZBS không có tham số này (xem
  `buildTemplateData` trong `cloudflare/zalo-outbox.ts`).
- **Hoàn tác một hóa đơn xuất nhầm/xuất test về "Chưa xuất hóa đơn"**: xoá dòng của nó trong bảng
  `sepay_invoices` (sau khi sao lưu bảng vào `/opt/vsteps/backups/`), phiếu thu giữ nguyên. Không
  đặt null các cột rồi giữ dòng: giao diện coi phiếu còn dòng hóa đơn là "Đang xuất"/"Đã xuất", và
  trạng thái `FAILED` đã duyệt sẽ bị hàng chờ tự phát hành lại lên MISA. Việc này chỉ gỡ bản ghi
  phía LMS; hóa đơn trên MISA (nếu là môi trường thật) phải huỷ/điều chỉnh trên portal MISA.

## Quy trình thu tay + báo Zalo + hóa đơn

Dùng khi chưa bật SePay (đối chiếu sao kê bằng tay). Nghiệp vụ nằm ở `requestPaymentAction` và
`collectTuitionAction` trong `cloudflare/worker.ts`, hàng chờ tin ở `cloudflare/zalo-outbox.ts`.

1. **Gửi yêu cầu thanh toán** (nút cùng tên ở màn học phí): xếp tin ZBS `PAYMENT_REQUEST`. Nút này
   cho **gửi lại** (`resend: true`): tin đã gửi/lỗi/đã nhận được đưa về hàng chờ để gửi thêm; tin
   đang chờ/đang gửi vẫn bị coi là trùng.
2. Khách chuyển khoản; nhân viên đối chiếu sao kê theo `order_code` trong tin, cũng chính là "Nội
   dung chuyển khoản" trên phiếu/QR.
3. Mở **Thu và báo học phí**, chọn **Chuyển khoản**, bấm **Lưu thu tiền** (action `collect`): phiếu
   sang `PAID`; nếu MISA **hoặc** Zalo đang bật thì lập hóa đơn `PENDING` (người mua chọn theo hai
   mẫu ở trên lúc phát hành), xếp tin `INVOICE_ISSUED` ("đã thanh toán") và
   kích hoạt hàng chờ Zalo trước rồi hàng chờ hóa đơn. API trả thêm `zaloMessage`.
4. **Tiền mặt**: không lập hóa đơn, không gửi tin.
5. Hóa đơn chỉ phát hành thật lên MISA khi `misa.enabled` **và** `misa.issueEnabled`; nếu không,
   hóa đơn nằm ở `PENDING` còn tin Zalo vẫn gửi bình thường.
6. Tin `INVOICE_ISSUED` chống trùng theo hóa đơn (hoặc theo khoản phải thu khi SePay khớp tiền mà
   không lập hóa đơn); tin lỗi gửi lại bằng nút "Gửi lại" ở trang Tin
   Zalo (chỉ dòng `FAILED`).

Lưu ý:

- Giao diện **không** tự làm mới số liệu tài chính; khi bật SePay, tiền về qua webhook nhưng phải
  tải lại trang để thấy.
- `order_code` = `studentTuitionPaymentCode` (`"HP"` + mã lớp + mã học viên,
  `cloudflare/tuition-billing.ts`), lùi về `paymentCode` của lệnh thanh toán khi thiếu mã lớp/học
  viên. **Rủi ro khi bật SePay**: `extractPaymentCode` (`cloudflare/sepay-engine.ts`) chỉ nhận `HP`
  + 6-10 ký tự chữ/số, mã dài hơn không tự khớp nên phải đối chiếu tay hoặc rút gọn mã trước khi
  bật.

## Zalo ZBS Template Message

Cấu hình ở **Cài đặt → Tích hợp → Zalo OA / ZBS** (chỉ ADMIN). Tài liệu chính thức:
[developers.zalo.me/docs/zbs-template-message](https://developers.zalo.me/docs/zbs-template-message/bat-dau/gioi-thieu-zbs-template-message)
(ZNS cũ, đổi thương hiệu thành ZBS Template Message). Ba tài khoản cần có trước khi gửi được tin:
Zalo OA (tài khoản chính thức của trung tâm), Ứng dụng/App (AppID + App Secret, tạo ở
`developers.zalo.me/createapp`), và ZBS Account (quản lý số dư/tính phí, liên kết với App qua
**ZBS → Cài đặt → Quản lý tài sản → Liên kết ứng dụng**).

- **Lấy Access Token + Refresh Token** (không cần dựng redirect URL riêng):
  `developers.zalo.me/tools/explorer` → chọn đúng App ở "Chọn ứng dụng" → đổi "Loại access token"
  sang **OA Access Token** → bấm nút chọn OA, tìm đúng OA của trung tâm → bấm nút đó lần nữa →
  đăng nhập và bấm "Đồng ý" ở màn hình Zalo hiện ra. Chỉ cần copy **Refresh Token** — hệ thống
  không lưu access token tĩnh, `cloudflare/zalo-zbs-client.ts` tự đổi lấy access token mới từ
  refresh token mỗi lần cần gửi.
- Trang tài liệu của Zalo (`developers.zalo.me/docs/**`) là SPA canvas-render nặng, dễ treo khi
  thao tác qua trình duyệt tự động — thao tác trực tiếp bằng tay nếu tự động hoá bị treo.
- **Dán vào form**: App ID, App Secret (lấy ở trang cài đặt App trên `developers.zalo.me`, không
  phải ở API Explorer), OA ID, Refresh Token (vừa lấy ở trên), rồi Template ID cho từng loại tin
  sau khi Zalo duyệt mẫu. Bấm "Kiểm tra kết nối" để xác nhận refresh token còn dùng được (gọi
  `ping()` trong `cloudflare/zalo-zbs-client.ts`).
- **Tham số động phải khớp đúng tên đã khai khi tạo mẫu trên Zalo** (xem `buildTemplateData` trong
  `cloudflare/zalo-outbox.ts`): mẫu "Yêu cầu thanh toán" dùng `order_code, ma_hoc_vien,
  transfer_amount, loai_hoc_phi, ten_hoc_vien`; mẫu "Thông báo đã thanh toán thành công" dùng
  `date, ma_hoc_vien, loai_hoc_phi, paid_fee, lop, chi_nhanh, ten_hoc_vien`. Đặt tên khác khi tạo
  mẫu thì Zalo từ chối gửi vì tham số không khớp; đổi mẫu ZBS đang gán cho một trong hai
  `templateId` thì phải đọc lại đúng tên tham số của mẫu mới (mục "Tham số" ở trang chi tiết mẫu,
  account.zalo.solutions) rồi sửa `buildTemplateData` theo, không suy đoán từ tên mẫu.
- **`loai_hoc_phi`** (dựng ở `cloudflare/zalo-tuition-label.ts` từ `billKey` của khoản phải thu)
  cho biết thu theo tháng hay theo khóa kèm khoảng ngày, năm 2 chữ số để luôn ≤ 30 ký tự (tối đa 28):
  `Theo tháng 01/09/26-30/09/26` (từ ngày 1 tháng đầu đến ngày cuối tháng cuối của kỳ thu) hoặc
  `Theo khóa 01/09/26-12/11/26` (từ buổi đầu đến buổi cuối của khóa).
- **Giới hạn độ dài tham số kiểu "Tên khách hàng" là 30 ký tự** — cả hai mẫu trên đều có tham số
  kiểu này (ví dụ `ten_hoc_vien`, `lop`). `loai_hoc_phi` luôn ≤ 30 ký tự nên an toàn với giới hạn này.
  Vượt quá 30 ký tự bị Zalo từ chối với `errorCode -1121 "<tên tham số>
  data breaks max length"`. Vì vậy `lop` chỉ gửi tên lớp, **không** ghép thêm tên chi
  nhánh — ghép thêm khiến phần lớn lớp vượt 30 ký tự (đã gặp lỗi này thật ngày 2026-09-28, sửa
  trong `buildTemplateData`).
- Refresh Token của Zalo **xoay vòng** mỗi lần dùng (token cũ hết hạn ngay khi lấy token mới) — hệ
  thống tự ghi token mới sau mỗi lần gửi thành công, không cần thao tác tay lại. Hệ quả: hai môi
  trường (local và production) không được dùng chung một Refresh Token — gửi từ môi trường này
  sẽ làm token của môi trường kia hết hạn, phải lấy lại token mới cho môi trường bị ảnh hưởng.
- Trạng thái triển khai, rủi ro và các bước còn chặn production: xem
  [`plans/260922-0846-tich-hop-sepay-misa-zalo/phase-7-zalo-zbs.md`](../plans/260922-0846-tich-hop-sepay-misa-zalo/phase-7-zalo-zbs.md).
- **Không** dán access token, app secret hay refresh token thật vào chat, file trong repo, hay log
  — chỉ nhập trực tiếp vào form Cài đặt → Tích hợp.

### Kiểm tra ZBS Account đã liên kết trước khi tự tạo mới

Một OA chỉ liên kết được với **đúng một** ZBS Account tại một thời điểm
(`account.zalo.solutions`, cổng quản lý số dư/tính phí riêng, khác `oa.zalo.me`). Nếu tự tạo một
ZBS Account mới và nạp tiền vào đó trong khi OA đã có ZBS Account khác liên kết từ trước, tiền nạp
không dùng được: hệ thống vẫn tính phí gửi tin từ ZBS Account **đang thật sự liên kết**, không phải
ZBS Account vừa tạo — gửi tin sẽ báo lỗi `errorCode -137 "ZBS Account charge failure"` dù ví vừa
nạp có tiền.

`errorCode -137` cũng có thể chỉ đơn giản là **ZBS Account đúng đang liên kết nhưng chưa đủ số dư**
tại đúng thời điểm gửi (đã gặp thật ngày 2026-09-28: cùng một OA/App, sau khi nạp thêm tiền vào đúng
ZBS Account đang liên kết thì lần gửi lại không còn lỗi này). Trước khi nghi ngờ sai liên kết, kiểm
tra số dư hiển thị ở góc trên `account.zalo.solutions` trước.

Trước khi tạo hoặc nạp tiền vào bất kỳ ZBS Account nào, kiểm tra route sau:

- **Khi nào dùng**: được thêm quyền Admin/quản trị viên trên một OA doanh nghiệp, hoặc cần nạp tiền
  cho ZBS trước khi gửi tin thật.
- **Cách tra**: đăng nhập `oa.zalo.me/manage` → chọn đúng OA → **Quản lý → Quản lý tài khoản →
  Quản lý liên kết** → xem mục "Danh sách tài khoản ZBS đã liên kết" (hiện ZBS ID, người liên kết,
  ngày liên kết).
- Mục đó **có dữ liệu** → OA đã có ZBS Account thật rồi. Không tạo ZBS Account mới, không tự nạp
  tiền vào ví riêng. Liên hệ đúng người ở trường "Người liên kết" (thường là người đại diện pháp
  luật hoặc người đã đăng ký ZBS Account đó — xem **Cài đặt → Thông tin doanh nghiệp** trên
  `oa.zalo.me` để biết người đại diện hiện tại), nhờ họ mời mình vào ZBS Account đó với quyền quản
  trị/nạp tiền (không chỉ quyền xem), rồi nạp tiền đúng vào ZBS Account đó
  (`account.zalo.solutions` sau khi được mời).
- Mục đó **trống** → OA chưa liên kết ZBS Account nào, lúc này mới được tạo ZBS Account mới và tự
  liên kết (**ZBS → Cài đặt → Quản lý tài sản → tab LIÊN KẾT OA**).
- Liên kết **Ứng dụng** (App) vào ZBS Account là thao tác riêng, độc lập với liên kết OA, làm ở tab
  **LIÊN KẾT ỨNG DỤNG** cùng trang — không bị ảnh hưởng bởi việc đổi ZBS Account nào đứng sau OA.
- Đổi ZBS Account nào đang liên kết với OA **không cần sửa gì** ở Cài đặt → Tích hợp → Zalo OA /
  ZBS của hệ thống LMS: cấu hình ở đó chỉ lưu App ID, App Secret, OA ID, Refresh Token, không lưu
  hay phụ thuộc mã ZBS Account nào.

## Sao lưu và phục hồi

`deploy.sh` tự dump database vào `/opt/vsteps/backups/truoc-deploy-<thời-điểm>.dump`
trước mỗi lần deploy và giữ 10 bản gần nhất.

```bash
# Sao lưu thủ công
ssh root@163.61.72.30 "docker exec vsteps-postgres pg_dump -U vsteps -d vsteps -Fc" > ban-sao.dump

# Phục hồi (dừng app trước để không ai ghi vào giữa chừng)
scp ban-sao.dump root@163.61.72.30:/tmp/
ssh root@163.61.72.30 "docker stop vsteps-app \
  && docker cp /tmp/ban-sao.dump vsteps-postgres:/tmp/r.dump \
  && docker exec vsteps-postgres pg_restore -U vsteps -d vsteps \
       --clean --if-exists --no-owner --no-privileges -j 2 /tmp/r.dump \
  && docker start vsteps-app"
```

Sao lưu chỉ tính là sao lưu khi **đã thử phục hồi thành công ít nhất một lần**.

## Rollback

`deploy.sh` giữ ảnh của bản trước dưới tag `vsteps-lms:previous`. Nếu bản mới không
trả lời `/api/health` trong 30 giây, script **tự quay về ảnh cũ** và trả về lỗi để
job CI đỏ.

Database **không** được khôi phục tự động — đó là chủ ý, vì khôi phục đè lên dữ
liệu người dùng vừa nhập là thiệt hại lớn hơn. Xem log rồi quyết định bằng tay.

Quay về thủ công:

```bash
ssh root@163.61.72.30 "docker tag vsteps-lms:previous vsteps-lms:latest \
  && cd /opt/actions-runner/_work/vsteps-lms/vsteps-lms/deploy \
  && docker compose --env-file /opt/vsteps/.env up -d app"
```

## Dựng lại từ đầu trên một máy mới

1. **Docker**: cài `docker-ce` + `docker-compose-plugin` theo kho chính thức của Docker.
2. **Thư mục cấu hình**: tạo `/opt/vsteps/backups`, tạo `.env` theo bảng trên,
   `chown -R github-runner:github-runner /opt/vsteps` và `chmod 600 .env`.
   Runner cần đọc được file này; để nguyên quyền root là job hỏng ngay bước đầu.
3. **Self-hosted runner**: tải runner từ `actions/runner`, đăng ký vào repo với
   nhãn `vsteps` (nhãn này khớp `runs-on` trong workflow), cài thành dịch vụ chạy
   bằng user `github-runner`, và thêm user đó vào nhóm `docker`.
4. **Reverse proxy**: `clpctl site:add:reverse-proxy --domainName=<tên-miền>
   --reverseProxyUrl='http://127.0.0.1:3100' ...` rồi
   `clpctl lets-encrypt:install:certificate --domainName=<tên-miền>`.
5. **Dữ liệu**: nếu chuyển từ hệ thống cũ, xem mục dưới.
6. Đẩy một commit lên `main` để workflow chạy lần đầu.

## Chuyển dữ liệu từ hệ thống cũ

Xem [`dong-bo-database.md`](dong-bo-database.md). Đừng restore toàn bộ database từ
máy cũ sang: hai máy lệch schema, làm vậy sẽ kéo máy mới lùi về schema cũ.

## Khi job CI đỏ

```bash
gh run list --limit 5
gh run view <id> --log-failed
ssh root@163.61.72.30 "docker logs --tail 80 vsteps-app"
ssh root@163.61.72.30 "systemctl status actions.runner.buivanvu94-vsteps-lms.vsteps-vps"
```

| Triệu chứng | Nguyên nhân thường gặp |
| --- | --- |
| `không tìm thấy /opt/vsteps/.env` | File thuộc về root, `github-runner` không đọc được |
| Job treo ở hàng đợi | Dịch vụ runner chết, hoặc nhãn `runs-on` không khớp |
| Build hết bộ nhớ | Máy hết RAM — kiểm tra bằng `free -h`, cân nhắc tắt bớt dịch vụ CloudPanel |
| App không lên, CI tự quay về bản cũ | Đọc log app; database đã được sao lưu trước đó |

## Checklist trước khi mở cho người dùng thật

- [ ] `https://<tên-miền>/api/health` trả về `ok: true` qua Internet, HTTP tự chuyển sang HTTPS.
- [ ] Đăng nhập thử bằng **một tài khoản giáo viên thật**, không chỉ tài khoản quản trị.
- [ ] `AUTH_SECRET` là chuỗi sinh riêng cho máy này.
- [ ] `ALLOW_DEMO_LOGIN` không đặt hoặc đặt `false`.
- [ ] Nếu có dữ liệu cũ: đã chuyển và đối chiếu, `vps_app_state` giữ nguyên làm đường lùi.
- [ ] Đã thử phục hồi một bản sao lưu thành công.
- [ ] PostgreSQL chỉ nghe trên `127.0.0.1` (`ss -ltnp | grep 5433`).

## Hệ thống cũ trên Coolify

Bản đang phục vụ trung tâm trước đây chạy trên VPS `149.28.131.241` qua Coolify,
deploy từ repo cũ `tanoshitest/steps-lms`. Máy đó vẫn chạy tầng lưu trữ JSON và
**không** chịu ảnh hưởng của quy trình trong tài liệu này. Hướng dẫn Coolify nằm
trong lịch sử git của repo cũ; không nhân bản lại ở đây.
