---
name: ebook-generator
description: End-to-end AI picture-book pipeline. One topic in, a complete illustrated ebook out - story beats, page plan, per-page illustration prompts, typeset spreads, and HTML / PDF / EPUB export. The whole skill exists to solve the two things that break AI picture books: character consistency and scene consistency. Locks a Character Bible and a Scene Bible before a single image is generated, then reuses those tokens verbatim in every prompt. Includes teacher mode, student authoring mode, narration scripts, comprehension questions, and single-page regeneration.
---

# ebook-generator: The AI Picture Book Production Line

> Input: a topic ("the fox and the grapes", "why we brush our teeth", "a robot who is afraid of rain").
> Output: a finished, consistent, typeset picture book in HTML, PDF, and EPUB.

This is a **production pipeline**, not a prompt. Run the stages in order. Every stage writes a
named artifact that later stages read. Never skip ahead to image generation - that is the single
biggest cause of the failure everyone hits: a fox that is orange on page 3, brown on page 6, and
a different species on page 9.

---

## 0. HARD RULES - READ FIRST

1. **Bibles before images.** No image prompt is written until `characters.json` and `scenes.json`
   exist and are locked. Locked means: the descriptor strings are frozen and copied **verbatim**
   into every prompt that features that character or place. Do not paraphrase them. Do not
   "improve" them on page 7.
2. **No rendered text inside generated images.** Image models garble letterforms, and garbled text
   in a children's book is unusable. Illustrations are pictures only. All words - title, body,
   page numbers - are composited by the renderer in stage 9 as real, selectable text.
3. **Every page reserves a text safe zone.** The illustration is composed with deliberate negative
   space where the copy will sit. Decide the zone in stage 6, state it in the prompt in stage 7,
   verify it in stage 8.
4. **One page = one image = one beat.** Never generate a contact sheet, a 4-up grid, or a "several
   moments" collage. If the book has 12 pages, you generate 12 images, announced one by one
   ("Page 3 of 12: the fox jumps").
5. **The style lock is one string, written once.** It is prepended to every single prompt,
   character art and cover included. Changing it mid-book restarts the book.
6. **Age band drives everything.** Vocabulary, sentence length, page count, and how frightening the
   conflict may get all fall out of the age band chosen in stage 1. Pick it before writing prose.
7. **Deterministic file names.** `p01`, `p02`, ... `p12`. Zero-padded, always. Renderer, exporter,
   and the regeneration command all key off these.

---

## 1. THE PIPELINE

| # | Stage | Reads | Writes |
| --- | --- | --- | --- |
| 1 | Brief inference | user topic | `brief.md` (in-context is fine) |
| 2 | Story generation | brief | prose draft + beat sheet |
| 3 | Story JSON | draft | `story.json` |
| 4 | Character Bible | story.json | `characters.json` + turnaround images |
| 5 | Scene Bible | story.json | `scenes.json` + location plates |
| 6 | Page Generator | story.json | `pages.json` |
| 7 | Image Prompt Generator | pages + both bibles | `prompts.json` |
| 8 | Image Generation | prompts.json | `images/p01.png` ... |
| 9 | Ebook Renderer | pages + images | `book.html` |
| 10 | Export | book.html | `book.pdf`, `book.epub` |

Schemas for every artifact: **[SCHEMAS.md](SCHEMAS.md)**.
Typesetting and export mechanics: **[RENDER.md](RENDER.md)**.

Announce the stage you are entering. Show the artifact. Then continue - do not stop and ask for
approval between every stage unless the user asked for a review gate. The default is: run the whole
pipeline, then offer revisions.

---

## 2. STAGE 1 - BRIEF INFERENCE

From the topic alone, decide and **state in one short block**:

- **Age band** - `3-5`, `6-8`, or `9-12`. Default `6-8` when unstated.
- **Story type** - fable, adventure, friendship, bedtime, curiosity/STEM, feelings/SEL, folk tale retelling.
- **Core moral or takeaway** - one sentence, in the child's terms. "Wanting something you cannot
  have does not make it bad" beats "sour grapes represent rationalized disappointment".
- **Cast** - one protagonist, at most two supporting characters. More than three named characters in
  a 12-page book is a guarantee of inconsistency.
- **World** - two or three locations, no more.
- **Language** - the language the user wrote in, unless they ask otherwise. Write native prose in
  that language; do not translate from English rhythm.
- **Page count** - 12 by default (see stage 6).

### Age band contract

| Band | Words / page | Sentence length | Conflict | Vocabulary |
| --- | --- | --- | --- | --- |
| 3-5 | 8-25 | one clause, one idea | mild, resolved fast, never scary at bedtime | concrete nouns, repetition and refrain are features |
| 6-8 | 25-60 | up to two clauses | real stakes, real failure, safe resolution | one new "stretch" word per spread, used in context |
| 9-12 | 60-120 | varied, some subordination | genuine setback, ambiguous middle | figurative language allowed, irony allowed |

