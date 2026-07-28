# Season 1 — Data Mapping

## Ruang lingkup dan metode audit

Dokumen ini memetakan kontrak data untuk delapan modul Phase 2 Season 1:

1. `RAW_PICKUP`
2. `RAW_DISPATCH`
3. `RAW_COD`
4. `MASTER_PICKUP`
5. `MASTER_SETORAN`
6. `PICKUP_PAYMENT`
7. `COURIER_SETTLEMENT_PAYMENT`
8. `COURIER_SETTLEMENT_TRANSFER`

Audit endpoint dilakukan read-only terhadap endpoint production pada tanggal operasional
26, 27, dan 28 Juli 2026. Respons hanya dianalisis dari file sementara di luar repository.
Tidak ada payload yang disalin ke dokumen karena pickup dan dispatch mengandung PII
pengirim, penerima, serta alamat.

Jumlah record yang diamati:

| Endpoint | 26 Juli | 27 Juli | 28 Juli | Total sampel |
| --- | ---: | ---: | ---: | ---: |
| `/jfs-pickup` | 26 | 45 | 9 | 80 |
| `/jfs-dispatch` | 331 | 235 | 219 | 785 |
| `/jfs-cod` | 71 | 57 | 11 | 139 |

Temuan ini adalah kontrak teramati, bukan jaminan kontrak upstream. Middleware legacy
mengubah nilai kosong menjadi `""` atau `0`, sehingga tipe asli dan perbedaan antara
“tidak tersedia” dan nilai nol sudah hilang sebelum mencapai NEXTGEN.

## Envelope respons

### Pickup

```json
{
  "total": 9,
  "data": []
}
```

- Tidak mempunyai `success` atau `page`.
- `total` adalah jumlah hasil setelah seluruh halaman upstream digabung.
- Pagination upstream tidak mempunyai batas halaman eksplisit.

### Dispatch dan COD

```json
{
  "success": true,
  "total": 219,
  "page": 2,
  "data": []
}
```

- `success` berupa boolean.
- `total` berupa number.
- `page` berupa number, tetapi implementasi middleware menghasilkan nilai yang tidak
  konsisten secara semantik. Contoh COD dengan data dapat mengembalikan `page: 0`.
  Field ini tidak boleh dijadikan bukti kelengkapan sinkronisasi.
- Dispatch dan COD dibatasi maksimal 20 halaman × 100 record. Tepat 2.000 record harus
  dianggap kemungkinan truncation sampai middleware menyediakan indikator lengkap.

## Mapping `RAW_PICKUP`

Endpoint:

```text
GET /jfs-pickup?date=YYYY-MM-DD
```

| Field endpoint | Tipe teramati | Null/kosong | Field rancangan | Catatan |
| --- | --- | --- | --- | --- |
| `waybillNo` | string | Tidak pada sampel | `waybillNo` | Berisi digit tetapi wajib tetap string agar leading zero tidak hilang. |
| `pickNetwork` | string | Tidak pada sampel | `pickNetwork` | Nama jaringan, bukan kode outlet yang tervalidasi. |
| `destination` | string | Tidak pada sampel | `destination` | Teks tujuan. |
| `settlement` | string | 3/80 string kosong | `settlementRaw` | Nilai teramati: `Bulanan`, `Tunai`, `DFOD`, dan kosong. Jangan langsung dijadikan enum ketat. |
| `totalFreight` | number | Middleware fallback `0` | `totalFreight` | Nilai uang; simpan sebagai `Decimal`, bukan `Float`. |
| `freight` | number | Middleware fallback `0` | `freight` | Tetap disimpan di RAW untuk fidelity, tetapi tidak dipakai sebagai ongkir MASTER. |
| `weight` | number | Middleware fallback `0` | `weight` | Ada bilangan pecahan; gunakan `Decimal`. Satuan diasumsikan kg hanya sebagai label endpoint/legacy, perlu konfirmasi. |
| `staff` | string | Tidak pada sampel | `staffNameRaw` | Fallback middleware: `collectStaffName` lalu `inputStaffName`; identitas stabil/kode tidak tersedia. |
| `sender` | string | Tidak pada sampel | `senderName` | PII. |
| `service` | string | Tidak pada sampel | `serviceRaw` | Sampel hanya `FastTrack`; kontrak middleware dapat mengirim teks lain. |
| `receiver` | string | Tidak pada sampel | `receiverName` | PII. |
| `address` | string | Tidak pada sampel | `receiverAddress` | PII sensitif. |

Field `Tanggal` yang disebut pada header bisnis **tidak ada dalam respons endpoint**.
Tanggal operasional RAW pickup harus diambil dari parameter `date` yang dikirim oleh job
sinkronisasi dan disimpan sebagai `operationalDate @db.Date`. Jangan menggunakan
`sourceFetchedAt` sebagai penggantinya.

Pada sampel, `totalFreight - freight` bernilai `0`, `2.000`, `5.000`, atau `7.000`.
Tidak boleh disimpulkan bahwa selisih tersebut selalu diskon, asuransi, surcharge, atau
biaya lain tanpa kamus JFS.

