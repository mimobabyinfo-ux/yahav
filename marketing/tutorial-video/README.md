# סרטון הסבר — התקנת מימו ומה יש באפליקציה

`mimo-tutorial.mp4` — 1:47 דק', 1080×1920 (9:16), עברית עם קריינות. מיועד לשליחה לאמהות בוואטסאפ.

## מה יש בו
1. פתיח — "שמים את מימו במסך הבית"
2–3. התקנה באייפון (ספארי ← שיתוף ← View More ← Add to Home Screen)
4. אנדרואיד (כרום ← שלוש נקודות ← הוספה למסך הבית)
5–8. סיור: בית · קהילה · יומן · מוצרים
9. סיום — וואטסאפ + mimo-baby.co.il

## איך זה נבנה (לשחזור / עדכון)
- **קריינות:** `narration.json` הוא התסריט. ה-workflow ‏`.github/workflows/tutorial-tts.yml` רץ על push
  לענף `claude/app-installation-tutorial-video-*` כשהתסריט משתנה, מייצר MP3 לכל שורה
  (edge-tts, קול he-IL-HilaNeural) ומקמיט אותם ל-`audio/`.
- **ויזואל:** `build/render.html` — אנימציה ב-HTML/CSS בשפה העיצובית של האפליקציה (צבעי ה-tailwind,
  Varela Round + Assistant, נכסי המותג מ-`public/brand`).
- **צילום:** `build/capture.mjs` (Playwright) מרנדר פריים-פריים ב-30fps לפי `timeline.json`
  (התזמון נגזר ממשכי ה-MP3 שנמדדו — `durations.csv`).
- **הרכבה:** `build/build_av.sh` — ffmpeg: מיקס קריינות לפי הטיימליין + H.264/AAC.

לעדכון הסרטון: עורכים את `narration.json` ו/או `render.html`, דוחפים (ה-TTS ירוץ לבד),
מודדים משכים מחדש ל-`durations.csv`, ואז `node build/capture.mjs && bash build/build_av.sh`.
