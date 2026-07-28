# Season 1 — Database Design

## Prinsip desain

- RAW menyimpan representasi respons middleware dan tidak menerima mutasi manual.
- MASTER adalah proyeksi operasional yang dapat dibangun ulang dari RAW.
- PAYMENT/SETTLEMENT menyimpan histori input manual dan tidak pernah ditimpa sync.
- Semua record mempunyai `tenantId` dan `outletId` wajib.
- Seluruh nilai uang menggunakan `Decimal`, rancangan awal `Decimal(18,2)`.
- Tanggal operasional menggunakan PostgreSQL `date`.
- Timestamp absolut menggunakan `timestamptz(3)` dan disimpan sebagai UTC.
- Timestamp sumber tanpa offset disimpan dua bentuk: string raw dan hasil parsing dengan
  asumsi timezone yang dicatat.
- Tidak ada perubahan terhadap model foundation pada tahap desain ini.

Nama model di bawah adalah rancangan Prisma, bukan perubahan pada `schema.prisma`.

## Enum rancangan

```prisma
enum RawSyncStatus {
  FETCHED
  NORMALIZED
  ERROR
}

enum PaymentStatus {
  BELUM_LUNAS
  LUNAS
  LEBIH_BAYAR
}

enum FinancialRecordStatus {
  VALID
  SUPERSEDED
  VOID
}

enum ObligationReviewDecision {
  APPROVED
  REJECTED
}

enum SyncRunStatus {
  RUNNING
  SUCCESS
  PARTIAL_SUCCESS
  FAILED
}

enum SyncRunType {
  FULL
  PICKUP
  DISPATCH
  COD
}
```

Catatan:

- Nilai upstream seperti `settlement`, `status`, dan kode COD tetap disimpan sebagai
  string/angka raw, bukan enum, karena kontraknya belum stabil.
- Label Indonesia adalah concern tampilan; nilai enum database dibuat stabil dan tidak
  bergantung copy UI.
- `PaymentStatus` adalah hasil hitung dinamis dan tidak perlu disimpan sebagai source of
  truth pada MASTER.

## `SyncRun`

Setiap percobaan sinkronisasi mempunyai satu row `SyncRun`, termasuk run yang gagal
sebelum menghasilkan RAW:

```prisma
model SyncRun {
  id                   String        @id @default(uuid()) @db.Uuid
  tenantId             String        @db.Uuid
  outletId             String        @db.Uuid
  runType              SyncRunType
  operationalDate      DateTime      @db.Date
  status               SyncRunStatus @default(RUNNING)
  startedAt            DateTime      @db.Timestamptz(3)
  completedAt          DateTime?     @db.Timestamptz(3)
  triggeredByUserId    String?       @db.Uuid
  pickupFetchedCount   Int           @default(0)
  pickupCreatedCount   Int           @default(0)
  pickupUpdatedCount   Int           @default(0)
  dispatchFetchedCount Int           @default(0)
  dispatchCreatedCount Int           @default(0)
  dispatchUpdatedCount Int           @default(0)
  codFetchedCount      Int           @default(0)
  codCreatedCount      Int           @default(0)
  codUpdatedCount      Int           @default(0)
  duplicateCount       Int           @default(0)
  anomalyCount         Int           @default(0)
  errorMessage         String?
  metadata             Json?
  createdAt            DateTime      @default(now()) @db.Timestamptz(3)
  updatedAt            DateTime      @updatedAt @db.Timestamptz(3)

  @@unique([tenantId, outletId, id])
  @@index([tenantId, outletId, startedAt])
  @@index([tenantId, outletId, operationalDate])
  @@index([status])
}
```

`triggeredByUserId` nullable untuk scheduled sync dan memakai `SET NULL`. Composite
foreign key dari RAW membawa `tenantId + outletId + runId`, sehingga RAW tidak dapat
menunjuk run milik scope lain. Penghapusan run yang direferensikan RAW ditolak dengan
`RESTRICT`. Migration juga memasang trigger immutable pada `firstSeenRunId`;
`lastSeenRunId` tetap dapat diperbarui pada replay.

