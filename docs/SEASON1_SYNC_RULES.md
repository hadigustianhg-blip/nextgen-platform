# Season 1 — Sync and Normalization Rules

## Boundary integrasi

- Browser tidak pernah memanggil middleware JFS.
- Route/action server memperoleh tenant, outlet, user, dan role dari session tervalidasi.
- Endpoint base URL berasal dari environment variable atau konfigurasi integrasi
  server-side.
- Credential/token tetap berada di `IntegrationCredential` atau secret environment dan
  tidak masuk log, response browser, query string internal, atau `sourcePayload`.
- Build dan migration tidak memanggil endpoint.
- Job menolak sync bila `session.outletId` tidak tersedia atau outlet session tidak cocok
  dengan integrasi yang dipilih.

Middleware production masih hard-coded `SUM001A`/`BDO000`. Sampai middleware menjadi
tenant-aware, NEXTGEN hanya boleh mengaktifkan sync untuk outlet yang mapping-nya
diverifikasi sebagai `SUM001A`. Menempelkan `outletId` lain pada payload yang sama akan
menjadi kebocoran/corruption lintas tenant.

## Tahapan sync

```text
Authorize session
  → resolve tenant/outlet integration
  → validate requested operational date
  → create SyncRun RUNNING
  → fetch server-side
  → validate envelope
  → validate every record
  → compute sourceRecordKey + sourceRecordHash
  → transactionally upsert RAW
  → normalize affected MASTER
  → finalize SyncRun counts + terminal status
  → write aggregate AuditLog
  → return sanitized counts
```

Fetch dan transaksi database dipisahkan agar transaksi tidak terbuka selama network I/O.
Namun normalisasi satu batch harus konsisten: record invalid tidak boleh diam-diam
diubah menjadi nol.

## Validation envelope

### Pickup

- HTTP 200.
- Body JSON object.
- `total` integer non-negatif.
- `data` array.
- `total == data.length`; mismatch membuat batch `ERROR`, bukan partial success.

### Dispatch/COD

- HTTP 200.
- `success === true`.
- `total` integer non-negatif.
- `data` array dan `total == data.length`.
- `page` dicatat sebagai metadata diagnostik tetapi tidak dipercaya untuk completeness.
- Jika `total == 2000`, tandai `POSSIBLY_TRUNCATED` dan jangan publish hasil MASTER
  sebagai final sampai source dapat dipastikan lengkap.

## Parsing

- Waybill: trim, tidak dikonversi menjadi number.
- Money: terima hanya finite number atau numeric string yang formatnya disetujui;
  konversi melalui decimal string. Tolak `NaN`, infinity, dan nilai ambigu.
- Weight: `Decimal(12,3)`.
- Operational date: parse `YYYY-MM-DD` strict dan simpan `date`.
- `dispatchTimeRaw`/`signTimeRaw`: simpan string original.
- Parsed timestamp: interpretasikan `YYYY-MM-DD HH:mm:ss` sebagai Asia/Jakarta lalu
  konversi ke UTC. Jika format berubah, simpan RAW dengan status error parsing dan jangan
  menebak timezone.
- Teks: simpan representasi payload di JSON; kolom pencarian boleh di-trim. Jangan
  mengubah nama/alamat di `sourcePayload`.

## Canonical payload dan hash

`sourceRecordHash` adalah SHA-256 atas JSON canonical record:

- key object diurutkan;
- tipe dipertahankan;
- tidak memasukkan timestamp fetch;
- tidak memasukkan tenant/outlet;
- tidak menghapus empty string atau zero.

Jika key sama dan hash sama:

- update `sourceFetchedAt`;
- pertahankan `firstSeenRunId`;
- update `lastSeenRunId` ke run aktif;
- jangan melakukan write besar atau rebuild MASTER yang tidak perlu.

Jika key sama dan hash berubah:

- update kolom RAW + `sourcePayload`;
- update `updatedAt`;
- tandai normalisasi ulang;
- catat count perubahan di AuditLog.

Saat key belum ada, `firstSeenRunId` dan `lastSeenRunId` sama-sama diisi ID run aktif.
Pada replay berikutnya hanya `lastSeenRunId` yang berubah. Composite foreign key
memastikan run dan RAW mempunyai tenant/outlet yang sama.

Rancangan ini menyimpan latest source record. Jika regulasi membutuhkan setiap snapshot
fetch, perlu tabel snapshot terpisah; jangan menyalahgunakan PAYMENT sebagai histori RAW.

## Unique key provisional

Unique constraint database untuk semua RAW:

```text
(tenantId, outletId, sourceRecordKey)
```

Format `sourceRecordKey` harus berversi agar algoritma dapat diaudit:

| RAW | Key provisional | Hasil sampel | Risiko |
| --- | --- | --- | --- |
| Pickup | `v1:pickup:{waybillNo}` | 80/80 unik; replay stabil dan menambah 2 waybill baru | Diterima Season 1; anomaly bila tanggal berubah. |
| Dispatch | `v1:dispatch:{waybillNo}:{waktu}` | 785/785 unik; replay menemukan 40 perubahan status pada key yang sama | Status sengaja tidak masuk key agar perubahan meng-update logical record. |
| COD | `v1:cod:{waybillNo}:{repaymentTypeCode}:{signTime}` | 139/139 unik; replay menambah 9 tanpa collision | Diterima Season 1 dengan guard kode/type dan tanpa klaim upstream ID. |

Kandidat dispatch yang memasukkan status ditolak: replay 28 Juli akan membuat 40 row
baru untuk waybill+waktu yang sama. Histori transition, bila diperlukan, harus memakai
snapshot/event table terpisah.

`sourceRecordKey` dibuat server-side; client tidak dapat mengirimnya.

## Idempotent upsert RAW

Pseudo-algorithm:

```text
for validated record:
  key = deriveKey(record)
  hash = sha256(canonicalJson(record))
  upsert where tenantId_outletId_sourceRecordKey
    create:
      sourceFetchedAt = fetchStartedAt
      syncStatus = FETCHED
      sourcePayload = exact middleware record
    update:
      sourceFetchedAt = fetchStartedAt
      payload/columns only when sourceRecordHash changed
      syncStatus = FETCHED when changed
```

Tidak ada input manual yang dapat memanggil update RAW.

## Normalisasi pickup

Untuk setiap waybill yang terpengaruh:

1. Ambil seluruh RAW pickup dalam tenant/outlet/waybill.
2. Pilih record valid terbaru secara deterministik:
   `sourceFetchedAt DESC, updatedAt DESC, id DESC`.
3. Set `freightAmount = RAW_PICKUP.totalFreight` sesuai keputusan bisnis final.
4. Upsert MASTER pada `(tenantId, outletId, waybillNo)`.
5. Tulis hanya field operasional MASTER.
6. Jangan menyentuh `PickupPayment`.
7. Ubah RAW terpilih menjadi `NORMALIZED`; RAW invalid menjadi `ERROR`.

Perubahan tanggal operasional pada waybill yang sama harus menghasilkan warning audit,
karena unique MASTER saat ini global per outlet/waybill.

## Normalisasi setoran

Normalisasi dijalankan per:

```text
tenantId + outletId + operationalDate
```

Tahapan:

1. Ambil RAW dispatch dan COD hanya dalam scope yang sama.
2. Canonicalize courier name untuk key teknis:
   trim → collapse whitespace → Unicode normalize → uppercase locale-independent.
3. Courier key dibentuk dengan trim, collapse multiple spaces, dan case-insensitive
   normalization. Jangan merge dua nama berbeda dengan fuzzy matching.
4. Join COD ke dispatch berdasarkan waybill dalam tenant/outlet yang sama.
5. Bila `codAmount != codValue`, nama kurir berbeda, atau COD tidak mempunyai dispatch,
   simpan anomaly dan jangan diam-diam memilih satu nilai.
6. Hanya sertakan dispatch dengan status ternormalisasi tepat `penerimaan normal`;
   `belum diterima` dan status lain dikecualikan.
7. Pilih event dispatch/COD yang relevan secara deterministik bila ada beberapa event
   untuk waybill.
8. Klasifikasikan TYPE COD dengan mapping hasil audit:
   - code `2` / normalized label `qris cod` → COD QRIS;
   - code `0` atau `1` / label `lainnya` → COD tunai;
   - kode/label lain → anomaly.
   Nilai asli tetap di RAW.
9. Agregasikan dengan formula bisnis final.
10. Upsert MASTER_SETORAN pada
   `(tenantId, outletId, operationalDate, courierKey)`.
11. Recompute MASTER sepenuhnya dari RAW pada scope tersebut, bukan incremental addition,
   agar retry tidak menggandakan nominal.
12. Jangan menyentuh settlement payment atau transfer.

## Formula final

Keputusan bisnis final saat ini:

```text
eligible dispatch      = normalized status == "penerimaan normal"
dfodAmount             = SUM eligible dispatch.ongkir GROUP BY courier
codCashAmount          = SUM(COD amount dengan code 0/1 atau non-QRIS label)
codQrisAmount          = SUM(COD amount dengan code 2 / label "qris cod")
totalSettlementAmount  = dfodAmount + codCashAmount
```

`codQrisAmount` ditampilkan sebagai informasi dan tidak masuk kewajiban tunai kurir.
Formula tidak memakai toleransi Rp1 dan seluruh arithmetic memakai Decimal.