## Mapping `RAW_DISPATCH`

Endpoint:

```text
GET /jfs-dispatch?date=YYYY-MM-DD
```

| Field endpoint | Tipe teramati | Null/kosong | Field rancangan | Catatan |
| --- | --- | --- | --- | --- |
| `waybillNo` | string | Tidak pada sampel | `waybillNo` | Business identifier; tetap string. |
| `kurir` | string | Tidak pada sampel | `courierNameRaw` | Hanya nama, tanpa ID/kode stabil. |
| `ongkir` | number | Middleware fallback `0` | `freightAmount` | 210/219 record pada 28 Juli bernilai nol; ada nilai pecahan pada sampel. Gunakan `Decimal`. |
| `waktu` | string | Tidak pada sampel | `dispatchTimeRaw`, `dispatchAt` | Format teramati `YYYY-MM-DD HH:mm:ss`, tanpa offset timezone. |
| `receiver` | string | Tidak pada sampel | `receiverName` | PII. |
| `address` | string | Tidak pada sampel | `receiverAddress` | PII sensitif. |
| `status` | string | Tidak pada sampel | `deliveryStatusRaw` | Nilai teramati: `belum diterima`, `penerimaan normal`. Jangan jadikan enum tertutup dulu. |
| `berat` | number | Middleware fallback `0` | `chargeWeight` | Ada bilangan pecahan; gunakan `Decimal`. |
| `pembayaran` | string | Tidak pada sampel | `settlementTypeRaw` | Nilai teramati: `Bulanan`, `Tunai`, `DFOD`. |
| `service` | string | Tidak pada sampel | `serviceRaw` | Nilai teramati: `FastTrack`, `MaxTrack`. |
| `codStatus` | string | Tidak pada sampel | `codStatusRaw` | Nilai teramati: `ada COD`, `Tidak COD`; simpan raw untuk toleransi perubahan ejaan/case. |
| `codValue` | number | Middleware fallback `0` | `codValue` | Nilai uang, gunakan `Decimal`. |
| `barang` | string | Tidak pada sampel | `goodsDescription` | Dapat mengandung data bisnis/PII; perlu kebijakan retensi. |

`waktu` pada seluruh sampel berbentuk `YYYY-MM-DD HH:mm:ss` dan tanggalnya sama dengan
tanggal query. Karena upstream tidak memberi timezone, parsing hanya boleh dilakukan
dengan asumsi eksplisit `Asia/Jakarta`; string asli tetap disimpan.

## Mapping `RAW_COD`

Endpoint:

```text
GET /jfs-cod?date=YYYY-MM-DD
```

| Field endpoint | Tipe teramati | Null/kosong | Field rancangan | Catatan |
| --- | --- | --- | --- | --- |
| `waybillNo` | string | Tidak pada sampel | `waybillNo` | Business identifier; tetap string. |
| `codAmount` | number | Middleware fallback `0` | `codAmount` | Nilai uang, gunakan `Decimal`. |
| `repaymentStatus` | number | Middleware fallback `0` | `repaymentStatusCode` | Kode teramati `0` dan `1`; arti tidak terlihat di source. |
| `repaymentType` | number pada kontrak teramati | Middleware fallback `0` | `repaymentTypeRaw`, `repaymentTypeCode`, `repaymentTypeLabel` | Audit backup Sheet + endpoint membuktikan `2 = Qris COD`, `0/1 = Lainnya/non-QRIS`. Label tetap perlu diteruskan middleware agar kontrak eksplisit. |
| `signTime` | string | Tidak pada sampel | `signTimeRaw`, `signedAt` | Format teramati `YYYY-MM-DD HH:mm:ss`, tanpa offset. |
| `dispatchStaffName` | string | Tidak pada sampel | `courierNameRaw` | Hanya nama, tanpa ID/kode stabil. |

Seluruh 139 COD pada sampel menemukan dispatch dengan waybill sama; nilai
`codAmount == dispatch.codValue` dan nama kurir juga sama. Ini bukti konsistensi sampel,
bukan aturan yang boleh dipaksakan tanpa mekanisme mismatch.

## Mapping RAW ke MASTER

### `RAW_PICKUP` → `MASTER_PICKUP`

| MASTER_PICKUP | Sumber | Aturan |
| --- | --- | --- |
| `operationalDate` | parameter request RAW | Wajib berasal dari tanggal job, karena payload tidak membawa tanggal. |
| `waybillNo` | `RAW_PICKUP.waybillNo` | Trim untuk key; nilai raw tetap ada di payload. |
| `staffName` | `RAW_PICKUP.staffNameRaw` | Normalisasi whitespace/case hanya untuk pencarian; tampilkan bentuk sumber terbaru. |
| `senderName` | `RAW_PICKUP.senderName` | Salin nilai operasional terbaru. |
| `freightAmount` | `RAW_PICKUP.totalFreight` | Keputusan bisnis final. Field `freight` tidak digunakan untuk ongkir MASTER. |
| `rawPickupId` | ID RAW | Relasi 1:1 logis ke record sumber terbaru. |
| `syncStatus` | hasil normalisasi | `PENDING`, `NORMALIZED`, atau `ERROR`. |