## `RawPickup`

```prisma
model RawPickup {
  id                String        @id @default(uuid()) @db.Uuid
  tenantId          String        @db.Uuid
  outletId          String        @db.Uuid
  operationalDate   DateTime      @db.Date
  sourceEndpoint    String
  sourceRecordKey   String
  sourceFetchedAt   DateTime      @db.Timestamptz(3)
  syncedAt          DateTime?     @db.Timestamptz(3)
  syncStatus        RawSyncStatus @default(FETCHED)
  syncError          String?
  sourceRecordHash   String        @db.Char(64)
  sourcePayload      Json
  firstSeenRunId     String        @db.Uuid
  lastSeenRunId      String        @db.Uuid

  waybillNo         String
  pickNetwork       String?
  destination       String?
  settlementRaw     String?
  totalFreight      Decimal       @db.Decimal(18, 2)
  freight           Decimal       @db.Decimal(18, 2)
  weight            Decimal       @db.Decimal(12, 3)
  staffNameRaw      String?
  senderName        String?
  serviceRaw        String?
  receiverName      String?
  receiverAddress   String?

  createdAt         DateTime      @default(now()) @db.Timestamptz(3)
  updatedAt         DateTime      @updatedAt @db.Timestamptz(3)

  @@unique([tenantId, outletId, sourceRecordKey])
  @@index([tenantId, outletId, operationalDate])
  @@index([tenantId, outletId, waybillNo])
  @@index([tenantId, outletId, syncStatus])
  @@index([firstSeenRunId])
  @@index([lastSeenRunId])
}
```

`sourcePayload` menyimpan object record yang diterima dari middleware, bukan seluruh
envelope satu batch. PII di payload dan kolom terproyeksi wajib tunduk pada access
control dan retention policy.

Logical key: `tenantId + outletId + waybillNo`.

## `RawDispatch`

```prisma
model RawDispatch {
  id                String        @id @default(uuid()) @db.Uuid
  tenantId          String        @db.Uuid
  outletId          String        @db.Uuid
  operationalDate   DateTime      @db.Date
  sourceEndpoint    String
  sourceRecordKey   String
  sourceFetchedAt   DateTime      @db.Timestamptz(3)
  syncedAt          DateTime?     @db.Timestamptz(3)
  syncStatus        RawSyncStatus @default(FETCHED)
  syncError          String?
  sourceRecordHash   String        @db.Char(64)
  sourcePayload      Json
  firstSeenRunId     String        @db.Uuid
  lastSeenRunId      String        @db.Uuid

  waybillNo         String
  courierNameRaw    String?
  freightAmount     Decimal       @db.Decimal(18, 2)
  dispatchTimeRaw   String?
  dispatchAt        DateTime?     @db.Timestamptz(3)
  receiverName      String?
  receiverAddress   String?
  deliveryStatusRaw String?
  chargeWeight      Decimal       @db.Decimal(12, 3)
  settlementTypeRaw String?
  serviceRaw        String?
  codStatusRaw      String?
  codValue          Decimal       @db.Decimal(18, 2)
  goodsDescription  String?

  createdAt         DateTime      @default(now()) @db.Timestamptz(3)
  updatedAt         DateTime      @updatedAt @db.Timestamptz(3)

  @@unique([tenantId, outletId, sourceRecordKey])
  @@index([tenantId, outletId, operationalDate])
  @@index([tenantId, outletId, waybillNo])
  @@index([tenantId, outletId, courierNameRaw, operationalDate])
  @@index([tenantId, outletId, syncStatus])
  @@index([firstSeenRunId])
  @@index([lastSeenRunId])
}
```

Logical key: `tenantId + outletId + waybillNo + dispatchTimeRaw`. Status tidak masuk
key karena replay membuktikan status berubah pada business record yang sama.

## `RawCod`

