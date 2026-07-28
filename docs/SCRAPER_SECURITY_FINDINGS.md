# Temuan Keamanan `jfs-middleware-refactor`

Audit ini bersifat source review, bukan penetration test. Severity menunjukkan dampak bila service dapat diakses pihak yang tidak dipercaya.

## Critical

### S-01 — `/set-token` tanpa autentikasi

`GET /set-token?token=...` menerima dan mengganti token global tanpa verifikasi caller. Penyerang dapat mengambil alih session JFS seluruh instance atau menyebabkan denial of service.

Token juga berada di URL dan dikembalikan pada response, sehingga dapat masuk access log, browser history, proxy, analytics, dan observability.

### S-02 — Endpoint data tidak mempunyai inbound authentication

Semua endpoint scraper dapat dipanggil tanpa API key/session. Dampaknya mencakup pengambilan data operasional, finansial, COD, order, inventory, dan PII penerima selama instance mempunyai token JFS aktif.

### S-03 — Token dan credential bersifat global lintas caller

Login atau set-token terakhir berlaku untuk semua request. Dalam penggunaan multi-client, ini memungkinkan cross-tenant credential confusion dan kebocoran data.

## High

### S-04 — Endpoint `/jfs-sensitive` mengekspos PII

Response memuat nama, nomor ponsel, telepon, alamat lengkap, COD, dan barang. Endpoint tidak mempunyai auth inbound, authorization per waybill, rate limit, atau audit access.

### S-05 — Logging legacy memuat payload dan raw response

`server.js` mencetak payload dispatch/COD/IBK, potongan raw upstream response, detail order error, dan object error upstream. Data ini dapat berisi identifier shipment, customer, atau informasi internal.

Logger modular memang menyensor key sensitif, tetapi endpoint legacy memakai `console.log/error` langsung dan tidak mendapat perlindungan tersebut.

### S-06 — Raw upstream error diteruskan ke caller

Beberapa response `detail` atau `error` berisi `error.response.data` mentah. Ini dapat membocorkan struktur upstream, identifier, pesan internal, dan data request.

### S-07 — CORS terbuka

`app.use(cors())` memakai default permissive. CORS bukan pengganti auth, tetapi bersama endpoint tanpa auth memperluas kemungkinan pemanggilan dari browser origin mana pun.

### S-08 — Credential-equivalent tersimpan di memory

Auth manager menyimpan account serta MD5 password selama process hidup agar dapat refresh login. MD5 bukan enkripsi dan hash tersebut dikirim sebagai password upstream; nilai itu harus diperlakukan sebagai credential rahasia.

## Medium

### S-09 — Tidak ada rate limiting atau bounded work menyeluruh

Pickup dan order sync tidak mempunyai max page; inventory mempunyai dua loop tanpa max; order sync melakukan N+1 detail request. Caller anonim dapat memicu pekerjaan berat berulang.

### S-10 — Token state tidak cocok untuk banyak instance

Token/credential hanya in-memory. Railway restart menghilangkan credential refresh; beberapa replica dapat menggunakan token berbeda. Tidak ada distributed lock pada refresh.

### S-11 — Validasi input tidak konsisten

Endpoint legacy tidak memvalidasi format/range tanggal. `/jfs-sensitive` tidak memastikan `waybillNo` tersedia. `/jfs-order-sync` meneruskan `start/end` apa adanya.

### S-12 — Partial success tidak selalu terlihat jelas

Order detail yang gagal hanya di-log dan dilewati, tetapi response tetap `success:true`. Batch status juga dapat `success:true` dengan array `errors`. Tanpa consumer handling yang ketat, data parsial dapat dianggap lengkap.

### S-13 — Upstream auth handling tidak konsisten

Endpoint modular memakai sanitized utility dan auth retry; endpoint legacy memakai Axios langsung, interceptor global, serta handler error berbeda-beda. Sebagian memeriksa `error.response.data.code===401`, sebagian hanya menghasilkan 500.

### S-14 — Shared secret tunggal

`JFS_AUTH_KEY` merupakan satu shared secret global, tanpa tenant scope, rotation metadata, expiry, caller identity, atau audit. Timing-safe comparison sudah baik, tetapi model secret tetap terlalu luas untuk multi-client.

## Low/operational

### S-15 — Device identity berubah jika env tidak diatur

Tanpa `JFS_DEVICE_NO`, random UUID dibuat setiap startup. Ini dapat menyebabkan perilaku session/device upstream berubah dan menyulitkan audit.

### S-16 — Health endpoint tidak membedakan readiness

`GET /` selalu mengembalikan teks sukses tanpa memeriksa token, upstream, atau dependency. Orchestrator dapat menganggap instance siap padahal scraper tidak dapat digunakan.

## Kontrol positif yang sudah ada

- `/jfs-auth/login` memakai `X-Auth-Key` dan timing-safe comparison.
- Endpoint login tidak mengembalikan token/password.
- Password plaintext tidak diteruskan ke upstream; source melakukan MD5 sesuai kontrak JFS.
- Auth retry dibatasi satu kali, dengan single-flight refresh pada satu instance.
- Utility modular mempunyai timeout, bounded retry, validasi JSON, dan klasifikasi error.
- Shared logger menyensor token, auth, cookie, password, secret, session, dan API key.
- Fixture test menggunakan data dummy dan safety test mencegah secret nyata.
- Batch waybill dibatasi 500 dan dipecah menjadi batch 100.
- Inventory-detail membatasi size/maxPage 1–500 serta memvalidasi tanggal.

## Prioritas mitigasi

1. Blokir akses publik `/set-token` dan seluruh endpoint scraper.
2. Terapkan authentication/authorization service-to-service untuk setiap endpoint.
3. Pisahkan token/credential/config per tenant dan outlet.
4. Hapus secret dari URL/response/log serta sanitasi error legacy.
5. Batasi CORS, rate, pagination, concurrency, range tanggal, dan request size.
6. Pindahkan credential/token ke encrypted centralized store dan audit seluruh penggunaan.
7. Tambah PII access policy, audit trail, retention, serta field minimization.
8. Tambah contract/security/isolation test sebelum multi-client rollout.
