# Season 1 — Final Blocker Audit

## Ruang lingkup

Audit ini menyelesaikan blocker desain DFOD, repayment type COD, unique key/replay, dan
pembayaran pickup bertahap. Semua pemeriksaan bersifat read-only.

Sumber yang diperiksa:

- seluruh source Apps Script legacy hasil ekstraksi ZIP;
- `Setoran.gs`, `PaymentPickup.gs`, source frontend, dan dokumentasi legacy;
- source dan git history `jfs-middleware-refactor`;
- Google Sheet legacy `NEXTGEN`, termasuk formula dan RAW;
- dua backup Google Sheet lama;
- respons middleware tanggal 26–28 Juli 2026;
- replay kedua terhadap tanggal yang sama;
- respons 13 Juli 2026 untuk pencocokan repayment type dengan backup Sheet.

PII tidak disalin ke dokumen. Waybill, kurir, receiver, alamat, dan barang pada contoh
telah dimasking atau dipseudonimkan.

## 1. Formula DFOD

### Bukti formula Google Sheet

Formula ditemukan pada `NEXTGEN → MASTER_SETORAN!C2:C`:

```gs
=IF(B2<>"",
  SUMIFS(
    RAW_DISPATCH!C:C,
    RAW_DISPATCH!B:B,B2,
    RAW_DISPATCH!G:G,"penerimaan normal"
  ),
"")
```

Header sumber:

```text
RAW_DISPATCH!B = KURIR
RAW_DISPATCH!C = ONGKIR
RAW_DISPATCH!G = STATUS
```

Formula lama berarti:

```text
dfod(courier, operationalDate) =
  SUM RAW_DISPATCH.ONGKIR
  WHERE normalized KURIR = normalized courier
    AND normalized STATUS = "penerimaan normal"
    AND record berada pada tanggal RAW yang sedang diproses
```

Sheet lama mengganti/ membersihkan RAW per siklus harian, sehingga formula tidak
memiliki filter tanggal eksplisit. NEXTGEN menyimpan banyak tanggal; implementasi baru
wajib menambahkan scope `operationalDate`.

### Field yang tidak dipakai

Formula DFOD lama tidak membaca:

- `PEMBAYARAN`;
- `COD STATUS`;
- `COD VALUE`;
- `WAYBILL`;
- `SERVICE`;
- `BERAT`;
- receiver, alamat, atau barang.

Sampel tiga hari menunjukkan alasan formula tersebut tetap menghasilkan nilai DFOD:

| Status | Pembayaran | Jumlah | ONGKIR positif | Total ONGKIR |
| --- | --- | ---: | ---: | ---: |
| Penerimaan normal | DFOD | 19 | 19 | 1.820.763,78 |
| Penerimaan normal | Bulanan | 594 | 0 | 0 |
| Penerimaan normal | Tunai | 36 | 0 | 0 |
| Belum diterima | DFOD | 7 | 7 | 942.460 |

Jadi `PEMBAYARAN=DFOD` berkorelasi sempurna dengan ONGKIR positif pada sampel, tetapi
formula source of truth tetap tidak memfilter field PEMBAYARAN. Tujuh record DFOD yang
belum diterima dikecualikan oleh filter STATUS.

### Bukti source Apps Script

- `Setoran.gs:155–168` memanggil `syncDispatch()`, `syncCOD()`, lalu melakukan flush.
- Definisi `syncDispatch()` dan `syncCOD()` tidak ada dalam arsip ZIP.
- `Setoran.gs:543–565` hanya membulatkan nilai DFOD bila cell tidak mempunyai formula;
  bila formula ada, nilainya dipertahankan.
- `Settings.gs` menandai `MASTER_SETORAN` sebagai formula-preserved sheet.

Tidak ada formula DFOD lain di Apps Script, middleware, dokumentasi, atau attachment.

### Formula final hasil audit