Formula DFOD lama tidak memfilter `PEMBAYARAN`, `COD STATUS`, atau `COD VALUE`. NEXTGEN
menambahkan scope tenant/outlet/operationalDate karena RAW baru tidak dibersihkan harian.
Middleware tetap disarankan meneruskan label TYPE resmi bersama kode.

## Apply obligation hasil sync

Setelah candidate obligation dihitung:

### Candidate lebih besar atau sama

```text
candidateTotal >= active totalSettlementAmount
```

- simpan active total lama ke `previousObligationAmount`;
- update komponen aktif dan `totalSettlementAmount`;
- naikkan `obligationVersion`;
- clear proposal lama secara auditable;
- payment/transfer tidak disentuh;
- status langsung dihitung ulang dari total aktif terbaru dikurangi histori payment valid.

### Candidate lebih kecil

```text
candidateTotal < active totalSettlementAmount
```

- jangan menurunkan komponen/nilai aktif;
- simpan seluruh komponen candidate pada field `proposed*`;
- simpan nilai aktif pada `previousObligationAmount`;
- set `needsReview=true`;
- audit nilai lama, nilai candidate, tanggal, dan normalization version;
- hanya Admin/Owner dapat approve atau reject.

Approve memindahkan proposal menjadi nilai aktif, menaikkan version, menyimpan actor dan
timestamp, lalu menghitung ulang status. Reject mempertahankan nilai aktif dan mencatat
alasan. Histori pembayaran tidak berubah pada kedua tindakan.

## Status dinamis setelah sync

```text
totalPaid =
  SUM(cashAmount seluruh CourierSettlementPayment VALID)
  + SUM(amount seluruh CourierSettlementTransfer VALID
        yang parent payment-nya VALID)

remainingAmount = active totalSettlementAmount - totalPaid

remainingAmount > 0 → BELUM_LUNAS
remainingAmount = 0 → LUNAS
remainingAmount < 0 → LEBIH_BAYAR
```

Sync kenaikan dapat mengubah LUNAS menjadi BELUM_LUNAS tanpa mengubah payment lama.

## Concurrency

- Gunakan transaction untuk upsert RAW + rebuild MASTER per scope.
- Gunakan PostgreSQL advisory lock atau lock row terdedikasi berdasarkan hash
  `(tenantId, outletId, endpoint, operationalDate)` agar dua sync sama tidak berjalan
  bersamaan.
- Retry network tidak boleh otomatis tanpa bounded attempt, timeout, dan jitter.
- Retry transaksi hanya untuk error transient/deadlock.
- Sync kedua dengan payload sama harus menghasilkan zero changed records.

## SyncRun dan audit event

`SyncRun` adalah source of truth operasional untuk lifecycle dan count satu percobaan
sync. Row dibuat `RUNNING` sebelum fetch. Pada akhir proses:

- seluruh endpoint yang diminta berhasil → `SUCCESS`;
- sebagian endpoint berhasil dan sebagian gagal → `PARTIAL_SUCCESS`;
- tidak ada hasil yang dapat diterapkan atau proses fatal → `FAILED`;
- `completedAt` wajib untuk seluruh status terminal.

Count `fetched`, `created`, dan `updated` disimpan terpisah untuk pickup, dispatch, dan
COD. `duplicateCount` menghitung record dengan logical key/hash yang sudah ada tanpa
perubahan; `anomalyCount` menghitung record yang membutuhkan observability/review.

AuditLog aggregate tetap ditulis untuk jejak aksi, dengan `syncRunId` di metadata:

```json
{
  "syncRunId": "uuid",
  "operationalDate": "YYYY-MM-DD",
  "fetched": 0,
  "created": 0,
  "changed": 0,
  "unchanged": 0,
  "invalid": 0,
  "normalized": 0,
  "durationMs": 0,
  "normalizationVersion": 1,
  "possiblyTruncated": false
}
```

Audit dan `SyncRun.metadata` tidak menyimpan waybill list, nama, alamat, raw payload,
token, atau upstream raw error. `triggeredByUserId` berasal dari session untuk sync
manual dan nullable untuk scheduled sync.

## Reconciliation wajib

Sebelum publish MASTER:

- jumlah RAW response = jumlah valid + invalid;
- tidak ada cross-tenant/outlet write;
- total per kategori dibandingkan laporan legacy;
- COD matched/unmatched/mismatch dihitung;
- jumlah MASTER per courier/date stabil setelah retry;
- payment/transfer count dan nominal tidak berubah setelah sync ulang;
- candidate penurunan tidak mengubah active obligation sebelum review Admin/Owner;
- kenaikan kewajiban menghitung ulang status terhadap seluruh histori payment valid;
- anomaly menghasilkan status dan observability, bukan silent coercion.
