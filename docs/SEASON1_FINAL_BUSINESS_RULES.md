# Season 1 — Final Business Rules

## Status dokumen

Dokumen ini adalah sumber aturan bisnis final untuk implementasi Phase 2 Season 1.
Dokumen desain lain harus mengikuti dokumen ini. Bila terdapat konflik, aturan di sini
menang sampai ada keputusan bisnis baru yang terdokumentasi.

Gap kontrak teknis yang belum memungkinkan sebuah aturan dijalankan tidak mengubah
keputusan bisnis. Implementasi harus berhenti dengan anomaly/error yang terlihat, bukan
menebak data.

## 1. Pemisahan data

### RAW

- Menyimpan record asli yang diterima dari middleware dalam `sourcePayload`.
- Tidak dapat diedit manual.
- Dapat disinkron ulang secara idempotent.
- Menyimpan tenant, outlet, endpoint, source key, waktu fetch/sync, status, dan payload.
- Menyimpan run pertama yang melihat record dan run terakhir yang melihatnya kembali.

### SYNC RUN

- Setiap percobaan sync mempunyai satu `SyncRun` dalam scope tenant dan outlet.
- Status lifecycle: `RUNNING`, `SUCCESS`, `PARTIAL_SUCCESS`, atau `FAILED`.
- Menyimpan ringkasan fetched/created/updated per RAW serta duplicate dan anomaly.
- `firstSeenRunId` tidak berubah setelah RAW dibuat.
- `lastSeenRunId` diperbarui setiap kali RAW ditemukan kembali.
- Actor boleh null untuk scheduled sync.
- Run yang sudah direferensikan RAW tidak boleh dihapus melalui cascade.

### MASTER

- Hasil normalisasi RAW.
- Menyimpan kewajiban/data operasional terbaru.
- Dapat dibangun ulang dari RAW.
- Tidak menyimpan histori pembayaran manual.

### PAYMENT/SETTLEMENT

- Histori transaksi input manual.
- Tidak pernah diubah atau dihapus oleh sync.
- Tidak hard delete.
- Koreksi memakai revision atau void dengan AuditLog.

## 2. MASTER_PICKUP

```text
MASTER_PICKUP.ongkir = RAW_PICKUP.totalFreight
```

Field `RAW_PICKUP.freight` tetap disimpan di RAW tetapi tidak digunakan sebagai ongkir
MASTER.

Tanggal operasional pickup berasal dari tanggal request sync karena payload endpoint
tidak membawa field tanggal.

## 3. Filter dispatch

Hanya RAW_DISPATCH dengan status ternormalisasi:

```text
Penerimaan Normal
```

yang masuk perhitungan MASTER_SETORAN.

Normalisasi perbandingan:

1. trim spasi awal/akhir;
2. collapse multiple spaces menjadi satu;
3. case-insensitive.

`Belum diterima` dan seluruh status selain `Penerimaan Normal` tidak masuk kewajiban
setoran. Nilai status asli tetap disimpan di RAW.

## 4. Klasifikasi COD

Gunakan nilai field TYPE:

```text
normalized TYPE == "qris cod" → COD QRIS
normalized TYPE != "qris cod" → COD tunai
```

Normalisasi hanya trim, collapse spaces, dan case-insensitive. Nilai asli tetap di RAW.

Audit endpoint dan backup Sheet lama membuktikan mapping:

```text
repaymentTypeCode = 2     → Qris COD
repaymentTypeCode = 0/1   → non-QRIS / COD tunai
```

Kode baru, null, atau selain `0/1/2` menjadi anomaly dan tidak boleh diklasifikasikan
diam-diam. Middleware sebaiknya menambahkan `repaymentTypeCode` dan
`repaymentTypeLabel` tanpa menghapus field `repaymentType` lama.

## 5. Formula kewajiban setoran