```text
eligibleDispatch =
  tenant/outlet/date scoped RAW_DISPATCH
  dengan normalized STATUS = "penerimaan normal"

dfod =
  SUM eligibleDispatch.ONGKIR
  GROUP BY normalized KURIR
```

Untuk kesetiaan terhadap implementasi lama, jangan menambahkan filter
`PEMBAYARAN=DFOD`. Field PEMBAYARAN tetap disimpan untuk observability dan anomaly
check.

## 2. Contoh RAW_DISPATCH termasking

### Eligible, ONGKIR masuk DFOD

```json
{
  "waybill": "***8016",
  "kurir": "KURIR_62C5",
  "ongkir": 43256,
  "waktu": "2026-07-26 11:00:19",
  "receiver": "***",
  "alamat": "***",
  "status": "penerimaan normal",
  "berat": 11,
  "pembayaran": "DFOD",
  "service": "FastTrack",
  "codStatus": "Tidak COD",
  "codValue": 0,
  "barang": "***",
  "classification": "INCLUDE_ONGKIR_IN_DFOD"
}
```

### Eligible, tetapi kontribusi DFOD nol

```json
{
  "waybill": "***7330",
  "kurir": "KURIR_62C5",
  "ongkir": 0,
  "waktu": "2026-07-26 11:00:23",
  "receiver": "***",
  "alamat": "***",
  "status": "penerimaan normal",
  "berat": 7,
  "pembayaran": "Bulanan",
  "service": "FastTrack",
  "codStatus": "ada COD",
  "codValue": 280939,
  "barang": "***",
  "classification": "INCLUDE_ONGKIR_IN_DFOD_VALUE_ZERO"
}
```

### Tidak eligible walaupun PEMBAYARAN DFOD

```json
{
  "waybill": "***7720",
  "kurir": "KURIR_2050",
  "ongkir": 57530,
  "waktu": "2026-07-28 10:43:09",
  "receiver": "***",
  "alamat": "***",
  "status": "belum diterima",
  "berat": 17,
  "pembayaran": "DFOD",
  "service": "FastTrack",
  "codStatus": "Tidak COD",
  "codValue": 0,
  "barang": "***",
  "classification": "EXCLUDE_BY_STATUS"
}
```

### Tidak eligible; COD VALUE juga tidak masuk DFOD

```json
{
  "waybill": "***7349",
  "kurir": "KURIR_9BA0",
  "ongkir": 0,
  "waktu": "2026-07-26 09:04:15",
  "receiver": "***",
  "alamat": "***",
  "status": "belum diterima",
  "berat": 6,
  "pembayaran": "Bulanan",
  "service": "FastTrack",
  "codStatus": "ada COD",
  "codValue": 92260,
  "barang": "***",
  "classification": "EXCLUDE_BY_STATUS"
}
```

## 3. Mapping repaymentType

### Source middleware

`jfs-middleware-refactor/server.js:453–466` meneruskan:

```js
{
  waybillNo: item.waybillNo || "",
  codAmount: item.codAmount || 0,
  repaymentStatus: item.repaymentStatus || 0,
  repaymentType: item.repaymentType || 0,
  signTime: item.signTime || "",
  dispatchStaffName: item.dispatchStaffName || ""
}
```

Tidak ada enum, dictionary conversion, switch, atau label mapping dalam source maupun
git history middleware.

### Bukti pencocokan historis

Backup Google Sheet `backup nextgen`, `RAW_COD`, tanggal 13 Juli 2026 mempunyai:

- 5 record TYPE `Qris COD`;
- 46 record TYPE `Lainnya`.

Endpoint tanggal yang sama mengembalikan tepat 51 record. Pencocokan
`waybill + codAmount + signTime` menghasilkan:

| repaymentTypeCode | Label Sheet | Jumlah cocok | Konflik |
| ---: | --- | ---: | ---: |
| 2 | `Qris COD` | 5 | 0 |
| 1 | `Lainnya` | 46 | 0 |

