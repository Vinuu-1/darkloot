# Vinu wallpaperZ — TODO

- [x] Homepage navbar/header එකෙන් “ADMIN SIGN IN” button එක ඉවත් කර `/admin/login` direct URL එක පමණක් තබා ඇත; homepage/footer/සාමාන්‍ය-user UI එකෙන් admin panel හෝ admin link එකක් නොපෙන්වයි.
- [x] පැරණි admin login credentials වෙනුවට Username `Vinu` සහ protected input මඟින් ලබාදුන් නව password එක සකසා `/admin/login` හරහා login හා protected dashboard ප්‍රවේශය තහවුරු කර ඇත; පරණ admin session අවලංගු වේ. Password අගය files, logs හෝ messages වලට නොදමන්න.
- [x] Responsive admin dashboard එකේ animated stats cards ලෙස Total Wallpapers, Total Views, Total Downloads, Daily Active Users, Weekly Users පෙන්වයි; daily views/downloads chart එකක් සහ wallpaper title, category (`Gaming`, `Cyberpunk`, `Anime`, `Cars`, `Nature`, `Dark`), tags, auto-detected resolution සමඟ upload; wallpaper edit/delete/restore; signed-in user directory සහ suspend/restore සපයයි.
- [x] Homepage එකේ “Sign in with Google” button එක දක්වයි; configured Google Web Client ID සහ server-side ID-token verification ашиглан normal Google usersට favorites සහ өөрийн download history APIs/UI සපaya; normal usersට admin role/API эрх өгдөггүй. Real end-user Google account session-ээр smoke-test хийгවේ නැත.
- [x] Site title, logo, visible branding `Vinu wallpaperZ` කර footer credit එක `Built by Vinu` කර ඇත.
- [ ] Footer එකට Vinuගේ contact detail එක් කරන්න. නිවැරදි label සහ email/website/social-handle අගය userගෙන් ලැබෙන තුරු කිසිවක් අනුමාන නොකරන්න.
- [x] English UI, modern dark-neon theme, responsive layout, smooth entry/scroll animations සහ Explore/wallpaper neon hover effects පවත්වා ඇත.
- [x] Cyberpunk, fictional open-world Cars, Anime-inspired සහ Dark Fantasy demo wallpapers හතර project storage වෙත 2560×1440 SVG ලෙස upload කර, stale starter-image references පමණක් migrate කර ඇත. Public HTTPS Preview browser එකේ images හතරම `2560×1440` ලෙස decode වී render වන බව තහවුරු කර ඇත; cards/preview/download controls ක්‍රියාත්මකයි. Direct download event එක analytics මාරු කරන නිසා test එකකින් counters වෙනස් කර නැත.
- [x] Preview සමාලෝචනයෙන් පසු changes canonical `main` වෙත checkpoint/push කර ඇත; `auto_publish` අක්‍රියවම තබා public publish කර නැත.