Never write above the band because the prose "sounds better". A picture book is read aloud by an
adult to a child who is looking at the picture, not at the words.

---

## 3. STAGE 2 - STORY GENERATION

Write the story as prose first, then break it. Prose first is not optional: beat sheets written
before prose produce mechanical books that read like an outline with pictures stapled on.

**Structure** - four movements, mapped onto the page plan in stage 6:

1. **Setup** - who, where, and what they want. The want must be visible in a picture.
2. **Attempt** - they try. It works a little, or not at all.
3. **Turn** - the real obstacle, or the moment the want is revealed as the wrong want.
4. **Resolution** - what changed, shown through action, not stated as a lesson.

**Craft rules**

- The moral is **never** written as a sentence of instruction on the last page. Show the character
  behaving differently, and let the last line land it obliquely.
- Read-aloud rhythm beats literary elegance. Say every line out loud in your head. If it stumbles,
  rewrite it.
- A refrain that repeats three times with a variation on the third is the strongest device
  available in the 3-5 band. Use it.
- Text and picture must not duplicate each other. If the words say "the fox jumped very high", the
  picture should show what the words do not: how ridiculous he looks, or how far the grapes still are.
- No em-dashes anywhere in book copy. Use a comma, a full stop, or restructure.
- No narrator addressing the child ("Can you see the fox, boys and girls?") unless the brief asks
  for an interactive book.

---

## 4. STAGE 3 - STORY JSON

Convert the prose into `story.json` (schema in SCHEMAS.md). This is the structured source of truth.
Everything downstream reads it; the prose draft is discarded after this point.

It carries: title, language, age band, story type, moral, cast list with roles, location list, and
the ordered beats with the final page copy attached to each.

Validate before continuing: every beat has copy, every named character appears in `cast`, every
location referenced appears in `locations`. A dangling reference here becomes an inconsistent
image later.

---

## 5. STAGE 4 - CHARACTER BIBLE (the consistency engine)

For each character in `cast`, write a locked entry in `characters.json`. Each entry has a
**`token`**: a single dense descriptor string, 25-45 words, that is pasted verbatim into every
prompt featuring that character.

A token must nail all five, in this order:

1. **Species + build + age read** - "young red fox, small and round-bodied, cub proportions, oversized head"
2. **Colour spec with values** - "rust-orange fur `#C8622F`, cream muzzle chest and tail tip `#F2E3CE`, four dark brown socks `#3B2A22`"
3. **Face specifics** - "round amber eyes with large pupils, small black button nose, no visible eyebrows"
4. **Costume and props** - "moss-green scarf knotted at the neck, worn on every page, no other clothing"
5. **Posture and personality tell** - "always leans forward on tiptoe, tail held high and curved"

**Rules**

- Every colour gets a hex value. "Orange" drifts. `#C8622F` does not.
- Pick **one** invariant prop or marking per character. It is the anchor a reader (and you) uses to
  confirm it is the same character. Never remove it, never change its colour.
- Write the token once. Later prompts append the action, never edit the token.
- Keep tokens mutually distinct: if two characters are both brown quadrupeds, change one.
- **Generate a turnaround first**: one image per character, plain neutral background, three views
  (front, three-quarter, side) plus two expressions. Look at it. If it does not match the token,
  fix the token or regenerate now - not after 12 story pages have been built on top of it.

Store the turnaround as `characters/<id>-turnaround.png` and treat it as the visual contract.

---

## 6. STAGE 5 - SCENE BIBLE

Same discipline, applied to place. Each location in `scenes.json` gets a token covering:

1. **Place** - "a sun-drenched hillside vineyard, low stone wall along the left"
2. **Time and light** - "late golden afternoon, long warm shadows falling to the right"
3. **Palette** - three to five hexes, and they must be consistent with the character palette rather
   than fighting it
4. **Signature objects** - "a leaning wooden trellis heavy with deep-purple grapes, one cracked clay pot"
5. **Depth cues** - what sits in foreground, midground, and background, so recurring shots of the
   same place actually read as the same place

Also render a **location plate** per scene (no characters, wide shot) before story pages. Same
reason as the turnaround: catch the drift while it is cheap.

**Time continuity**: if the story spans an afternoon into evening, write the lighting progression
into the scene tokens per act, and note in `pages.json` which lighting variant each page uses.
Lighting that jumps randomly is as jarring as a character changing colour.

---

## 7. STAGE 6 - PAGE GENERATOR

