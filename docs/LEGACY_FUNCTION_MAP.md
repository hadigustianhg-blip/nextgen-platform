# Peta Fungsi Legacy NEXTGEN

## Fungsi backend publik per domain

Fungsi tanpa suffix `_` adalah surface yang dapat dipanggil frontend atau trigger. Fungsi berakhiran `_` adalah helper internal.

| File/domain | Fungsi publik |
| --- | --- |
| `Main.gs` | `doGet`, `include` |
| Auth | `loginNextgen`, `validateNextgenSession`, `logoutNextgen`, `getNextgenCurrentUser` |
| Dashboard | `getDashboardSummary`, `getDashboardTrendData`, `refreshDashboard` |
| Delivery | `getSetoranData`, `saveSetoranInput`, `saveDeliverySettlement`, `getSetoranSummary`, `refreshSetoranData`, `syncDeliverySettlementData`, `getDeliverySettlementClosingPreview`, `closeDeliverySettlement` |
| Settlement history | `getDeliverySettlementHistory`, `updateDeliverySettlementHistory` |
| Pickup settlement | `getPickupSettlementData`, `savePickupSettlement`, `bulkUpdatePickupSettlement`, `getPickupSettlementSummary`, `refreshPickupSettlement`, `syncPickupSettlementData`, `getPickupSettlementClosingPreview`, `closePickupSettlement` |
| Transfer main | `getTransferMainFormData`, `getTransferMainTransactions`, `getTransferMainGroupedData`, `getTransferMainSummary`, `saveTransferMainTransaction`, `updateTransferMain`, `deleteTransferMain`, `refreshTransferMain`, `getTransferMainData`, `saveTransferMain` |
| Transfer verification | `processTransferMutationCsv`, `getTransferVerificationData`, `saveTransferVerificationNote`, `clearTransferCsvData` |
| Payment settlement | `getPaymentSettlementData`, `getPaymentSettlementSummary`, `refreshPaymentSettlement`, `savePaymentRecap`, `saveSetorTunai`, `saveCashoutPayment`, `updateCashoutPayment`, `deleteCashoutPayment`, `getCashoutPaymentData` |
| Payment pickup | `getPaymentPickupData`, `getPaymentPickupSummary`, `updatePaymentPickup`, `refreshPaymentPickup` |
| Operasional | `getOperasionalData`, `getOperasionalCategories`, `getOperasionalTeam`, `saveOperasional`, `deleteOperasional`, `refreshOperasional`, `getOperasionalDashboardSummary` |
| Dokumen tagihan | `getDokumenTagihanData`, `generateSelectedTagihanPdf`, `refreshDokumenTagihan` |
| Data pendingan | `getDataPendingan`, `getDataPendinganSummary`, `refreshDataPendingan`, `syncDataPendingan` |
| Penjadwalan | `refreshPenjadwalanPickup`, `syncPenjadwalanPickup` |
| Monitoring harian | `getMonitoringHarianData`, `getMonitoringHarianSummary`, `refreshMonitoringHarian`, `syncMonitoringHarianData`, `getMonitoringHarianClosingPreview`, `closeMonitoringHarian` |
| Monitoring bulanan | `getMonitoringBulananTeamData`, `getMonitoringBulananTrendData`, `getMonitoringBulananSummary`, `refreshMonitoringBulanan` |
| SLA | `getSlaAvailablePeriods`, `getSlaPeriodData` |
| Waybill stuck | `getMonitoringWaybillStuckData`, `syncMonitoringWaybillStuck` |
| Cashflow | `getCashflowJFSData` |
| Profit/Loss | `getProfitLossData`, `saveManualProfitLossEntry`, `deleteManualProfitLossEntry` |
| Salary | `getTeamLoanData`, `getTeamIncomeRecap`, `getSalaryClosingPreview`, `getSalaryClosingData`, `closeSalaryPeriod`, `cancelSalaryClosing`, `getSalaryPaymentData`, `saveSalaryOvertime`, `saveSalaryAdjustment`, `saveManualOvertime`, `applyBulkSalaryAdjustment`, `processSalaryPayment`, `processSalaryPaymentBatch`, `processSingleSalaryPayment`, `generateSalarySlip`, `markSalaryAsPaid`, `generateSalarySlipManual`, `getSalaryWhatsappData`, `markSalarySlipShared`, `getPublishSalaryData`, `generateSalaryPdf`, `markSalaryWhatsappSent`, `endSalaryProcess`, `getSalaryHistory`, `processSalaryBatch` |
| Settings | `getSettingsAccounts`, `changeOwnPassword`, `createSettingsAccount`, `createNextgenExcelBackup`, `getResetPreview`, `resetNextgenData` |
| JFS settings | `getJfsConnectionSettings`, `saveJfsConnectionSettings`, `connectJfsFromSettings` |
| Auto closing | `runPreClosingSync`, `validatePreClosingData`, `autoClosingHarian`, `retryNextgenClosingManual`, `getNextgenAutoClosingStatus`, `installNextgenAutoClosingTriggers`, `disableNextgenAutoClosing` |