```prisma
model RawCod {
  id                  String        @id @default(uuid()) @db.Uuid
  tenantId            String        @db.Uuid
  outletId            String        @db.Uuid
  operationalDate     DateTime      @db.Date
  sourceEndpoint      String
  sourceRecordKey     String
  sourceFetchedAt     DateTime      @db.Timestamptz(3)
  syncedAt            DateTime?     @db.Timestamptz(3)
  syncStatus          RawSyncStatus @default(FETCHED)
  syncError            String?
  sourceRecordHash     String        @db.Char(64)
  sourcePayload        Json
  firstSeenRunId       String        @db.Uuid
  lastSeenRunId        String        @db.Uuid

  waybillNo            String
  codAmount            Decimal       @db.Decimal(18, 2)
  repaymentStatusRaw   Json
  repaymentStatusCode  Int?
  repaymentTypeRaw     Json
  repaymentTypeCode    Int?
  repaymentTypeLabel   String?
  signTimeRaw          String?
  signedAt             DateTime?     @db.Timestamptz(3)
  courierNameRaw       String?

  createdAt            DateTime      @default(now()) @db.Timestamptz(3)
  updatedAt            DateTime      @updatedAt @db.Timestamptz(3)

  @@unique([tenantId, outletId, sourceRecordKey])
  @@index([tenantId, outletId, operationalDate])
  @@index([tenantId, outletId, waybillNo])
  @@index([tenantId, outletId, courierNameRaw, operationalDate])
  @@index([tenantId, outletId, syncStatus])
  @@index([firstSeenRunId])
  @@index([lastSeenRunId])
}
```

Logical key:
`tenantId + outletId + waybillNo + repaymentTypeCode + signTimeRaw`.
Mapping terverifikasi: code `2` adalah `Qris COD`; code `0/1` adalah non-QRIS/Lainnya.
Kode lain menjadi anomaly.

## `MasterPickup`

```prisma
model MasterPickup {
  id                  String        @id @default(uuid()) @db.Uuid
  tenantId            String        @db.Uuid
  outletId            String        @db.Uuid
  rawPickupId          String        @unique @db.Uuid
  operationalDate     DateTime      @db.Date
  waybillNo            String
  staffName            String?
  senderName           String?
  freightAmount        Decimal       @db.Decimal(18, 2) // selalu RawPickup.totalFreight
  syncStatus           RawSyncStatus @default(NORMALIZED)
  normalizationVersion Int           @default(1)
  sourceSyncedAt       DateTime       @db.Timestamptz(3)
  createdAt            DateTime       @default(now()) @db.Timestamptz(3)
  updatedAt            DateTime       @updatedAt @db.Timestamptz(3)

  @@unique([tenantId, outletId, waybillNo])
  @@index([tenantId, outletId, operationalDate])
  @@index([tenantId, outletId, staffName, operationalDate])
}
```

`rawPickupId` harus mereferensikan RAW dengan tenant/outlet yang sama. Foreign key biasa
tidak membuktikan kesamaan tenant bila hanya memakai ID; service wajib menulis melalui
query scoped, dan migration final dapat mempertimbangkan composite foreign key jika
kompleksitasnya diterima.

## `PickupSettlementRevision`

Supporting model ini berada dalam domain pickup dan memisahkan diskon aktif dari
transaksi pembayaran bertahap:

```prisma
model PickupSettlementRevision {
  id                    String        @id @default(uuid()) @db.Uuid
  tenantId              String        @db.Uuid
  outletId              String        @db.Uuid
  masterPickupId        String        @db.Uuid
  revision              Int
  recordStatus          FinancialRecordStatus @default(VALID)
  supersedesRevisionId  String?       @db.Uuid
  discountAmount        Decimal       @db.Decimal(18, 2)
  reason                String?
  voidedAt              DateTime?     @db.Timestamptz(3)
  voidedByUserId        String?       @db.Uuid
  voidReason            String?
  createdByUserId       String        @db.Uuid
  updatedByUserId       String        @db.Uuid
  createdAt             DateTime      @default(now()) @db.Timestamptz(3)
  updatedAt             DateTime      @updatedAt @db.Timestamptz(3)

  @@unique([masterPickupId, revision])
  @@index([tenantId, outletId, masterPickupId, recordStatus])
}
```

Satu MasterPickup mempunyai tepat satu settlement revision `VALID`. Invariant:

```text
0 <= discountAmount <= MasterPickup.freightAmount
```

## `PickupPayment`

```prisma
model PickupPayment {
  id                    String        @id @default(uuid()) @db.Uuid
  tenantId              String        @db.Uuid
  outletId              String        @db.Uuid
  masterPickupId        String        @db.Uuid
  transactionKey        String        @db.Uuid
  revision              Int
  recordStatus          FinancialRecordStatus @default(VALID)
  supersedesPaymentId   String?       @db.Uuid
  paymentDate           DateTime      @db.Date
  receivedAmount        Decimal       @db.Decimal(18, 2)
  paymentMethodRaw      String
  transferAccount       String?
  note                  String?
  voidedAt              DateTime?     @db.Timestamptz(3)
  voidedByUserId        String?       @db.Uuid
  voidReason            String?
  createdByUserId       String        @db.Uuid
  updatedByUserId       String        @db.Uuid
  createdAt             DateTime      @default(now()) @db.Timestamptz(3)
  updatedAt             DateTime      @updatedAt @db.Timestamptz(3)

  @@unique([transactionKey, revision])
  @@index([tenantId, outletId, paymentDate])
  @@index([tenantId, outletId, masterPickupId, recordStatus])
}
```

Satu MASTER dapat mempunyai banyak transaksi pembayaran valid. Koreksi tidak menimpa
transaksi: revision lama menjadi `SUPERSEDED`, lalu revision baru dengan
`transactionKey` yang sama dibuat `VALID`. Void mengubah transaksi valid menjadi
`VOID` dengan actor, waktu, dan alasan.

```text
activeDiscountAmount =
  PickupSettlementRevision.discountAmount WHERE recordStatus=VALID

finalPickupObligation = MasterPickup.freightAmount - activeDiscountAmount
pickupTotalPaid = SUM(PickupPayment.receivedAmount WHERE recordStatus=VALID)
pickupRemainingAmount = finalPickupObligation - pickupTotalPaid
```

Status mengikuti tanda `pickupRemainingAmount`: BELUM_LUNAS, LUNAS, atau LEBIH_BAYAR.

## `MasterSetoran`

```prisma
model MasterSetoran {
  id                    String        @id @default(uuid()) @db.Uuid
  tenantId              String        @db.Uuid
  outletId              String        @db.Uuid
  operationalDate       DateTime      @db.Date
  courierKey             String
  courierName            String
  dfodAmount             Decimal       @db.Decimal(18, 2)
  codCashAmount          Decimal       @db.Decimal(18, 2)
  codQrisAmount          Decimal       @db.Decimal(18, 2)
  totalSettlementAmount Decimal       @db.Decimal(18, 2)
  previousObligationAmount Decimal?    @db.Decimal(18, 2)
  proposedDfodAmount       Decimal?    @db.Decimal(18, 2)
  proposedCodCashAmount    Decimal?    @db.Decimal(18, 2)
  proposedCodQrisAmount    Decimal?    @db.Decimal(18, 2)
  proposedObligationAmount Decimal?    @db.Decimal(18, 2)
  needsReview              Boolean     @default(false)
  obligationVersion        Int         @default(1)
  reviewedByUserId         String?     @db.Uuid
  reviewedAt               DateTime?   @db.Timestamptz(3)
  reviewDecision           ObligationReviewDecision?
  reviewNote               String?
  syncStatus             RawSyncStatus @default(NORMALIZED)
  normalizationVersion   Int           @default(1)
  sourceFetchedFrom      DateTime       @db.Timestamptz(3)
  sourceFetchedTo        DateTime       @db.Timestamptz(3)
  createdAt              DateTime       @default(now()) @db.Timestamptz(3)
  updatedAt              DateTime       @updatedAt @db.Timestamptz(3)

  @@unique([tenantId, outletId, operationalDate, courierKey])
  @@index([tenantId, outletId, operationalDate])
  @@index([tenantId, outletId, courierName, operationalDate])
}
```

`courierKey` adalah hasil canonicalization deterministik sementara karena endpoint tidak
memberikan courier ID. Penggabungan alias nama kurir tidak boleh dilakukan diam-diam.

