# Alur Autentikasi Scraper JFS

## Sumber token

Pada startup:

1. `AUTH_TOKEN` dibaca dari environment, default string kosong.
2. `createJfsAuthManager({ initialToken: AUTH_TOKEN })` membuat cache token in-memory.
3. Callback `onToken` menyelaraskan token auth manager kembali ke variabel global `AUTH_TOKEN`.
4. Semua endpoint dan service membaca token global yang sama.

Token tidak dipersistenkan ke database. Restart atau perpindahan instance mengembalikan state ke `AUTH_TOKEN` environment.

## Login credential

Caller mengirim:

```http
POST /jfs-auth/login
X-Auth-Key: <JFS_AUTH_KEY>
Content-Type: application/json

{"account":"...","password":"..."}
```

Alur internal:

1. `safeKeyMatches` membandingkan `X-Auth-Key` dan `JFS_AUTH_KEY` dengan `crypto.timingSafeEqual`, setelah memastikan panjang Buffer sama.
2. `loginWithCredentials` memvalidasi account/password non-kosong.
3. Account di-trim.
4. Password di-hash satu kali dengan MD5 lowercase.
5. Auth manager menyimpan `{account,passwordHash}` dalam memory.
6. POST dikirim ke `https://jfsgw.jtcargo.co.id/basicdata/login` dengan:

```json
{
  "account": "<account>",
  "password": "<md5 lowercase>",
  "captchaToken": "",
  "deviceNo": "<JFS_DEVICE_NO atau random UUID>",
  "countryId": "1"
}
```

7. Token diambil dari `response.data.data.token`.
8. `networkCode` dan `name` dikembalikan kepada caller; token tidak dikembalikan oleh endpoint login.
9. Token menjadi token global untuk semua endpoint/caller.

Credential plaintext hanya ada pada request masuk dan parameter fungsi; yang dicache adalah account dan MD5 password. MD5 tersebut tetap credential-equivalent terhadap upstream dan disimpan tanpa enkripsi di memory.

## Login ulang otomatis

Ada dua mekanisme:

- Service modular memakai `executeWithAuthRetry`: jalankan operasi dengan token global; bila error dikenali sebagai unauthorized, panggil `authManager.refreshLogin()` dan ulangi operasi satu kali.
- Axios interceptor global menangani request legacy yang menggunakan Axios langsung: pada response HTTP 401, bila request belum pernah diulang, bukan URL login, dan credential tersedia, lakukan refresh lalu ganti header `Authtoken`/`authtoken` dan ulangi request.

`refreshPromise` mencegah beberapa refresh login berjalan bersamaan pada satu instance.

Refresh otomatis hanya mungkin setelah `/jfs-auth/login` pernah menerima credential pada instance yang sama. Jika hanya `AUTH_TOKEN` atau `/set-token` yang digunakan, auth manager tidak mempunyai credential untuk login ulang.

## Endpoint set-token

`GET /set-token?token=...` langsung mengganti token global dan mengembalikan token tersebut. Endpoint:

- tidak memakai `X-Auth-Key`;
- tidak mempunyai autentikasi lain;
- menempatkan secret dalam query string;
- mengembalikan secret dalam JSON;
- memengaruhi seluruh user/client pada instance.

## Header upstream

Token dikirim sebagai `Authtoken` atau `authtoken`, tergantung endpoint. Header lain umumnya `Lang`, `Langtype`, `Origin`, `Referer`, `Routename`, dan User-Agent browser.

## Environment terkait

| Variable | Fungsi |
| --- | --- |
| `AUTH_TOKEN` | Initial global JFS token. |
| `JFS_AUTH_KEY` | Shared secret untuk satu-satunya endpoint login JFS. |
| `JFS_DEVICE_NO` | Device identifier upstream; bila kosong dibuat random UUID per startup. |
| `REQUEST_TIMEOUT_MS` | Timeout utility modular. |
| `REQUEST_RETRY_COUNT` | Retry utility modular. |

## Batas autentikasi saat ini

- `X-Auth-Key` hanya melindungi `/jfs-auth/login`, bukan endpoint data maupun `/set-token`.
- Tidak ada identitas caller, tenant, outlet, scope, rate limit, expiry lokal, atau audit autentikasi.
- Semua instance Railway dapat memiliki token/credential berbeda.
- `cors()` mengizinkan origin luas dan tidak menjadi autentikasi.
