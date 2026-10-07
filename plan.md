# Vinu wallpaperZ — ව්‍යාපෘති සැලැස්ම

## අරමුණ සහ implementation

පවතින Vinu wallpaperZ archive එකේ branding, navigation, admin login සහ user features යාවත්කාලීන කරන්න. Homepage header/footer එකෙන් admin පිවිසුම් සබැඳි ඉවත් කර, admin login එක `/admin/login` හි පමණක් සපයන්න. Admin සහ සාමාන්‍ය Google user sessions වෙන වෙනම roles/cookies භාවිතා කරයි; සාමාන්‍ය user එකෙකුට admin endpoints හෝ admin dashboard ලබා නොදෙන්න. Admin login username/password project secrets තුළින් ලබාගන්න; password hash කර සසඳා, credential version එක වෙනස් වූ විට පරණ admin sessions අවලංගු කරන්න.

Admin control room එකෙන් wallpapers create/upload, metadata edit, soft-delete/restore, සහ login වූ Google users ලැයිස්තුව suspend/restore කළ හැක. Upload fields: title, category (`Gaming`, `Cyberpunk`, `Anime`, `Cars`, `Nature`, `Dark`), comma-separated tags සහ image resolution; resolution එක upload file එකෙන් server/browser දෙකෙන්ම validate කරගන්න. Files project object storage වෙත, metadata MySQL වෙත සුරකින්න. Delete එක soft-delete (`is_active=0`) වන නිසා history/favorites අහිමි නොවේ.

Dashboard cards: Total Wallpapers, Total Views, Total Downloads, Daily Active Users (පසුගිය පැය 24 තුළ සත්‍යාපිත Google users), Weekly Users (පසුගිය දින 7 තුළ සත්‍යාපිත Google users). Views යනු wallpaper preview opens; Downloads යනු archive download endpoint හරහා සටහන් වූ downloads. දින 7ක views/downloads chart එක server-side event records වලින් ලැබේ. Favorites සහ signed-in user download history ඔවුන්ගේම user ID මත පමණක් කියවිය හැක. Admin user table තුළ Google verified profile name/email, login/activity times හා status පෙන්වයි; Google tokens හෝ passwords සුරකින්න එපා.

Google sign-in සඳහා Google Identity Services button එක භාවිතා කර browser credential එක backend වෙත යවන්න. Node server එක `google-auth-library` මඟින් ID token signature, audience/client ID, issuer, expiry සහ nonce පරීක්ෂා කළ පසුව පමණක් user session නිකුත් කරයි. අවශ්‍ය public client ID එක `GOOGLE_CLIENT_ID` ලෙස protected project setting එකක තබා, backend endpoint එකෙන් browser වෙත public client ID පමණක් ලබාදෙන්න. Google Web OAuth client එකක් හා Authorized JavaScript Origin එකක් අවශ්‍යය; දැනට Preview origin එක `https://8328-ixnqz79rime9crxqrvh1b-a600a59f.us1.manus.computer`. Client ID එක protected setting එකට සකසා ඇත; Preview button/configuration සහ server-side verification path පරීක්ෂා කර ඇති නමුත් පෞද්ගලික Google account එකකින් සාර්ථක login එකක් මෙතැන සිදුකර නැත.

Footer credit එක `Built by Vinu` වේ. නිවැරදි public contact label/value ලැබෙන තුරු පුද්ගලික contact තොරතුරු අනුමාන කර ප්‍රකාශයට පත් නොකරන්න.

## ව්‍යාපෘති ව්‍යුහය

- `index.html`: English homepage shell, Google sign-in slot, archive navigation/footer, wallpaper preview සහ account dialog.
- `src/app.js`: homepage catalog, search/filter, preview, favorite actions සහ page-view events.
- `src/api.js`: escaped HTML, JSON fetch සහ same-origin mutation helpers.
- `src/google-auth.js`: GIS script/button, Google callback, user session, favorites/history UI.
- `src/admin.js`: `/admin/login` login, animated stats, charts, wallpaper upload/edit/delete, user list/status controls.
- `src/metrics-chart.js`: accessible animated SVG views/downloads visualization.
- `src/styles.css`: existing dark-neon archive styling සහ responsive glassmorphism admin/account components.
- `server.js`: Node HTTP server, role-separated signed cookies, rate-limited admin login, Google ID-token verification, analytics, favorites/history, admin APIs, validated storage uploads.
- `schema.sql`: wallpaper tags, Google users, favorites, analytics events, login limits සඳහා repeatable/additive MySQL schema.
- `logo.svg`, `app.config.ts`: Vinu wallpaperZ mark සහ platform logo metadata.
- `Dockerfile`, package manifest/lockfile/`pnpm-workspace.yaml`: pinned Node runtime, production dependencies සහ reviewed install policy.
- `manus-routes.json`: page routes `/` සහ `/admin/login`; API endpoints මෙයට ඇතුළත් නොවේ.
- `TODO.md`: source requirements, completion සහ external-input blockers.

## සැලසුම

**Design movement:** Cyberpunk noir + premium glassmorphism control room.

**Core principles:** (1) Wallpaper art සහ දත්ත එකවරත් සරලව දක්වන්න; (2) පාලක dashboard එක dense වුවත් පැහැදිලි hierarchy එකක් තබන්න; (3) cyan/violet glow එක action, focus සහ chart data සඳහා පමණක් භාවිතා කරන්න; (4) desktop හා mobile දෙකේම touch/keyboard access එක සමානව සුරකින්න.

**Color philosophy:** Near-black `#080A0D` සහ charcoal panels අඳුරු immersive base එක සපයයි. Frosted translucent panels depth එකක් එක් කරයි; luminous cyan `#70F3EF` යනු brand/action color එක වන අතර violet secondary highlight එක animation හා graph series වෙනස පෙන්වයි. Contrast අඩු නොකර glow එක edge/highlight වලට සීමා කරන්න.