`totalSettlementAmount` selalu `dfodAmount + codCashAmount`. `codQrisAmount` disimpan
dan ditampilkan tetapi tidak termasuk kewajiban tunai. Bila hasil normalisasi baru lebih
rendah:

- nilai aktif tidak berubah;
- seluruh komponen baru masuk field `proposed*`;
- `previousObligationAmount` menyimpan nilai aktif sebelum proposal;
- `needsReview=true`;
- hanya Admin/Owner dapat approve/reject;
- keputusan, actor, timestamp, dan alasan diaudit.

Bila hasil baru lebih besar atau sama, komponen aktif diperbarui otomatis,
`previousObligationAmount` menyimpan nilai sebelumnya, version bertambah, dan proposal
lama dibersihkan secara auditable.

MASTER_SETORAN adalah agregat banyak RAW. Pada rancangan minimal, lineage direkonstruksi
dengan scope `(tenantId, outletId, operationalDate, courierKey)` dan versi normalisasi.
Jika audit produksi membutuhkan bukti record-per-record yang immutable, tambahkan tabel
lineage teknis pada migration tahap berikutnya; jangan menyimpan daftar ID sebagai kolom
`Transfer1..8` atau payload teks.

## `CourierSettlementPayment`

```prisma
model CourierSettlementPayment {
  id                    String        @id @default(uuid()) @db.Uuid
  tenantId              String        @db.Uuid
  outletId              String        @db.Uuid
  masterSetoranId       String        @db.Uuid
  transactionKey        String        @db.Uuid
  revision              Int
  recordStatus          FinancialRecordStatus @default(VALID)
  supersedesPaymentId   String?       @db.Uuid
  paymentDate           DateTime      @db.Date
  cashAmount            Decimal       @db.Decimal(18, 2)
  transferAmountSnapshot Decimal      @db.Decimal(18, 2)
  paidAmountSnapshot     Decimal      @db.Decimal(18, 2)
  note                   String?
  overpaymentConfirmedAt DateTime?    @db.Timestamptz(3)
  overpaymentConfirmedByUserId String? @db.Uuid
  voidedAt              DateTime?     @db.Timestamptz(3)
  voidedByUserId        String?       @db.Uuid
  voidReason            String?
  createdByUserId       String        @db.Uuid
  updatedByUserId       String        @db.Uuid
  createdAt             DateTime      @default(now()) @db.Timestamptz(3)
  updatedAt             DateTime      @updatedAt @db.Timestamptz(3)

  @@unique([transactionKey, revision])
  @@index([tenantId, outletId, masterSetoranId, recordStatus])
  @@index([tenantId, outletId, paymentDate])
}
```

Setiap row adalah satu transaksi pembayaran, bukan snapshot tunggal seluruh settlement.
Satu MASTER dapat mempunyai banyak transaksi `VALID`. Nilai snapshot memudahkan audit
transaksi, tetapi status dan sisa keseluruhan selalu dihitung dari histori valid:

```text
transactionTransfer = SUM(transfer VALID dalam transaksi)
transactionPaid     = cashAmount + transactionTransfer

totalPaid            = SUM(cashAmount transaksi VALID)
                     + SUM(amount transfer VALID milik transaksi VALID)
remainingAmount      = master.totalSettlementAmount - totalPaid
```

Status dinamis:

```text
remainingAmount > 0 → BELUM_LUNAS
remainingAmount = 0 → LUNAS
remainingAmount < 0 → LEBIH_BAYAR
```

Tidak ada toleransi Rp1. Overpayment diizinkan setelah warning dan konfirmasi Admin
yang tercatat. Nilai lebih tidak dipindahkan ke hari berikutnya.

## `CourierSettlementTransfer`