## Helper backend

Semua helper teridentifikasi dan dikelompokkan berdasarkan tanggung jawab:

- Auth/settings: validasi payload, lookup user/session/account, normalisasi teks, formatter session/date, admin guard, backup/reset sheet dan folder.
- Settlement/payment/transfer: reader/mapper row, header alias lookup, filter/period normalization, amount/date parser, row identity/concurrency validation, aggregate/sync, closing/history dedupe, proof upload dan folder handling.
- Monitoring/QC: sheet reader, header mapper, validity checks, percentage/date normalization, grouping/sorting, closing keys, raw-sheet cleanup.
- Finance/salary: mapper/filter/aggregate recap, closing ID and duplicate keys, append/delete rows, status normalization, payment calculation, PDF/image/HTML/SVG/WhatsApp builders, header helpers, history summary, bulk-adjustment helpers.
- Infrastructure: period/date helpers, `SystemLog` serialization/writer, auto-closing runtime state/window/trigger helpers.

Daftar nama helper lengkap per file:

- `Auth.gs`: `validateNextgenLoginPayload_`, `findNextgenLoginUserById_`, `getNextgenSessionByToken_`, `deleteNextgenSession_`, `getNextgenLoginSheet_`, `ensureNextgenLoginPasswordHeader_`, `normalizeNextgenText_`, `formatNextgenSessionDate_`.
- `Setoran.gs`: `getSetoranSheet_`, `getSetoranSpreadsheet_`, `getRequiredSetoranSheet_`, `getSetoranRows_`, `mapSetoranRow_`, `formatSetoranDate_`, `validateSetoranPayload_`, `validateDeliverySettlementPayload_`, `validateDeliverySettlementSession_`, `findSetoranRowByName_`, `findSetoranRowByNameAndDate_`, `normalizeSetoranName_`, `parseSetoranAmount_`, `parseDeliveryTransferAmounts_`, `sumSetoranNumbers_`, `toSetoranNumber_`, `normalizeMoney_`, `normalizeSetoranDateKey_`, `calculateSetoranSettlement_`, `getDeliverySettlementTransferDetails_`, `isDeliverySettlementSaved_`, `roundDeliverySettlementDfodColumn_`, `writeSetoranBelumBayarIfManual_`, `getSetoranSummaryWithOverride_`, `normalizeSetoranSummaryAliases_`, `getOrCreateSetoranHistorySheet_`, `getSetoranHistoryKeys_`, `buildSetoranClosingKey_`, `getSetoranClosingUser_`, `clearDeliverySettlementAfterClosing_`, `clearSetoranManualBelumBayar_`, `clearSetoranRawSheet_`.
- `PickupSettlement.gs`: `getPickupSettlementSheet_`, `getRequiredPickupSettlementSheet_`, `getPickupSettlementRows_`, `mapPickupSettlementRow_`, `validatePickupSettlementPayload_`, `validateBulkPickupSettlementPayload_`, `findPickupSettlementRowByIdentity_`, `isPickupSettlementAdjusted_`, format/number/text helpers, `requirePickupSettlementAdmin_`, history key/sheet helpers, closing user/cleanup helpers.
- `PaymentSettlement.gs`: context/header/read/map/row/setter helpers; recap/cashout validators; cashout sheet/map/find/upload/folder/extension/ID helpers; filter/date/amount/validity helpers; user/admin guards.
- `SalaryFinance.gs`: 118 internal helpers covering read/map/filter/aggregate, closing/payment/history sheets, duplicate validation, adjustment calculation, PDF/image/WhatsApp creation, status normalization, header lookup, bulk adjustment, period/kasbon calculation, and update/delete operations. Nama persisnya adalah seluruh deklarasi berakhiran `_` pada file; tidak ada fungsi anonim yang diperlakukan sebagai API.

## Fungsi frontend

`script.html` mempunyai 691 deklarasi fungsi bernama. Fungsi tersebut membentuk kelompok berikut:

- Bootstrap/auth/menu: `bindNextgenApplication`, `bootNextgenApplication`, auth bind/init/submit/show/hide/logout/storage, role helpers, menu access, sidebar accordion dan `switchSettlementView`.
- Per module: pola `bind*Controls`, `load*View`, `set*Loading`, `render*`, `getFiltered*Rows`, table/card/pagination renderer, modal open/close/submit, formatter dan validator.
- Dashboard: load/render summary, SLA panel/donut/progress, chart render, animation, error state.
- Finance/salary: cashflow, kasbon, income, closing, cancel, payment, bulk/row adjustment, PDF/slip preview, WhatsApp, publish, ending, history.
- Shared: pagination, date/number/Rupiah/kg/percent formatting, HTML/attribute escaping, toast/error sanitization, JFS sync freshness indicator.
- Transfer verification dideklarasikan dalam dua blok; nama seperti `bindTransferVerificationControls`, `loadTransferVerificationView`, `renderTransferVerificationResults`, filter/summary/status/file/delete helpers muncul kembali dan implementasi terakhir menimpa yang awal.
- `Profit-Loss.html` menambah 36 fungsi: bind/load/render summary/tables/charts/pagination, modal manual/delete, save/delete, loading/error, currency/period helpers.

## Semua `google.script.run`

| Frontend action | Backend yang dipanggil |
| --- | --- |
| Restore/login/logout | `validateNextgenSession`, `loginNextgen`, `logoutNextgen` |
| Settings | `getSettingsAccounts`, `changeOwnPassword`, `createSettingsAccount`, `createNextgenExcelBackup`, `resetNextgenData` |
| Connect JFS | `getJfsConnectionSettings`, `saveJfsConnectionSettings`, `connectJfsFromSettings` |
| Pending/penjadwalan | `refreshDataPendingan`, `syncDataPendingan`, `refreshPenjadwalanPickup`, `syncPenjadwalanPickup` |
| Dashboard/monitoring | `refreshDashboard`, `refreshMonitoringHarian`, `syncMonitoringHarianData`, `getMonitoringHarianClosingPreview`, `closeMonitoringHarian`, `refreshMonitoringBulanan`, `getSlaAvailablePeriods`, `getSlaPeriodData`, `getMonitoringWaybillStuckData`/`syncMonitoringWaybillStuck` secara dinamis |
| Delivery | `refreshSetoranData`, `syncDeliverySettlementData`, `getDeliverySettlementClosingPreview`, `closeDeliverySettlement`, `saveDeliverySettlement`, `getSetoranSummary` |
| History | `getDeliverySettlementHistory`, `updateDeliverySettlementHistory` |
| Pickup | `refreshPickupSettlement`, `syncPickupSettlementData`, `getPickupSettlementClosingPreview`, `closePickupSettlement`, `savePickupSettlement`, `getPickupSettlementSummary`, `bulkUpdatePickupSettlement` |
| Transfer main | `refreshTransferMain`, `saveTransferMainTransaction`, `updateTransferMain`, `deleteTransferMain` |
| Transfer verification | `getTransferVerificationData`, `processTransferMutationCsv`, `saveTransferVerificationNote`, `clearTransferCsvData`, dan pemanggilan `previewTransferMutationCsv` yang backend-nya tidak ada |
| Payment | `refreshPaymentSettlement`, `savePaymentRecap`, `saveCashoutPayment`/`updateCashoutPayment` dinamis, `deleteCashoutPayment`, `refreshPaymentPickup`, `updatePaymentPickup` |
| Operasional/dokumen | `refreshOperasional`, `saveOperasional`, `deleteOperasional`, `refreshDokumenTagihan`, `generateSelectedTagihanPdf` |
| Finance | `getCashflowJFSData`, `getTeamLoanData`, `getTeamIncomeRecap`, `getSalaryClosingPreview`, `closeSalaryPeriod`, `cancelSalaryClosing`, `getSalaryPaymentData`, `applyBulkSalaryAdjustment`, `saveSalaryAdjustment`, `processSalaryBatch`, `generateSalarySlipManual`, `getSalaryWhatsappData`, `markSalarySlipShared`, `getPublishSalaryData`, `generateSalaryPdf`, `markSalaryWhatsappSent`, `endSalaryProcess`, `getSalaryHistory` |
| Profit/Loss | `getProfitLossData`, `saveManualProfitLossEntry`, `deleteManualProfitLossEntry` |

Total lexical call site: 86. Beberapa menggunakan method dinamis sehingga satu call site mewakili dua backend.

## Fungsi eksternal yang dirujuk tetapi tidak didefinisikan dalam arsip

`loginJfsDariSheet`, `tarikPickup`, `tarikDFOD`, `tarikCOD`, `syncPickupmonitoring`, `syncDispatchmonitoring`, `tarikDetailPending`, `syncPUMP`, serta fungsi closing/sync yang dipanggil kondisional dari auto-closing. Kontraknya tidak dapat dipetakan dari source yang tersedia.