```text
dfod             = SUM(RAW_DISPATCH.ongkir)
                   WHERE operationalDate sesuai MASTER
                   AND courier canonical sesuai MASTER
                   AND normalizedStatus = "penerimaan normal"
codTunai         = SUM(COD AMOUNT dengan TYPE selain Qris COD)
codQris          = SUM(COD AMOUNT dengan TYPE Qris COD)
totalSetoran     = dfod + codTunai
```

COD QRIS ditampilkan terpisah dan tidak masuk kewajiban tunai kurir.

Formula lama tidak memfilter `PEMBAYARAN`, `COD STATUS`, `COD VALUE`, atau waybill.
Field tersebut tetap disimpan untuk observability dan anomaly detection, tetapi bukan
komponen formula DFOD. Bukti formula terdapat di `SEASON1_BLOCKER_AUDIT.md`.

Seluruh arithmetic menggunakan Decimal. Tidak ada toleransi Rp1.

## 6. Identitas kurir

Sumber nama:

- RAW_PICKUP: `staff` sesuai nama field aktual endpoint;
- RAW_DISPATCH: `kurir`;
- RAW_COD: `dispatchStaffName`/KURIR sesuai nama field aktual endpoint.

Courier key Season 1:

```text
trim
→ collapse multiple spaces
→ case-insensitive canonical form
```

Tidak ada fuzzy matching. Dua nama berbeda tidak digabung otomatis. Alias mapping manual
disiapkan untuk Season berikutnya bila hasil pengujian memerlukannya.

## 7. Histori pembayaran

Satu MASTER dapat mempunyai banyak transaksi pembayaran valid.

Setiap transaksi:

- memiliki transaction key;
- dapat mempunyai revision;
- revision lama menjadi `SUPERSEDED`;
- pembatalan menjadi `VOID`;
- tidak hard delete;
- mempunyai actor dan AuditLog.

Sync dilarang membuat, mengubah, merevisi, atau void transaksi pembayaran.

## 8. Bentuk pembayaran setoran

Satu transaksi settlement dapat terdiri dari:

- tunai saja;
- transfer saja;
- tunai + transfer;
- beberapa transfer.

Maksimal delapan transfer per satu input/payment transaction. Batas diterapkan pada
validation dan service.

Database memakai satu row `CourierSettlementTransfer` per transfer. Tidak ada kolom
`Transfer1` sampai `Transfer8`.

## 9. Formula pembayaran dan status

Hanya payment/transfer `VALID` yang dihitung.

```text
totalPaid =
  SUM(bayarTunai seluruh payment VALID)
  + SUM(nominal seluruh transfer VALID
        yang parent payment-nya VALID)

remainingAmount = MASTER_SETORAN.totalSetoran - totalPaid
```

Status dinamis:

```text
remainingAmount > 0 → BELUM_LUNAS
remainingAmount = 0 → LUNAS
remainingAmount < 0 → LEBIH_BAYAR
```

Status bukan input manual dan tidak boleh menjadi snapshot permanen yang dapat stale.

## 10. Partial payment

Partial payment diperbolehkan. Beberapa transaksi dapat diakumulasi sampai kewajiban
terpenuhi.

Untuk pickup:

```text
activeDiscountAmount =
  PickupSettlementRevision.discountAmount WHERE status = VALID

finalPickupObligation =
  MasterPickup.freightAmount - activeDiscountAmount

pickupTotalPaid =
  SUM(PickupPayment.receivedAmount WHERE status = VALID)

pickupRemainingAmount =
  finalPickupObligation - pickupTotalPaid
```

Diskon ditetapkan satu kali pada settlement/revision aktif, bukan diulang pada setiap
payment. Histori diskon dan pembayaran memakai `VALID`, `SUPERSEDED`, dan `VOID`, tanpa
hard delete. Invariant wajib:

```text
0 <= activeDiscountAmount <= MasterPickup.freightAmount
```

Status pickup mengikuti tanda `pickupRemainingAmount`: positif `BELUM_LUNAS`, nol
`LUNAS`, dan negatif `LEBIH_BAYAR`.