Diskon, total diterima, status pembayaran, metode bayar, rekening transfer, dan
keterangan tidak boleh dimapping ke MASTER. Semua berada pada revisi
`PICKUP_PAYMENT`.

### `RAW_DISPATCH` + `RAW_COD` → `MASTER_SETORAN`

Grain MASTER adalah:

```text
tenant + outlet + operationalDate + normalized courier identity
```

| MASTER_SETORAN | Sumber kandidat | Status keputusan |
| --- | --- | --- |
| `operationalDate` | tanggal query/job | Jelas. |
| `courierName` | dispatch `kurir`; fallback COD `dispatchStaffName` | Nama perlu canonicalization/alias. |
| `dfodAmount` | SUM `RAW_DISPATCH.ongkir` untuk kurir/tanggal dengan normalized status `Penerimaan Normal` | Formula ditemukan di `MASTER_SETORAN!C`. Formula lama tidak memfilter `PEMBAYARAN`, `COD STATUS`, atau `COD VALUE`. |
| `codCashAmount` | SUM `RAW_COD.codAmount` dengan type code `0/1` atau label selain `Qris COD` | Mapping berbasis pencocokan historis tanpa konflik pada 62 record. Kode tak dikenal menjadi anomaly. |
| `codQrisAmount` | SUM `RAW_COD.codAmount` dengan type code `2` / label `Qris COD` | Ditampilkan sebagai informasi dan tidak menjadi kewajiban tunai kurir. |
| `totalSettlementAmount` | `dfodAmount + codCashAmount` | Keputusan bisnis final saat ini. `codQrisAmount` tidak termasuk total. |
| `normalizationVersion` | versi aturan aplikasi | Wajib agar rebuild dapat diaudit. |
| `sourceFetchedFrom/To` | rentang fetch sumber | Provenance agregasi. |

Bayar tunai, total transfer, detail transfer, belum bayar, dan keterangan tidak boleh
ditulis oleh proses normalisasi MASTER.

## Field ambigu dan inkonsisten

1. Pickup tidak mengembalikan tanggal.
2. Middleware mengubah null/missing menjadi nol atau string kosong.
3. Kontrak endpoint belum mengirim label TYPE walaupun mapping historis kode sudah
   ditemukan.
4. Arti bisnis `repaymentStatus` masih berupa kode angka dan tidak digunakan dalam
   klasifikasi Season 1.
5. Tidak ada courier ID; nama raw dapat berubah ejaan, case, atau whitespace.
6. `waktu` dan `signTime` tidak mempunyai offset timezone.
7. Field `page` COD/dispatch tidak dapat dipercaya sebagai nomor/total halaman.
8. Dispatch/COD berhenti di 2.000 record tanpa indikator truncation.
9. Pickup tidak mempunyai batas halaman dan berisiko loop panjang jika upstream tidak
   pernah mengembalikan halaman pendek.
10. Endpoint masih hard-coded untuk jaringan/outlet `SUM001A` dan finance center
    `BDO000`; `tenantId/outletId` NEXTGEN tidak boleh dianggap membuktikan bahwa payload
    benar-benar berasal dari outlet tersebut.

## Kesimpulan kontrak

Kontrak cukup untuk merancang penyimpanan RAW yang lossless terhadap **respons
middleware**. Formula DFOD dan mapping repayment type sudah ditemukan. Middleware tetap
disarankan meneruskan label TYPE resmi agar reverse mapping tidak menjadi kontrak
permanen.

## Keputusan status dan pembayaran final

- Hanya dispatch dengan status ternormalisasi `penerimaan normal` yang masuk
  MASTER_SETORAN.
- `totalSetoran = dfod + codTunai`; COD QRIS hanya informasi.
- Total pembayaran adalah jumlah seluruh pembayaran manual valid, bukan nilai yang
  disimpan pada MASTER.
- Status dihitung dinamis:

```text
remainingAmount = totalSettlementAmount - totalPaid
remainingAmount > 0  → BELUM_LUNAS
remainingAmount = 0  → LUNAS
remainingAmount < 0  → LEBIH_BAYAR
```

- Tidak ada toleransi Rp1.
- Kenaikan kewajiban boleh diterapkan otomatis.
- Penurunan hanya menjadi kandidat dan memerlukan review Admin/Owner.

## Pickup payment bertahap

Diskon dipisahkan dari transaksi pembayaran:

```text
activeDiscountAmount = discount pada PickupSettlementRevision VALID
finalPickupObligation = MasterPickup.freightAmount - activeDiscountAmount
pickupTotalPaid = SUM PickupPayment.receivedAmount dengan status VALID
pickupRemainingAmount = finalPickupObligation - pickupTotalPaid
```

`activeDiscountAmount` wajib berada pada rentang `0..freightAmount`. PickupPayment tidak
menyimpan diskon per transaksi.