```prisma
model CourierSettlementTransfer {
  id                    String   @id @default(uuid()) @db.Uuid
  tenantId              String   @db.Uuid
  outletId              String   @db.Uuid
  settlementPaymentId   String   @db.Uuid
  transactionKey        String   @db.Uuid
  sequence              Int
  revision              Int      @default(1)
  recordStatus          FinancialRecordStatus @default(VALID)
  supersedesTransferId  String?  @db.Uuid
  amount                Decimal  @db.Decimal(18, 2)
  destinationAccount    String?
  bankName              String?
  referenceNumber       String?
  transferredAt         DateTime? @db.Timestamptz(3)
  note                  String?
  createdByUserId       String   @db.Uuid
  updatedByUserId       String   @db.Uuid
  createdAt             DateTime @default(now()) @db.Timestamptz(3)
  updatedAt             DateTime @updatedAt @db.Timestamptz(3)

  @@unique([transactionKey, revision])
  @@index([tenantId, outletId, settlementPaymentId, sequence, recordStatus])
  @@index([tenantId, outletId, referenceNumber])
}
```

Database tetap memakai satu row per transfer dan tidak mempunyai kolom `Transfer1..8`.
Service membatasi maksimal delapan transaksi transfer untuk satu
`CourierSettlementPayment`. Koreksi membuat revision baru; hapus dari operasi bisnis
menjadi `VOID`, bukan hard delete.

## Relasi

```text
Tenant ─┬─ Outlet
        ├─ SyncRun ── firstSeen/lastSeen ── RAW
        ├─ RawPickup ── 0..1 MasterPickup
        │                            ├─ 0..N PickupSettlementRevision
        │                            └─ 0..N PickupPayment transactions/revisions
        ├─ RawDispatch ─┐
        └─ RawCod ──────┴─ N..1 MasterSetoran ── 0..N SettlementPayment transactions/revisions
                                                  └─ 0..N Transfer revisions

User ── createdBy/updatedBy ── PickupPayment
User ── createdBy/updatedBy ── PickupSettlementRevision
User ── createdBy/updatedBy ── SettlementPayment
User ── createdBy/updatedBy ── SettlementTransfer
```

Semua relasi dibaca dan ditulis melalui scope session:

```text
tenantId = session.tenantId
outletId = session.outletId
```

`outletId == null` tidak boleh otomatis berarti akses semua outlet. Endpoint Season 1
harus menolak operasi atau meminta outlet aktif yang telah diotorisasi server-side.

## Kebijakan delete

- RAW: tidak dapat dihapus melalui UI; retention purge adalah job administratif terpisah.
- MASTER: tidak hard delete bila sudah mempunyai payment; rebuild memakai upsert.
- PAYMENT/TRANSFER: transaksi valid dijumlahkan; revision lama tidak dihapus; koreksi
  membuat revision baru dan pembatalan memakai `VOID`.
- Foreign key operasional sebaiknya `Restrict`, bukan cascade yang dapat menghapus
  histori finansial saat master/user/outlet berubah.

## Audit foundation

Foundation `AuditAction` saat ini hanya mempunyai `LOGIN`, `LOGOUT`, `CREATE`, `UPDATE`,
dan `DELETE`. Agar tidak mengubah foundation, Season 1 memakai action yang ada:

| Aktivitas | `action` | `entityType` |
| --- | --- | --- |
| Sync pickup | `CREATE` | `RAW_PICKUP_SYNC` |
| Sync dispatch | `CREATE` | `RAW_DISPATCH_SYNC` |
| Sync COD | `CREATE` | `RAW_COD_SYNC` |
| Pembayaran baru | `CREATE` | `PICKUP_PAYMENT` / `COURIER_SETTLEMENT_PAYMENT` |
| Revision pembayaran | `UPDATE` | entity pembayaran |
| Diskon pickup dibuat/direvisi/void | `CREATE`/`UPDATE`/`DELETE` | `PICKUP_SETTLEMENT_REVISION` |
| Transfer tambah | `CREATE` | `COURIER_SETTLEMENT_TRANSFER` |
| Transfer koreksi | `UPDATE` | `COURIER_SETTLEMENT_TRANSFER` |
| Transfer dinonaktifkan | `DELETE` | `COURIER_SETTLEMENT_TRANSFER` |

Metadata sync hanya memuat count, tanggal, duration, hasil, dan error tersanitasi; jangan
menyalin payload PII atau credential.
