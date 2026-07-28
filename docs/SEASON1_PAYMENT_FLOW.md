# Season 1 — Payment and Settlement Flow

## Prinsip final

- Pembayaran adalah histori transaksi manual, bukan field pada MASTER.
- Satu MASTER dapat mempunyai banyak transaksi pembayaran valid.
- Sync hanya mengubah kewajiban MASTER; payment dan transfer tidak pernah ditimpa.
- Koreksi memakai revision atau void. Tidak ada hard delete finansial.
- Semua nominal memakai Decimal dan dihitung server-side.
- Status selalu hasil hitung terhadap kewajiban aktif terbaru.

## Grain transaksi

`PickupPayment` dan `CourierSettlementPayment` merepresentasikan satu transaksi
pembayaran. Setiap transaksi mempunyai `transactionKey` stabil dan revision.

```text
transactionKey A
  revision 1 → SUPERSEDED
  revision 2 → VALID

transactionKey B
  revision 1 → VALID
```

Total pembayaran menjumlahkan revision `VALID` terbaru dari semua transaction key.
Revision `SUPERSEDED` dan `VOID` tidak ikut perhitungan.

## Pickup payment

MASTER_PICKUP menggunakan:

```text
ongkir = RAW_PICKUP.totalFreight
```

Nominal pembayaran, metode, rekening, dan keterangan berada pada `PickupPayment`.
Diskon tidak berada pada transaksi pembayaran. Diskon ditetapkan satu kali melalui
`PickupSettlementRevision` aktif untuk MASTER tersebut.

Flow create:

1. Server mengambil tenant, outlet, user, dan role dari session.
2. MASTER dicari dengan ID + tenant + outlet yang sama.
3. Nilai Decimal, tanggal pembayaran, metode, rekening, dan note divalidasi.
4. Insert transaksi revision pertama dengan status `VALID`.
5. Audit `CREATE/PICKUP_PAYMENT`.

Flow correction:

1. Lock revision valid berdasarkan `transactionKey`.
2. Jadikan revision lama `SUPERSEDED`.
3. Insert revision baru dengan nilai yang telah divalidasi.
4. Audit changed fields, actor, alasan, dan revision.

Flow void:

1. Hanya role berwenang.
2. Set transaksi valid menjadi `VOID`.
3. Simpan `voidedAt`, `voidedByUserId`, dan alasan wajib.
4. Audit `DELETE/PICKUP_PAYMENT`; tidak menjalankan hard delete.

Flow settlement/revision diskon:

1. Satu MASTER hanya mempunyai satu `PickupSettlementRevision` berstatus `VALID`.
2. Revision baru menjadikan revision aktif sebelumnya `SUPERSEDED`.
3. Pembatalan revision menjadi `VOID`; tidak ada hard delete.
4. `discountAmount` wajib memenuhi `0 <= discountAmount <= freightAmount`.
5. Diskon tidak disalin atau dijumlahkan pada setiap `PickupPayment`.

Formula pickup final:

```text
activeDiscountAmount =
  discountAmount dari PickupSettlementRevision VALID

finalPickupObligation =
  MasterPickup.freightAmount - activeDiscountAmount

pickupTotalPaid =
  SUM(PickupPayment.receivedAmount WHERE recordStatus = VALID)

pickupRemainingAmount =
  finalPickupObligation - pickupTotalPaid
```

Status:

```text
pickupRemainingAmount > 0 → BELUM_LUNAS
pickupRemainingAmount = 0 → LUNAS
pickupRemainingAmount < 0 → LEBIH_BAYAR
```

Satu `MasterPickup` boleh dibayar bertahap melalui beberapa `PickupPayment` valid.

## Courier settlement transaction

Satu `CourierSettlementPayment` boleh terdiri dari:

- tunai saja;
- transfer saja;
- tunai dan transfer;
- maksimal delapan row transfer dalam transaksi tersebut.

Database tetap menyimpan satu row per transfer. Tidak ada kolom `Transfer1` sampai
`Transfer8`. Batas delapan diterapkan oleh validation/service dalam transaction.

### Create transaction

1. Scope MASTER_SETORAN dari trusted session.
2. Lock MASTER untuk perhitungan konsisten.
3. Validasi cash dan 0–8 transfer.
4. Hitung jumlah transfer dari detail, bukan dari angka kiriman client.
5. Hitung totalPaid seluruh histori valid bila transaksi baru ditambahkan.
6. Jika hasil menjadi overpayment, tampilkan warning dan minta konfirmasi Admin.
7. Insert payment dan transfer secara atomic.
8. Audit payment serta detail transfer.

Snapshot transaksi:

```text
transactionTransfer = SUM(transfer VALID dalam transaksi)
transactionPaid     = cashAmount + transactionTransfer
```

Source of truth settlement keseluruhan:

```text
totalPaid =
  SUM(cashAmount seluruh payment VALID)
  + SUM(amount seluruh transfer VALID
        dengan parent payment VALID)

remainingAmount = MASTER_SETORAN.totalSettlementAmount - totalPaid
```

Status final:

```text
remainingAmount > 0 → BELUM_LUNAS
remainingAmount = 0 → LUNAS
remainingAmount < 0 → LEBIH_BAYAR
```

Tidak ada toleransi Rp1.

## Partial payment

Partial payment diperbolehkan. Contoh:

```text
Kewajiban     Rp1.000.000
Tunai           Rp600.000
Transfer        Rp400.000
Total paid    Rp1.000.000
Remaining              Rp0
Status               LUNAS
```

Payment juga dapat dilakukan bertahap melalui beberapa
`CourierSettlementPayment`. Setiap transaksi tetap terlihat dalam histori.

## Overpayment

Overpayment diperbolehkan dengan aturan:

- service menghitung preview dan warning sebelum commit;
- diperlukan konfirmasi Admin;
- actor dan waktu konfirmasi disimpan;
- status dinamis menjadi `LEBIH_BAYAR`;
- kelebihan tidak dipindahkan otomatis ke hari berikutnya;
- kelebihan tidak menjadi saldo/kredit;
- koreksi hanya melalui revision/void yang diaudit.

Client tidak boleh mengirim flag konfirmasi tanpa server memastikan user saat itu
memiliki role Admin yang sah.

## Transfer correction dan void

Koreksi:

1. Lock transfer valid.
2. Jadikan revision lama `SUPERSEDED`.
3. Buat revision baru dengan `transactionKey` transfer yang sama.
4. Recompute snapshot payment dan status settlement.
5. Audit `UPDATE/COURIER_SETTLEMENT_TRANSFER`.

Void:

1. Jadikan transfer valid `VOID`.
2. Jangan hard delete.
3. Recompute payment dan status.
4. Audit `DELETE/COURIER_SETTLEMENT_TRANSFER`.

Service memastikan jumlah transfer valid dalam satu payment tidak pernah melebihi
delapan setelah create/correction/void.

## Sync ulang dan status

### Kewajiban naik atau tetap

Jika candidate sync lebih besar atau sama:

1. MASTER diperbarui otomatis.
2. Histori payment/transfer tetap.
3. `totalPaid` dihitung ulang dari histori valid.
4. `remainingAmount` dan status berubah dinamis.

Contoh:

```text
Sebelum sync:
  kewajiban  Rp1.000.000
  totalPaid  Rp1.000.000
  status     LUNAS

Sesudah sync naik:
  kewajiban  Rp2.000.000
  totalPaid  Rp1.000.000
  remaining  Rp1.000.000
  status     BELUM_LUNAS
```

Payment lama tidak diubah atau dikaitkan permanen dengan kewajiban lama.

### Kewajiban turun

Jika candidate lebih kecil:

1. Nilai aktif MASTER tidak turun.
2. Candidate dan komponennya disimpan pada `proposed*`.
3. `needsReview=true`.
4. Admin/Owner memilih approve atau reject.
5. Keputusan dan alasan diaudit.
6. Setelah approve, status dihitung ulang dan dapat menjadi `LEBIH_BAYAR`.

Review kewajiban tidak membuat, mengubah, atau void payment.

## Authorization baseline

| Operasi | Role minimum rancangan |
| --- | --- |
| Sync manual | OWNER, ADMIN, OPERATIONAL |
| Create payment | OWNER, ADMIN, FINANCE |
| Correct/void payment | OWNER, ADMIN |
| Add/correct/void transfer | OWNER, ADMIN, FINANCE; void final OWNER/ADMIN |
| Approve/reject penurunan kewajiban | OWNER, ADMIN |
| Confirm overpayment | ADMIN; OWNER perlu keputusan eksplisit |
| Lihat histori | OWNER, ADMIN, FINANCE, VIEWER sesuai policy outlet |

Role matrix final yang belum diputuskan tetap dicatat di open questions.

## Validasi server

- Semua parent lookup menyertakan tenant dan outlet session.
- `outletId=null` tidak berarti akses semua outlet.
- Decimal diparse dari canonical string, bukan arithmetic JavaScript `number`.
- Cash dan transfer tidak negatif.
- Maksimal delapan transfer per payment transaction.
- `transferAmountSnapshot` sama dengan jumlah detail valid.
- `paidAmountSnapshot = cash + transfer`.
- Konfirmasi overpayment harus berdasarkan calculation server terkini.
- Revision menggunakan optimistic concurrency/locking.
- Tidak ada payload RAW, credential, atau note sensitif di log.

## Audit

Setiap create/correction/void mencatat:

- tenant/outlet dari session;
- actor dari session;
- entity ID dan transaction key;
- revision lama/baru;
- changed-field names;
- alasan correction/void;
- nominal before/after yang diperlukan;
- timestamp server.

Review penurunan kewajiban mencatat:

- active obligation;
- proposed obligation;
- keputusan approve/reject;
- Admin/Owner reviewer;
- alasan;
- version normalisasi.

## Invariants

1. Banyak transaksi `VALID` boleh dimiliki satu MASTER.
2. Hanya satu revision `VALID` per `transactionKey`.
3. Maksimal delapan transfer valid per payment transaction.
4. Parent payment `VOID/SUPERSEDED` tidak ikut `totalPaid`.
5. Transfer `VOID/SUPERSEDED` tidak ikut `totalPaid`.
6. Aggregate payment selalu sama dengan detail valid.
7. Status tidak disimpan sebagai angka manual; selalu dihitung dinamis.
8. Sync tidak memutasi histori pembayaran.
9. Penurunan kewajiban tidak aktif sebelum review.
10. Tidak ada hard delete data finansial.
11. Diskon pickup hanya berasal dari satu settlement revision aktif.
12. Diskon tidak dapat membuat kewajiban pickup negatif.
