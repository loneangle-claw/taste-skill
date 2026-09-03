# ebook-generator - Renderer and Export

Stage 9 composes `pages.json` + `images/` into `book.html`. Stage 10 exports that one source to PDF
and EPUB. One source, three targets: never maintain three layouts.

---

## 1. Typesetting rules

### Type size

Sized for a reader who is still decoding letters, at a reference page width of 1200px. Scale with
`clamp()` so it holds on a phone.

| Age band | Body | Line height | Max line length |
| --- | --- | --- | --- |
| 3-5 | 28-34px | 1.8 | 28 characters |
| 6-8 | 22-26px | 1.7 | 40 characters |
| 9-12 | 18-21px | 1.6 | 55 characters |

Title on the cover: 3 to 4 times body size, never more than four words per line.

### Non-negotiables

- **Ragged right. Never justify.** Justified text opens rivers of whitespace at these line lengths,
  and rivers are exactly what a struggling reader's eye falls into.
- **No hyphenation.** A broken word is a broken word for a child.
- **Break lines on phrase boundaries.** Author the breaks with `<br>` or a `text-wrap: balance`
  container plus manual overrides. "He backed up. / He ran. / He jumped so high" is three lines
  because it is three breaths, not because the box ran out.
- **Font choice** - a humanist sans with a single-storey `a` and `g` for the 3-5 band (letterforms
  that match how children are taught to write). A warm serif is fine from 6-8 up. Never a display
  face for body copy, never a "handwriting" font, never all-caps body copy.
- **Contrast 7:1 minimum** for body copy against whatever is behind it. Measure it, do not eyeball it.

### Text over illustration

The copy sits in the `text_zone` declared in `pages.json`. Two treatments, pick per book and hold:

1. **Scrim** - a soft gradient from the page edge into transparent, under the text only. Keeps the
   art full bleed. Requires a genuinely quiet safe zone in the image.
2. **Panel** - a solid or near-solid rounded shape in a palette colour from `scenes.json`, with the
   text inside. Safer, more classic, better for busy illustrations.

Never drop black text straight onto a mid-tone painted background with no treatment.

`full-bleed-none` pages carry no text. `facing` pages put the illustration full bleed on one side
and the copy on a plain paper-tone panel on the other.

---

## 2. book.html

Structure:

```html
<article class="book" data-age-band="6-8" data-lang="en">
  <section class="page" id="p01" data-role="cover" data-text-zone="top">
    <img src="images/p01.png" alt="A small red fox in a green scarf stands on a hillside, looking up at purple grapes hanging above him.">
    <div class="copy"><h1>The Fox and the Grapes</h1></div>
  </section>
  <section class="page" id="p02" data-role="opening" data-text-zone="bottom"> ... </section>
</article>
```

Requirements:

- **Real text in the DOM.** Copy is never baked into the raster. It must be selectable, searchable,
  translatable, and readable by a screen reader.
- **Alt text on every illustration**, describing the *picture* - what a sighted reader gets from
  looking - not a repeat of the copy underneath it. That would be read twice.
- **Spread on wide, single page on narrow.** Two pages side by side above ~1024px, one below.
- **Navigation**: left/right arrow keys, swipe, click zones on the outer thirds, a page indicator,
  and jump-to-page. Bind Home and End to cover and last page.
- **Preload the next page's image**, so a page turn never shows a white flash.
- **Respect `prefers-reduced-motion`**: page turns become instant cross-fades or nothing at all.
- **Self-contained option** - inline images as base64 when the user wants a single shareable file;
  otherwise ship `book.html` next to `images/`.
- **No layout shift**: set explicit `width`/`height` or `aspect-ratio` on every `<img>`.
- Include the language on `<html lang>` so screen readers pronounce it correctly.

Optional and easy: a read-aloud toggle that highlights the current sentence, driven by the narration
script from the education extensions.

---

## 3. PDF export

Fixed layout, print-ready.

- **Trim size** - default 8.5 x 8.5in square, or 10 x 8in landscape. State which you used.
- **Bleed** - 3mm (0.125in) on all four sides for any full-bleed illustration. Extend the art into
  the bleed; do not scale the art up and crop the composition.
- **Safe margin** - keep all text at least 12mm from the trim edge. A text zone that touches the
  edge gets guillotined.
- **Colour** - RGB for screen PDFs. Convert to CMYK only if the user is going to a commercial
  printer, and say so when you do, because the purples and oranges in a warm children's palette
  shift visibly.
- **Resolution** - 300 DPI at trim size. At 8.5in square that is 2550px. If the generated images are
  smaller, upscale once, cleanly, and say that you did.
- **Fonts embedded**, always. One page per book page, in order, no orphan blank pages except a
  deliberate one after the cover.
- Generate from `book.html` with a headless browser print (`@page { size: 8.5in 8.5in; margin: 0 }`)
  or a PDF library. Then **open the output and look at it** before calling it done.

---

## 4. EPUB export

**Fixed layout, EPUB 3.** Reflowable is wrong for picture books: it breaks the relationship between
a picture and the words that belong to it, which is the entire form.

In `content.opf`:

```xml
<meta property="rendition:layout">pre-paginated</meta>
<meta property="rendition:orientation">landscape</meta>
<meta property="rendition:spread">both</meta>
```

Per page, in each XHTML file:

```xml
<meta name="viewport" content="width=1600, height=1200"/>
```

The viewport must match the illustration's pixel dimensions exactly, on every page, or readers will
letterbox inconsistently.

Also required:

- Text absolutely positioned over the image, still as real text.
- A valid EPUB 3 nav document (`nav.xhtml` with `epub:type="toc"`), plus cover metadata
  (`<meta name="cover">` and a `properties="cover-image"` item).
- `dc:language` matching `story.json`.
- Fonts embedded and declared, or the fallback stack will silently change your typesetting.
- Accessibility metadata: `schema:accessMode`, `accessibilityFeature` (include `alternativeText`),
  and `accessibilitySummary`.
- Validate with epubcheck. Report the result honestly; do not ship an EPUB you did not validate.

---

## 5. Export checklist

- [ ] HTML opens offline, pages turn, keyboard and swipe both work.
- [ ] Every illustration has alt text describing the picture.
- [ ] Body copy hits its size, line height, line length, and 7:1 contrast.
- [ ] No justified text, no hyphenation, phrase-boundary line breaks.
- [ ] PDF: correct trim, bleed on full-bleed art, text inside the safe margin, fonts embedded, 300 DPI.
- [ ] PDF opened and visually checked page by page.
- [ ] EPUB: pre-paginated, per-page viewport matches image size, nav and cover present, epubcheck clean.
- [ ] All three exports carry the same page count and the same page order.