**Layout paradigm:** Public site එක editorial, artwork-first gallery එකක් ලෙස පවතී. Admin desktop view එකේ compact side navigation සහ ප්‍රධාන canvas එකේ stats → chart → management sections වේ; mobile view එකේ stacked metric cards, scrollable tab strip සහ single-column forms/tables වේ. Dashboard එක අහඹු විශාල centered grid එකක් නොව, workflow අනුව කලාපගත control room එකකි.

**Signature elements:** (1) geometric VWZ neon mark; (2) cyan scan-ring/reticle motif; (3) translucent glass cards වල දාර හරහා යන cyan-violet edge glow හා micro-grid.

**Interaction philosophy:** Hover/focus මඟින්ම controls හඳුනාගත හැකි විය යුතුය. Edit, delete/restore, suspend/restore ක්‍රියා පැහැදිලි status/result toast පෙන්වයි. Google sign-in, favorites සහ downloads userට හුරු, අමතර Google scopes නොඉල්ලන අත්දැකීමක් තබයි.

**Animation:** Page entry සහ section reveal එක කෙටි fade/translate; stats cards staggered count-up; chart bars/paths load වෙද්දී grow/draw; buttons/cards 2–4px lift සමඟ cyan/violet glow; upload states spinner/progress. Motion `prefers-reduced-motion` වලදී සීමා/නිවා දමන්න. Charts සඳහා text summary සහ aria labels ද තිබිය යුතුය.

**Typography:** Headings සඳහා `Space Grotesk`, labels/body සඳහා `Inter`; metric අංක විශාල/දැඩි, units කුඩා; admin metadata uppercase letter-spaced. Mobile labels overflow නොවන ලෙස line wrapping සහ minimum tap sizes තබන්න.

**Brand essence:** “Playersගේ desktop setup එකට cinematic game-inspired wallpapers සොයා, සුරක්ෂිතව සුරකින්න සහ කළමනාකරණය කරන්න එක් neon archive එකක්.” Personality: bold, atmospheric, dependable.

**Brand voice:** Headlines කෙටි සහ vivid; controls සෘජු සහ පැහැදිලි. උදාහරණ: “Built for after dark.” සහ “Make the archive yours.”

**Wordmark/logo:** `Vinu wallpaperZ` නම සමඟ custom geometric VWZ monogram, angular cyan stroke එකක් හා charcoal tile එකක්; favicon සහ platform logo එක එකිනෙකට ගැළපේ.

**Signature brand color:** Luminous cyan `#70F3EF`.

## සීමා සහ ප්‍රකාශනය

Project-managed MySQL/Object Storage සහ local server භාවිතා කරන්න; Google integration සඳහා user-owned OAuth Web client ID අවශ්‍යය, එය දැන් protected setting එකේ ඇත. Analytics හි non-PII wallpaper view/download events පමණක්; DAU/WAU signed-in active users ලෙස ගණන් කරන්න. Contacts නොලැබෙන තුරු footer එකේ `Built by Vinu` පමණක් පෙන්වන්න. Auto-publish අක්‍රියව තබා, user ඉල්ලූ Preview review සහ canonical `main` checkpoint/push පමණක් කරන්න; public publish නොකරන්න.


## Google sign-in තාක්ෂණික මූලාශ්‍ර

- [Google Identity Services: Display the Sign in with Google button](https://developers.google.com/identity/gsi/web/guides/display-button) — browser credential callback එකෙන් JWT ID token ලැබේ.
- [Google Identity Services: Verify the Google ID token on your server](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token) — Google Auth Library භාවිතයෙන් signature, client-ID audience, issuer සහ expiry verify කළ පසුව user සෑදීම/පිවිසීම කරන්න; `sub` ස්ථාවර identity key එකයි, `email_verified` පරීක්ෂා කළ යුතුය.
- [Google Identity Services: Get a Google API client ID](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid) — Web OAuth client ID, consent branding, Authorized JavaScript Origins සහ GIS CSP අවශ්‍යතා සකසන්න; email/profile/openid ප්‍රමාණවත් වන අතර අමතර Google API scopes ඉල්ලන්නේ නැත.


## Wallpaper asset delivery amendment

පොදු full-page Preview එකේ මුල් async artwork slots හතරම broken-image/alt-text ලෙස පෙනුණු අතර ඒ output සඳහා local source file එකක් තිබුණේ නැත. පැරණි generation job එක poll හෝ retry නොකර, website එක හිස් නොපෙනීමට Cyberpunk, open-world Cars, Anime-inspired සහ Dark Fantasy සඳහා වෙන වෙනම 2560×1440 original SVG vector wallpapers සකසා project object storage එකට upload කළෙමි. Database startup migration එක එම හතර starter slug වල `/manus-storage/async-images/...` path තිබෙන විට පමණක් image path, filename සහ dimensions මාරු කරයි; admin විසින් image path වෙනස් කර ඇති හෝ අලුත් records වෙනස් නොකරයි. Final delivery ට පෙර app-level Preview render එක පරීක්ෂා කර සාර්ථක නම් පමණක් asset outcome එක complete ලෙස සලකන්න.


## Preview storage-rendering fix

Stable `/manus-storage/...` image requests redirect to the project CDN. The earlier policy allowed same-origin images and Google profile pictures, but blocked this verified CDN hop. Add only the observed storage-CDN host to `img-src`; do not broaden script, connect, or other CSP sources. After restart, the public HTTPS Preview loaded all four SVG wallpapers successfully at 2560×1440. Temporary signed URLs were neither saved nor exposed.