Data 28 Juli menambah bukti:

| repaymentTypeCode | Label Sheet | Jumlah teramati |
| ---: | --- | ---: |
| 0 | `Lainnya` | 11 |

Mapping yang didukung bukti:

```text
2 → Qris COD
0 → Lainnya / non-QRIS
1 → Lainnya / non-QRIS
```

Aturan Season 1:

```text
repaymentTypeCode == 2 → codQris
repaymentTypeCode in [0,1] → codTunai
kode lain/null → anomaly, jangan diklasifikasikan diam-diam
```

### Perubahan minimum middleware yang direkomendasikan

Walaupun mapping sudah ditemukan, kontrak sebaiknya dibuat eksplisit tanpa menghapus
field lama:

```json
{
  "repaymentType": 2,
  "repaymentTypeCode": 2,
  "repaymentTypeLabel": "Qris COD"
}
```

Untuk kode 0/1, label teramati adalah `Lainnya`. Middleware sebaiknya meneruskan label
asli upstream/dictionary JFS, bukan hard-code berdasarkan observasi ini, bila label
tersebut tersedia.

## 4. Audit duplicate dan replay 26–28 Juli

### Snapshot awal

| RAW | Rows | Distinct waybill | Waybill berulang | Exact duplicate | Candidate key collision |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pickup | 80 | 80 | 0 | 0 | 0 |
| Dispatch | 785 | 785 | 0 | 0 | 0 |
| COD | 139 | 139 | 0 | 0 | 0 |

Timestamp bukan identifier:

- Dispatch mempunyai 17 timestamp yang digunakan oleh dua waybill berbeda.
- COD mempunyai 1 timestamp yang digunakan oleh dua waybill berbeda.
- Maksimum yang diamati adalah dua record per timestamp.

Tidak ada upstream record ID pada respons middleware. Daftar field respons tepat sama
dengan mapping `clean` di `server.js`; jika upstream JFS mempunyai ID internal, field
tersebut dibuang sebelum response middleware.

### Replay kedua

Tanggal historis 26/27 stabil: tidak ada addition, removal, atau perubahan field.

Tanggal 28 berubah:

| RAW | Added | Removed | Existing changed | Perubahan |
| --- | ---: | ---: | ---: | --- |
| Pickup | 2 | 0 | 0 | record baru |
| Dispatch | 0 | 0 | 40 | hanya `status` berubah |
| COD | 9 | 0 | 0 | record baru |

Empat puluh dispatch mempertahankan waybill dan `waktu`, tetapi status berubah. Dengan
key kandidat yang memasukkan normalized status, replay akan membuat 40 event/row baru
untuk business record yang sama. Jika normalizer menjumlahkan seluruh event, kewajiban
dapat terduplikasi.

## 5. Unique key hasil audit

### RAW_PICKUP

```text
(tenantId, outletId, waybillNo)
```

Status: **diterima untuk Season 1**.

Risiko:

- upstream dapat menggunakan ulang waybill atau melakukan koreksi tanggal;
- belum ada record ID upstream.

Mitigasi: perubahan payload meng-update RAW yang sama dan menghasilkan payload hash
baru; anomaly bila operational date berubah.

### RAW_DISPATCH

Kandidat awal:

```text
(tenantId, outletId, waybillNo, sourceTime, normalizedStatus)
```

Status: **ditolak sebagai logical unique key** karena replay membuktikan status berubah
pada 40 record.

Key Season 1:

```text
(tenantId, outletId, waybillNo, sourceTime)
```

Status diperlakukan mutable source field. Jika histori setiap transition diperlukan,
gunakan snapshot/event table terpisah; jangan menjadikan transition sebagai record
keuangan tambahan.

Risiko:

- dua upstream record untuk waybill dan waktu identik belum pernah terlihat;
- sourceTime tanpa timezone;
- koreksi sourceTime akan membentuk row baru.

