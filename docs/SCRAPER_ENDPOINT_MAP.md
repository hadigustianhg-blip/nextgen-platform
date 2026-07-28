# Peta Endpoint `jfs-middleware-refactor`

## Ruang lingkup

Audit read-only dilakukan terhadap `server.js`, seluruh `src/`, test contract, fixture, dan dokumentasi dalam `jfs-middleware-refactor/`. Source dibagi menjadi endpoint legacy yang masih langsung berada di `server.js` dan endpoint modular dengan alur route → controller → service → scraper.

Tidak ada prefix API atau versioning. Semua path dipasang langsung pada root Express.

## Ringkasan endpoint

| Method | Path | Jenis | Fungsi |
| --- | --- | --- | --- |
| GET | `/` | Legacy | Health/informational text. |
| GET | `/set-token` | Legacy | Mengganti token JFS global saat runtime. |
| POST | `/jfs-auth/login` | Modular | Login ke JFS memakai account/password dan menyimpan token global. |
| GET | `/jfs-pickup` | Legacy | Mengambil pickup/shipping waybill per tanggal. |
| GET | `/jfs-dispatch` | Legacy | Mengambil dispatch waybill per tanggal. |
| GET | `/jfs-cod` | Legacy | Mengambil detail collection receipt COD per tanggal. |
| GET | `/jfs-ibk-report` | Legacy | Mengambil record dana IBK dari kemarin hingga hari ini. |
| GET | `/jfs-order-sync` | Legacy | Mengambil order OMS dan detail setiap order. |
| GET | `/jfs-inventory` | Legacy | Mengambil task inventory lalu detail setiap task. |
| GET | `/jfs-aging-sign` | Modular | Mengambil report aging/sign untuk tanggal tertentu. |
| GET | `/jfs-sensitive` | Modular | Mengambil detail penerima/alamat sebuah waybill. |
| GET | `/jfs-inventory-detail` | Modular | Mengambil report detail inventory terpaginasikan. |
| POST | `/jfs-waybill-status-batch` | Modular | Mengambil status batch waybill, maksimal 500 waybill unik. |

## Kontrak rinci

### `GET /`

Request: tanpa parameter.

Response `200`, teks:

```text
API JFS Middleware (Pickup + Dispatch) 🚀
```

### `GET /set-token`

Request:

- Query wajib `token`.
- Tidak ada autentikasi inbound.

Response `200`:

```json
{
  "message": "Token berhasil diupdate",
  "token": "<token yang baru>"
}
```

Response `400`:

```json
{ "error": "Token wajib diisi" }
```

Efek samping: mengganti `AUTH_TOKEN` global dan token dalam auth manager untuk semua caller dan semua endpoint pada instance tersebut.

### `POST /jfs-auth/login`

Request:

- Header wajib `X-Auth-Key`, harus sama dengan environment `JFS_AUTH_KEY`.
- JSON body:

```json
{
  "account": "akun-jfs",
  "password": "password-jfs"
}
```

Response `200`:

```json
{
  "success": true,
  "message": "Login JFS berhasil",
  "networkCode": "kode jaringan dari profil JFS",
  "name": "nama dari profil JFS"
}
```

Token JFS tidak dikembalikan, tetapi disimpan global di memory.

Response `401` jika API key salah/kosong:

```json
{ "success": false, "error": "UNAUTHORIZED" }
```

Response `401` bila credential/login JFS gagal:

```json
{ "success": false, "error": "JFS_LOGIN_FAILED" }
```

### `GET /jfs-pickup`

Request:

- Query `date` opsional, format yang diharapkan `YYYY-MM-DD`.
- Default menggunakan `new Date().toISOString().slice(0, 10)`, yaitu tanggal UTC, bukan WIB.
- Token global harus tersedia.

Upstream: POST form-data ke JFS shipping waybill list. Pagination size 100 tanpa batas maksimum. Payload mengunci `pickFinanceCode=BDO000`, `pickNetworkCode=SUM001A`, `isVoid=0`, serta time/input-time satu hari penuh.

Response `200`:

```json
{
  "total": 1,
  "data": [{
    "waybillNo": "",
    "pickNetwork": "",
    "destination": "",
    "settlement": "",
    "totalFreight": 0,
    "freight": 0,
    "weight": 0,
    "staff": "",
    "sender": "",
    "service": "",
    "receiver": "",
    "address": ""
  }]
}
```

Error: `400 {"error":"Token kosong"}`; helper dapat mengirim `401 {"error":"TOKEN EXPIRED","detail":"Silakan update token JFS"}`; error lain `500 {"error":"Gagal ambil data pickup","detail":...}`.

### `GET /jfs-dispatch`

Request:

- Query `date` opsional; default tanggal WIB.
- Token global harus tersedia.

Upstream: POST JSON ke dispatch waybill list, maksimal 20 halaman × 100. Payload mengunci `oneNetwork=BDO000`, `dispatchFinanceCode=BDO000`, `dispatchFinanceId=183`, `countryId=1`.

Response `200`:

```json
{
  "success": true,
  "total": 1,
  "page": 1,
  "data": [{
    "waybillNo": "",
    "kurir": "",
    "ongkir": 0,
    "waktu": "",
    "receiver": "",
    "address": "",
    "status": "",
    "berat": 0,
    "pembayaran": "",
    "service": "",
    "codStatus": "",
    "codValue": 0,
    "barang": ""
  }]
}
```

Error: token kosong `400`; error lain `500` dengan `error` dan raw `detail`.

### `GET /jfs-cod`

Request:

- Query `date` opsional; default tanggal WIB.
- Token global harus tersedia.

Upstream: POST JSON ke collection receipt detail, maksimal 20 × 100. Payload mengunci `revenueNetworkCode=SUM001A` dan `financeCenterId=BDO000`.

Response `200`:

```json
{
  "success": true,
  "total": 1,
  "page": 1,
  "data": [{
    "waybillNo": "",
    "codAmount": 0,
    "repaymentStatus": 0,
    "repaymentType": 0,
    "signTime": "",
    "dispatchStaffName": ""
  }]
}
```

Error: token kosong `400`; upstream/error lain `500`.

### `GET /jfs-ibk-report`

Request:

- Tidak menerima tanggal.
- Periode selalu kemarin `00:00:00` hingga hari ini `23:59:59` WIB.
- Token global harus tersedia.

Upstream: POST JSON ke IBK fund report, maksimum 20 × 100. Payload mengunci `financialCenterId=183` dan `networkId=2015`. URL upstream tetap mengandung `current=1&size=100` walaupun body mengubah `current`.

Response `200`:

```json
{
  "success": true,
  "total": 1,
  "page": 1,
  "data": [{
    "networkName": "",
    "tradeType": 0,
    "feeTypeName": "",
    "feeItemTypeName": "",
    "date": "",
    "amount": 0
  }]
}
```

Error: token kosong `400`; error lain `500`.

### `GET /jfs-order-sync`

Request:

- Query `start` dan `end` opsional; nilai diteruskan apa adanya sebagai datetime.
- Default `start`: awal bulan WIB; default `end`: waktu saat ini WIB.
- Token global harus tersedia.

Upstream:

1. POST form-data ke OMS order page, size 100, pagination tanpa max page.
2. Untuk setiap order, GET detail by log menggunakan `item.id`.
3. Jeda 1,5 detik antar halaman dan detail.

Response `200`:

```json
{
  "success": true,
  "total": 1,
  "startTime": "YYYY-MM-DD HH:mm:ss",
  "endTime": "YYYY-MM-DD HH:mm:ss",
  "syncTime": "YYYY-MM-DD HH:mm:ss",
  "data": [{
    "id": "",
    "orderSourceName": "",
    "orderSourceCode": "",
    "waybillId": "",
    "customerName": "",
    "customerCode": "",
    "status": "",
    "statusCode": "",
    "senderName": "",
    "senderCompany": "",
    "senderPhone": "",
    "senderProvince": "",
    "senderCity": "",
    "senderArea": "",
    "senderAddress": "",
    "receiverName": "",
    "receiverPhone": "",
    "receiverProvince": "",
    "receiverCity": "",
    "receiverArea": "",
    "receiverAddress": "",
    "goodsName": "",
    "goodsType": "",
    "weight": 0,
    "packageNumber": 0,
    "expressType": "",
    "expressTypeCode": "",
    "paymentMode": "",
    "sendName": "",
    "sendCode": "",
    "pickNetwork": "",
    "pickNetworkCode": "",
    "proxyArea": "",
    "proxyAreaCode": "",
    "customerOrderTime": "",
    "dispatchNetworkTime": "",
    "inputTime": "",
    "syncTime": ""
  }]
}
```

Detail order yang gagal hanya di-log dan dilewati, sehingga response sukses dapat parsial. Error tingkat outer: token kosong `400`; lainnya `500 {"success":false,"error":...}`.

### `GET /jfs-inventory`

Request:

- Query `date` opsional; default tanggal WIB.
- Token global harus tersedia.

Upstream dua tahap:

1. Semua task `queryOpsCheckForPage`, page size 20, tanpa batas maksimum.
2. Untuk setiap `checkCode`, semua detail `queryOpsCheckDetailForPage`, size 20, juga tanpa batas maksimum.

Response `200` normal:

```json
{
  "success": true,
  "date": "YYYY-MM-DD",
  "totalCheckCode": 1,
  "total": 1,
  "data": [{
    "billCode": "",
    "waybillNo": "",
    "checkCode": "",
    "checkNetworkName": "",
    "checkNetworkCode": "",
    "status": "",
    "checkUser": "",
    "checkTime": "",
    "inStockTime": "",
    "codMoney": 0,
    "dfodCodMoney": 0,
    "secondLevelTypeName": "",
    "stockTime": 0,
    "planSignTime": "",
    "fieldFilled": "",
    "rebackStatus": ""
  }]
}
```

Jika tidak ada task, response tidak mempunyai `totalCheckCode`: `{"success":true,"date":"...","total":0,"data":[]}`. Error token `400`; token expired tertentu `401`; error lain `500`.