Break `story.json` into `pages.json`. The default 12-page plan:

| Page | Role | Notes |
| --- | --- | --- |
| P01 | Cover | Title page. Hero character, most appealing pose, strong negative space at top for the title. |
| P02 | Opening | Establish world and character. Wide shot. |
| P03 | The want | Show what the character wants and why it matters. |
| P04 | First attempt | Action. |
| P05 | It fails | Comedy or frustration beat. |
| P06 | Bigger attempt | Escalation. Best candidate for the book's biggest, most dynamic image. |
| P07 | Real obstacle | The turn. |
| P08 | Low point | Quietest page. Let the composition go still and small. |
| P09 | Realisation | Something changes internally. Show it on the face. |
| P10 | New action | The changed behaviour. |
| P11 | Resolution | Warm, wide, resolved. |
| P12 | Closing / moral | Oblique last line. Often a quiet echo of P02's composition. |

Other lengths: 8 pages (drop P05, P07, P09, P10), 16 pages (split P04/P06 and P09/P10 into two
beats each), 24 pages (each act gets six pages). Never fewer than 8 - there is no story arc in six
pictures.

**Each page entry carries**: id, role, copy, location id, characters present, the emotional beat, the
**camera** call, and the **text zone**.

**Camera variety is enforced.** Across the book you must use at least five distinct camera setups
from: extreme wide, wide, medium, medium close, close-up, low angle looking up, high angle looking
down, over-the-shoulder, worm's-eye, bird's-eye. And you may never use the same setup on three
consecutive pages. Flat medium-shot-every-page is the picture-book equivalent of a wall of grey text.

**Text zone** is one of `top`, `bottom`, `left`, `right`, `full-bleed-none` (wordless page), or
`facing` (text on the facing page, illustration full bleed). Vary it, and match it to the
composition: a character looking up-right wants its text bottom-left.

---

## 8. STAGE 7 - IMAGE PROMPT GENERATOR

Every prompt is assembled from fixed slots, in this order. Same order every time.

```
[STYLE LOCK] + [SCENE TOKEN] + [LIGHTING VARIANT] + [CHARACTER TOKEN(S)]
+ [ACTION] + [EXPRESSION] + [CAMERA] + [COMPOSITION / TEXT SAFE ZONE]
+ [ASPECT] + [NEGATIVE]
```

**STYLE LOCK** - written once in stage 4, reused forever. It must specify medium, line quality,
colour treatment, and edge finish. Example:

> "children's picture book illustration, soft gouache and coloured-pencil texture, warm saturated
> palette, gentle visible brush grain, clean rounded shapes, soft ambient light, no harsh outlines,
> storybook composition, consistent flat depth of field"

**ACTION** - one verb phrase, physically depictable. "Reaches up on hind legs, front paws stretched
toward the grapes" - not "feels determined".

**EXPRESSION** - name the emotion **and** the face mechanics: "hopeful: eyes wide, ears forward,
mouth slightly open".

**CAMERA** - from the page entry: "low angle from ground level, looking up past the fox toward the
trellis".

**COMPOSITION / TEXT SAFE ZONE** - always explicit: "leave the upper third as open sky with no
detail, for text overlay".

**NEGATIVE** - always append the full standing list:

> "no text, no letters, no words, no watermark, no signature, no speech bubbles, no page numbers,
> no frame or border, no collage, no multiple panels, no photorealism, no 3D render, no extra
> limbs, no extra characters, no changed fur colour, no missing scarf"

The last two are book-specific: **append every invariant from the character tokens as an explicit
negative**. It is the cheapest consistency win available.

**Aspect** - one aspect ratio for the whole book (default 4:3 landscape for spreads, 3:4 for
portrait books). Never mix within a book.

Write all prompts to `prompts.json` **before generating any of them**, then read them back as a set
and check: same style lock in all, same tokens in all, camera variety satisfied, text zones varied.

---

## 9. STAGE 8 - IMAGE GENERATION

Order of generation: character turnarounds → location plates → **P01 cover last, not first**. The
cover should be composed after you know what the book actually looks like.

For story pages, generate in page order and announce each one.

**QC gate - check every image against this before accepting it:**

- Character matches its turnaround: colour, markings, invariant prop, proportions, face.
- Location matches its plate, and lighting matches the declared variant.
- Text safe zone is genuinely empty, not "mostly empty".
- No text, no watermark, no border, no panels.
- Anatomy: limb count, eye count, hands or paws not fused.
- The action in the picture is the action in the copy.
- Tone matches the age band. Nothing accidentally menacing in a bedtime book.

**On failure**: regenerate that page with the token re-emphasised and the specific failure added as
a negative. Do not fix it by editing the story copy to match a wrong picture. If the same failure
happens twice, the token is ambiguous - fix the token, then regenerate every page that uses it.