### RAW_COD

```text
(tenantId, outletId, waybillNo, repaymentTypeCode, signTime)
```

Status: **diterima untuk Season 1**, tetap dengan anomaly guard.

Risiko:

- belum ada receipt ID;
- type/signTime dapat dikoreksi;
- kemungkinan multiple receipt identik belum dapat dibuktikan dari tiga hari.

## 6. sourceRecordHash

Gunakan SHA-256 atas canonical JSON field response. Hash bukan pengganti tenant/outlet
scope dan tidak memasukkan:

- fetchedAt;
- syncedAt;
- createdAt/updatedAt;
- database ID;
- sync status;
- normalization version.

Canonicalization:

- urutan key tetap;
- string raw dipertahankan;
- Decimal menjadi canonical decimal string;
- null, empty string, dan zero dibedakan;
- timestamp source dipertahankan dalam bentuk raw.

Field hash:

```text
Pickup:
waybillNo, pickNetwork, destination, settlement, totalFreight, freight,
weight, staff, sender, service, receiver, address

Dispatch:
waybillNo, kurir, ongkir, waktu, receiver, address, status, berat,
pembayaran, service, codStatus, codValue, barang

COD:
waybillNo, codAmount, repaymentStatus, repaymentType, signTime,
dispatchStaffName
```

Gunakan:

- `sourceRecordKey` untuk logical upsert;
- `sourceRecordHash` untuk exact duplicate/no-change detection;
- hash berubah pada status dispatch replay, tetapi logical key tetap sama.

## 7. Pembayaran pickup bertahap

Diskon bukan atribut setiap `PickupPayment`. Tambahkan supporting model desain
`PickupSettlementRevision` dalam domain Pickup:

```text
PickupSettlementRevision
  masterPickupId
  revision
  discountAmount
  VALID | SUPERSEDED | VOID
  actor/reason/timestamps
```

Satu MasterPickup mempunyai tepat satu settlement revision `VALID`, tetapi dapat
mempunyai banyak `PickupPayment` `VALID`.

```text
activeDiscountAmount =
  discountAmount dari PickupSettlementRevision VALID

finalPickupObligation =
  MasterPickup.freightAmount - activeDiscountAmount

pickupTotalPaid =
  SUM PickupPayment.receivedAmount
  WHERE recordStatus = VALID

pickupRemainingAmount =
  finalPickupObligation - pickupTotalPaid
```

Status:

```text
pickupRemainingAmount > 0 → BELUM_LUNAS
pickupRemainingAmount = 0 → LUNAS
pickupRemainingAmount < 0 → LEBIH_BAYAR
```

Invariant:

- `0 <= activeDiscountAmount <= freightAmount`;
- final obligation tidak boleh negatif;
- correction diskon membuat settlement revision baru;
- payment tidak membawa/menjumlahkan diskon;
- sync pickup tidak mengubah settlement revision atau payment;
- payment dan discount revision tidak hard delete.

## 8. Blocker tersisa

Tidak ada blocker desain yang tersisa dalam ruang lingkup audit ini. Formula DFOD,
repayment type, replay key, dan desain pickup payment telah diselesaikan.

Hal berikut tetap perlu difinalkan sebelum implementasi terkait, tetapi bukan alasan
untuk menebak atau mengubah hasil audit:

1. Middleware sebaiknya meneruskan `repaymentTypeCode` dan label resmi agar kontrak
   tidak bergantung pada reverse mapping.
2. Kode repayment baru/null harus tetap menjadi anomaly sampai ada codebook baru.
3. Candidate key COD dan dispatch tetap mempunyai risiko residual selama upstream ID
   tidak tersedia.
4. Role/approval detail, retention PII, multi-outlet mapping, serta parameter
   operasional sync tetap tercatat di `SEASON1_OPEN_QUESTIONS.md`.