### `GET /jfs-aging-sign`

Request:

- Query `date` opsional; default tanggal WIB.
- Token global harus tersedia.

Upstream report hanya meminta `current=1,size=20`; tidak ada pagination lanjutan.

Response `200`:

```json
{
  "success": true,
  "total": 1,
  "data": [{
    "signTimelyTotal": 0,
    "networkName": "",
    "signDelayOtherTotal": 0,
    "signTimelyRate": "0%",
    "problemOtherTotal": 0,
    "queryTime": "",
    "sendCenterTotal": 0,
    "signDelayNoSignTotal": 0
  }]
}
```

Error: token kosong `400`; lainnya `500 {"error":"Gagal ambil aging sign","detail":"..."}`.

### `GET /jfs-sensitive`

Request:

- Query `waybillNo`; tidak divalidasi wajib/non-kosong.
- Token global harus tersedia.

Response `200`:

```json
{
  "success": true,
  "data": {
    "waybillNo": "",
    "dispatchTime": "",
    "dispatchStaffName": "",
    "receiverName": "",
    "receiverMobilePhone": "",
    "receiverTelphone": "",
    "receiverDetailedAddress": "",
    "chargeWeight": 0,
    "abnormalName": "",
    "updateTime": "",
    "codMoney": 0,
    "goodsName": ""
  }
}
```

Error: token kosong `400 {"error":"Token kosong"}`; lainnya `500 {"success":false,"error":"..."}`.

### `GET /jfs-inventory-detail`

Request query:

- `startDate` opsional, default hari ini WIB;
- `endDate` opsional, default `startDate`;
- `billCode` opsional;
- `size` opsional, default 100, integer 1–500;
- `maxPage` opsional, default 100, integer 1–500;
- tanggal wajib strict `YYYY-MM-DD` dan start tidak boleh sesudah end.

Response `200`:

```json
{
  "success": true,
  "total": 1,
  "pages": 1,
  "data": [{
    "billCode": "",
    "customerName": "",
    "customerCode": "",
    "goodsName": "",
    "packageNumber": 0,
    "weight": 0,
    "volume": 0,
    "inventoryHours": 0,
    "transitHours": 0,
    "codNeed": "",
    "isReceiverPay": "",
    "isRefund": "",
    "isProblemPiece": "",
    "waybillStatus": "",
    "operateSiteType": "",
    "operateSiteName": "",
    "destinationSiteName": "",
    "sendNextStation": "",
    "problemCategory": "",
    "problemType": "",
    "abnormalRemark": "",
    "takeScanTime": "",
    "operateScanTime1": "",
    "operateScanTime2": "",
    "abnormalRegisterTime": "",
    "proxyAreaName": "",
    "takeProxyAreaName": "",
    "destinationProxyAreaName": "",
    "takeSiteName": "",
    "firstDistributionName": "",
    "destinationDistributionName": "",
    "expressTypeName": "",
    "deliverCount": 0,
    "dispatchName": "",
    "shipHour": ""
  }]
}
```

Error validasi/token `400`; lainnya `500` dengan `error` dan `detail`.

### `POST /jfs-waybill-status-batch`

Request body:

```json
{
  "waybills": ["WB001", "WB002"],
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD"
}
```

`startDate` default hari ini WIB; `endDate` default `startDate`. Waybill dinormalisasi menjadi string unik non-kosong, maksimal 500, lalu dikirim ke JFS per batch 100. Payload upstream selalu memakai `scanSiteCode=SUM001A`, `scanType=收件`, `signType=3`.

Response `200`:

```json
{
  "success": true,
  "totalRequested": 2,
  "totalFound": 1,
  "totalNotFound": 1,
  "data": [{
    "sourceWaybill": "WB001",
    "status": "success",
    "billCode": "WB001",
    "saleMan": "",
    "currentScanSite": "",
    "scanUser": "",
    "estimateTime": "",
    "currentScanTime": "",
    "scanTime": "",
    "orderSourceName": "",
    "inputTime": "",
    "scanSiteCode": "",
    "scanSite": "",
    "recordId": "",
    "stayReason": "",
    "isVoid": "",
    "receiverCityName": "",
    "currentScanType": "",
    "scanType": "",
    "estimateTimeStandard": "",
    "problemReason": ""
  }, {
    "sourceWaybill": "WB002",
    "status": "not_found"
  }],
  "errors": []
}
```

Batch upstream yang gagal menghasilkan satu entry per waybill pada `errors` dengan `sourceWaybill`, `status:"failed"`, dan `error`; endpoint tetap dapat mengembalikan `success:true`. Input/token/date error `400 {"success":false,"error":"..."}`; unexpected error `500`.

## Catatan kontrak

- Response dan status endpoint legacy tidak konsisten.
- Beberapa `detail`/`error` memasukkan object atau pesan upstream mentah.
- Tidak ada inbound authentication pada endpoint scraper.
- Tidak ada tenant/client/outlet pada request maupun response.
