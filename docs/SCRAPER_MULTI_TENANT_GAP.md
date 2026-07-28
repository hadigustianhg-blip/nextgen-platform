# Gap Multi-tenant Scraper JFS

## Hardcode yang mengikat SUM001A atau konfigurasi satu client

| Lokasi | Hardcode | Dampak |
| --- | --- | --- |
| `server.js` `/jfs-pickup` | `pickNetworkCode="SUM001A"` | Pickup selalu outlet SUM001A. |
| `server.js` `/jfs-cod` | `revenueNetworkCode="SUM001A"` | COD selalu revenue network SUM001A. |
| `waybill-status.scraper.js` | `scanSiteCode="SUM001A"` | Batch status selalu memfilter scan site SUM001A. |
| `server.js` `/jfs-pickup` | `pickFinanceCode="BDO000"` | Finance center tunggal. |
| `server.js` `/jfs-dispatch` | `oneNetwork="BDO000"`, `dispatchFinanceCode="BDO000"`, `dispatchFinanceId=183` | Dispatch terikat finance/network tunggal. |
| `server.js` `/jfs-cod` | `financeCenterId="BDO000"` | COD terikat finance center tunggal. |
| `server.js` `/jfs-ibk-report` | `financialCenterId=183`, `networkId=2015` | IBK terikat ID internal satu network. |
| Seluruh proses | `countryId="1"`, locale Indonesia | Konfigurasi global, bukan profil tenant. |
| Seluruh proses | Satu `AUTH_TOKEN`, satu credential cache | Login client terakhir mengganti konteks semua client. |

`networkCode` hasil login memang dibaca, tetapi hanya dikembalikan ke caller; kode itu tidak digunakan untuk mengonfigurasi payload scraper.

## Gap model dan isolasi

- Tidak ada `tenantId`, `outletId`, integration credential ID, atau caller identity.
- Tidak ada registry hubungan tenant → akun JFS → outlet/network/finance center.
- Tidak ada pemisahan token atau credential per tenant.
- Tidak ada penyimpanan token; semuanya in-memory global.
- Tidak ada tenant-scoped concurrency lock, queue, cache, rate limit, audit, atau metrics.
- Tidak ada validasi bahwa caller berhak meminta waybill/outlet tertentu.
- Response tidak memuat tenant/outlet provenance.
- Request dapat berjalan pada token global yang berubah di tengah proses bila client lain login/set-token.
- Multi-instance Railway akan mempunyai state berbeda dan tidak sinkron.
- Endpoint heavy berjalan dalam HTTP request dan dapat menghabiskan worker untuk client lain.

## Perubahan arsitektur yang diperlukan

### 1. Boundary service-to-service

Semua endpoint harus dilindungi autentikasi service-to-service. Caller NEXTGEN harus menyampaikan identitas internal yang dapat diverifikasi; scraper tidak boleh menerima `tenantId` mentah sebagai satu-satunya bukti. Tenant/outlet harus berasal dari API key/JWT/mTLS claim atau lookup integration ID yang terikat pada session server NEXTGEN.

### 2. Integration account store

Buat penyimpanan terpusat:

- `tenantId`, `outletId`;
- integration/account ID;
- JFS account dan encrypted credential;
- network code, network ID, finance code, finance ID;
- device number;
- token terenkripsi, expiry/last refresh;
- status, last login, failure count, key version.

Credential/token tidak boleh berada dalam source, query, response, atau log.

### 3. Auth manager per integration

Ganti singleton global dengan registry/pool auth context keyed oleh integration ID. Setiap request mengambil context tenant/outlet yang sudah diautorisasi. Refresh login harus single-flight **per integration**, bukan global. Token cache harus mendukung banyak instance (database/Redis atau broker yang sesuai).

### 4. Parameter resolver

Hapus hardcode SUM001A/BDO000/183/2015 dari handler. Resolve konfigurasi server-side berdasarkan outlet/integration:

```text
trusted caller → tenant/outlet authorization
               → integration profile
               → network/finance IDs
               → scraper payload
```

Jangan menerima network/finance code arbitrary dari browser.

### 5. Tenant-safe contract

Endpoint internal sebaiknya menerima resource/outlet context yang stabil, idempotency key, tanggal/range, dan filter domain. Response harus memuat correlation/job ID dan outlet provenance yang aman. Semua query, cache key, log, metric, job, dan result store wajib di-scope oleh tenant/outlet.

### 6. Job architecture

Pickup/dispatch/COD, order sync, IBK, dan inventory berpotensi panjang. Ubah menjadi job:

1. create sync job;
2. worker mengambil credential/config tenant;
3. bounded pagination dan concurrency;
4. progress/result per tenant;
5. idempotency dan retry;
6. callback/polling internal.

Tambahkan limit per tenant agar satu client tidak menghabiskan kapasitas global.

### 7. Contract dan migration compatibility

- Pertahankan mapper output selama NEXTGEN lama masih menjadi consumer.
- Tambahkan v2 contract tenant-aware tanpa diam-diam mengubah response legacy.
- Tambahkan contract test untuk semua endpoint legacy sebelum refactor.
- Test wajib membuktikan token dan data tenant A tidak pernah digunakan pada request tenant B.
- Jalankan terhadap `jfs-middleware-v2`/staging terlebih dahulu; jangan mengubah service produksi saat validasi.

## Urutan perubahan paling aman

1. Lindungi atau nonaktifkan akses publik `/set-token`; tambah authentication pada seluruh endpoint.
2. Tambah contract test penuh untuk delapan endpoint legacy.
3. Buat integration profile dan encrypted credential storage.
4. Refactor auth manager menjadi per-integration tanpa mengubah scraper mapping.
5. Extract network/finance parameters menjadi server-side resolved config.
6. Modularisasi endpoint legacy satu per satu.
7. Tambah tenant-isolation, concurrency, and token-race tests.
8. Pindahkan endpoint heavy ke worker/job.
9. Integrasikan dengan NEXTGEN menggunakan trusted tenant/outlet context.
10. Parallel-run dan reconcile output per outlet sebelum cutover.