Keep the generation parameters (seed if available, model, aspect) in `prompts.json` per page, so a
single page can be regenerated later without disturbing the rest.

---

## 10. STAGE 9 - EBOOK RENDERER

Compose text over image into `book.html`. Full typesetting spec in **[RENDER.md](RENDER.md)**.
The non-negotiables:

- Real text in the DOM. Never bake copy into a raster.
- Body type sized for a beginning reader: 3-5 band at 28-34px, 6-8 at 22-26px, 9-12 at 18-21px, at
  reference page width. Generous line height (1.6-1.8). Never justify. Ragged right, always.
- Text sits in the declared safe zone with a soft scrim or a solid text panel behind it, whichever
  the design calls for. Contrast target: 7:1 for body copy. This is a book for people learning to
  read; AA is not enough.
- Line breaks are meaningful. Break on phrase boundaries, not wherever the box ends.
- Spread view on wide screens, single page on narrow. Keyboard arrows, swipe, and page-number jump.
- Alt text on every illustration, written for a screen reader as a description of the picture, not
  a repeat of the copy.

---

## 11. STAGE 10 - EXPORT

Three targets, one source (`book.html`). Details in RENDER.md.

- **HTML** - self-contained, images inlined or shipped alongside, works offline, responsive.
- **PDF** - fixed-layout, print-ready, correct trim size and bleed, embedded fonts, one page per page.
- **EPUB** - EPUB 3 fixed-layout for picture books (reflowable destroys the text/image relationship),
  with `rendition:layout` set to `pre-paginated`, per-page SVG or absolutely positioned text, plus
  a valid nav document and metadata.

Always state which files were produced and where they are.

---

## 12. EDUCATION EXTENSIONS

Offer these once the book exists; build them when asked.

- **Teacher mode** - a lesson pack alongside the book: learning objectives, three discussion
  questions per act, vocabulary list with the stretch words in context, and one extension activity.
- **Student authoring mode** - flip the pipeline into a guided interview: ask the child for
  character, place, problem, and ending, one question at a time, then run the pipeline on their
  answers. Never overwrite their choices with better ones; ambition beats polish here.
- **Narration script** - per-page read-aloud text with pacing marks, pronunciation notes for names,
  and a suggested voice direction per character. Ready to hand to a TTS engine or a human reader.
- **Comprehension set** - per book: three literal questions, two inferential, one evaluative, plus
  an answer key. Match the age band.
- **Single-page regeneration** - regenerate exactly one page from `prompts.json` without touching
  the others, then re-render. The whole artifact layout exists to make this cheap.

---

## 13. ANTI-SLOP - WHAT KILLS AI PICTURE BOOKS

Banned outright:

- The generic big-eyed 3D "Pixar-ish" render when the style lock said painted. Pick a medium and hold it.
- Every page a centered medium shot of the character smiling at camera.
- Gradient-mesh sunset backgrounds with no depicted place.
- Text baked into the image.
- Detail-maximalist backgrounds that bury the protagonist. The child must find the character in under a second.
- Palette drift: pages 1-4 warm, pages 5-8 cool, no story reason.
- Anthropomorphic characters wearing a different outfit each page.
- The moral stated as a caption on the last page.
- Uncanny hands. If a character needs hands, give them paws, mittens, or keep hands out of frame.
- Sameness of scale: every page framed at the same distance. Vary it or the book reads flat.

---

## 14. OUT OF SCOPE

Not for: chapter books and middle-grade prose, comics and manga panel layouts, textbooks and
non-fiction reference, colouring books, activity workbooks, or anything involving real people's
likenesses. Do not reproduce copyrighted characters or a named living illustrator's signature style;
describe an aesthetic instead.

---

## 15. PRE-FLIGHT CHECK

Every box, honestly, before you call the book done.

- [ ] Age band declared, and every page's copy is inside its word count.
- [ ] Story has all four movements and the moral is shown, never stated.
- [ ] `characters.json` and `scenes.json` exist, with hex values and one invariant per character.
- [ ] Turnarounds and location plates generated and approved before story pages.
- [ ] One style lock string, byte-identical across every prompt.
- [ ] Camera variety: five or more setups, never three the same in a row.
- [ ] Text zones vary, and every image has a genuinely clear one.
- [ ] Every image passed the stage 8 QC gate.
- [ ] No text, watermark, or border in any illustration.
- [ ] No em-dash anywhere in the book copy.
- [ ] Body type size, line height, and 7:1 contrast met.
- [ ] Alt text on every image.
- [ ] HTML, PDF, and EPUB all produced, opened, and checked.
- [ ] `prompts.json` retained so any single page can be regenerated.
