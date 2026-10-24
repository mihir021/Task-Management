# Artwork slots

All shipped PNG/JPEG files are original abstract placeholder plates. They contain
only grids, rings and labels. No character, mask, suit, logo or licensed artwork
is included. The page works completely with these placeholders.

Replace a file at the same path to use your own or properly licensed artwork:

| Path                              | Recommended size | Crop                                                |
| --------------------------------- | ---------------- | --------------------------------------------------- |
| hero.png                          | 900 × 1100       | Portrait; center subject with generous safe margins |
| suit-01.jpg through suit-06.jpg   | 600 × 800        | Portrait, center crop                               |
| rogue-01.jpg through rogue-06.jpg | 600 × 800        | Portrait, center crop                               |

Keep hero art below 250 KB and each gallery image below 100 KB when possible.
The page uses lazy loading for galleries, fixed dimensions to reduce layout shift,
and object-fit: cover. Update each slot label and alt description in
src/fan/FanExperience.tsx when you replace a plate with real licensed art.
Do not scrape images. Verify the license and attribution terms yourself.