Contoh:

```text
totalSetoran  Rp1.000.000
bayarTunai      Rp600.000
transfer        Rp400.000
totalPaid     Rp1.000.000
remaining               0
status              LUNAS
```

## 11. Overpayment

Overpayment diperbolehkan dengan ketentuan:

- warning ditampilkan sebelum penyimpanan;
- membutuhkan konfirmasi Admin;
- konfirmasi dan actor disimpan;
- status menjadi `LEBIH_BAYAR`;
- kelebihan tidak dipindahkan ke hari berikutnya;
- kelebihan tidak menjadi saldo atau kredit otomatis;
- koreksi hanya melalui revision/void dengan AuditLog.

## 12. Sync ulang: kewajiban naik atau tetap

Jika candidate hasil sync:

```text
candidateTotal >= activeTotal
```

maka:

- MASTER diperbarui otomatis;
- nilai sebelumnya disimpan sebagai previous obligation;
- obligation version bertambah;
- seluruh payment/transfer tetap;
- status dihitung ulang terhadap kewajiban terbaru.

Payment yang sebelumnya membuat status LUNAS dapat menjadi BELUM_LUNAS setelah
kewajiban naik.

## 13. Sync ulang: kewajiban turun

Jika:

```text
candidateTotal < activeTotal
```

maka:

- active obligation tidak diturunkan;
- candidate dan seluruh komponennya disimpan sebagai proposed obligation;
- nilai aktif lama dipertahankan;
- `needsReview=true`;
- Admin atau Owner harus approve/reject;
- actor, waktu, keputusan, nilai lama/baru, dan alasan dicatat.

Approve:

- proposal menjadi active obligation;
- previous obligation dipertahankan untuk audit;
- obligation version bertambah;
- status dihitung ulang.

Reject:

- active obligation tetap;
- proposal ditutup;
- alasan dan reviewer disimpan.

Review kewajiban tidak mengubah histori pembayaran.

## 14. Multi-tenant

- Semua row mempunyai tenantId dan outletId.
- Semua query scoped dari session.
- Tenant/outlet dari client bukan authority.
- User tanpa outlet aktif tidak otomatis mendapat akses seluruh outlet.
- Middleware hard-coded SUM001A hanya boleh dipakai untuk outlet yang mapping-nya
  diverifikasi.

## 15. Audit

Audit wajib untuk:

- sync setiap RAW;
- create/revision/void pickup payment;
- create/revision/void settlement payment;
- create/revision/void transfer;
- kenaikan kewajiban otomatis;
- proposal penurunan;
- approve/reject penurunan;
- konfirmasi overpayment.

Audit tidak menyimpan credential, token, alamat, atau payload PII.

## 16. Invariants implementasi

1. `MASTER_PICKUP.ongkir` selalu dari `totalFreight`.
2. Hanya `Penerimaan Normal` masuk settlement.
3. COD QRIS tidak masuk `totalSetoran`.
4. Tidak ada fuzzy matching kurir.
5. Maksimal delapan transfer per payment transaction pada service.
6. Banyak payment valid dapat diakumulasi.
7. Satu transaction key hanya mempunyai satu revision VALID.
8. Status dihitung dinamis tanpa toleransi.
9. Sync tidak memutasi histori finansial.
10. Penurunan kewajiban memerlukan Admin/Owner review.
11. Overpayment memerlukan konfirmasi Admin.
12. Tidak ada hard delete data finansial.
13. Diskon pickup hanya berasal dari satu settlement revision aktif.
14. Diskon pickup tidak dapat membuat `finalPickupObligation` negatif.
15. Setiap RAW mempunyai first seen dan last seen SyncRun dalam tenant/outlet yang sama.
16. Sync ulang tidak mengubah first seen dan selalu memperbarui last seen.
17. SyncRun terminal mempunyai `completedAt` dan count non-negatif.
