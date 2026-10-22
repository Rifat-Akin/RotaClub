# RotaClub Geliştirici Kuralları ve Katkı Rehberi (Issue #73 & #17)

Bu belge, **Uluslararası Rotary 2420. Bölge — Galata Rotary Kulübü** pilotu ve çoklu kulüp (Multi-Tenant) **RotaClub** platformu için geliştirme standartlarını tanımlar.

## 1. Mimari İlkeler (P0 Öncelikleri)
- **Sunucu Yetkilendirmesi (Server-Side RBAC — #22, #23):** Rol kontrolleri yalnızca arayüzde buton gizleyerek yapılamaz. Sekreterlik (`sekreter`), Saymanlık (`sayman`) ve Dönem Başkanlığı (`baskan`) aksiyonları `/api/pilot/*` uç noktalarında sunucu tarafından doğrulanır.
- **Kalıcı Ortak Veri & Denetim Geçmişi (#14, #18, #19):** LCV bildirimleri, kuver matrisi, QR yoklama, dekont onayları ve kasa hareketleri sunucu veritabanında saklanır ve her işlem `AuditLogEntry` olarak denetim izine yazılır.
- **KVKK ve Örnek Veri Güvenliği (#12, #15):** Geliştirme ve pilot ortamlarında kullanılan örnek üye verileri gerçek kimlik/kredi kartı bilgisi içeremez; üye iletişim bilgileri yalnızca oturum açmış kulüp üyelerine sunulur.

## 2. Komutlar ve Test Altyapısı (#17)
- `npm run dev` — Express API + Vite geliştirme sunucusunu `http://localhost:3000` üzerinde başlatır.
- `npm test` — `src/utils/rotaryLogic.test.ts` üzerindeki iş mantığı (LCV/kuver hesaplama, cari bakiye, toplu tahakkuk, CSV üretimi, 1 Temmuz devir-teslim) testlerini çalıştırır.
- `npm run lint` — TypeScript tip güvenliği kontrolünü (`tsc --noEmit`) çalıştırır.
- `npm run build` — Üretim paketini (`dist/`) derler.
